---
status: current
summary: Tenant to business, one enforced scope, the chokepoint, the leak suite
created: 2026-10-08
updated: 2026-11-08
tags: [fleetco, architecture, multi-tenancy, businesses, saas, isolation]
source: Claude Code (Xerro)
---

## Overview

Who a tenant is, who a **business** is, and which of them the code enforces.

> **Rewritten 2026-11-08 — ADR-005.** This document previously assumed one level of scope and made
> it the tenant. OTC turns out to hold several lines of business, so the model is now **tenant →
> business**, and the enforced level is the **business**.

**Decision: one enforced scope — `business_id` — on every domain table. The tenant is a grouping,
not a predicate.**

## The Model

| Term | What it is | How many in V1 |
|---|---|---|
| **Tenant** | A company. Resale adds more | **1** — OTC |
| **Business** | A line of business inside a tenant: graphics, fleet, trailers, plus a test business | **4** |
| **User** | Global to the tenant, granted access per business | Dave → 4; Cameron and Dan → 3 |
| **Customer** | A company the business sells to. **Business-scoped** — see the open question below | — |

```
tenant (OTC)
 ├── user ── membership (tenant) ── business_grant (business + role)
 └── business ── everything domain-level
      graphics · fleet · trailers · test
```

**Nothing domain-level is shared across businesses.** Not customers, not parts, not vendors, not
labor rates, not tax rules, not templates. A shared entity would be an explicit, named exception,
and there are none.

## Why One Enforced Level And Not Two

Full reasoning in ADR-005. The three load-bearing points:

1. **Two predicates would not be two independent checks.** `tenant_id` and `business_id` on a
   request both derive from the same membership lookup, so a bug there produces a consistent pair
   and both predicates pass. You would be writing one check twice and reviewing it twice.
2. **`business_id` is a globally unique UUIDv7 and a business never moves between tenants**, so
   `WHERE business_id = X` already implies the tenant. **That invariant is a one-way door.** If a
   business ever has to move, this model reopens.
3. **Chokepoint arity is the reviewable property.** One required scope key per table means "do all
   the predicates apply here?" is a compiler question, not a memory question — which matters when
   every line is agent-written and one person reviews it.

**What it costs, plainly: there is no data-layer backstop for a cross-tenant leak.** If the resolver
is wrong, the breach is cross-tenant rather than merely cross-business. The compensating control is
one test: stub the grant check to pass, and assert a foreign-tenant business still 404s. That proves
the two checks have independent provenance, which is the claim the whole model rests on.

## Column Shape

```sql
-- every domain table
business_id uuid NOT NULL REFERENCES platform.businesses(id)
-- no tenant_id, ever. A schema gate fails the build if one appears.

-- every parent
UNIQUE (business_id, id)

-- every child references the pair, not just the parent id
FOREIGN KEY (business_id, work_order_id)
  REFERENCES work_orders (business_id, id)
```

**The composite foreign key is the highest-value line in this design.** A child row pointing at a
parent in another business becomes impossible in the database rather than unlikely in the service.
Against an agent-written codebase with one reviewer, that is worth more than any amount of care.

`business_id` is **denormalized onto children, never reached through a join** — a scope that needs a
join is a scope a reviewer has to trace. Indexes are a mechanical substitution: everything that led
with `tenant_id` leads with `business_id`, same arity, same count, plus the new
`UNIQUE (business_id, id)` the composite keys require.

`platform.businesses` is `(id, tenant_id, name, slug, number_prefix, quickbooks_class, is_test,
archived_at, created_at)` with `UNIQUE (tenant_id, slug)` and `UNIQUE (tenant_id, number_prefix)`.

**Consequence:** ADR-006's extraction path — filter by `tenant_id`, dump the subset — now needs a
join through `platform.businesses`. One view definition.

## Authorization Chokepoint

Two base classes, one scope key each. **The class a repository extends is its classification, and
the compiler forces the choice.**

```ts
export type BusinessScope = { businessId: BusinessId; rows: RowFilter }

// Exactly one applies. A discriminated union, not two nullable fields.
export type RowFilter =
  | { kind: 'all' }                              // staff, operator
  | { kind: 'customer'; customerId: CustomerId }  // portal
  | { kind: 'assignee'; userId: UserId }          // technician, ROLE-003

export type TenantScope = { tenantId: TenantId }
```

