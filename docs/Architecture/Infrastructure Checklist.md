---
created: 2026-10-09
tags: [fleetco, architecture, infrastructure, observability, checklist, saas]
source: Claude Code (Xerro)
---

## Overview

The cross-cutting infrastructure a SaaS application needs that is not a product feature and does
not show up in any requirements document — so it gets discovered in production, usually at the
worst moment.

**This is an inventory, not a work order.** Most items are not blockers to start. The value is in
the **When** column: a handful must be built into the skeleton because retrofitting them means
touching every file, and the rest can wait for a specific trigger.

[[Operations]] covers the *procedures* for running the system. This document covers *what has to
exist*.

Phase key:
- **P0 — Skeleton.** Before the first real user. Cheap now, expensive to retrofit.
- **P1 — Before cutover.** Required the day Fleetco turns FullBay off and a business depends on this.
- **P2 — Later.** Needs a trigger: tenant two, the first enterprise customer, or real scale.

## The Ones That Actually Bite

Out of everything below, these are the items most often missed and most painful to discover late.

| Item | Why it bites |
|---|---|
| **Request-scoped logging context** | Adding `tenant_id`/`user_id`/`request_id` to logs later means touching every log call in the codebase. P0 or regret it. |
| **Idempotency keys on writes** | A double-submitted invoice is a billing error, not a UI glitch. Must be designed in, not patched. |
| **Time zone strategy** | Store UTC, render in shop-local. Labor hours and invoice dates are wrong forever if this is decided late. |
| **Email deliverability (SPF/DKIM/DMARC)** | Invoices land in spam silently. Nobody reports it; they just don't pay. Must be done before the first invoice is sent. |
| **A2P 10DLC registration** | If the shop texts customers, US carriers require registration and it takes **weeks**. Start early or the feature sits finished and unusable. |
| **Admin / back-office tooling** | Chronically forgotten. Day one of production you need to reset a password, fix a bad record, and reprocess an invoice. Without it, every fix is a manual SQL statement against production. |
| **EXIF stripping on photos** | Defect photos from phones carry GPS coordinates. Storing and serving those is a privacy problem nobody notices until someone does. |
| **Graceful shutdown** | SSE holds long-lived connections (ADR-015). Without draining, every deploy drops every connected user mid-session. |

## Observability

> **Stack decided 2026-10-12 — ADR-028.** Sentry Team ($26/mo) for errors, backend *and* frontend,
> plus session replay. Pino for structured JSON logs. Metrics and alarms deferred between
> CloudWatch and Grafana Cloud — both acceptable, decided at implementation time. All custom
> instrumentation behind a `Telemetry` port so the vendor is one adapter.
>
> **NestJS Observe was evaluated on the spike harness and declined.** It cannot see an SSE stream
> (measured: zero telemetry for a held-open connection) and the 200ms outbox dispatcher must be
> excluded from it to stay inside any plan — so both P0 items below that matter most are in its
> blind spots. It is also backend-only, so it adds to Sentry rather than replacing it. Revisit
> after 1.0.

| Item | When | Tool / approach |
|---|---|---|
| Structured JSON logging | **P0** | Pino. Every line carries `request_id`, `tenant_id`, `user_id`, route |
| Request ID propagation | **P0** | Generated at the edge, threaded through. *Not* distributed tracing — see [[Evolution Path]] non-goals |
| PII logging policy | **P0** | A written list of what must never be logged: passwords, tokens, full payment data. Enforced by a redaction serializer |
| Backend error tracking | **P0** | Sentry, with release tagging so errors map to a deploy |
| Frontend error tracking | **P0** | Same Sentry project, separate DSN |
| Health + readiness endpoints | **P0** | `/health` touches the database; readiness separate from liveness |
| Log aggregation and search | **P1** | Provider-native to start. Retention ≥ 30 days |
| Uptime / synthetic monitoring | **P1** | External checker hitting `/health`. Alerts to **phone**, not email |
| Metrics and dashboards | **P1** | Request rate, p50/p95/p99 latency, error rate, DB pool saturation, outbox backlog. One "is it healthy" page. **We write these ourselves (ADR-028) — no vendor supplies outbox or SSE metrics** |
| Business-level alarms | **P1** | See [[Operations]] — no invoice posted in 4 business hours, outbox dead-letter, auth failure spike, cross-tenant denial (should be zero) |
| Alert routing and escalation | **P1** | Where alerts go, and what happens when Dave is asleep. See Q13 |
| Slow query logging + index review | **P1** | `pg_stat_statements`. A monthly look is enough early |
| Real user monitoring (Core Web Vitals) | **P2** | Shop floor tablets on bad Wi-Fi make this more relevant than usual |

