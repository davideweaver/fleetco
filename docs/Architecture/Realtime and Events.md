---
created: 2026-10-09
tags: [fleetco, architecture, realtime, events, outbox, sse]
source: Claude Code (Xerro)
---

## Overview

How domain events, audit logging, notifications, and live UI updates all come out of one
mechanism: a transactional outbox table that we own.

**Core decision: we own the realtime layer. Events are written to an outbox in the same
transaction as the state change, dispatched in-process, fanned out across API instances via
Postgres `LISTEN/NOTIFY`, and pushed to browsers over SSE — authorized by the same code path as
our REST endpoints.**

## Ordering Is Part of the Contract

> **Added 2026-10-13 after a defect found in the spike — see ADR-015.**

`Last-Event-ID` is a **high-water mark**, not a set of seen ids. A client that receives event 7
and then event 6 records 7, and on reconnect asks for everything after 7 — so 6 is lost
permanently, by the exact mechanism that exists to guarantee no gaps.

So **the live stream must deliver in ascending id order**, and that is a correctness requirement
rather than a nicety. The spike implementation used RxJS `mergeMap` to read each notified row,
which runs the reads concurrently and emits in completion order; under a burst it reversed pairs.
Fixed to `concatMap`.

**Rule.** On the SSE delivery path, any operator that can reorder — `mergeMap`, `forkJoin`,
unbounded concurrency of any kind — is forbidden. A regression test asserts strictly ascending
ids under a ten-event burst.

## Why Not a Platform's Built-In Realtime

Supabase Realtime's Postgres Changes mode was the obvious candidate and is the wrong tool here,
for two structural reasons:

1. **It authorizes via RLS.** We have explicitly rejected RLS as the authorization layer. Using
   it for realtime means maintaining *two* authorization implementations — TypeScript for REST,
   SQL policies for realtime — that must agree with each other forever. That divergence is a
   cross-tenant leak with a delivery date.
2. **It requires the browser to connect directly to the database platform.** That contradicts
   the "browser only talks to our API" decision in [[Stack Evaluation]].

It is also fire-and-forget: if the socket was down when a change landed, the client silently
misses it. On shop-floor Wi-Fi that is not a corner case.

Owning this layer is not a compromise — it is strictly better for this product.

## The Design

```
  state change + outbox row          ← ONE transaction. Atomicity is the whole point.
          │
          ▼
  dispatcher polls outbox            ← SELECT … FOR UPDATE SKIP LOCKED
          │
          ├──► in-process handlers   ← audit log, email, SMS, webhooks
          │
          └──► LISTEN/NOTIFY         ← fanout to every API instance
                      │
                      ▼
              SSE push to clients    ← filtered by the SAME authz code as REST
```

### Why the Outbox Earns Its Keep Immediately

This is not speculative infrastructure for a future extraction. It delivers four things on day
one:

- **Audit log** — a legal requirement given DOT and warranty record retention (Q9)
- **Customer portal activity feed** — "your truck was authorized at 2:14pm"
- **Notifications** — email and SMS triggered off the same stream
- **Live UI updates** — the service board updating without a refresh

And it pre-builds the integration seam for any future service extraction. See
[[Evolution Path]].

## Event Shape

```
service_order.authorized
service_order.status_changed
parts.issued
inventory.adjusted
invoice.posted
inspection.defect_found
```

Each outbox row carries: a monotonic `id` (the replay cursor), `tenant_id`, an optional
`customer_id` for portal visibility, the event name, a JSON payload, `occurred_at`, and
`dispatched_at`.

**`tenant_id` on every event row is non-negotiable** — it is what lets the dispatcher and the
SSE filter apply tenant scoping without re-reading the source row.

## Transport: SSE, Not WebSocket

**Decision: Server-Sent Events for v1.**

Our traffic is overwhelmingly server→client; client→server already has REST. SSE is plain HTTP,
passes through every proxy and corporate firewall, reconnects automatically, and carries
`Last-Event-ID` natively — which *is* our replay cursor. There is far less to get wrong than
with a WebSocket, and a hospital's network is more likely to permit it.

Revisit if genuinely bidirectional, low-latency features appear (collaborative editing,
presence indicators on the service board). Nothing in phase one needs that.

## Replay on Reconnect

The capability a platform's CDC-based realtime cannot give us, and the reason the outbox is a
table rather than a queue.