**There are still two authorization levels and now one tenancy level.** Business replaces tenant in
the first slot; it does not add a slot.

**A finding worth recording: the product already had three row filters, not two.** ADR-005 named
shop staff and portal, but ROLE-003 — technicians see only their assigned jobs, including via direct
links and API calls — is a third. The union puts all three in the second slot where exactly one can
apply, which makes a fourth principal kind a compiler error in every repository rather than a
forgotten `if`.

**`ActiveBusiness` is the only place a `BusinessScope` is minted**, and `scopeOf(principal)` — which
today lets any route mint a scope from identity alone — is **deleted**:

```ts
ActiveBusiness.resolve(session, assertedBusinessId, grants):
  business ← businesses.byId(assertedBusinessId)
  assert business.tenant_id === session.tenant_id    // independent provenance, once
  assert a grant exists for (session.user_id, business.id)
```

### Gates That Make This Structural

- Drizzle query builders banned outside `**/repository.ts` *(already enforced)*
- Every exported repository extends exactly one of the two bases
- Every domain table has `business_id NOT NULL` with its foreign key; **no** domain table has
  `tenant_id` — enumerated from `information_schema`
- Every foreign key between two business-scoped tables includes `business_id`
- Every documented operation is under `/v1/b/{businessId}/` or on a short named tenant-scoped
  allowlist

## Carrying The Active Business

**In the request path. Not in the session, and not in a header.**

- Every business-scoped route is `/v1/b/{businessId}/…`; the app URL is `/b/{businessId}/jobs/{id}`
- The session carries `tenant_id` and **nothing** about the active business
- **No default.** A business-scoped route reachable without the segment does not exist, so there is
  no "fall back to the user's first business" path to get wrong. That fallback is the bug: it means a
  stale client silently writes to the wrong books
- Resolved on every request, uncached, so revocation is immediate — the same reasoning that rejected
  JWTs
- Every response echoes its `businessId`, and the client discards a response whose business does not
  match the tab. That catches in-flight responses landing after a switch, which server-side scoping
  cannot

**Why the path and not a header:** a missing path segment is visible in the OpenAPI document and
assertable in one line; a missing header is invisible. The path also puts `business_id` into access
logs and traces for free, and avoids `Vary`, forwarded headers and preflight entirely.

**Cost:** every route template and client call site grows a segment, and ~90% of operations grow a
parameter. That verbosity is the enforcement.

### Two Tabs, Two Businesses

**Two tabs are two URLs, which are two scopes, with no shared mutable state.** Switching in one tab
does not move the other. The alternative — active business on the session — turns a side-by-side
comparison, exactly what an owner with four businesses does on day one, into a silent data-entry
hazard.

Because tabs can diverge, **visual distinctness becomes necessary rather than nice**: the business
name goes in the rail's context cluster *and* the browser tab title (`[GFX] Job 1042 — Fleetco`),
because the title is the only thing visible when a tab is unfocused — which is exactly when the
mistake happens. A test business additionally re-skins the rail through a scoped token override.

| Failure | Response | What the user sees |
|---|---|---|
| Business segment names a business with no grant, or in another tenant | **404, never 403** — matching ROLE-003 | "This business isn't available to you", plus the picker. **No silent fallback** |
| Business archived under a held tab | 404 | Same pane, naming the business |
| Grant revoked mid-session | Next request 404; any open stream terminates | A toast naming the business, then the picker |
| A URL pasted from tab A into tab B while B is mid-save | B's save completes correctly, because its business was already in its request path | Nothing. This is the payoff |

### Switching And The Session

**Switching business re-mints the session only when it crosses tenants**, never within one. Within a
tenant it is pure navigation and the cookie never changes — re-minting on every switch would change
a cookie all tabs share and destroy the two-tab property above. Cross-tenant switching rotates the
session, which [[Auth and Identity]] already requires on a privilege change.

The switcher shows a flat list of businesses for a single-tenant user, and a two-level tenant →
business list otherwise. Nobody sees the second shape for years.

## Classification Rule

Three questions, in order. First match wins.