## Product Analytics and User Tracking

| Item | When | Notes |
|---|---|---|
| Product analytics | **P1** | PostHog. **Strategically important here:** feature-usage data proves which FullBay capabilities actually get used, feeding [[Feature Inventory]] and Q4 |
| Session replay | **P1** | Dramatically reduces solo-operator support cost — see what the service advisor actually did. **Requires PII masking rules before enabling**, given customer and hospital data |
| Analytics consent / masking policy | **P1** | Written before replay is switched on, not after |
| Usage metering | **P2** | Needed even without usage-based billing — you cannot size or price what you cannot measure |
| Feature flags | **P2** | Decouples deploy from release; lets a risky change go to one customer first |

## Security

| Item | When | Notes |
|---|---|---|
| Secrets in a managed store | **P0** | Provider secret store. Never in the repo |
| Pre-commit secret scanner | **P0** | `gitleaks`. Cheap, catches the one mistake that matters |
| Audit log | **P0** | Falls out of the outbox (ADR-009). A compliance requirement, not a feature — see Q9 |
| Idempotency keys on writes | **P0** | Invoicing correctness. See the table above |
| Rate limiting | **P1** | Per IP **and** per account. At the edge and in the app — login, reset, and all write endpoints |
| Security headers / CSP | **P1** | Easy to add early, tedious to retrofit once inline scripts creep in |
| File upload validation | **P1** | Size limits, MIME sniffing, **EXIF stripping** on photos |
| Dependency scanning | **P1** | Renovate or Dependabot, **auto-merge on patch** so security fixes don't queue behind attention |
| Data retention + deletion policy | **P1** | Driven by DOT/DVIR and warranty requirements (Q9). Also: what happens when a customer leaves |
| PII inventory | **P1** | What sensitive data we hold, where it lives, who can see it. Hospital InfoSec will ask |
| TLS cert expiry monitoring | **P1** | Automatic renewal still fails sometimes, always on a weekend |
| SAST / code scanning | **P2** | CodeQL — free on GitHub, near-zero effort |
| WAF / bot protection | **P2** | Cloudflare in front when the portal is publicly reachable |
| Vulnerability disclosure path | **P2** | A `security.txt` and an email address. Trivial, and enterprise reviews look for it |
| Quarterly production access review | **P2** | Expect the answer to be "one or two people" — document it anyway |

## Delivery

| Item | When | Notes |
|---|---|---|
| CI: test, typecheck, lint | **P0** | On every PR |
| **Branded types** (ids, `Cents`, `Instant`) | **P0** | Highest-leverage agent guardrail — see [[Code Standards and Guardrails]] |
| **Custom architecture lint rules** | **P0** | Cross-module imports, unscoped queries, `process.env`, `any` |
| **Dependency allowlist** (CODEOWNERS on `package.json`) | **P0** | Agents add packages constantly |
| **The golden module** as reference implementation | **P0 at M6** | "Follow `modules/customers` exactly" beats any style guide |
| Mutation testing on money modules | **P1** | Periodic, not per-commit. Coverage is the wrong metric |
| Cross-tenant leak suite as a required gate | **P0** | No override. See [[Tenancy Model]] |
| Migration automation | **P0** | Drizzle, forward-only, expand/deploy/contract. See [[Operations]] |
| Seed and fixture data | **P0** | A realistic dataset for local dev and tests. Skipping this slows every future day |
| **Infrastructure as code** (Terraform/CDK) | **P0 from Phase 1** | Mandatory once a second environment exists, or they drift. ADR-026 |
| Vercel frontend previews per PR | **P0 from Phase 1** | Free and automatic; points at `staging`. Deployed *backend* previews were dropped — see [[Environments]] |
| **Non-prod mailer allowlist** | **P0 from Phase 1** | Staging emailing invoices to real customers is the likeliest real-world leak. Enforce in the mailer, not in config |
| Separate AWS accounts, prod vs non-prod | **P0 before production** | ADR-025. Best guard against a destructive command in the wrong place |
| Release versioning + changelog | **P1** | Support needs to ask "what version are you on" and get a useful answer |
| Staging with scrubbed production data | **P1** | Scrubbed, not a copy. Real shapes, fake people. **The scrubber is load-bearing for privacy and needs tests** |
| Aurora fast clone script | **P1** | On-demand copy-on-write clone for risky migrations — replaces Neon branching |
| Documented rollback path | **P1** | "Roll forward only" is a valid policy, but it must be a decision with a plan for when forward is broken |