A client reconnects with `Last-Event-ID: 48213`. The server authorizes the subscription, then
replays outbox rows after that id that the principal is permitted to see, then resumes live
push. No gap, no silent loss, no full refetch.

This matters specifically because technicians work on tablets with intermittent Wi-Fi in a
repair bay.

## Authorization

**One rule: subscription authorization and request authorization call the same code.**

A client subscribes to topics; every topic request passes through the same tenant-scoping
chokepoint that guards the REST endpoints:

```
tenant:{tenantId}:dispatch              ← shop staff, role-gated
tenant:{tenantId}:order:{orderId}       ← shop staff
customer:{tenantId}:{customerId}        ← portal users, one customer only
```

Per-event filtering re-checks the principal before each push rather than trusting the
subscription, so a mid-session permission revocation takes effect immediately.

Cross-tenant leak tests in CI must cover the SSE surface, not just REST. Seed two tenants,
subscribe as one, assert nothing from the other ever arrives. See [[Tenancy Model]].

## Multi-Instance Fanout

The moment a second API task exists, a client connected to task A needs events produced on task B.

**Decision (revised 2026-10-09 by ADR-023): Postgres `LISTEN/NOTIFY`. No Redis.**

- Each `api` task holds one dedicated connection issuing `LISTEN` on a channel
- The `worker` issues `NOTIFY` after dispatching an outbox row
- The payload carries only the event id, tenant, and topic — the 8000-byte cap is irrelevant
  because clients replay the body from the outbox by cursor

**Why this works: durability was never in the transport.** It has always lived in the outbox table.
A missed notification costs nothing, because a reconnecting client replays from its cursor. That is
the same property that made Redis acceptable, so removing Redis loses nothing.

**Two constraints to record:**

- **The listener needs a direct connection, not RDS Proxy in transaction mode.** Transaction-mode
  poolers break `LISTEN/NOTIFY`. Route the listener connection directly; pooled application queries
  may go through a proxy if one is introduced later.
- `NOTIFY` fires on transaction commit, so the dispatcher must commit before notifying, or
  listeners wake to a row they cannot yet see.

> **Why this changed.** The original design specified Redis pub/sub, required because Neon's
> transaction-mode pooler blocks `LISTEN/NOTIFY`. Moving to Aurora (ADR-023) made session-mode
> connections available, which removed a vendor and a moving part for free. Redis returns only if
> fanout volume ever outgrows Postgres, which at tens of tenants is not foreseeable.

## Dispatcher Mechanics

- **`FOR UPDATE SKIP LOCKED`** so multiple instances can poll the outbox concurrently without
  double-dispatching
- **At-least-once delivery.** Handlers must be idempotent; keyed on the outbox `id`
- **Poll interval** of ~200ms is ample; `LISTEN/NOTIFY` can wake the dispatcher sooner if the
  latency ever matters
- **Failure handling**: retry with backoff, a `failed_attempts` counter, and a dead-letter
  state that alerts rather than silently stalling the stream
- **Ordering** is guaranteed per `tenant_id` only, not globally. Design handlers accordingly.

## Retention

Outbox rows are both the event stream and the audit trail, and those have different lifespans.

- **Partition by month.** Keep ~30 days hot for replay
- **Roll older rows into the audit log table**, which has a retention period driven by DOT and
  warranty requirements (Q9 — still open)
- **Never** simply `DELETE` the history. Some of it is legally required.

## Scale Sanity Check

One Node instance handles roughly 10,000 concurrent SSE connections without tuning. Fleetco is
looking at perhaps 20–80 concurrent users for years. This is not where the hard problems live.

## If Offline-First Wins, This Document Is Moot

**Open Question Q5 — the mobile/offline requirement — can invalidate this entire design.**

If technicians need genuinely offline-capable tablets, the answer is a sync engine
(**PowerSync**, Electric SQL, or Zero), and the sync engine *becomes* the realtime layer.
PowerSync is notable for authenticating through our own backend, which fits the "own API"
decision cleanly.

**Do not build the SSE layer before Q5 is answered.** Build the outbox — it is correct under
every scenario and delivers the audit log regardless.

## Related

- [[Architecture Decisions]] — ADR-009, ADR-015
- [[Evolution Path]] — the outbox as the future service integration seam
- [[Tenancy Model]] — the authorization chokepoint
- [[Stack Evaluation]]
- [[Open Questions]] — Q5 (offline), Q9 (retention)
