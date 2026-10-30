---
created: 2026-10-08
updated: 2026-10-09
tags: [fleetco, architecture, multi-tenancy, saas, isolation]
source: Claude Code (Xerro)
---

## Overview

The tenancy and **authorization** model for the Fleetco platform, including the architecture that
supports reselling the whole stack to *other* fleet management companies. Authentication is
covered separately in [[Auth and Identity]].

**The core answer: the tenant is the fleet management company. Its customers are not tenants —
they are a data scope inside a tenant. This is not multi-multi-tenancy.**

Getting this wrong is how teams end up building nested tenancy, which roughly doubles complexity
for no benefit.

## The Confusion Worth Clearing Up

FullBay has two kinds of login: one for the fleet management company's staff, and one for each of
that company's customers. It's natural to read those as two levels of tenancy. They aren't.
**They are two roles.**

A customer portal login is a user with a narrow role plus a scope: "this user may see only the
rows belonging to `customer_id = X` within `tenant_id = Y`." That's authorization, not tenancy.

## The Model

```
tenant (fleet management company)      ← Fleetco, OtherShop, …
├── users: shop staff                  ← full access within tenant, role-gated
└── customers (the fleets serviced)    ← Acme Trucking, City Hauling, Regional Hospital
    ├── users: portal logins           ← scoped to ONE customer_id
    ├── vehicles / units
    ├── service orders
    └── invoices
```

Every domain table carries `tenant_id`. The result is **two levels of authorization but one level
of tenancy.**

### Three Planes, Not Two

There is a third party that is easy to miss: **Fleetco as the vendor.** If they resell, they need
an operator view across all tenants — usage, billing, support impersonation, provisioning.

| Plane | Who | Scope | SSO shape |
|---|---|---|---|
| **Vendor / operator** | Fleetco staff running the SaaS business | Cross-tenant | n/a — internal |
| **Tenant** | A fleet management company's staff | One `tenant_id` | Standard, per-tenant |
| **Portal** | A fleet customer's staff | One `customer_id` within one `tenant_id` | **Per-customer — non-standard** |

**Vendor plane, revised 2026-10-09.** The original rule was "the vendor plane is a separate
application with a separate auth system," which is correct for a multi-tenant SaaS business and
premature for one tenant. Resale is a small possibility (Q7), so for phase one the operator
capability is an **admin role inside the single application**, with impersonation and a full audit
trail.

The separation rule returns the moment a second tenant exists — a Fleetco operator account sharing
a user table with tenant users is how one role-check bug becomes a cross-tenant breach. What keeps
that cheap later is the `tenant_id` discipline below.

**On the SSO column:** because Fleetco's customers include large hospitals, enterprise SSO arrives
at the *portal* plane — keyed on `customer_id` inside a tenant. Essentially every off-the-shelf
B2B SSO product assumes SSO is configured per tenant, so this mapping is ours to own. Full
treatment in [[Auth and Identity]].

## Isolation: Pooled, Decided

**Decision (2026-10-09): one shared database, all tenants separated by `tenant_id`.** Resale is
assessed as a small possibility (Q7), and the deployment question is now closed — see ADR-006.

For context, the three models that were on the table:

| Model | Shape | Isolation | Ops cost |
|---|---|---|---|
| **Pooled** ← chosen | One database, all tenants, separated by `tenant_id` | Logical | One deploy, one migration run |
| Schema-per-tenant | One database, one Postgres schema per tenant | Logical, stronger | One instance, N migration runs |
| Siloed | Separate database + API deploy per tenant | Physical | N deploys, N migrations, N bills |

**Why pooled won.** The two migrations are not equally hard, and that asymmetry decided it:

- **Pooled → siloed is easy.** Filter by `tenant_id`, dump the subset, point that tenant at its own
  database. Per-tenant, on demand, for the one buyer who ever demands it.
- **Siloed → pooled is hard.** Merging databases with colliding keys and schemas that have drifted
  apart.

So pooled-first is the reversible choice and siloed-first was the one-way door — the opposite of
the usual intuition that physical separation is the safe start. Siloed also required fan-out
migration tooling, a tenant registry, and partial-failure handling **before tenant two**, which is
weeks of platform work ahead of a problem that may never arrive. ServiceTitan, Fleetio, and almost
certainly FullBay are all pooled; physical isolation here is an enterprise upsell, not a baseline.

### Why `tenant_id` Stays Anyway

The reasonable objection: if resale is unlikely, is `tenant_id` on every table dead weight?

**No, because the portal already forces the machinery.** Portal users must be restricted to one
`customer_id`, which means a query-level scoping chokepoint and a leak-test suite have to exist no
matter what. `tenant_id` rides along on infrastructure that is required anyway — one extra column
and one extra predicate at a chokepoint that is already there. Retrofitting it later would touch
every table and every query in the system.

### If Physical Isolation Is Ever Demanded

Extract that single tenant: dump its rows by `tenant_id`, load into a dedicated database, point
its configuration at the new connection. Bounded work, one tenant at a time, no rewrite. This is
the option that pooled-first preserves.

## Authorization Chokepoint

The single highest-value structural decision in the whole system.

**Tenant scope is applied at one place in the data layer, not hand-written per query.** A
repository or query-builder wrapper that *cannot* produce an unscoped query. Every read and write
passes through it; there is no second path.

This is why RLS was rejected as the authorization mechanism (ADR-011) — not because RLS is bad,
but because having *two* authorization implementations that must agree forever is how cross-tenant
leaks ship. One implementation, in TypeScript, tested.

The chokepoint serves REST and realtime subscriptions alike. See [[Realtime and Events]].

## Identity: The Wrinkle That Bites

**A person is not owned by a tenant.** The same human can legitimately be a portal user for two
different shops that both run this software — a fleet serviced by two competing shops is a
completely normal situation.

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

## Tenant Resolution: Not Needed

**Decision (2026-10-09): a single hostname, `app.fleetco.com`. No tenant in the URL.** See
ADR-018, which supersedes the earlier subdomain-per-tenant decision.

With one tenant there is nothing to resolve before login. Both original rationales for subdomains
were resale-driven — giving resellers something that felt like their own product, and pre-login
tenant resolution that pooled mode would have needed across many tenants.

**This is a security simplification, not merely less work.** A session cookie scoped to a shared
parent domain is transmitted to *every* subdomain under it, so a session minted for one tenant
would arrive at another looking valid. Removing subdomains removes the bug class instead of
mitigating it.

**What survives:** `tenant_id` is still stored on the session and verified on every request. Cheap
defense in depth, and it means adding tenant resolution later is a routing change rather than a
re-architecture. See [[Auth and Identity]].

**Still deferred:** custom domains and white labeling.

## Day-One Non-Negotiables

Cheap now, extremely expensive to retrofit:

1. **`tenant_id` on every domain table.** Enforced by convention and by a test that fails if a
   table lacks it.
2. **Tenant scope applied at a single chokepoint** in the data layer, not hand-written per query.
   A repository or query-builder wrapper that *cannot* produce an unscoped query.
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
7. **Cross-tenant *and* cross-customer leak tests in CI.** Seed two tenants, assert every endpoint *and every realtime
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
- [[Stack Evaluation]]
- [[Architecture Decisions]]
- [[Operations]]
- [[Open Questions]] — Q7 (is resale real), Q14 (closed)
- [[Project Brief]]