## Reliability

| Item | When | Notes |
|---|---|---|
| Graceful shutdown / connection draining | **P0** | SSE makes this mandatory, not optional |
| Background job runner | **P0** | Outbox dispatcher, scheduled syncs, retention pruning. Real infrastructure that gets forgotten because it has no UI |
| Job failure visibility + dead letter | **P0** | A silently stalled dispatcher is worse than a crash. See [[Realtime and Events]]. Needs four custom metrics: backlog gauge, dispatcher heartbeat, dead-letter count, open-SSE-connection gauge |
| Timeouts, retries, backoff on outbound calls | **P1** | QuickBooks and parts catalogs will be flaky. Assume it |
| Circuit breaker on integrations | **P1** | One dead vendor API must not take down invoicing |
| Connection pool sizing + monitoring | **P1** | The usual first real scaling surprise |
| Degraded / read-only mode | **P2** | A shop looking things up during an incident is far better than a shop that is fully down |

## Operational and Business

| Item | When | Notes |
|---|---|---|
| Admin / back-office tooling | **P1** | See the bite table. Password resets, record repair, invoice reprocessing |
| Impersonation with audit trail | **P1** | Converts most support calls from 30 minutes to 3. See [[Auth and Identity]] |
| Support intake channel | **P1** | A shared mailbox or channel — not texts to a personal phone. See Q15 |
| Runbooks | **P1** | Restore, rollback, common failures. Written so someone who is *not* Dave can follow them |
| Email deliverability: SPF, DKIM, DMARC | **P1** | Before the first invoice is emailed. See the bite table |
| Cost and billing alerts | **P1** | A runaway query or egress spike should page someone, not surprise a credit card |
| Status page | **P2** | Even a trivial one, once there is more than one tenant |
| A2P 10DLC registration | **P2** | Only if SMS ships. **Start weeks early** |
| Legal: ToS, privacy policy, DPA | **P2** | A hospital customer will ask for a DPA |
| Billing / subscription infrastructure | **P2** | Only if resale becomes real (Q7) |

## Cross-Cutting Decisions to Make Early

Not tools — decisions that silently shape everything, and are expensive to revisit:

1. **Time zones.** Store UTC, render in shop-local. Which timezone does a shop *have*, and is it a
   configuration value? Labor hours and invoice dates depend on this.
2. **Money.** Integer minor units, never floats. One currency assumed; name the assumption.
3. **Soft delete vs. hard delete.** Legal retention (Q9) argues for soft delete almost everywhere,
   which means every query must filter it — so decide at the chokepoint, not per table.
4. **Identifiers.** UUIDv7 (see [[Tenancy Model]]). Non-enumerable in portal URLs.
5. **What counts as PII here**, and what therefore cannot be logged, replayed, or sent to a
   third-party analytics service.

## Rough Cost

Most of the P0 and P1 list is configuration and discipline rather than spend. Incremental
services:

| Service | Monthly |
|---|---|
| Sentry Team — errors + frontend + replay (ADR-028) | $26 |
| Metrics backend — CloudWatch, or Grafana Cloud free tier | $0–15 |
| PostHog (analytics + replay) | $0–50 at this volume |
| Uptime monitoring | $0–10 |
| **Already included in the [[Stack Evaluation]] model** | **~$30–85** |

Still trivial against FullBay's $5,000. The real cost is the time to build the P0 items into the
skeleton, which is why they belong in the skeleton rather than in a later sprint.

## Related

- [[Operations]] — procedures: backup, restore, migrations, support, incidents
- [[Environments]] — environment progression, parity rules, real-world guards
- [[Testing Strategy]] — CI gates and the test layers
- [[Code Standards and Guardrails]] — what the lint layer enforces
- [[Stack Evaluation]] — the vendor and cost model
- [[Realtime and Events]] — outbox, dispatcher, dead-letter
- [[Auth and Identity]] — impersonation, session security
- [[Tenancy Model]] — the leak-test suite and identifier rules
- [[Open Questions]] — Q9 (retention), Q13 (who else maintains this), Q15 (support expectations)
