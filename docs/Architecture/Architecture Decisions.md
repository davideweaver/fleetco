---
status: current
summary: ADR log, 001-035. The decision index is at the top
created: 2026-10-08
updated: 2026-11-08
tags: [fleetco, architecture, adr, decisions]
source: Claude Code (Xerro)
---

## Overview

ADR-style log of architectural decisions for the Fleetco platform. Every decision here is
**provisional** until the project is accepted and [[Open Questions]] are answered — in particular,
Q2 (the prototype) and Q5 (mobile/offline) could reopen several of these.

Status key: `PROPOSED` · `ACCEPTED` · `SUPERSEDED` · `REOPENED`

## Decision Index

| ADR | Decision | Status |
|---|---|---|
| 001 | Modular monolith, not microservices, for phase one | `PROPOSED` |
| 002 | Postgres, not MongoDB | `PROPOSED` |
| 003 | Supabase as infrastructure, not as the application | `SUPERSEDED` by 010 |
| 004 | Avoid the high-lock-in Supabase tier | `SUPERSEDED` by 011 |
| 005 | **The business is the unit of tenancy** | `PROPOSED` (rewritten 2026-11-08) |
| 006 | Pooled deployment, single shared database | `PROPOSED` (resolved) |
| 007 | Users modeled as `user ↔ membership ↔ tenant` | `PROPOSED` (re-justified) |
| 008 | Subdomain-based tenant resolution | `SUPERSEDED` by 018 |
| 009 | Transactional outbox for domain events | `PROPOSED` (expanded) |
| 010 | Plain managed Postgres, not Supabase | `PROPOSED` (provider revised) |
| 011 | No business logic in the database | `PROPOSED` |
| 012 | Authentication behind a port; Better Auth as first adapter | `PROPOSED` |
| 013 | Opaque session tokens in Postgres, not JWTs | `PROPOSED` |
| 014 | REST with OpenAPI generated from Zod schemas | `PROPOSED` |
| 015 | Server-owned realtime over SSE, fed by the outbox | `PROPOSED` (transport revised) |
| 016 | Federated identity model, SSO-ready on day one | `PROPOSED` |
| 017 | Cookie scoping under subdomain tenancy | `SUPERSEDED` by 018 — moot |
| 018 | Single domain, no subdomain tenant routing | `PROPOSED` |
| 019 | Neon platform services: take primitives, refuse API layers | `SUPERSEDED` by 023 |
| 020 | Neon-managed Better Auth, conditional on two answers | `SUPERSEDED` by 023 |
| 021 | AWS ECS Fargate, not Kubernetes | `PROPOSED` |
| 022 | Platform-portable containerization discipline | `PROPOSED` |
| 023 | AWS-native platform: Aurora + S3, Neon dropped | `PROPOSED` |
| 024 | One non-prod environment first, two at cutover | `SUPERSEDED` by 029 |
| 025 | Separate AWS accounts for production and non-production | `PROPOSED` |
| 026 | Infrastructure as code once a second environment exists | `PROPOSED` (resolved by 030) |
| 027 | NestJS, decided by spike | `PROPOSED` (resolved) |
| 028 | Observability: Sentry + Pino behind a Telemetry port; metrics backend deferred | `PROPOSED` |
| 029 | Two deployed environments, no staging | `PROPOSED` |
| 030 | Terraform, not CDK | `PROPOSED` (resolves 026) |
| 031 | GitHub Actions with OIDC, build once, promote the artifact | `PROPOSED` |
| 032 | Agent access model: read-only in production | `PROPOSED` |
| 033 | S3 and CloudFront for the frontend, not Vercel | `PROPOSED` |
| 034 | Feature flags are release mechanism, with two CI gates | `PROPOSED` |
| 035 | QuickBooks is the real tenancy boundary, and needs its own control | `PROPOSED` |

## ADR-001 — Modular monolith, not microservices, for phase one `PROPOSED`

**Context.** Dave's instinct is a cloud-hosted microservice architecture in Node with React. Sound
long-term target, wrong starting point.

**Decision.** One Node/TypeScript deployable with enforced internal module boundaries.

**Rationale.** The dominant cost of early microservices is not hosting — it's the ~2–3x
per-feature coordination tax on a one-to-three-person team, plus the fact that the correct service
boundaries in heavy-duty repair are genuinely unknown until the domain is built. A bad module
boundary is cheap to fix; a bad network boundary is not.

**Consequences.** Requires deliberate internal discipline to avoid becoming a tangled monolith —
see [[Evolution Path]]. Revisit when team size or a differing security posture forces a split.

**Caveat.** Q5 (offline/mobile) is the one open question that could reopen this.

## ADR-002 — Postgres, not MongoDB `PROPOSED`

**Context.** Dave floated MongoDB or Postgres.

**Decision.** Postgres.

**Rationale.** The domain is strongly relational — customers, vehicles, service orders, line items,
parts, inventory movements, invoices — with referential integrity that directly affects billing
accuracy. A document store makes the invoicing and inventory math harder.

**Consequences.** Schema migrations become a managed discipline from day one. Acceptable — see
[[Operations]].

## ADR-003 — Supabase as infrastructure, not as the application `SUPERSEDED`

> **Superseded by ADR-010 on 2026-10-09.** The *principle* in this decision survives intact:
> the browser never queries the database platform directly, and all business logic lives in our
> own API. Only the choice of vendor changed. Retained here because the reasoning trail is what
> produced ADR-010.

**Original decision.** Use Supabase for managed Postgres, Auth, and Storage; write our own Node
API in front of it. The browser never holds a Supabase service-role key and never queries tables
directly.

**Why it was superseded.** Following ADR-004 honestly — banning RLS-as-authz, PostgREST, and Edge
Functions — left Supabase supplying a connection string, an object store, a user table that
created a workaround rather than solving a problem, and a Realtime feature that was unusable
under this very ADR. See [[Stack Evaluation]].

## ADR-004 — Avoid the high-lock-in Supabase tier deliberately `SUPERSEDED`

> **Superseded by ADR-011 on 2026-10-09.** Generalized from a Supabase-specific policy into a
> vendor-independent principle. The lock-in-by-tier analysis is preserved in [[Stack Evaluation]]
> because it is the reasoning that produced ADR-010.

## ADR-005 — The business is the unit of tenancy `PROPOSED`

**Rewritten 2026-11-08**, replacing "the tenant is the fleet management company" in full. ADR-006
(pooled), ADR-018 (single hostname) and ADR-029 (two environments) are unaffected; ADR-007 is
extended rather than changed.

**Context.** A **tenant** is a company; a **business** is a line of business inside it. OTC is one
tenant holding four businesses — graphics, fleet, trailers, and a test business for the developer.
OTC is the only tenant for the next one to two years; resale would add more. Users are global to the
tenant and granted access per business. Everything domain-level belongs to exactly one business.
Businesses are created and deleted as a V1 feature, because the test business needs both
(ADR-029).

The original ADR-005 assumed one level of scope and made it the tenant. That assumption is what has
to change. The question is whether the replacement enforces one level or two.

**Decision. One enforced level: `business_id`, on every domain table, and no `tenant_id` there.**

- Domain tables carry `business_id uuid NOT NULL REFERENCES platform.businesses(id)`, denormalized
  onto child tables rather than reached through a join. A schema gate fails the build if a domain
  table lacks it, or carries `tenant_id`.
- Child rows reference their parent by the composite pair `(business_id, parent_id)`, against a
  `UNIQUE (business_id, id)` on the parent. **Cross-business parenting becomes impossible in the
  database**, not merely unlikely in the service.
- The tenant survives as the grouping for the user directory, roles, numbering uniqueness and
  billing, on its own small set of tenant-scoped tables. It applies no predicate to domain queries.
- **Two authorization levels, one tenancy level.** Business replaces tenant in the chokepoint's
  first slot; it does not add a slot. The second slot is a row filter — a discriminated union of
  `all` (staff), `customer` (portal) and `assignee` (technician, ROLE-003) — of which exactly one
  applies.
- The active business is carried in the **request path** (`/v1/b/{businessId}/…`), never on the
  session, and resolved and validated on every request. **There is no default business.**
- A business is **archived**, not deleted. Hard purge is permitted only for a business whose
  immutable `is_test` flag is set.

**Rationale.**

- **The original rationale stands, and is the reason for one level rather than two.** Nested
  tenancy roughly doubles complexity for no benefit. Enforcing both ids would overturn that;
  enforcing only `business_id` honours it.
