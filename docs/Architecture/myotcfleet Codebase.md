---
created: 2026-10-11
tags: [fleetco, myotcfleet, codebase, architecture, assessment]
source: Claude Code (Xerro) — read of github.com/cthomasotc-ui/myotcfleet
clone: /Users/dweaver/Projects/ai/xerro-agent/repos/cthomasotc-ui-myotcfleet
confidence: high — read directly from source
---

## Overview

Assessment of the actual myotcfleet codebase, now that repo access exists. Supersedes the
inference-based parts of [[myotcfleet Recon]], which was built from the shipped bundle.

**Headline: the app is a customer portal in front of FullBay, not a FullBay replacement.**
Everything else below is secondary to that.

## The Decisive Finding

There is **no shop-side domain model**. Zero tables for any of:

`work_orders` · `technicians` · `labor` · `parts` · `inventory` · `estimates` · `timeclock` ·
`core charges`

`active_services` — the table that looks like a work order — is a **pointer at FullBay documents**:

```
id, user_id, unit_id, shop, stage, severity, first_concern, po_number,
estimate_number, service_order_number, estimate_total, notes, authorized_at,
created_at, last_update
```

`estimate_number`, `service_order_number`, and `estimate_total` are references and a cached
total. There are no line items, no labor operations, no parts, no technician assignment, and no
cost roll-up. The actual repair work still happens in FullBay; this app shows the customer what
FullBay already decided and collects an authorization.

**What this means for the $60k/year question:** FullBay's price is for shop operations — service
orders, parts, inventory, technician productivity, invoicing. This codebase implements ~0% of
that. Replacing FullBay is a greenfield build of the entire shop side, and the existing app does
not shorten it. What the app *does* give you, and it is genuinely valuable, is a finished,
well-specified **customer-facing portal** — the part FullBay does worst and the part Fleetco's
customers actually touch.

That reframes the engagement. See [[Evolution Path]] — this is an argument for keeping FullBay as
the shop system longer than planned while owning the customer experience, or for scoping the real
project as "build a shop system" with eyes open, not as "finish Cam's app."

## What The Codebase Actually Is

| | |
|---|---|
| Stack | TanStack Start 1.168 + React Router 1.170, Vite, Tailwind 4, Supabase JS 2.110, Stripe 22 |
| Size | 203 TS/TSX files, ~48,000 lines; 47 routes |
| Schema | **50 tables, 201 RLS policies, 28 Postgres functions, 42 triggers**, 90 migrations |
| History | 1,597 commits, almost all `gpt-engineer-app[bot]` (Lovable) |
| Server layer | 10 `*.server.ts` (server-only logic) + 21 `*.functions.ts` (TanStack server-fn wrappers) |
| Secrets | `.env` is committed but holds only publishable keys. Real secrets are server-side env vars. Untidy, not a leak |

### Enums (the real domain vocabulary)

- `app_role`: `customer_admin, repair_approver, viewer, billing, location_manager, otc_admin,
  otc_coordinator`, later extended with `driver, fleet_authorizer, account_owner`
- `service_stage`: `draft, submitted, evaluating, ready_to_authorize, in_progress, completed`
- `severity_level`: `none, minor, major, down`
- `invoice_status`: `current, coming_due, past_due, paid`
- `app_permission`: `users.manage, vehicles.manage, vehicle_access.manage,
  company_settings.manage, drivers.view_all, issues.authorize, services.request,
  services.authorize, invoices.view, invoices.pay, reports.view, messages.send,
  profile.edit_others`

A 13-permission enum with per-user overrides (`user_permissions`) on top of roles. That is a
deliberate RBAC design, not an accident.

## Quality Assessment

This is the surprise of the review: **the code is good.** Not "good for a non-developer" — good.

Evidence, from `src/lib/fullbay.server.ts`:

```ts
// SECURITY: FULLBAY_API_KEY is read here only, never returned, logged, or sent anywhere except Fullbay.
// Trim: a key pasted with a trailing newline fails exactly like a wrong key.
// Fullbay does not document the controlling timezone: today, then yesterday, then tomorrow.
// Fullbay answers HTTP 200 with status "FAIL" for a rejected request.
```

Comments explain *why*, handle real-world failure modes, and show security awareness. There is a
clean server/client boundary, consistent `*.server.ts` / `*.functions.ts` separation, timeouts on
every outbound call, and `AbortController` cleanup in `finally`.

`AGENTS.md` is a genuine architecture decision log, each entry carrying a `Why:`. Example:

> *"OTC 'open customer account' moves the OTC user's `profiles.company_id` into the customer and
> records `otc_account_sessions`; while a session exists, DB role helpers treat them as that
> company's admin. **Why:** reuses existing company-scoped RLS instead of per-page filters."*

`roadmap.md` honestly tracks what is **not** done, including a precise list of what fleet-group
scoping still misses. A builder who writes down his own unfinished edges is a builder you can work
with.

**Caveat on attribution:** 1,597 commits almost entirely from the Lovable bot means the *prose* of
these comments is likely model-generated. The judgment to keep them, and the decision log, is his.
Either way the artifact is sound — but don't assume he can defend every line in a design review.