1. **Could two businesses in one tenant hold different values, and would mixing them corrupt a
   number a customer sees or an auditor reads?** → **business-scoped**
2. **Is the row about a person's access, or about the tenant's commercial relationship with us?** →
   **tenant-scoped**
3. **Is it identical for every tenant on earth and shipped with the code?** → **global**, owned by
   migrations, no scope column and no table users can edit

**Anything that does not answer cleanly is business-scoped. Duplicated configuration is annoying;
shared configuration is a correctness bug.**

| | Scope |
|---|---|
| **Business** | Everything in [[Domain Model]]'s `customers.*`, `workorders.*`, `parts.*`, `scheduling.*`, `billing.*`, `portal.*` — plus labor rates, tax rules, notification and document templates, job stages, the outbox, the audit log |
| **Tenant** | Tenant, Business, User, Identity, Membership, BusinessGrant, Role, Session, SSO connection, Invite, authentication audit, our own subscription records, `platform.number_sequences`, `platform.document_numbers` |
| **Global** | The permission catalog (code constants per PLAT-008), country and state lists, units of measure, LaunchDarkly flag definitions |

The five that needed arguing:

| Thing | Scope | Why, and the cost |
|---|---|---|
| Roles | **Tenant** definition, **per-business** grant | "Owner" defined four times drifts. But someone may be Owner in graphics and absent from trailers, so the grant is `(user, business, role)`. Cost: three tables where two would do |
| Permissions | **Global** | PLAT-008 already checks a permission string in code |
| Notification + document templates | **Business** | A graphics invoice must not carry the trailer shop's remit-to. **Seeded from a global default at create, never inherited at read time** — read-time inheritance is a second resolution path, which is a reviewer's problem forever. Cost: four copies to edit |
| Tax rates | **Business** | Statutory, and graphics vs. repair labor is a genuinely different taxability question. The most expensive possible thing to share |
| Feature flags | **Global** definitions, **business** as a targeting key | A LaunchDarkly multi-context: a `user` kind and a `business` kind keyed on `businessId` with `tenantId` and `isTest` as attributes. Flags target the business kind by default. "Turn it on for Dave" becomes "for Dave in the test business" — which is what was actually wanted |

## Numbering

**Per business for the sequence, tenant-wide for the uniqueness guarantee.** Forced rather than
chosen:

QBO-002 sends invoices to **one** QuickBooks company file with a class per business, and INV-004
requires numbers unique across new invoices, migrated FullBay invoices, and invoices already in
QuickBooks. One company file is one `DocNumber` namespace, so two businesses each starting at 1001
breaks the sync inside the accounting system. But a tenant-wide sequence is also wrong — each
business's books would be full of gaps, and "is invoice 1042 missing or is it the trailer shop's?"
cannot be answered from inside one business.

So:

- Each business has an immutable `number_prefix` (`GFX`, `FLT`, `TRL`, `TEST`), unique in the tenant
- Numbers come from `platform.number_sequences (tenant_id, business_id, doc_type, next_value)`,
  allocated with `SELECT … FOR UPDATE` inside the finalize transaction. **Not a Postgres sequence** —
  sequences gap on rollback and PLAT-009 forbids gaps. At tens of invoices a day the serialization is
  free
- Allocation writes `platform.document_numbers` with `UNIQUE (tenant_id, doc_type, number)`. **That
  constraint, not the prefix convention, protects the QuickBooks namespace** — conventions get
  forgotten, constraints do not
- The allocation row survives voids (PLAT-009) and survives a business purge

**Cost:** the stored number is a string, so sorting by number means sorting by `(prefix,
allocated_at)`. **And the test business allocates real numbers** — harmless because `is_test` makes
the QuickBooks adapter refuse to sync, but the prefix must be visibly `TEST` so a screenshot is never
mistaken for a real invoice.

> **Gated on D-C21.** All of the above assumes one QuickBooks company file with a class per
> business. If OTC runs a separate sync per business, the tenant-wide constraint relaxes.

## Business Lifecycle

**Create** — one transaction: the business row (client-supplied UUIDv7, so retry is idempotent), the
creator's grant, the number-sequence rows, config seeded from global defaults, and an outbox
`business.created`. **`is_test` is set here and is immutable** — there is no update path and the
patch type omits it. A flag you can turn off is a flag someone turns off at 6am.

