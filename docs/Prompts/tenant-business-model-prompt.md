---
status: artifact
summary: The prompt used to design the tenant/business model
created: 2026-11-08
updated: 2026-11-08
tags: [fleetco, prompt, tenancy, domain, design]
source: Dave + Claude Code (Xerro)
---

Paste everything below the line into a fresh agent session with this repository available.

---

You are designing the tenancy model for a multi-business SaaS product before it is built. The
environment and deployment strategy is settled; this is the piece that was deliberately left for its
own pass. I want decisions with trade-offs, not options with caveats.

## Read these first

- `docs/Architecture/Tenancy Model.md` — the current model. **It assumes one level of scope and that
  is what has to change.**
- `docs/Architecture/Architecture Decisions.md` — **ADR-005** (the decision to replace), plus 006
  (pooled, one database), 007 (`user ↔ membership ↔ tenant`), 009 (outbox), 014 (REST/Zod), 018
  (single hostname, no subdomains), and 029 (two environments).
- `docs/Architecture/Auth and Identity.md` — sessions, the "Cookies and Origins" section, memberships,
  impersonation.
- `docs/Architecture/Realtime and Events.md` — outbox, SSE authorization, the replay contract.
- `docs/Architecture/AWS Buildout.md` — read **"Still Open"** and **"The Test Business"**.
- `docs/Architecture/UI Vocabulary.md` and `docs/Product/Domain Model.md` — the words already in use.
- The spike code, which already implements single-level scope:
  `fleetco-nestjs-vehicles/src/platform/types/{scope,principal,branded}.ts`,
  `platform/outbox/{schema,repository,notifier}.ts`, `platform/test/factories.ts`.

## What is agreed — do not relitigate

- **Tenant = a company.** OTC is the only one for the next one to two years. Resale adds more; it is
  a real long-term goal, not a fantasy.
- **Business = a line of business inside a tenant.** OTC has graphics, fleet and trailers, plus a
  test business for the developer. All currently run on FullBay; the plan is to move them all over.
  **V1 must support this from the start.**
- **Users are global to the tenant and granted access per business.** Dave can reach all four;
  Cameron and Dan reach the three real ones, not the test business.
- **Switching business is a control in the menu footer.**
- **Everything domain-level is scoped to a business. Nothing is shared across businesses except
  users** — not customers, not parts, not vendors, not labor rates. A shared entity would be an
  explicit, named exception, and there are none today.
- **Businesses can be created and deleted.** Both are V1 features, because the test business needs
  them.
- **A business carries an `is_test` flag** that the integration adapters enforce, since business
  isolation protects data but not side effects.

## Constraints — do not propose solutions that ignore these

- **One part-time developer.** Bus factor of two; the second person is not a developer. Review
  capacity, not code volume, is the bottleneck.
- **Every line of code is written by AI agents and reviewed by one person.** A design that is safe
  *structurally* beats one that is safe when everyone remembers the rule. This is the single most
  important criterion.
- Pooled multi-tenancy, one shared Postgres database (ADR-006). Not negotiable.
- A single hostname, no tenant or business in the subdomain (ADR-018).
- Invoicing and money correctness matter more than uptime. Some records are statutory.
- The product replaces a $5,000/month incumbent for one customer. Scale is tens of users, hundreds of
  vehicles, thousands of work orders.

## The first fork — answer this before anything else

**Are there two enforced levels of scope, or one?**

- **(A) Two levels.** `tenant_id` and `business_id` both enforced on domain tables.
- **(B) One enforced level.** `business_id` is the only scope on domain data. The tenant exists only
  as a grouping for the user directory and billing, with no predicate on domain queries.

ADR-005 chose one level on the explicit grounds that nested tenancy "roughly doubles complexity for
no benefit." **(B) honours that reasoning; (A) overturns it.** Decide which, and say plainly whether
you are keeping ADR-005's rationale or rejecting it. Everything below depends on this answer, so
resolve it first and carry it through consistently.

## Decisions I need from you

1. **The fork above**, with the reasoning.
2. **Column shape on domain tables.** Which scope columns, denormalized or derived, and what the
   indexes look like.
3. **The chokepoint.** `Tenancy Model.md` requires a data-layer wrapper that *cannot* produce an
   unscoped query. Give me its shape. **And resolve how business scope composes with the portal's
   existing customer scope** — ADR-005 has two authorization levels today (shop staff, and portal
   users scoped to a `customer_id`). Do not quietly turn that into three levels of tenancy.