### Real technical risks

1. **The impersonation design is dangerous.** Mutating `profiles.company_id` to switch an OTC
   admin into a customer's tenant is clever RLS reuse, but it means a crash, timeout, or abandoned
   session can leave a user's identity pointing at the wrong company. There are guard triggers
   (`prevent_profile_company_change`, `otc_account_sessions`), which shows he saw the risk — but
   identity should not be mutable state. This is the first thing I would redesign.
2. **201 RLS policies across 49 tables is a large, untested security surface.** No test suite
   anywhere in the repo. RLS is exactly the kind of logic that fails silently and leaks across
   tenants. Needs a policy test harness before it holds real customers.
3. **Partial fleet-group scoping**, per his own roadmap: enforced on vehicles, driver reports,
   calendar, lifecycle; *not* on active services, invoices, service history, tracking, insurance,
   vendors, reports, or notifications. That is an authorization gap, not a feature gap.
4. **Zero tests.** 48k lines, no test files.
5. **Lovable coupling.** `AGENTS.md` warns that force-push or rebase destroys Lovable project
   history. Any real dev workflow has to decide whether to cut the cord or live with it.

## FullBay API — Now Fully Documented

This closes the question in [[myotcfleet Recon]] and confirms what Fleetco reported.

**Endpoint base:** `https://app.fullbay.com/services/<name>.php` — a legacy PHP API returning XML,
form-encoded POST bodies.

**Auth:** `token = SHA1(apiKey + YYYY-MM-DD + outboundIPv4)`, sent alongside the raw `key`. The
token is date-scoped and IP-bound. Undocumented timezone, so he brute-forces offsets
`[0, -1, +1, -2, +2]` and tries both with and without the IP. Rejections come back as **HTTP 200
with `"status":"FAIL"`**.

**Endpoints he probed** (`PROBE_ENDPOINTS` in `fullbay.server.ts`):

`getCustomers.php` · `getCustomerUnits.php` · `getUnits.php` · `getServiceOrders.php` ·
`getInvoices.php` · `getPreventiveMaintenance.php` · `getPMSchedules.php`

**Only `getInvoices.php` is used anywhere in the codebase.** The probe screen exists precisely
because the others don't usefully answer. That is why the unit importer back-derives the vehicle
roster from up to 104 weeks of invoice history, and why writes go through FullBay's public web
form instead of an API.

Two shops, two keys: `FULLBAY_API_KEY` (OTC Lancaster), `FULLBAY_MOBILE_API_KEY` (OTC Mobile
Department) — `src/lib/fullbay-shops.ts`.

FullBay-related tables: `fullbay_invoices`, `fullbay_billing_sync`, `fullbay_customer_links`,
`fullbay_customer_payments`, `fullbay_form_tests`.

## Other Notables

- **Amtrak is in the portal** as a branded demo account (`roadmap.md`). Worth understanding what
  that relationship actually is — it changes the resale story.
- **Stripe is wired in** (`stripe` 22, `@stripe/react-stripe-js`) with `company_subscriptions`.
  He is thinking about billing *for the portal itself*, i.e. the resale model.
- **Verizon Connect is the largest integration** — `verizon.functions.ts` at 1,779 lines, plus a
  2,105-line `fleet-map.tsx`.
- **pg_cron** drives daily compliance reminders via `/api/public/cron/compliance-reminders`, with
  the secret in `private.cron_secrets` and dedupe via `compliance_reminder_log`.
- **QR vehicle reporting** is fully built: `vehicle_qr_tokens`, `qr_sign_in_requests`,
  `qr_audit_events`, token-limit triggers, anonymous reporting routes.
- **Audit infrastructure** exists: `audit_events`, `record_changes` with a trim trigger.
- `src/integrations/supabase/types.ts` (3,030 lines) is the generated schema in TypeScript — the
  fastest way to read the full data model.

## Revised Recommendation

The migrate-vs-rewrite question has a clearer answer now, and it splits:

- **Keep and build on**: the schema and the customer-portal surface. 50 tables with real RLS,
  a working permission model, and finished compliance/QR/vendor/insurance flows represent genuine
  months of specification work. Rewriting that from scratch would be vandalism.
- **Build new**: the entire shop side. Nothing exists to migrate.
- **Redesign before production**: the impersonation mechanism, and the untested RLS surface.
- **Decide deliberately**: whether the real project is "own the customer portal, keep FullBay for
  the shop" (far cheaper, doesn't kill the $60k bill) or "build a shop system" (the actual
  replacement, and a much larger job than the app's polish suggests).

The second framing is the one Fleetco thinks they are buying. The gap between those two is the
most important thing to get straight before quoting any work.

## Related

- [[myotcfleet Recon]] — the frontend crawl this supersedes in part
- [[FullBay Analysis]] — API section now resolved
- [[Feature Inventory]] — portal features are done; shop features are all unbuilt
- [[Evolution Path]] · [[Platform Choice]] · [[Data Export Feasibility]]
- [[Open Questions]] — add: what is the Amtrak relationship?