**Delete — archive by default; purge only when `is_test`.**

This is also the answer to [[Infrastructure Checklist]]'s soft-delete question, and a better one than
that document assumed: **soft delete lives at the business level**, where it is one predicate on one
row at the chokepoint — not `deleted_at IS NULL` on sixty tables. Domain rows keep their own
lifecycles instead: void, cancel, inactive. That reconciles soft delete with Q9 at a fraction of the
cost and removes a whole class of forgotten-predicate leak.

**A real business is never purged in V1** — PLAT-005 forbids deleting financial records and Q9's
retention periods are unknown. Deferred with a trigger: the first time OTC actually divests a line of
business.

**Purge order**, test businesses only:

1. Set `archived_at`, delete every grant, emit `business.unavailable` so held streams terminate.
   In-flight requests begin 404ing at the resolver. **Nothing to revoke in sessions, because sessions
   never held the business** — the request-carried decision pays off here
2. Delete domain rows children-before-parents, **in an order derived at runtime from the
   `information_schema` foreign-key graph** — a hand-maintained delete order is the thing that rots
   when module twelve lands
3. Delete the outbox rows
4. **Retained deliberately:** `platform.audit_log` (PLAT-004) and `platform.document_numbers`
   (PLAT-009). Both keep `business_id` as a dangling id with a business-name snapshot and **no
   foreign key** — the missing key is load-bearing and is commented as such
5. S3 objects are keyed `s3://bucket/{businessId}/{entity}/{id}` — **business-first, decided now
   precisely so a purge is one prefix.** Delete all versions. **This forces an infrastructure
   decision: Object Lock on the attachments bucket must be in governance mode, not compliance mode,
   or a purge is impossible and you find out on the day**
6. Delete the LaunchDarkly business context, best-effort removal from flag targeting, alert on
   leftovers. Business ids are never recycled, so stale targeting is clutter, not a correctness risk
7. An `audit_log` row for the purge, and an outbox `business.purged`

The guard cannot be a database constraint (ADR-011 bans logic there), so it is an operator-plane
route, a typed confirmation of the business slug, an audit row, and the enumerated acceptance test
below. **Residual risk, named: a code bug could purge a real business.** The mitigation is that the
operation lives in one file with one caller and is covered by leak case 16.

## `is_test` Enforcement

The flag is on `platform.businesses`, immutable, and carried on `ActiveBusiness` — so it is in the
request context everywhere without a refetch.

**Every outbound port takes `ActiveBusiness` as its first parameter**, exactly as every repository
takes a scope:

```ts
interface Mailer     { send(business: ActiveBusiness, message: Message): Promise<void> }
interface Accounting { push(business: ActiveBusiness, invoice: Invoice): Promise<void> }
interface Payments   { charge(business: ActiveBusiness, intent: Intent): Promise<Receipt> }
```

**An adapter that cannot see `isTest` cannot be written, because it cannot be called without it.**
Each implementation calls a shared `assertRealWorldAllowed(business)` and diverts — mailer to a
catch-all, **QuickBooks to refusal, not a sandbox** (a sandbox sync that half-works is worse than
none), payments to test keys. The gate is a test that enumerates every class implementing an outbound
port and asserts each changes behaviour under `isTest`.

**Anything that spans businesses cannot hold a `BusinessScope` by definition**, so it gets exactly
one type it must go through:

```ts
type RealBusinesses = readonly BusinessId[] & { readonly __brand: 'RealBusinesses' }
realBusinessesOf(scope: TenantScope): Promise<RealBusinesses>
// is_test = false AND archived_at IS NULL. The only constructor.
```

Aggregation repositories accept `RealBusinesses`, never `BusinessId[]`, so **the exclusion is in the
type a reviewer reads.** A lint rule forbids constructing it outside `platform/tenancy`.

## Users Across Tenants

`user → identity (credentials) → membership (per tenant) → business_grant (per business, with a
role)`. One login, N tenants, N businesses per tenant. ADR-007 extended, not changed.