4. **A classification rule** for what is business-scoped, tenant-scoped, or global — a *rule*, not a
   list, plus the list it produces for the entities in `Domain Model.md`. Include roles and
   permissions, notification templates, tax rates, document templates, feature flags.
5. **How the active business is carried**, and the consequences. See the hard spots below.
6. **Outbox and SSE.** The topic grammar is `customer:{tenantId}:{customerId}` and the replay index
   is `(tenant_id, topic, id)`. What do those become, and how is the replay cursor scoped so a
   subscriber in one business can never receive another's events — including during replay?
7. **Numbering sequences.** Invoice and work-order numbers: per business or per tenant? There are
   accounting consequences, so argue it rather than picking.
8. **Business lifecycle.** Create, and delete. Hard delete or archive? Table order, S3 objects,
   LaunchDarkly targeting, and the audit rows that may be legally required to survive (Q9). What is
   the acceptance test that proves a delete left nothing behind?
9. **`is_test` enforcement**, and how anything that spans businesses excludes test businesses without
   relying on someone remembering.
10. **Users across tenants.** One identity with memberships works inside a tenant. When resale
    arrives, can one person serve two companies — an accountant, say — without reopening this
    decision? Say whether your model allows it or forecloses it.
11. **Vocabulary.** What the UI calls this concept and what the code calls it. They need not match,
    but both need deciding, against `UI Vocabulary.md`.
12. **The leak suite's new cases.** At minimum: a user who legitimately belongs to two businesses,
    acting in one, must not reach the other by passing its ids. Name the others.
13. **The retrofit.** The spike code already implements single-level scope in the files listed above.
    Tell me what changes, roughly how big it is, and whether any of it is a one-way door.

## Hard spots — probe these hardest

1. **Two browser tabs in two businesses.** If the active business lives on the session, two tabs
   cannot diverge — switching in one silently changes the other, which is a data-entry hazard when
   someone is comparing two businesses side by side. If it lives in the URL or a request header, tabs
   can diverge but the server must validate it on every request and the client can now assert its own
   scope. **This is the sharpest question in the whole design.** Decide it, and say what the user
   experience is when it goes wrong.
2. **Does the business appear in URLs?** ADR-018 kept the tenant out of the URL. Does a business go in
   the path? Weigh bookmarking and link-sharing against ADR-018's reasoning and the non-enumerable-id
   rule in `Tenancy Model.md`.
3. **A held SSE connection when the user switches business.** What happens to the stream, the replay
   cursor, and anything mid-flight?
4. **Deletion versus retention.** Soft delete is already a cross-cutting decision in
   `Infrastructure Checklist.md`, and legal retention (Q9) pushes against hard delete. The test
   business genuinely needs to disappear. Reconcile these.
5. **Impersonation and cross-business admin.** Dan owns all the businesses and will want to move
   between them without three logins. That is correct for an owner and wrong as a default. Where does
   that live relative to `Auth and Identity`'s impersonation-with-audit-trail?
6. **The thing I have not thought of.** Finding a failure mode not on this list is worth more than
   confirming one that is.

## Deliverable

- **A decision per numbered item**, each with the trade-off it costs. Where you are genuinely
  uncertain, say so rather than picking to look decisive.
- **A draft replacement for ADR-005**, in the house style used in `Architecture Decisions.md` —
  Context, Decision, Rationale, Consequences.
- **The retrofit list** for the spike code.
- **The new leak-suite cases**, concretely enough to become tests.
- **Anything in "What is agreed" you think is wrong.** It is agreed, not sacred. If one of those
  points will cause real pain, say so in a few sentences with your strongest reason — then design
  within it anyway, so I get both.

## Do not

- Do not rewrite `Tenancy Model.md` or any other document. Give me the decisions; I will write them.
- Do not restate the agreed points back to me.
- Do not propose row-level security as the authorization layer, a separate database per business, a
  separate deployment per business, or a service extraction. The first is rejected in
  `Tenancy Model.md`, the rest in ADR-006 and ADR-001.
- Do not design for scale this product will not see. Tens of users, not tens of thousands.
- Do not pad. A short document that decides things beats a long one that surveys them.