- **Two predicates would not be two independent checks.** Under two levels both ids derive from the
  same membership lookup, so a bug there produces a consistent pair and both predicates pass. The
  cross-tenant check earns its keep only when its inputs have independent provenance — the
  session's tenant and the request's business — and that is one assertion in one resolver, not a
  predicate repeated on sixty tables. A denormalized `tenant_id` on a domain row can only catch a
  disagreement the column itself creates.
- **`business_id` is globally unique and a business never moves between tenants**, so
  `WHERE business_id = X` already implies the tenant. **That invariant is load-bearing: if it ever
  has to change, this decision reopens.**
- **Chokepoint arity is the reviewable property.** Every line is agent-written and reviewed by one
  person, so "do all the scope predicates apply to this new table?" must never need answering
  twice. One required scope key per table, chosen by which repository base class it extends, is a
  compiler question rather than a memory question.
- **The business boundary is crossed by live traffic every day** (ADR-029's test business); the
  tenant boundary will not be for years. Enforcing the boundary that is actually crossed is worth
  more than enforcing the hypothetical one.

**Consequences.**

- `tenant_id` leaves every domain table, so ADR-006's extraction path — filter by `tenant_id`, dump
  the subset — becomes a join through `platform.businesses`. A view definition, not a rewrite.
- **There is no data-layer backstop for a cross-tenant leak.** A resolver bug is a cross-tenant
  breach rather than a cross-business one. The compensating control is a leak test that **stubs the
  grant check to pass and asserts a foreign-tenant business still 404s**, proving the two checks are
  independent.
- The leak suite's central case becomes a **multi-business user**: legitimately a member of two
  businesses, acting in one, must not reach the other by passing its ids. Full case list in
  [[Tenancy Model]]. Still a required deploy gate.
- Outbox topics become `business:{businessId}:…` and `customer:{businessId}:{customerId}`; the
  replay index becomes `(business_id, topic, id)`; ordering is guaranteed per business.
- Because the active business lives in the request rather than the session, **two browser tabs can
  sit in two businesses without interfering** — the intended behaviour, and it makes visual
  distinctness of the active business a requirement rather than a courtesy.
- **Switching business re-mints the session only when it crosses tenants**, never within one. This
  supersedes the "switching business should re-mint the session" note in [[AWS Buildout]], which
  would have changed a cookie all tabs share and destroyed the two-tab property.
- **Soft delete is settled at the business level** — one predicate on one row at the chokepoint —
  rather than `deleted_at` on sixty tables, resolving [[Infrastructure Checklist]]'s cross-cutting
  item more cheaply than that document anticipated. Domain rows keep their own lifecycles: void,
  cancel, inactive.
- `platform.audit_log` and `platform.document_numbers` survive a purge by design (PLAT-004,
  PLAT-009) and therefore carry no foreign key to `platform.businesses`. The missing key is
  load-bearing and is commented as such.
- Numbers are allocated from a **per-business gap-free sequence with an immutable prefix**, unique
  tenant-wide by constraint — because QBO-002 syncs every business into one QuickBooks company file,
  which is one `DocNumber` namespace (INV-004).
- **The integration edge is not covered by this decision and needs its own control** — see
  ADR-035.
- **PLAT-006 and the `fleetco-ui` context cluster say "department" and assume customers are shared
  across them. Both change.** The concept is a **Business** in the UI and `business` in code, and
  customers are business-scoped. **This reverses a documented design choice** made because Cam's
  biggest FullBay complaint was one company split across many customer records (G5), and it is
  gated on D-C18.
- **This promotes FUT-002 (the switcher) into V1 scope**, which is a PRD decision as much as an
  architectural one.

## ADR-006 — Pooled deployment, single shared database `PROPOSED`

**Resolved 2026-10-09**, superseding the original "siloed deployment initially" decision and
closing the reopening.

**Context.** Dave assesses reselling the platform to other fleet management companies as a **small
possibility**, and does not want that possibility to complicate the system before it is real
(Q7). The earlier decision deployed a separate database and API instance per tenant from the
start, to offer physical data isolation as a sales answer.

**Decision.** **One shared database.** All tenants' rows live together, separated by `tenant_id`.
One deploy, one migration run. `tenant_id` still goes on every domain table from the first
migration.

**Rationale.**

- **The migrations are asymmetric.** Pooled → siloed is easy: filter by `tenant_id`, dump the
  subset, point that tenant at a new database — per-tenant, on demand, for the one buyer who ever
  demands it. Siloed → pooled is hard: merging databases with colliding keys and drifted schemas.
  **Pooled-first is the reversible choice; siloed-first was the one-way door.**
- **Siloed required real platform work before tenant two** — fan-out migration tooling, a tenant
  registry, partial-failure handling, cross-tenant log aggregation. That is a few weeks spent
  ahead of a problem that may never arrive.
- **The market does not demand it.** ServiceTitan, Fleetio, and almost certainly FullBay are all
  pooled. Physical isolation in this category is an enterprise upsell, not a baseline expectation.
- **Schema drift was the likeliest 6am incident** — N databases at differing migration versions
  after a partial fan-out failure, against a bus factor of one. See [[Operations]].

**Why `tenant_id` stays anyway.** It is nearly free, because the portal forces the scoping
machinery regardless: portal users must be restricted to one `customer_id`, so the query-level
chokepoint and the leak-test suite get built either way. `tenant_id` rides along on infrastructure
that already has to exist, and retrofitting it later would touch every table and every query.

**Consequences.** Cost settles at the low end of the [[Stack Evaluation]] model. No tenant
registry, no migration fan-out, no per-tenant deploys. If a buyer ever demands physical isolation,
extracting that one tenant to its own database is a bounded piece of work rather than a rewrite.

## ADR-007 — Users modeled as `user ↔ membership ↔ tenant` `PROPOSED`

**Decision.** No `tenant_id` column directly on users. Always go through a memberships table.

**Rationale — revised 2026-10-09.** The original rationale was that Supabase user pools don't
nest. That rationale is void under ADR-010, but **the decision stands on the stronger underlying
reason**: a fleet serviced by two competing shops that both run this software is a completely
normal situation, so a person can legitimately belong to two tenants. Pooled deployment (ADR-006)
exposes this immediately rather than hiding it.

**Consequences.** Extended by ADR-016, which adds a separate `identity` table beneath the user.

## ADR-008 — Subdomain-based tenant resolution `SUPERSEDED`

> **Superseded by ADR-018 on 2026-10-09.** Both of its rationales were resale-driven: giving
> resellers something that felt like their own product, and resolving a tenant before login. With
> one tenant there is nothing to resolve. Retained because its withdrawal is what makes ADR-017
> moot.

**Original decision.** `<tenant>.yourapp.com`, resolved before login.

## ADR-009 — Transactional outbox for domain events `PROPOSED`

**Decision.** Significant state changes write to an outbox table in the same transaction as the
change. An in-process dispatcher fans out to subscribers.

**Rationale.** Immediate value (audit log, portal activity feed, notifications) and it pre-builds
the integration seam for any future service extraction.

**Expanded 2026-10-09.** The outbox is now also the **realtime substrate**, not merely an audit
mechanism. That promotion adds requirements: a monotonic id serving as a client replay cursor,
`FOR UPDATE SKIP LOCKED` dispatch for multi-instance safety, idempotent handlers under
at-least-once delivery, dead-letter alerting, and monthly partitioning with a retention policy.
Full treatment in [[Realtime and Events]].

**Consequences.** This is the highest-leverage piece of infrastructure in the system and is
correct under every scenario, including an offline-first pivot. Build it first.

## ADR-010 — Plain managed Postgres, not Supabase `PROPOSED`

**Context.** Supersedes ADR-003. Supabase was selected as the Postgres/Auth/Storage provider;
the constraints in ADR-004 then removed most of what made it attractive.

**Decision.** Plain managed Postgres, with our own auth library (ADR-012), object storage on an
S3-compatible store, and our own realtime layer (ADR-015).

> **Provider revised 2026-10-09 by ADR-023: AWS Aurora Serverless v2.** Neon was the original
> choice. The decision *against* Supabase and against any database-resident business logic is
> unchanged, and is what this ADR actually establishes.

**Rationale.** With RLS-as-authz, PostgREST, and Edge Functions all banned, Supabase's residual
contribution was a dashboard and a few saved days on auth flows — against a vendor sitting in the
most security-sensitive path in the system. Supabase Realtime was additionally unusable because
it authorizes via RLS and requires direct browser-to-platform connections. Neon adds database
branching, which makes per-pull-request preview environments nearly free. Full analysis in
[[Stack Evaluation]].

**Consequences.** A few more days of setup for auth and storage. In exchange: no vendor in the
auth path, one authorization implementation rather than two, and ADR-007's workaround becomes
unnecessary.

## ADR-011 — No business logic in the database `PROPOSED`

**Context.** Generalizes ADR-004 beyond Supabase.

**Decision.** Business logic lives in TypeScript in our API. **Not permitted as primary
mechanisms:** row-level security as the authorization layer, database functions or triggers
encoding domain rules, or any auto-generated API as the public contract.

**Rationale.** Logic encoded in SQL policies and triggers is invisible to the type system,
untestable alongside the code that depends on it, and unportable. More importantly, authorization
must have exactly **one** implementation — two that must agree forever is how cross-tenant leaks
ship.

**Consequences.** RLS may still be enabled as defense-in-depth, but correctness must never depend
on it alone. Database constraints (foreign keys, `NOT NULL`, `CHECK`) are emphatically *not*
business logic and should be used aggressively.

## ADR-012 — Authentication behind a port; Better Auth as the first adapter `PROPOSED`

**Context.** Needed after ADR-010 removed Supabase Auth. Options were hand-rolling, a TypeScript
library, or a self-hosted identity server.

**Decision.** Define an `AuthN` port in our own code. Implement it with **Better Auth**, which
generates tables into our own Postgres and runs in our process.

**Rationale.** Authentication is the easy half of the problem; authorization is ours regardless and
no library models our tenancy. So the library choice should be made behind a seam and then
stopped worrying about. Better Auth covers the flows with sharp edges (reset, verification,
change-email) plus a long tail we will certainly want — TOTP 2FA, API keys, and admin
impersonation for support. With a team of 1–3 and no security reviewer, inherited security
maintenance is worth more than it appears.

**Consequences.** A young dependency on a sensitive path, and an upgrade treadmill. The port
limits the blast radius and keeps Keycloak or WorkOS available later. Full treatment in
[[Auth and Identity]].

## ADR-013 — Opaque session tokens in Postgres, not JWTs `PROPOSED`

**Decision.** 32 random bytes, base64url-encoded, stored as a SHA-256 hash in a `sessions` table,
delivered as an `httpOnly; Secure; SameSite=Lax` cookie. Passwords hashed with argon2id.

**Rationale.** Revocation is a hard business requirement: when a shop manager fires a technician at
2pm, that session must be dead at 2:01pm. A stateless JWT cannot be revoked without a denylist,
which is a sessions table with worse ergonomics. The usual counterargument — avoiding a lookup per
request — is irrelevant at tens of tenants. Storing the hash means a database dump does not yield
live sessions.

## ADR-014 — REST with OpenAPI generated from Zod schemas `PROPOSED`

**Context.** Closes a previously open question. Candidates were REST/OpenAPI, tRPC, and GraphQL.

**Decision.** REST at the public boundary, with the OpenAPI document generated from Zod schemas,
and a typed client generated from that spec for our frontends.

**Rationale.** This gets tRPC-grade end-to-end type safety *and* a versionable public contract,
rather than trading one for the other. GraphQL is explicitly rejected: its payoff requires many
clients across many teams, its per-field authorization is markedly harder to funnel through a
single tenant-scoping chokepoint (our largest risk), it demands dataloader discipline everywhere,
and vertical B2B integration partners want REST and webhooks.

**Consequences.** Zod schemas become the single source of truth for validation, types, and
documentation. Breaking changes require versioning discipline once a third party integrates.

## ADR-015 — Server-owned realtime over SSE, fed by the outbox `PROPOSED`

**Decision.** Our API owns the realtime layer. Events flow from the ADR-009 outbox through an
in-process dispatcher, fan out across API instances via Postgres `LISTEN/NOTIFY`, and reach
browsers over **Server-Sent Events**.

**Rationale.** Platform-native CDC realtime (e.g. Supabase Postgres Changes) authorizes via RLS,
violating ADR-011, and requires direct browser-to-database connections, violating ADR-003's
surviving principle. It is also fire-and-forget: a client whose socket was down silently misses
changes, which on shop-floor Wi-Fi is routine rather than exceptional. Owning this gives us one
authorization code path shared with REST, and **replay from a cursor** on reconnect. SSE over
WebSocket because traffic is overwhelmingly server→client, it is plain HTTP that traverses
hospital networks, and `Last-Event-ID` *is* the replay cursor.

**Consequences.** Cross-tenant leak tests must cover the SSE surface. Full treatment in
[[Realtime and Events]].

> **Transport revised 2026-10-09 by ADR-023.** The original fanout was Redis pub/sub, required
> because Neon's transaction-mode pooler blocks `LISTEN/NOTIFY`. Aurora allows a session-mode
> connection, so **Postgres `LISTEN/NOTIFY` replaces Redis** — one fewer vendor, one fewer moving
> part. Durability never lived in the transport; it has always been the outbox table, and clients
> replay by cursor. **Constraint: the listener needs a direct connection, not RDS Proxy in
> transaction mode.**

**Caveat.** Q5 can moot this entirely — an offline-first requirement makes a sync engine
(PowerSync, Electric) the realtime layer. Build the outbox first; defer the SSE layer until Q5 is
answered.

> **Verified against two running instances, 2026-10-13.** The fanout claim above had never been
> tested — every prior check ran one process talking to itself. Two API instances against one
> Postgres, both `LISTEN`ing:
>
> - **Cross-instance fanout works.** A subscriber on instance A received an event written through
>   instance B.
> - **No double-dispatch.** Subscribers on both instances, ten writes alternating across both:
>   each received exactly ten frames, ten distinct ids, zero duplicates, zero failed attempts.
>   `FOR UPDATE SKIP LOCKED` holds across processes, not merely across in-process workers.
> - **Rolling deploy works.** A client on B survived B's `SIGTERM`: B drained in 6s, two writes
>   landed on A meanwhile, and the client reconnected to A with its `Last-Event-ID` and replayed
>   exactly the missed events — no gap, no duplicates.

> **Defect found and fixed, 2026-10-13 — ordering.** The spike implementation used RxJS
> `mergeMap` to read each notified row, which runs those reads **concurrently and emits in
> completion order**. Under a burst, pairs arrive reversed.
>
> This is silent data loss, not cosmetic. `Last-Event-ID` is a high-water mark: a client that
> receives 7 then 6 records **7**, and on reconnect asks for everything after 7 — so 6 is gone
> permanently, destroyed by the very mechanism that exists to guarantee no gaps.
>
> Fixed to `concatMap`, which serialises the reads and preserves id order, at a throughput cost
> this system will never notice. A regression test asserts strictly ascending ids under a
> ten-event burst; it fails with `mergeMap` and passes with `concatMap`.
>
> **Rule for any future consumer: ordered delivery is part of the SSE contract, because the
> cursor is a high-water mark.** Any operator that can reorder — `mergeMap`, `forkJoin`,
> unbounded concurrency of any kind — is forbidden on this path.

> **Known narrow gap — commit-then-notify.** The dispatcher commits `markDispatched` and *then*
> calls `pg_notify`. If an instance dies in that window the row is marked dispatched but never
> announced. Replay still returns it, because the replay query filters on
> `dispatched_at IS NOT NULL` — so nothing is lost **on reconnect**. But a client on a different,
> healthy instance has no reason to reconnect and silently never sees that event. Accepted for
> now; the cheap mitigation, if it ever matters, is to carry the current topic cursor in the
> heartbeat comment so a client can detect its own gap.

## ADR-016 — Federated identity model, SSO-ready on day one `PROPOSED`

**Context.** Fleetco's customers include large hospitals, which run enterprise identity providers.
SSO is not needed at launch but the data model must not preclude it.

**Decision.** Model `user ↔ identity` alongside `user ↔ membership` (ADR-007). `password_hash` is
nullable. Add an `sso_connection` table keyed on **`(tenant_id, customer_id | null)`**, empty at
first, with verified email domains per connection for home-realm discovery.

**Rationale.** Retrofitting an identity table means backfilling and re-keying live sessions. The
nullable key insight: hospitals are Fleetco's *customers*, so they are **portal** users — meaning
SSO configures per `customer_id`, not per `tenant_id`. Every off-the-shelf B2B SSO product assumes
the latter, so we own this mapping layer regardless of provider.

**Consequences.** A written JIT provisioning rule is required before the first connection goes
live: bind `customer_id` to the **connection**, never infer scope from token claims. SCIM and
SOC 2 arrive in the same conversation as the first SSO request. Full treatment in
[[Auth and Identity]].

## ADR-017 — Cookie scoping under subdomain tenancy `SUPERSEDED`

> **Moot as of 2026-10-09**, superseded by ADR-018. This ADR existed only to defuse a hazard
> created by ADR-008: a session cookie scoped to a shared parent domain is transmitted to every
> tenant subdomain, so a session minted for one tenant arrives at another looking valid.
> Withdrawing subdomains removes the hazard rather than mitigating it — **a security
> simplification, not merely less work.**

**What survives.** Storing `tenant_id` on the session and verifying it on every request is kept as
cheap defense in depth, now in [[Auth and Identity]] rather than as its own decision.

## ADR-018 — Single domain, no subdomain tenant routing `PROPOSED`

**Context.** Supersedes ADR-008 and ADR-017. Follows from ADR-006 and Dave's assessment that
resale is a small possibility (Q7).

**Decision.** One hostname — `app.fleetco.com`. No tenant in the URL. The API is served same-site
(`api.fleetco.com` with a shared parent, or `/api` proxied through the frontend host) so session
cookies are never cross-origin.

**Rationale.** With a single tenant there is nothing to resolve before login. Removing subdomains
deletes an entire class of cookie-scoping bug, simplifies TLS and local development, and costs
nothing that phase one needs.

**Consequences.** If tenant two ever arrives, tenant resolution must be added — but from a session
that already carries `tenant_id` (ADR-006), so it becomes a routing change rather than a
re-architecture. Custom domains and white labeling remain deferred.

## ADR-019 — Neon platform services: take the primitives, refuse the API layers `SUPERSEDED`

> **Superseded by ADR-023 on 2026-10-09**, which dropped Neon entirely. The *policy* established
> here survives and generalizes — take a platform's infrastructure primitives, refuse anything that
> would hold business logic or authorization. It is what rejected Neon's Data API and Functions
> just as it rejected Supabase's PostgREST and Edge Functions. Retained because the policy is
> reusable for the next vendor that bundles.

**Context.** Neon is no longer just Postgres hosting. Under Databricks it ships a bundle branded
**Lakebase**: Postgres, Object Storage, Managed Better Auth, a Data API, Functions, Lakebase
Search, and an AI Gateway. This raises the same question Supabase did, and ADR-011's lock-in
framework is the reusable answer.

**Decision.** A standing policy plus per-product verdicts.

**Policy: take the infrastructure primitives, refuse anything that would hold business logic or
authorization.**

- **Take:** Postgres with branching, **Object Storage**, PITR, scale-to-zero *on non-production
  branches only*.
- **Take conditionally:** Managed Better Auth — see ADR-020.
- **Defer:** Lakebase Search (vector/keyword/hybrid in Postgres — a genuine phase-three
  opportunity for semantic search over service history), AI Gateway.
- **Refuse:** the **Data API** (PostgREST renamed — already banned by ADR-011 and ADR-014) and
  **Functions** as a primary mechanism (Edge Functions renamed; splitting business logic between
  Fastify and vendor functions is the tangle ADR-001 exists to prevent).

**Rationale.** Three reasons beyond the lock-in policy:

1. **Consolidation is genuinely valuable, in proportion.** The alternative to Neon's bundle is not
   fewer third-party dependencies — it is the same dependencies from more vendors. Object storage
   must come from somewhere. For a one-to-three-person team each extra vendor is another bill,
   credential, status page, and support relationship. Being honest about the size of the win: it
   removes **one** vendor (Cloudflare R2) plus auth setup and upgrade work. Fly, Vercel, Upstash,
   Resend, Twilio, and Sentry all remain. The real benefits are branch-synced files and offloaded
   auth maintenance, not vendor count.
2. **Object Storage branches with the database**, so a preview branch carries both rows and the
   photos they reference. That is a real quality-of-life gain for a tiny team.
3. **The refused items are refused on unchanged reasoning.** Nothing about renaming PostgREST to
   "Data API" alters why an unversionable auto-generated API and RLS-based authorization were
   rejected.

**Consequences.**

- **Production must never scale to zero.** *(Rule relocated to ADR-021 on 2026-10-09, since this
  ADR is superseded and the rule is about compute rather than about Neon.)*
- **The API does not move to vendor functions.** The deciding reason is technical: SSE needs
  long-lived connections (ADR-015), which serverless functions handle poorly.
- **Strategic caveat.** Neon is a Databricks product being repositioned toward AI and agent
  workloads; Fleetco is a small, non-strategic customer in a product aimed elsewhere. Not
  disqualifying — it is still Postgres and `pg_dump` still works, which is the portability
  ADR-010 required — but a reason to stay on the platform's boring edges, which this policy does.
- Verify Neon Object Storage egress pricing against Cloudflare R2's zero-egress model once Q8
  gives real photo volumes. One fewer vendor is worth a modest premium; it is not worth an
  unbounded one.

## ADR-020 — Neon-managed Better Auth, conditional on two answers `SUPERSEDED`

> **Superseded by ADR-023 on 2026-10-09**, and it never needed resolving. Neon was dropped, so
> Better Auth is self-hosted per ADR-012 and **Q16 closes without an answer.** The two conditions
> recorded here — where the auth endpoints execute, and who owns the auth tables' DDL — remain the
> right test for any future managed-auth offering.

**Context.** ADR-012 chose Better Auth as a library running in our process, writing to our own
Postgres, behind an authN port we own. Neon now offers **Managed Better Auth** — the same library,
with user data stored in our Postgres and branching alongside it.

**Decision.** **Adopt it if, and only if, both conditions below hold.** Otherwise self-host the
library exactly as ADR-012 describes. Either way the authN port is unchanged, which is what makes
this a reversible, low-stakes choice — the port earning its keep.

**Condition 1 — where do the auth HTTP endpoints execute?** "Managed, no separate auth service to
run" is ambiguous. If the endpoints run in Neon's infrastructure, there is a network hop and a
vendor sitting in the login path, which is precisely what disqualified Supabase Auth under
ADR-010. **Acceptable only if it is managed schema plus a maintained library running in our
process.**

**Condition 2 — who owns DDL on the auth tables?** If Neon migrates them while Drizzle owns every
other table, two systems write schema to one database. Against a bus factor of one, a vendor-side
auth upgrade altering a column our migration history does not know about is a genuine hazard.
**Acceptable only if we can take ownership of those tables when we choose to.**

**Rationale.** If both hold, this removes the main drawback recorded against Better Auth in
ADR-012 — a young dependency with an upgrade treadmill on our most security-sensitive path —
while keeping user data in our own database. It is a materially better shape than Supabase Auth
was, because the library is the same one we already selected rather than a separate service with
its own user store.

**Consequences.** Tracked as Q16 in [[Open Questions]] until answered. Nothing is blocked
meanwhile: build against the port, and the adapter choice can be made later. Full treatment in
[[Auth and Identity]].

## ADR-021 — AWS ECS Fargate, not Kubernetes `PROPOSED`

**Context.** Hosting had been a single table row with no analysis. Dave is experienced with
Kubernetes and asked whether it is overkill to start. The binding requirement is **no downtime and
no performance surprises**, against a bus factor of one.

**Decision.** **AWS ECS Fargate.** Two services from one image: `api` (HTTP + SSE, two tasks
minimum, behind an ALB) and `worker` (outbox dispatcher and scheduled jobs, one task). The Node
framework inside the container is NestJS — see ADR-027.
Frontend stays on Vercel. Google Cloud Run is the equal-footing alternative on the merits; AWS
wins on Dave's existing experience, which is a legitimate tiebreaker for a system one person will
operate. Pending confirmation that Fleetco has no conflicting cloud preference (Q17).

**Rationale.**

- **The compute layer is genuinely simple, because Neon carries the state.** ADR-010 and ADR-019
  put Postgres, auth, and object storage on Neon, which reduces hosting to *running two stateless
  containers*. Most of the reason teams reach for Kubernetes is its primitives around state and
  complex topology — StatefulSets, persistent volumes, operators, service meshes. None of that
  applies. What remains is exactly what Fargate does with no cluster of any kind.
- **The platform SLA is not the binding constraint — Dave's availability is.** The gap between
  99.9% and 99.95% uptime is about 20 minutes a month; the gap between "the platform healed
  itself" and "someone must notice and intervene" is hours, and only one person can do it. So the
  choice optimizes for **never needing manual intervention**.
- **ECS has no API deprecation treadmill.** AWS has kept the ECS API remarkably stable, so task
  definitions keep working for years. For a system intended to run for a decade with minimal
  attention, that property is worth more than it first appears — and it is the main thing ECS has
  over managed Kubernetes.
- **Not Fly.io.** Its strengths are edge deployment, global distribution, and developer
  experience, none of which a single-metro repair shop needs; its documented weak spot is platform
  reliability and incident support, which is precisely what Fleetco cannot absorb.
- **Not a self-managed VPS.** Cheapest by far, and it makes Dave the platform as well as the
  developer — OS patching, TLS renewal, disk monitoring. Every one is a new way for the system to
  need attention it cannot get.

**On Kubernetes — reasoning corrected 2026-10-09.** An earlier version of this ADR claimed
managed Kubernetes meant "a cluster upgrade every 4–8 months forever." **That was too strong.**
GKE Autopilot on a Stable release channel genuinely auto-upgrades both control plane and nodes.
EKS is less automatic — AWS operates the control plane and Auto Mode handles node lifecycle, but
the cluster version upgrade remains the operator's decision, with roughly a 6x control-plane price
penalty for lapsing into extended support.

What managed Kubernetes does not remove: **workload compatibility risk** (an auto-upgrade dropping
an API your manifests rely on breaks things on the provider's schedule, not yours), everything
above the cluster (manifests, Helm, CRDs, operators, RBAC, PDBs), and a much larger debugging
surface.

**So the decision is closer than first written, and GKE Autopilot is a legitimate alternative.**
The surviving argument is **conceptual surface area**: with one deployable, Kubernetes' real
payoff goes unused while its surface is still carried. Fewer moving parts means fewer things that
can force a 6am decision.

**Cost is explicitly not the differentiator.** At always-on sizing, Kubernetes on DOKS (~$50/mo)
or GKE Standard (~$55–70) is cost-competitive with or cheaper than Fargate (~$54–152 depending on
sizing and NAT) — because serverless containers price per-second for compute that never idles,
which is their worst case, while Kubernetes buys raw nodes that are cheaper at constant
utilization. EKS is the outlier at ~$150–200, almost entirely its $73 control-plane fee. **We are
choosing to pay a modest premium to avoid carrying a platform we would not use**, and that should
be stated honestly rather than dressed up as a saving.

**Triggers that would justify Kubernetes later.** A customer contractually requiring deployment
into their own VPC; more than roughly four or five distinct deployables; the platform's pricing or
reliability failing; or **a second engineer who also knows Kubernetes**, which removes the
bus-factor objection and is the most likely real trigger (Q13).

**Consequences.**

- **Production must never scale to zero**, and tasks run with a minimum count of two. A cold start
  at 7am, when the first service advisor logs in, is a bad experience every single morning.
  Non-production is the opposite case and *should* scale to zero outside business hours — see
  [[Environments]]. *(This rule previously lived in superseded ADR-019; relocated here 2026-10-09
  because it governs compute, not a database vendor.)*
- **The ALB idle timeout must be raised from its 60-second default**, or SSE connections die
  constantly. This is the single most likely configuration bug in the stack.
- **A NAT gateway decision is required** (~$32/month for private subnets, versus public subnets
  with ALB-only ingress security groups). A real decision, not a default — private plus NAT is
  more defensible under an enterprise security review.
- Host and database must share a region; latency to the database matters more than latency to users.
- Availability is the product of every vendor in the path, so Neon caps ours regardless of host.

Full treatment in [[Hosting and Deployment]].

## ADR-022 — Platform-portable containerization discipline `PROPOSED`

**Context.** ADR-021 picks a platform while explicitly wanting the freedom to leave it. That
freedom is not automatic; it is a set of small disciplines that are nearly free now and expensive
to retrofit.

**Decision.** Seven rules, enforced from the first commit:

1. **A plain Dockerfile** — no platform buildpack, no proprietary build step. The image that runs
   in production must run under `docker run` locally.
2. **All configuration from environment variables.** Twelve-factor, no exceptions.
3. **No local filesystem state.** Uploads to object storage, sessions to Postgres.
   The container is disposable.
4. **Logs to stdout as JSON** — never to a file, never through a platform logging SDK.
5. **No proprietary platform services for anything structural.** The platform's secret store and
   scheduler are thin and swappable and may be used; its database, queue, and storage products may
   not.
6. **Scheduled jobs are plain commands** the platform merely invokes, so they run identically
   under Cloud Scheduler, EventBridge, or a Kubernetes CronJob.
7. **A real health endpoint** that touches the database, plus **graceful shutdown on `SIGTERM`**
   that drains SSE connections and completes in-flight requests.

**Rationale.** This is the compute-layer equivalent of ADR-006's "pooled-capable code": keep the
door open at near-zero cost rather than pre-building for a move that may never happen. Rule 7 is
not optional — SSE holds long-lived connections, so without draining every deploy drops every
connected user mid-session.

**Consequences.** Moving platforms becomes a configuration exercise rather than a project. Skip
these and the first migration becomes the work that never gets prioritized.

## ADR-023 — AWS-native platform: Aurora and S3, Neon dropped `PROPOSED`

**Context.** ADR-021 put compute on AWS. That raised the question Dave asked directly: if we are
already in a cloud, why keep Neon as a separate platform vendor when the cloud offers equivalents?
Full evaluation in [[Platform Choice]].

**Decision.** **Drop Neon.** Everything stateful moves into the AWS account:

- **Postgres: Aurora Serverless v2**, 0.5 ACU floor, in a private subnet
- **Object storage: S3**, with versioning and Object Lock for legal records
- **Auth: Better Auth self-hosted** as a library, per ADR-012
- **SSE fanout: Postgres `LISTEN/NOTIFY`** — Redis eliminated

**Rationale.** Stripping Neon's bundle down, only one thing was unique to it:

| Neon service | Cloud-native equivalent | Winner |
|---|---|---|
| Postgres | Aurora / RDS | **AWS** — far more proven for a decade-long commitment |
| Object storage | S3 | **AWS, clearly** — Object Lock and versioning for statutory records |
| Managed Better Auth | The same library, self-hosted | Tie — it is a library either way |
| **Database branching** | Aurora fast clone (partial) | **Neon** — the one genuine differentiator |

So the question reduced to whether per-pull-request branching justifies a vendor in the critical
path. It does not, for four reasons:

1. **It removes a vendor from the critical path.** Availability is the product of every vendor in
   the request path, and Neon capped ours regardless of host — a point already conceded in
   [[Hosting and Deployment]]. With a bus factor of one, fewer vendors between the shop and their
   invoices is a recurring structural win.
2. **Same-VPC private networking.** No public hop to the database, more predictable latency, and a
   better answer when hospital InfoSec asks where their data lives.
3. **S3 is the right home for legal records.** DVIR and warranty documentation carry statutory
   retention (Q9); S3 Object Lock plus versioning is the strongest available story.
4. **Aurora fast clone recovers most of branching** — copy-on-write, creates in minutes, scriptable.

**Why Aurora rather than RDS.** Aurora Serverless v2 at a 0.5 ACU floor costs roughly what RDS
`db.t4g.small` Multi-AZ costs (~$50 vs ~$54) **and hands back database branching via fast clone.**
Storage replicated six ways across three availability zones and faster failover come along at the
same price.

**Consequences.**

- **Redis is eliminated.** Aurora permits session-mode connections, so `LISTEN/NOTIFY` works. The
  listener must use a direct connection, never RDS Proxy in transaction mode.
- **Per-pull-request deployed previews get dropped**, because Neon branching is what made them
  nearly free. Replaced by a four-tier dev-database workflow — see [[Environments]].
- **The 0.5 ACU floor is ~1 GB of RAM**, small for `shared_buffers`. A shop quiet overnight may
  see a cold cache at 7am; raise the floor to 1.0 ACU (~$87/month) if measured. Start at 0.5.
- **Aurora bills I/O separately** unless I/O-Optimized is selected. Start standard, switch if I/O
  becomes a meaningful share.
- Backups become Aurora PITR **plus** an independent `pg_dump` to S3 in a separate account — see
  [[Operations]].
- **Q16 closes** without needing an answer. **Q17** narrows to "does Fleetco have an existing AWS
  account."
- Cost settles at **$200–400/month** (see [[Stack Evaluation]]), with one fewer vendor and one
  fewer moving part.

**Costs accepted, recorded honestly.** Neon branching is genuinely better than the substitute;
Aurora is a more complex product with ACU and I/O behavior to learn; there is more AWS surface to
configure; and vendor concentration means one compromised credential set affects everything,
mitigated by the off-account backup requirement. The counterargument section in [[Platform Choice]]
holds the full version.

## ADR-024 — One non-production environment first, two at cutover `SUPERSEDED` by 029

**Context.** Environments were previously scattered across [[Operations]] and the
[[Infrastructure Checklist]] as a four-item list (local, preview-per-PR, staging, production), and
the per-PR preview assumed Neon branching, which ADR-023 removed.

**Decision.** A deliberate progression rather than a fixed set:

- **Phase 0 — building:** local plus CI only. **Deploy nothing.**
- **Phase 1 — Fleetco starts reviewing:** add **`staging`**, one persistent deployed environment
  with realistic synthetic data.
- **Phase 2 — at or shortly before cutover:** add **`dev`**, so `staging` can stay stable for
  Fleetco and migration rehearsal while `dev` is where things get broken.
- **Never more than two non-production environments before tenant two.**

**Per-pull-request deployed previews are dropped.** On AWS each would need a Fargate service, an
ALB target group, and an Aurora clone — real cost and real moving parts. Their purpose is letting
*other people* review a change without checking it out, and with one to three people who can all
run it locally, that value is low. **Vercel's free frontend previews** pointed at `staging` cover
the UI-review case; CI's ephemeral Postgres covers migration correctness; Aurora fast clone covers
the genuinely risky migration.

**Rationale.** The first deployed environment earns its place not by testing features — local and
CI do that — but by catching **"works locally, breaks on Fargate"**: a missing IAM permission, a
security group rule, the ALB idle timeout killing SSE, an S3 bucket policy, a mail service
refusing to send. Those are invisible until something real runs in a real VPC. Everything beyond
the first environment must earn its place against the attention it consumes.

**Consequences.** Shared ALB with host-based routing and a shared small non-production database
keep the cost at roughly $20–65/month rather than $75 per environment. **Non-production scales to
zero outside business hours** — the one place that is appropriate, since ADR-021 forbids it in
production. Full treatment in [[Environments]].

## ADR-025 — Separate AWS accounts for production and non-production `PROPOSED`

**Decision.** Two AWS accounts — `prod` and `nonprod` — under one Organization, with IAM Identity
Center for access and cross-account roles for deploys.

**Rationale.** Accounts are free, and this is the **single best protection against the worst
solo-operator mistake**: running a destructive command against production while believing you are
somewhere else. It also gives clean blast-radius isolation for compromised credentials and a tidy
per-environment bill.

**Consequences.** Moderate one-time setup. Must be in place before production holds real data —
retrofitting an account split after the fact is a migration. Alongside this, non-production must be
structurally unable to reach the real world: a hard recipient allowlist in the mailer, sandbox-only
integration credentials with a startup check that refuses production keys in non-production, and
synthetic data by default. **The mailer guard is the one to build first** — staging emailing
invoices to real customers is the most likely of these to actually happen.

## ADR-026 — Infrastructure as code once a second environment exists `PROPOSED`

**Decision.** Terraform or AWS CDK, with the environment as a variable, from the moment a second
environment exists. One definition, applied N times.

**Rationale.** **This is the real cost of a second environment, and it is not money.** Two
hand-clicked AWS environments diverge immediately, and once they have, "it works in staging" stops
meaning anything. Drift is also what makes a restore or a rebuild unreliable, which matters most
precisely when it matters most.

**Consequences.** A new P0 item on the [[Infrastructure Checklist]] — but only from Phase 1
onward, which is a genuine argument for ADR-024's Phase 0 having no deployed environments at all
and therefore no infrastructure code to write yet. Deliberate non-goal: no Kubernetes manifests,
no Helm, no service mesh (ADR-021).

## ADR-027 — NestJS as the API framework, decided by spike `PROPOSED` (resolved)

**Context.** Earlier drafts of [[Stack Evaluation]] named Fastify as a default rather than a
decision, and a recommendation flipped to NestJS and back within two exchanges — once on
familiarity, then on a stated dislike of dependency injection. Neither was an evaluation, so the
decision was gated on building the same `customers` module four times and reading the output:
NestJS, Fastify with our own structure, AdonisJS, and a port of Dave's `authors-api` pattern.
Criteria were fixed in advance in [[Framework Evaluation]].

**Decision. NestJS**, with the Express adapter, Zod contracts, and no `@nestjs/config`,
`@nestjs/swagger` or `@nestjs/testing`.

**Rationale.**

- **The strongest argument against it did not survive contact.** The fear was that agents would
  reproduce Nest's heavier idioms — `interface IFooService` with token injection, an abstraction
  per service. The spike produced **zero** application interfaces, zero one-implementation ports
  and three `Symbol` tokens. The prediction was simply wrong, and it was the main thing holding
  the decision open.
- **`@Module({ exports })` is a tier-1 boundary no competitor matches.** When `vehicles` and then
  `workorders` arrived, each could reach exactly the services its siblings exported and nothing
  else: asking Nest for another module's repository throws at bootstrap rather than failing
  review. That is [[Evolution Path]] rule 2 enforced by the container.
- **Agent output quality was the deciding criterion and Nest's corpus is the largest.** Every
  line is agent-written; this compounds.
- **`@Sse()` handled the hard case correctly** — an `async` handler's authorization failure
  becomes a real JSON 404 rather than an error frame inside an already-200 stream.
- **The container is not load-bearing, which is a feature.** `wire()` in the test harness builds
  the whole application with plain `new` calls — no `@nestjs/testing`, no module metadata. DI
  costs nothing at test time.

**What it costs, measured rather than estimated.**

- **~83 lines of genuine framework tax** (`app.module.ts`, `db.module.ts`, the `@Module` blocks,
  the Zod pipe) against the ~800 lines of hand-built `lib/` scaffolding [[Framework Evaluation]]
  projected for the "our own structure" candidates.
- **Two dev dependencies that exist only to bridge Vitest to Nest's `emitDecoratorMetadata`**
  (`unplugin-swc`, `@swc/core`), plus two tsconfigs and a two-step typecheck.
- **CommonJS is effectively mandatory**, because decorator metadata wants CJS emit. This is not
  free: `@nestjs/observe` is ESM-only and had to be loaded by dynamic `import()` from bootstrap
  (ADR-028). Expect that friction again with any ESM-only package.
- **`@types/express` leaks the adapter** into three platform files.
- **Route enumeration needs private Express internals** (`getHttpAdapter().getInstance().router`)
  because Nest exposes no public API for it. The leak suite depends on this and it will break on
  an Express or Nest major. The clearest long-term liability in the choice.

**What three modules taught us that one could not.**

- **The scope chokepoint is not copy-pasteable.** A portal principal pins on `customers.id` but
  on `vehicles.customer_id` — the two `scoped()` methods looked identical and were not. This is
  now `TenantScopedRepository` with an abstract `scopeColumn`, mutation-tested.
- **Abstractions break even at three call sites, not two.** The repository seam was net zero
  lines across three repositories; the OpenAPI builder was +7 at two resources. Both go
  profitable from the next module. "No abstraction until two call sites" is the floor for when
  extraction is *possible*, not when it is *profitable*.
- **The ceiling is lower than `authors-api`.** Drizzle's types refuse a generic table parameter
  (`TableLikeHasEmptySelection` cannot resolve over an unresolved type parameter), so the full
  `ModelDataSource` shape is unreachable without type assertions or a duplicate row schema. Part
  of that repo's brevity came from `baseModel?: any`, which our rules forbid. **This is an ORM
  and strictness constraint, not a framework one — it would be identical under Fastify.**
- **A child table must denormalise `customer_id`.** The chokepoint scopes one table, so a child
  that cannot answer "which fleet?" alone forces either a join inside the chokepoint or an
  unscoped read. Every future child table needs this, kept honest by a composite foreign key.

**Consequences.** M6's walking skeleton is this spike's `customers` module. [[Agent Playbooks]]
and the framework-dependent mechanisms in [[Code Standards and Guardrails]] should be rewritten
against it. **Open follow-ups:** the outbox has no generic `subject_id`, so three modules have now
each stuffed their entity id into the event payload — that wants deciding; and `routes.ts` remains
~96% duplicated across modules and is deliberately *not* abstracted, because Nest's parameter
pipes bind to the declaring class and the workaround is a mixin factory this codebase would call
clever TypeScript. `authors-api` hand-writes its controllers too.

## ADR-028 — Observability: Sentry and Pino behind a Telemetry port, metrics backend deferred `PROPOSED`

**Context.** [[Infrastructure Checklist]] already named Pino, Sentry, PostHog and CloudWatch, but
as a shopping list rather than a decision. **NestJS Observe** then launched — a Nest-native APM
from the framework's author at $22/mo — and was evaluated on the three-module spike harness on
2026-10-11 by instrumenting the real application and capturing its outbound telemetry.

**Decision.**

1. **Sentry Team ($26/mo) for error tracking**, backend *and* frontend, plus session replay.
   50k errors, 5M spans, 90-day retention, unlimited seats.
2. **Pino for structured JSON logging**, every line carrying `request_id`, `tenant_id`, `user_id`
   and route, with a redaction serializer enforcing the PII policy.
3. **Metrics, dashboards and alarms: deferred to implementation time**, between **CloudWatch** and
   **Grafana Cloud**. Both are acceptable. CloudWatch wins on ADR-023's one-vendor-one-bill logic
   and gives Aurora pool metrics natively; Grafana wins on dashboard quality and Dave's existing
   familiarity, and its free tier (10k series, 50GB logs, 14-day retention) fits our volume. This
   is a reversible preference, not an architectural constraint, so it does not need deciding now.
4. **All custom instrumentation sits behind a `Telemetry` port** of our own — the same shape as the
   AuthN port in ADR-012 — so the vendor is one adapter, not a sweep through every module.
5. **NestJS Observe: declined for now.** Revisit once it is past 1.0 and the gaps below close.

**Rationale.**

- **We do not need an APM.** Distributed tracing is an explicit non-goal in [[Evolution Path]]:
  one deployable, one database. An APM's core value is tracing hops we do not have.
- **Observe cannot see the two things we most need watched.** Measured, not inferred: a held-open
  SSE stream produced **zero telemetry** — confirmed both by capturing the SDK's own egress and by
  the absence of any `/events` operation in its dashboard. And the outbox dispatcher polls every
  200ms, which is ~13M job runs/month on an idle system, so it must be excluded from
  instrumentation to stay inside any plan — which also silences dispatcher *errors*, the exact
  "silently stalled dispatcher" failure [[Operations]] calls out. Both P0 reliability concerns land
  in its blind spots.
- **It does not replace Sentry.** Observe is backend-only, so frontend error tracking and session
  replay — both on the checklist — still require Sentry. The real comparison is $48/mo for
  Observe + Sentry against $26 for Sentry alone.
- **Cost is not the deciding factor.** Every option here is trivial against FullBay's $5,000. The
  deciding factors are coverage and operational burden for one person.
- **What Observe did well, recorded for the revisit.** Auto-instrumentation reached our own code
  (`CustomersRepository.scopedWhere` appeared as a span); `pg` is patched, so Drizzle queries are
  traced; routes are normalised server-side to `/v1/vehicles/:vehicleId`; SQL **values** are never
  sent, only `$1`-style placeholders; redaction is on by default with custom pattern and key
  support; and framework-handled `DomainError`s are classified "Intrinsic" rather than conflated
  with unhandled crashes. It is a good product aimed at a different problem.

**Consequences.**

- **The outbox and SSE metrics are ours to build under any vendor.** Outbox backlog gauge,
  dispatcher heartbeat, dead-letter count, open-SSE-connection gauge, and alarms on each. Roughly
  100 lines. This is the highest-value observability work available to us precisely because no
  product does it.
- **`sourceContext` and its equivalents are a deliberate choice, not a default.** Observe ships
  application source fragments to its server with that flag on by default. Whatever vendor is
  chosen, shipping source or payloads is decided explicitly and before a DPA exists.
- **Data residency is a DPA input.** Observe's collector resolves to AWS `us-east-1`; Sentry and
  Grafana both need the same question answered before a hospital customer asks it.
- **Release attribution needs an explicit version.** Any SDK inferring a release from git picks up
  the wrong commit when the service is not its own repository. Set it from CI.

**Evaluation artefacts.** The instrumented harness lives in
`projects/fleetco/spikes/fleetco-nestjs-vehicles`, wired inert behind `OBSERVE_APP_KEY` so the
dependency can be removed without touching application code.

> **Port and metrics built, 2026-10-13.** The `Telemetry` port exists in
> `platform/observability/telemetry.ts` with an in-memory adapter, and all six metrics this ADR
> said no vendor would supply are implemented and verified against a forced backlog:
>
> | Metric | Verified |
> |---|---|
> | `fleetco_outbox_pending` | reported 2 with a forced backlog |
> | `fleetco_outbox_oldest_pending_age_seconds` | reported 42 for a 42-second-old row |
> | `fleetco_outbox_dead_lettered` | reported 1 past the 5-attempt threshold |
> | `fleetco_outbox_last_tick_age_seconds{instance}` | per-instance; `-1` means never ticked |
> | `fleetco_sse_connections_open{resource}` | 2 on A, 1 on B; returned to 0 on client disconnect |
> | `fleetco_outbox_dispatched_total` / `_failures_total` | counters on the dispatch path |
>
> **Exposition is Prometheus text**, which both candidate backends read natively — Grafana Alloy
> scrapes it, the CloudWatch agent ingests it. Choosing the format does not choose the vendor,
> and it keeps the metrics readable with `curl` during an incident, with no dashboard and no
> credentials.
>
> **Two labelling rules, learned by getting them wrong.** Backlog metrics are deliberately
> *unlabelled*: they describe the shared outbox table, so labelling them per-instance turns one
> truth into N and makes `sum()` wrong. The heartbeat *is* labelled per instance, because with
> two dispatchers one can die while the other holds the backlog at zero — backlog alone cannot
> detect a half-dead deployment.
>
> **`/ready` is now split from `/health`**, closing that P0. Liveness asks "is this process
> alive"; readiness asks "should traffic come here", which is false during the drain while the
> process is still perfectly healthy. The leak suite asserts `/health`, `/ready` and `/metrics`
> stay outside the OpenAPI document and expose no tenant identifiers.

## Open Architectural Questions

- **Mobile and offline — the highest-priority open item.** Blocked on Q5. If technicians need
  offline-capable tablets in bays, a sync engine replaces ADR-015 and ADR-001 may reopen. This is
  the single largest architectural input still outstanding.
- ~~**Deployment topology.**~~ **Resolved 2026-10-09** — pooled, single database. See ADR-006.
- **Accounting integration boundary.** Needs Q6 answered. QuickBooks sync is a notorious source of
  complexity and deserves a hard module boundary from the start.
- **Authorization model richness.** Role-based is probably sufficient, but the customer-authorization
  workflow in heavy-duty repair has approval thresholds that may want something richer.
- **Document and photo storage volume.** Defect photos and signed authorizations add up; affects
  storage cost modeling. Blocked on Q8.
- **PDF generation** for invoices and estimates. Unglamorous, always underestimated, needs an owner.
- ~~**Neon-managed vs. self-hosted Better Auth.**~~ **Closed 2026-10-09** — Neon dropped
  (ADR-023), so Better Auth is self-hosted per ADR-012.
- **FullBay data migration architecture.** Blocked on Q1. If an export exists, the import pipeline
  and its reconciliation strategy need designing as a first-class module, not a one-off script.

## Related

- [[Stack Evaluation]]
- [[Tenancy Model]]
- [[Evolution Path]]
- [[Auth and Identity]]
- [[Realtime and Events]]
- [[Operations]]
- [[Open Questions]]

## ADR-029 — Two deployed environments, no staging `PROPOSED`

**Context.** ADR-024 planned a phased progression to a persistent `staging` environment. A later
plan made `staging` run against *production's own* database, buckets and integrations, to give OTC a
canary on real data. An adversarial review of that plan found seven serious defects, every one of
them a consequence of **two code versions sharing a live database permanently** — and verified that
the containment property the plan leaned on did not exist in the code, because the outbox dispatcher
runs inside the API process (`main.ts:49`).

**Decision. Two deployed environments: `prod` and `dev`. No staging environment.** Next-version work
is exercised by three mechanisms instead:

1. **Feature flags** — ship off, then on for Dave, then Cameron, then everyone. Per feature rather
   than per release.
2. **A test business inside production** — real system, isolated data, deletable, and nothing lands
   in OTC's books.
3. **A clone-and-dry-run gate on every release** — fast-clone production's database, run the
   release's migrations against the copy, record the timing, destroy it.

**Rationale.** A staging environment answers two questions, and each has a cheaper answer. "Can
someone try this first?" is a flag and a test business. "Will this migration behave on real data?" is
the clone. What remains unique to staging is rehearsing a change that *cannot* be flag-gated — a
framework major, a large refactor — and the mitigation for those is release hygiene, not a permanent
second stack.

The deciding criterion was **review surface**. The compatibility surface of two permanent versions on
one database is far wider than the schema: data values, constraints, event payloads, cached reference
data, OAuth refresh tokens, scheduled-job versions. Automated checking reaches about a third of it;
the rest becomes standing human vigilance, which is this project's scarcest resource
([[Software Factory]]).

**Consequences.** Feature flags move from P2 to P0 and become part of the release mechanism, which is
why ADR-034 adds two CI gates for them. The clone gate must live in the normal release path rather
than being an on-demand tool, because on-demand rehearsal rots. The scrubber gets an owner, since
production data is only ever restored into nonprod scrubbed. ADR-025's account boundary becomes a
complete guard again, because nothing deployed in the production account is anything but production.

**Deferred with a trigger, not rejected: a staging environment on a *clone* of production — never on
production itself.** About a day of work, because everything it needs gets built anyway. The trigger
is the first change that cannot be flag-gated and that makes Dave nervous. Full option analysis in
[[Environment Strategy Options]].

## ADR-030 — Terraform, not CDK `PROPOSED` (resolves 026)

**Decision.** Terraform, with the environment as a variable and separate root modules per
environment rather than workspaces. State in S3 per account with native S3 locking.

**Rationale.** CDK's advantage — TypeScript, the same language as the application — is real. It loses
on the criterion that matters most here: **`terraform plan` is a legible diff of real resources, so
the plan is the artifact Dave reviews instead of reviewing the agent's reasoning.** With every line
of infrastructure written by an agent, a reviewable dry-run is worth a second language. Drift
detection is also first-class, which matters because a nightly plan is how a hand-clicked change gets
caught.

**Consequences.** HCL in the repository. Separate root modules make it structurally impossible for
one environment's apply to touch another's data resources.

## ADR-031 — GitHub Actions with OIDC, build once, promote the artifact `PROPOSED`

**Decision.** GitHub Actions in one private monorepo in an OTC organisation. **No long-lived AWS
keys**; GitHub OIDC with the trust policy conditioned on `repo:<org>/<repo>:environment:prod`.
**Build once and promote the artifact** — an image digest for the API, a versioned S3 prefix for the
UI — never rebuilt from source. Production deploys are manual, `v*`-tagged, and only Dave can create
a `v*` tag.

**Rationale.** Identical artifacts make rollback a config change and remove "it built differently
this time" as a failure mode. The environment-scoped OIDC condition is the real security boundary:
scoped to the repository instead of the repository *and* environment, every test run can reach
production.

**Consequences.** GitHub's required-reviewers gate is unavailable on a private repository without
Enterprise, so the human gate is manual dispatch plus a tag ruleset plus CODEOWNERS on the workflow
and production Terraform paths. Stated plainly: with one person shipping, required reviewers was
always Dave approving Dave. The UI must read its API base URL at runtime, or one artifact cannot
serve both environments.

**Migration discipline:** additive-only, enforced as an **allowlist** rather than a denylist, with
one rule that reverses the usual order — a new constraint ships in the release *after* the code that
satisfies it.

## ADR-032 — Agent access model: read-only in production `PROPOSED`

**Decision.** `AgentReadOnly` in all accounts as the default; `AgentDeploy` with write access in
`nonprod` only. **No agent role has write access in the production account.** Production mutations
happen only through the release workflow. SCPs on the production OU deny cluster and bucket deletion,
deny disabling CloudTrail, and deny every region but `us-east-1`.

**Rationale.** The managed AWS MCP Server makes an agent genuinely useful against live AWS, and the
Agent Toolkit's IAM condition keys can distinguish an agent's call from a human's. But what makes
infrastructure 90% agent-doable is **Terraform in a repo behind CI, not the MCP server** —
agent-written code reviewed as a plan diff and applied by a pipeline is reproducible, auditable and
revertible. An agent calling live APIs is none of those, even when it is right.

**Consequences.** The MCP server is scoped to research, read-only diagnosis and throwaway `dev`
provisioning. Nightly drift detection catches anything that reached a console by hand.

## ADR-033 — S3 and CloudFront for the frontend, not Vercel `PROPOSED`

**Decision.** The React application is served from S3 behind CloudFront, in the same Terraform as
everything else. **The API is not behind CloudFront** — the browser calls the ALB directly, with
CORS.

**Rationale.** Vercel's free tier is not licensed for commercial use, so the comparison is $20–40 per
month per seat against roughly $5, and the only thing Vercel then uniquely supplies is per-pull-request
previews — about a day of work to reproduce on CloudFront and free afterwards. Keeping the frontend in
Terraform gives one IaC story, one bill, and one place that answers "what is deployed."

The API stays off CloudFront because SSE holds a connection open for an hour and CloudFront applies
its own origin read timeout to that path. SSE breaking invisibly is already the most likely
configuration bug in this stack (ADR-022, the ALB idle timeout); a second copy of it is not worth a
free WAF.

**Consequences.** We own SPA routing, cache invalidation and the preview mechanism. `index.html` must
be served no-cache or invalidated on every origin-path flip. Deploy the API before the UI and roll the
UI back before the API, since a new UI against an old API fails on endpoints that do not exist yet.

## ADR-034 — Feature flags are release mechanism, with two CI gates `PROPOSED`

**Decision.** LaunchDarkly, free Developer tier, behind a `FeatureFlags` port. Every flag has a
default compiled into the application and the SDK runs in streaming mode with local evaluation, so a
vendor outage cannot change whether Fleetco can invoice — and that is tested. **Flags move from P2 to
P0.**

**Two CI gates, because flags are now load-bearing and vigilance is the wrong mechanism:**

1. Every flag referenced in code has a test exercising **both** branches. Build fails otherwise.
2. Every flag records an expiry date at creation, and CI fails once it passes.

**Rationale.** With no staging environment (ADR-029) a flag is the only thing between a half-finished
feature and a real customer, which is a bigger job than flags usually have. Renting beats building
because the switch is an afternoon but the admin screen, the change history and per-user targeting are
not — and targeting is what gives OTC early access without a second environment. Three live flags is
eight combinations, so the real mitigation for the permutation problem is **few flags alive at once,
killed quickly**, which gate 2 enforces structurally.

**Consequences.** Another vendor, but one confined to a port with compiled-in defaults. Billing is per
*running process* and fractional by connection time, so the bill scales with task count rather than
user count — around 2.7 connections in practice, inside the free tier. ServiceTitan's LaunchDarkly
account cannot be used; Fleetco needs its own under OTC.

## ADR-035 — QuickBooks is the real tenancy boundary, and it needs its own control `PROPOSED`

**Context.** QBO-002 sends every finalized invoice to **one** QuickBooks company file, with a class
identifying the business. So at the integration edge, "nothing is shared across businesses" is
false: the chart of accounts, the QuickBooks customer list and the invoice-number namespace are all
shared, and the only thing separating two businesses' books is a string field on an outbound
payload.

**A mis-set class puts money in the wrong books on a statutory record. No chokepoint, predicate,
foreign key or leak test can catch it, because it happens after the boundary** — which makes it a
worse failure than the cross-business data leak ADR-005 is built to prevent.

**Decision.**

- `quickbooks_class` is a column on `platform.businesses`, set at create, **immutable**.
- The accounting adapter **derives the class from the resolved business** and has no overload that
  accepts one as a parameter.
- A business with `is_test` set makes the adapter **refuse to sync at all** — not sync to a sandbox.
  A half-working sandbox sync is how test invoices reach real books.
- A test asserts that for every synced payload, the class equals that of the business the source row
  belongs to, with the source row read back through its own business scope.
- **A monthly per-business reconciliation** compares our invoice total against QuickBooks' total for
  that class and alerts on any difference. This is the only detector that works for an error already
  past the boundary, and [[Operations]] states that invoicing correctness matters more than uptime.

**Open and blocking the design, not the decision:** does OTC currently run **one** QuickBooks sync
with a class per business, or **a separate sync per business**? D-C21. If it is one file, the above
is required as written. If each business has its own file or its own connection, the number-space
constraint relaxes and the class control becomes a connection control instead.

**Consequences.** The immutable class means a business created with the wrong class must be archived
and recreated, which is correct — a class change would silently re-file history. The reconciliation
job is the first scheduled task whose failure is a money alarm rather than an infrastructure one.