The resale case — an accountant serving two companies — works because **the resolver reads the tenant
from the business, never from a presumed single membership.** The only thing that would foreclose it
is the cross-tenant assertion, which is why switching re-mints the session on a tenant crossing.

## The Leak Suite

Eighteen cases. Every "every operation" case is **enumerated from the documented operations**, not
listed by hand.

1. **The headline case.** User with grants in A and B, acting in A, requests a record belonging to B
   → 404, on every business-scoped operation
2. **Cross-business parenting.** Acting in A, post a line whose parent is in B → rejected, and the
   composite foreign key makes it impossible even if the service forgets
3. **No business segment.** Every business-scoped operation is unreachable without it; nothing
   defaults
4. **No grant.** Business exists in the same tenant, user has no grant → 404
5. **Archived business.** A user who had a grant before archiving → 404
6. **Foreign tenant, with the grant check stubbed to pass** → still 404. **This is the test that
   proves the cross-tenant assertion is independent of the grant check**, which is the claim ADR-005
   rests on
7. **Revocation mid-stream.** Open a stream on A, revoke the grant; the next event is not delivered
   and the stream terminates
8. **Foreign cursor.** Open a stream on B with a cursor captured from A → treated as absent, B
   replays from the start, no A event id appears
9. **Interleaved replay.** Events written alternately to A and B on one global sequence; replay B
   from zero and assert the received ids are exactly B's subsequence, gap-free
10. **Portal inside a business.** Portal principal in A scoped to customer X cannot reach customer Y
    in A, cannot reach anything in B, cannot be granted two customers
11. **Assignment composes, doesn't replace.** Technician in A assigned J1: J2 in A → 404; J1 under
    B's segment → 404
12. **Side-effect fence.** For every class implementing an outbound port, instantiated with a test
    business, the real-world call is not made
13. **Aggregation excludes test.** A cross-business report run by a user with all four grants omits a
    distinguishable amount seeded into the test business
14. **Schema gate.** Every domain table has `business_id NOT NULL` + foreign key; none has
    `tenant_id`; every foreign key between business-scoped tables includes `business_id`
15. **Route-plane gate.** Every documented operation is business-prefixed or on the named allowlist
16. **Purge completeness.** Seed A (`is_test`) and B (real) with one of every entity; purge A; assert
    zero rows with A's id in every table enumerated from `information_schema`, B's counts unchanged,
    zero S3 objects under A's prefix including non-current versions, **the retained set is exactly
    `audit_log` and `document_numbers` asserted by name** — so adding a retained table requires
    editing this test, which is the review you want — a request under A 404s, and a stream held on A
    has terminated rather than stalled
17. **Impersonation does not widen.** An operator with their own grant in B impersonates a user
    granted only A; requests under B → 404
18. **Numbering.** Concurrent finalizes in two businesses: each sequence gap-free, no duplicate
    `(doc_type, number)` tenant-wide, and a void releases nothing

## The Retrofit

The spike implements single-level scope. Estimated **1,200–1,600 lines touched of ~5,500**, of which
~400 are new logic and the rest mechanical rename — roughly two days of agent work, with the review
cost concentrated in the 400.

| Area | Change |
|---|---|
| `types/branded.ts` | Add `BusinessId` and friends. `TenantId` stays |
| `types/principal.ts` | **Unchanged** — the business is deliberately not on the principal. It is per-request, not per-identity |
| `types/scope.ts` | Split into `BusinessScope` + `RowFilter` + `TenantScope`. **`scopeOf(principal)` is deleted** — the single highest-value line of the retrofit |
| new `platform/tenancy/` | `businesses`, `business_grants`, `ActiveBusiness`, `businessScopeOf`, `realBusinessesOf`. ~300 new lines |
| `db/tenant-scoped-repository.ts` | Split into business- and tenant-scoped bases, with keyset paging moving to a shared scope-free base |
| 3 module `schema.ts` | `tenant_id` → `business_id` on 5 tables, swap index leading columns, add `UNIQUE (business_id, id)`, composite foreign keys. **A migration rewrite, not an alter — no production data exists** |
| 3 module `repository.ts` / `service.ts` / `routes.ts` | `businessColumn`, the assignee filter, `ActiveBusiness` in signatures, the `/b/{businessId}` segment |
| `outbox/*` | `business_id`, `(business_id, topic, id)` replay index, notification payload. `claimPending` stays deliberately unscoped — the dispatcher serves no principal |
| `test/factories.ts` | `makeBusiness`, `makeActiveBusiness`, `makeGrant`. **The leverage point** — every test changes through this file |
| Leak suites | The 18 cases, plus the schema and route-plane gates. **The largest chunk, correctly** |
| `fleetco-ui` | `departments` → `businesses`, a working switcher, `/b/{businessId}` routing, tab title, test-business token override |

