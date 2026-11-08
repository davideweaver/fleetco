---
status: current
summary: When to extract a module, and the non-goals
created: 2026-10-08
updated: 2026-10-30
tags: [fleetco, architecture, migration, modular-monolith, microservices]
source: Claude Code (Xerro)
---

## Overview

How the Fleetco platform gets from a single Node application to services *if and when* that's
warranted — and the small set of disciplines that make the transition cheap instead of a rewrite.

**The headline: three rules, nearly free to follow today, turn a service extraction from a quarter
of work into a weekend. Retrofitting them later is the expensive version.**

**Re-justified twice on 2026-10-09.** Second: delivery is agent-driven, which makes these rules
*more* valuable, not less — a bounded module is the unit an agent can change safely without
understanding the whole system. Enforcement moves from convention to lint rules; see
[[Code Standards and Guardrails]].

First: resale is now assessed as a small possibility (Q7), so the
organizational pressure that usually forces service extraction may never arrive. The three rules
below are kept anyway — but on **maintainability** grounds rather than as preparation for
extraction. They are what keeps a monolith navigable for a one-to-three-person team, and
navigability is a stated goal independent of any future split. Extraction becoming cheap is now a
side effect rather than the purpose.

## The Three Rules

### 1. Schema per module

One Postgres instance, logically partitioned by schema:

```
workorders.*     parts.*        billing.*
customers.*      scheduling.*   portal.*
```

Not `public.*` for everything. The schema boundary is a visible, greppable reminder of where the
module lines are, and it makes the eventual "move these tables to their own database" step
mechanical.

### 2. No cross-module joins in application code

**This is the rule that matters most.** Modules call each other through explicit TypeScript
interfaces, not by reaching into each other's tables.

```ts
// NO — billing reaching into the work order schema
const rows = await db.select().from(workorders.serviceOrders)...

// YES — billing asks the work order module
const order = await workOrderModule.getForInvoicing(orderId);
```

A single enforced rule here is the difference between extraction being a weekend and being a
quarter. It is also the hardest to maintain under deadline pressure, so enforce it mechanically:
each module owns its schema, and **a lint rule** prevents module A from querying module B's
tables.

**Enforce with a lint rule, not database grants.** `PROPOSED 2026-10-09` — grants that block
cross-schema reads also break cross-schema foreign keys, and we want those. ADR-002 chose Postgres
precisely for referential integrity that affects billing accuracy, and the real relationships cross
module lines: service order → invoice line → parts issued. So:

- **Keep foreign keys across schemas** at the database level. Constraints are not business logic
  (ADR-011) and should be used aggressively.
- **Restrict *query* access in application code**, where a lint rule can see it and a reviewer can
  reason about it.

At extraction time the cross-schema FKs are the one thing that must be dropped and replaced with
eventual consistency over events — which is a known, bounded piece of work, and a far better
trade than giving up integrity for years in exchange for a boundary we may never cross.

### 3. Domain events on an outbox table

From day one, significant state changes write to an outbox table in the same transaction as the
change itself:

```
service_order.authorized
parts.issued
invoice.posted
inspection.defect_found
```

A simple in-process dispatcher reads the outbox and fans events out to subscribers. Today that's
a function call. When a module becomes a service, **the event bus is already the integration
point** — swap the dispatcher for SQS, NATS, or whatever fits, and nothing else changes.

This also delivers immediate value well before any extraction: audit logging, the customer portal
activity feed, notifications, **and the live-update layer the UI needs** all fall out of it
naturally. The outbox was promoted to the realtime substrate in ADR-015 — full mechanics
(replay cursors, `SKIP LOCKED` dispatch, retention, fanout) live in [[Realtime and Events]].

Of the three rules this is the one to build **first**, because it is correct under every scenario,
including an offline-first pivot.

## Extraction, When the Time Comes

A strangler-fig migration, one module at a time:

1. Pick the module with real pressure behind it — a scaling problem, a team boundary, or a
   different deployment need (the customer portal is the likeliest first candidate, since it has
   a different security posture and traffic profile).
2. Stand up the new service with a copy of the module's code. The interface is already defined.
3. Point the monolith's module interface at the service over HTTP or gRPC instead of in-process.
4. Move the module's schema to its own database once the interface has been stable for a while.
5. Replace any remaining reads with events from the outbox.

Because the interface existed first, steps 2–3 are a deployment exercise, not a redesign. The
second service is running before anyone has to think about Kubernetes.

## What Actually Forces the Split

Worth being honest about, so nobody extracts a service out of architectural ambition:

| Trigger | Likely for Fleetco? |
|---|---|
| More engineers than can share one deploy | Unlikely — resale is a small possibility (Q7) |
| Different security posture for one surface | **Most likely trigger** — the customer portal |
| Genuinely different scaling profile | Unlikely for years |
| Different deployment cadence demanded by a customer | Unlikely without resale |
| Raw database load | Very unlikely. Postgres scales vertically a long way. |

**Honest assessment: extraction may well never happen,** and that is a perfectly good outcome. The
portal is the only plausible candidate, on security-posture grounds rather than scale.

Note that **load is rarely the reason.** For a vertical B2B product with tens of tenants and
thousands of users, a single well-indexed Postgres instance is nowhere near a ceiling. The real
driver is organizational.

## Deliberate Non-Goals for Phase One

- No Kubernetes — deferred with an explicit trigger list in [[Hosting and Deployment]], not
  rejected forever
- No service mesh
- No separate read models or CQRS
- No message broker at all — no SQS, NATS, Kafka, or Redis. The outbox table is the durable log
  and Postgres `LISTEN/NOTIFY` does ephemeral fanout between API tasks (ADR-015, ADR-023).
  Durability never lived in the transport, so a dropped notification costs nothing — a client
  reconnects with its cursor and replays.
- No GraphQL federation
- No distributed tracing beyond simple request IDs

Each of these is a reasonable thing to add later in response to an actual problem, and a
significant tax to carry before then.

## Related

- [[Stack Evaluation]]
- [[Tenancy Model]]
- [[Architecture Decisions]]
- [[Realtime and Events]]
- [[Operations]]
