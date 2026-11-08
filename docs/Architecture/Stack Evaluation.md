---
status: current
summary: The full stack and the cost model
created: 2026-10-08
updated: 2026-11-08
tags: [fleetco, architecture, stack, postgres, aurora, aws, cost]
source: Claude Code (Xerro)
---

## Overview

Options analysis for the Fleetco platform's backend. The question as originally posed was
"Supabase to start, or microservices?" — the useful reframing was **"what is the smallest thing
that keeps the door to services open?"**

**Recommendation: modular monolith in Node/TypeScript on AWS — Aurora Serverless v2 for Postgres,
S3 for object storage, Better Auth self-hosted, and our own API in front of all of it.**

> **Two revisions, both on 2026-10-09.** This document first recommended Supabase, then Neon. Both
> were withdrawn. The *architectural* conclusions — own API not BaaS, Postgres not Mongo, monolith
> not microservices, no business logic in the database — never depended on the vendor and are
> unchanged throughout. See [[#Why Not Supabase]] and [[Platform Choice]].

## Why Not Microservices to Start

Dave's instinct was a fully cloud-hosted microservice solution in Node and React. That is a sound
long-term target and the wrong starting point, for two reasons — and hosting cost is the *smaller*
one.

**The coordination tax.** Every service needs its own deploy pipeline, observability, distributed
tracing, inter-service auth, and schema contracts. Anything that was one Postgres transaction
becomes a distributed saga. For a one-to-three-person team that is roughly a 2–3x cost on every
feature shipped.

**The boundaries are unknown.** The seams in heavy-duty repair are genuinely non-obvious: service
orders vs. parts inventory vs. PM scheduling vs. invoicing vs. the customer portal. Guess wrong
and a bad boundary is hardened into a network call, which is far more expensive to undo than a bad
module boundary inside one repository. You learn the real boundaries by building the domain.

## The Decision That Actually Matters

Not "which provider." It is: **does React talk to the database platform directly, or to our own
API?**

For this product, **our own API.** Reasons specific to fleet maintenance:

- **Real business logic.** Service-order state machines, the customer authorization workflow, labor
  rates, parts markup, warranty handling, invoice generation. None of that fits comfortably in RLS
  policies and Postgres functions.
- **Multi-tenancy safety.** RLS-only tenant isolation works until one policy is subtly wrong, and
  then it is a cross-tenant leak in a portal that *customers' own customers* can see. See
  [[Tenancy Model]].
- **A public API needs versioning.** You cannot version an auto-generated PostgREST schema.
- **Integrations are server-side anyway.** Accounting, parts catalogs, telematics.

This conclusion is what disqualified Supabase, and later what reduced Neon to a convenience
bundle.

## Why Not Supabase

The original analysis identified that Supabase's lock-in is **not uniform** — it depends entirely
on which features are allowed into the application:

| Tier | Feature | Exit cost |
|---|---|---|
| **None** | Postgres tables, SQL migrations | `pg_dump`. It is just Postgres. |
| **Low** | Storage (S3-backed), Realtime | Swap the client, move objects. Days. |
| **Medium** | Auth (GoTrue) | Users live in `auth.users`. A weekend plus a careful cutover. |
| **High** | RLS as the authorization layer, Edge Functions, PostgREST as the public API | **The trap.** Business rules live in SQL policies and Deno functions that exist nowhere else. |

The policy was "stay in the top three tiers deliberately" — and following it honestly is what
revealed the problem. **Once RLS-as-authz, PostgREST, and Edge Functions are banned, what remains
is a convenience bundle rather than a platform.** Supabase Realtime was additionally unusable,
because it authorizes via RLS and requires the browser to connect directly to the platform —
contradicting the decision above.

**This tier framework turned out to be the reusable tool**, and it is what later evaluated Neon's
bundle and rejected its Data API and Functions on identical grounds. Keep it for the next vendor
that bundles.

## Why Not Neon

Neon replaced Supabase and then lost on a different axis. Stripping its bundle down, only one
thing was unique to it:

| Neon service | AWS equivalent | Winner |
|---|---|---|
| Postgres | Aurora / RDS | **AWS** — far more proven for a decade-long commitment |
| Object storage | S3 | **AWS, clearly** — Object Lock and versioning for statutory records |
| Managed Better Auth | The same library, self-hosted | Tie — it is a library either way |
| **Database branching** | Aurora fast clone (partial) | **Neon** — the one genuine differentiator |

So the question became whether per-pull-request branching justifies keeping a vendor in the
critical path. It does not: **availability is the product of every vendor in the request path**,
and with a bus factor of one, fewer vendors between the shop and their invoices is a recurring
structural win. Same-VPC private networking, S3 Object Lock for DVIR records, and one bill follow
from the same move. Full evaluation in [[Platform Choice]]; decision in ADR-023.

## Database: Postgres, Not MongoDB

Clear call. Fleet maintenance is relational to its core — customers, vehicles, service orders, line
items, parts, inventory movements, invoices — with referential integrity that directly affects
billing accuracy. Document stores make the invoicing and inventory math harder, not easier.

## Proposed Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + TypeScript + Vite | Dave's stated preference and strongest ground |
| API | Node + TypeScript — **NestJS** (ADR-027) | Decided by spike 2026-10-13; Express adapter, Zod contracts |
| API contract | REST + OpenAPI generated from Zod schemas | Versionable public contract *and* end-to-end types |
| ORM / query | Drizzle | Migrations-as-code, SQL control, plain readable SQL files |
| Database | **Aurora Serverless v2** (Postgres), private subnet | In-VPC, storage replicated 6 ways across 3 AZs, fast clone for branching |
| Auth | Better Auth self-hosted, behind our own authN port | Covers the flows; swappable by design |
| Realtime | SSE from our API, fed by the outbox | Same authorization path as REST; supports replay |
| Fanout | Postgres `LISTEN/NOTIFY` | No Redis — durability is the outbox table |
| File storage | **S3**, versioning + Object Lock | Defect photos, signed authorizations, invoices — some are statutory records |
| Compute | **ECS Fargate** — `api` ×2, dispatcher in-process | No cluster, no nodes, no ECS API deprecations. Worker splits out when a handler does real outbound work |
| Frontend hosting | **S3 + CloudFront** (ADR-033) | In the same Terraform as everything else. Vercel's free tier is not licensed for commercial use, so it was $20–40/seat against ~$5 |
| Feature flags | **LaunchDarkly** free tier, behind a port (ADR-034) | Release mechanism, not a convenience — there is no staging environment |
| Errors | Sentry | Non-negotiable on software a business depends on |

Full hosting treatment in [[Hosting and Deployment]]; environments in [[Environments]].

## Cost Model

**Approximate, us-east-1, from knowledge with a May 2026 cutoff. Verify in the AWS calculator.**

| Item | Monthly |
|---|---|
| Fargate: `api` ×2 (right-sized) | $18 |
| ALB | $20 |
| NAT gateway — **one, in `prod`** (ADR-029/B6) | $32 |
| CloudFront + S3 for the UI | $5 |
| Aurora Serverless v2, 0.5 ACU floor + 50 GB | $50–60 |
| S3 + requests + egress | $5–25 |
| Parameter Store, ECR, CloudWatch Logs | $7–10 |
| **AWS subtotal** | **$109–174** |
| `dev`, the only non-production environment *(see [[Environments]])* | $41–51 |
| Release-time database clones — copy-on-write, destroyed after | ~$1 |
| ~~Vercel~~ — replaced by CloudFront, counted above | — |
| LaunchDarkly (free Developer tier; billed per running process) | $0–10 |
| GitHub Team, 2–3 seats | $8–12 |
| Sentry | $26 |
| PostHog (analytics + session replay) | $0–50 |
| Transactional email + SMS (Resend / Twilio) | $20–50 |
| Uptime monitoring, domain, misc. | $5–15 |
| **Total through first production customer** | **$230–375** |

**Revised 2026-11-08.** The third environment was removed (ADR-029), the frontend moved from Vercel
to CloudFront (ADR-033), LaunchDarkly and GitHub Team were added, and the NAT gateway stopped being
optional. Net effect is roughly flat.

**Earlier revision history on this figure.** The original "under $100" omitted email, SMS, error tracking,
and object egress. Pooled deployment (ADR-006) then made it flat with tenant count rather than a
per-tenant multiple. Realistic Fargate and Aurora sizing corrected it upward. Dropping Neon
removed Redis and trimmed it slightly. Non-production environments were then added explicitly, and
reconciled against [[Environments]] on 2026-10-09 — the upper bound is $65, covering two
environments, not one.

**Context:** Fleetco currently pays **$5,000/month for FullBay**. This stack is under **8%** of
that. An equivalent microservice footprint on EKS runs roughly **$500–1,500/month** before serving
a request — still cheaper than FullBay, but ~4x this with a 2–3x per-feature tax on top.

## Does This Stack Hold Permanently?

Largely, and that is the point. Postgres scales vertically a very long way, and for a vertical B2B
product with tens of tenants and thousands of users it is nowhere near a ceiling. The realistic
future is:

1. Aurora + one Node deployable on Fargate (now)
2. Same, with the first module extracted when real pressure appears — see [[Evolution Path]]
3. Kubernetes if and only if a trigger in ADR-021 fires

The thing that forces services is rarely load. It is **team boundaries** — more engineers than can
comfortably share one deploy. That is a good problem and a long way off.

## Related

- [[AWS Buildout]] — the buildout and the current cost model
- [[Platform Choice]] — the Neon-versus-AWS-native evaluation
- [[Hosting and Deployment]] — Fargate, ALB, SSE, Kubernetes triggers
- [[Environments]] — non-production topology and cost
- [[Architecture Decisions]]
- [[Auth and Identity]]
- [[Realtime and Events]]
- [[Tenancy Model]]
- [[Evolution Path]]
- [[Operations]]
- [[Infrastructure Checklist]]
- [[Fleetco Overview]]