**One-way doors:**

- **Dropping `tenant_id` from domain tables.** Reversible only as a migration across every table.
  What makes it safe is the invariant *a business never changes tenant*
- **`/b/{businessId}` in the app URL.** Changing it breaks every bookmark. A redirect from the
  unprefixed path to the user's last business is acceptable **for navigation only** — the same
  behaviour on a data request is the banned default above, and that distinction belongs in a comment
  at the redirect
- **The number format `{PREFIX}-{n}`.** Frozen once invoices are in QuickBooks and in customers'
  hands
- **`is_test` immutability.** The one-way-ness is the feature

**Not one-way:** the topic grammar, the index shapes, the chokepoint's internals.

**Deferred from the design as written:** the business-stamped SSE cursor format
(`id: {8 hex}:{n}`). `EventSource` already scopes `Last-Event-ID` per connection and each business is
a separate URL, so the failure only appears once we persist cursors ourselves — which is Q5's offline
path, not V1. **Keep the cursor-validation hook, skip the frame format** until offline is real.

## Isolation: Pooled, Decided

**Decision (2026-10-09): one shared database.** Resale is assessed as a small possibility (Q7), and
the deployment question is closed — see ADR-006.

> **Updated 2026-11-08.** The separator is now `business_id`, not `tenant_id` (ADR-005). The pooled
> reasoning below is unchanged; only the column changes.

For context, the three models that were on the table:

| Model | Shape | Isolation | Ops cost |
|---|---|---|---|
| **Pooled** ← chosen | One database, all tenants, separated by `tenant_id` | Logical | One deploy, one migration run |
| Schema-per-tenant | One database, one Postgres schema per tenant | Logical, stronger | One instance, N migration runs |
| Siloed | Separate database + API deploy per tenant | Physical | N deploys, N migrations, N bills |

**Why pooled won.** The two migrations are not equally hard, and that asymmetry decided it:

- **Pooled → siloed is easy.** Dump a tenant's subset and point it at its own database. Per-tenant,
  on demand, for the one buyer who ever demands it. **Now a join through `platform.businesses`
  rather than a column filter** — one view definition, not a rewrite.
- **Siloed → pooled is hard.** Merging databases with colliding keys and schemas that have drifted
  apart.

So pooled-first is the reversible choice and siloed-first was the one-way door — the opposite of
the usual intuition that physical separation is the safe start. Siloed also required fan-out
migration tooling, a tenant registry, and partial-failure handling **before tenant two**, which is
weeks of platform work ahead of a problem that may never arrive. ServiceTitan, Fleetio, and almost
certainly FullBay are all pooled; physical isolation here is an enterprise upsell, not a baseline.

### Why A Scope Column Is Not Dead Weight

The reasonable objection: if resale is unlikely, is a scope column on every table worth it?

**Yes, and the portal was always the reason, not resale.** Portal users must be restricted to one
`customer_id`, so a query-level chokepoint and a leak-test suite have to exist regardless. The scope
column rides on infrastructure that is required anyway. Retrofitting it later would touch every table
and every query.

**That argument now applies to `business_id` rather than `tenant_id`, and it is stronger** — the
business boundary is crossed by live traffic every day (ADR-029's test business), while the tenant
boundary will not be crossed for years.

### If Physical Isolation Is Ever Demanded

Extract one tenant: dump the rows belonging to its businesses, load into a dedicated database, point
its configuration at the new connection. Bounded work, one tenant at a time, no rewrite. This is the
option pooled-first preserves.

## Identity: The Wrinkle That Bites

**A person is not owned by a tenant.** The same human can legitimately be a portal user for two
different shops that both run this software — a fleet serviced by two competing shops is a completely
normal situation. **The business layer does not change this**; see [[#Users Across Tenants]].

Therefore: model users as `user ↔ membership ↔ tenant`, never with a `tenant_id` column on the
user. Beneath that, a separate `identity` table holds credentials and federated logins, so one
person can authenticate by password today and through their employer's IdP tomorrow without
becoming two accounts.

**Pooled deployment (ADR-006) exposes this immediately** rather than hiding it, which is an
argument for getting it right now: it is nearly free on day one and expensive to retrofit once
sessions exist in production. Full schema in [[Auth and Identity]].

> *Earlier versions of this document justified the membership table by Supabase's non-nesting user
> pools. That justification is void under ADR-010, but the decision stands on the stronger reason
> above.*

## Resolution: Tenant No, Business Yes

**Tenant resolution is still not needed.** ADR-018 withdrew subdomains; the tenant comes from the
session and nothing in a URL names it.

**Business resolution is needed, and it is V1 work.** ADR-018 anticipated this — *"if tenant two ever
arrives, tenant resolution must be added"* — and the thing that arrived was businesses rather than
tenants. The resolution is `/v1/b/{businessId}/` plus `ActiveBusiness.resolve`, covered above. Note
what it is **not**: there is no inference, no default, and no fallback to the user's first business.

## Day-One Non-Negotiables

Cheap now, extremely expensive to retrofit:

1. **`tenant_id` on every domain table.** Enforced by convention and by a test that fails if a
   table lacks it.
2. **Business scope applied at a single chokepoint** in the data layer, not hand-written per query.
   A repository or query-builder wrapper that *cannot* produce an unscoped query. Plus the composite
   `(business_id, parent_id)` foreign keys, which make cross-business parenting impossible in the
   database.
3. **`user ↔ membership ↔ tenant`** rather than a `tenant_id` column on users.
4. **A separate `identity` table** beneath users, with a nullable `password_hash`, so SSO is
   additive later rather than a migration.
5. **`tenant_id` stored on the session** and verified on every request.
6. **UUIDv7 primary keys everywhere**, never sequential integers. *(Rationale corrected
   2026-10-09 — the original justification was enabling siloed → pooled consolidation, which is
   void now that deployment is pooled from the start. The decision stands on three other
   grounds:* non-enumerable identifiers in a customer-facing portal, where sequential integers
   invite guessing at other customers' records; offline identifier generation if Q5 turns out to
   require it; and collision-free merging of records imported from FullBay. UUIDv7 keeps
   time-ordered index locality, so the usual performance objection to UUIDs does not apply.
7. **Cross-business, cross-tenant *and* cross-customer leak tests in CI** — the eighteen cases
   above, with a multi-business user as the central one.** Seed two tenants, assert every endpoint *and every realtime
   subscription* refuses the other's data — then do the same for two customers inside one tenant,
   which is the case that matters on day one. This suite is the single highest-value test asset in
   the product, and it is a required deploy gate.

## Explicitly Deferred

Not now, despite the resale ambition:

- **SSO** — deferred, but with a readiness plan and a day-one schema. See [[Auth and Identity]].
- **SCIM provisioning** — arrives in the same conversation as the first SSO request.
- **SOC 2** — correctly out of scope for phase one, but hospital InfoSec reviews reach through to
  the platform, so timing becomes a sales constraint if the resale play is real.
- **A separate vendor-plane application** — deferred to tenant two; an admin role with
  impersonation covers phase one.
- **Subdomain tenant routing** — withdrawn entirely, see ADR-018.
- White labeling, custom domains, per-tenant feature flags beyond simple configuration,
  usage-based billing.

## Related

- [[Auth and Identity]] — authentication, sessions, the SSO plan
- [[Realtime and Events]] — the chokepoint applied to subscriptions
- [[AWS Buildout]] — the test business and the environment strategy it belongs to
- [[Rules Catalog]] — PLAT-006, ROLE-003, INV-004, QBO-002, PLAT-009, and D-C18/D-C21/D-C22
- [[Stack Evaluation]]
- [[Architecture Decisions]]
- [[Operations]]
- [[Open Questions]] — Q7 (is resale real), Q14 (closed)
- [[Project Brief]]
