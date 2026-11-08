---
status: reference
summary: What the existing myOTCFleet prototype actually is
created: 2026-10-10
updated: 2026-10-30
tags: [fleetco, myotcfleet, recon, product, architecture]
source: Claude Code (Xerro) — authenticated frontend crawl of https://myotcfleet.com
confidence: high for anything observed directly; gaps marked explicitly
---

## Overview

What the Lovable-built replacement app (`myotcfleet.com`) actually is, as of 2026-10-10,
reverse-engineered from the shipped bundle plus an authenticated crawl of 17 routes.

This app is **the requirements document** for the real build. It is the clearest available
statement of what Fleetco wants, written by the person who understands their business. Treat the
feature surface and workflow vocabulary as authoritative; treat the schema as a sketch.

**Access used:** `davideweaver@hotmail.com`, role `customer_admin`, company
"OTC Fleet Services Test" (`d3e8c0c0-…`), a sandbox tenant created 2026-10-09. 101 seeded units.

## Headline Findings

1. **The FullBay API exists but is invoice-only — and the integration code proves it.** Fleetco
   reported the API "only exposes some invoice details and nothing else." The shipped source
   confirms that precisely, and shows the two workarounds it forced. See
   [[#The FullBay Integration Is The Whole Story]] below. This is the single most important
   finding of the recon, because it determines what a migration can and cannot do.
2. **It is not a toy Lovable SPA.** TanStack Start with SSR and server functions, on Cloudflare,
   with Supabase (project `ulnxbegekuenrqzjqyzw`) behind it. Six of the richest routes never touch
   Supabase from the browser at all — they call server functions that hold the privileged
   credentials. That is a real architecture, and it means a meaningful share of the business logic
   is invisible without the repo.
3. **There is a real multi-tenancy and white-label layer already.** Per-company feature flags,
   accent color, logo, theme/toolbar mode, and an `isDemo` flag. This is built like something
   intended to be resold, which lines up with the resale ambition in [[Fleetco Overview]].
4. **Two-sided product.** A customer/fleet-operator side (what the crawl saw) and an OTC-internal
   shop side (`otc_admin`, `otc_coordinator`) that is entirely unseen. The internal side is where
   the FullBay replacement risk actually lives.

## The FullBay Integration Is The Whole Story

Read from the shipped chunks `admin.fullbay`, `admin.fullbay-form-test`, `fullbay-unit-import`,
and `fullbay-shops`. All quotes below are literal strings from his code.

### Two API keys, one per shop

`fullbay-shops` is a hardcoded two-entry table:

| Shop | Key env var |
|---|---|
| `lancaster` — "OTC Lancaster" | `FULLBAY_API_KEY` |
| `mobile` — "OTC Mobile Department" | `FULLBAY_MOBILE_API_KEY` |

### Read path: invoices only, so the fleet roster is back-derived from invoice history

There is no units endpoint, no customers endpoint, no work-order endpoint. To answer "what
vehicles does this customer have," `fullbay-unit-import` **scans invoice history and infers the
roster from whatever vehicles appear on invoices**:

- Scan windows offered: **13 / 26 / 52 / 104 weeks**
- `"${s.length} unit(s) seen across ${c.size} Fullbay customer(s) (scanned ${a} week(s))"`
- `"… had no invoices in this period, so no units could be read. Try scanning a longer period."`
- Each candidate shows `suggestedUnitNumber`, `nickname`, year/make/model, `alreadyInFleet`,
  and `Last invoiced <date>`
- Dedup key: `${customerName}::${fullbayUnitId ?? vin ?? suggestedUnitNumber}`

That is a two-year invoice crawl used as a substitute for a vehicle list. It is lossy by
construction: **a vehicle that hasn't been invoiced in the scan window does not exist** as far as
the import can tell. Any unit never serviced, or serviced longer ago than the window, is invisible.

`/admin/fullbay` also ships an **"Identify Account & Endpoints"** probe that enumerates endpoints
and reports `status`, `note`, `recordCount`, `recordTags`, and `names` per endpoint. They built an
endpoint-discovery tool, which is what you do when the API is undocumented and you are hunting for
anything beyond invoices.

### Write path: there is no API. He is posting to FullBay's public web form.

`admin.fullbay-form-test` fetches FullBay's **public repair-request HTML form, parses it, and
replays it**:

- Reads the live form's `method`, `action`, `hiddenNames`, and `visibleFields` (incl. which are
  `required`) — *"The Fullbay form layout could not be read right now."*
- Submits and infers success from `upstreamStatus`, `confirmationDetected`, and `redirectHost`
- Test payload is defensive: `"ZZ TEST COMPANY (myOTC POC)"`, `"TEST UNIT — DO NOT SERVICE"`,
  `"TEST SUBMISSION from the myOTC portal proof-of-concept. Please disregard — no actual repair
  is requested."`

And the blocker, in his own words:

> *"Fullbay write access is paused behind the server-side flag (currently off), so submissions are
> blocked. **The public form creates a brand-new Fullbay customer and never matches an existing
> one.**"*

That is where he stopped. Every submission would orphan a new customer record in FullBay instead
of attaching to the real one. There is no way to fix that from outside FullBay.

### Why this decides the migration strategy

- **Dual-write during cutover is off the table.** With no write API and a form that can't match
  existing customers, the new system cannot keep FullBay in sync while running in parallel.
- **Historical data migration cannot come through the API.** Invoices are reachable; units,
  customers, work orders, parts, labor, and technician history are not. That history has to come
  from a FullBay-side export (CSV/DB/report) or not at all — see [[Data Export Feasibility]].
- **Hard cutover per customer is the only viable shape**, which happens to match the existing plan
  of replacing one smaller customer first. That alignment is luck, not design, and it should now be
  stated as a constraint rather than a preference.
- **The invoice-scan import is a migration tool worth keeping** for bootstrapping a customer's
  roster on day one, with the window set to 104 weeks and manual reconciliation after.

## Architecture As Observed

| Layer | What it is |
|---|---|
| Frontend | TanStack Start (SSR + client router), React, Tailwind, Radix/shadcn primitives |
| Hosting | Cloudflare; Lovable-originated (`lovable.app` preview URLs in OG tags) |
| Data | Supabase Postgres via PostgREST, called directly from the browser for ~13 tables |
| Privileged logic | TanStack server functions (`/_serverFn/<sha256>`), auth via Supabase JWT |
| Auth | Supabase email/password. No SSO. Self-signup disabled — admin invite only |
| Analytics | `/__l5e/trackevents` and `/~api/analytics` |
| Keys | Publishable key in bundle (correct). REST introspection endpoint now requires a secret key, so the schema cannot be dumped from outside |

Server functions are **properly authorized** — an unauthenticated call returns
`Unauthorized: No authorization header provided`. That is better security hygiene than a
non-developer prototype usually gets, and worth saying out loud.

## Domain Model

### Roles (10, from the shipped label module)

| Key | Display label |
|---|---|
| `account_owner` | Account Owner |
| `customer_admin` | Fleet Authorizer (Admin) |
| `fleet_authorizer` | Fleet Authorizer |
| `driver` | Driver |
| `repair_approver` | Fleet Authorizer |
| `viewer` | Viewer |
| `billing` | Fleet Authorizer |
| `location_manager` | Fleet Authorizer |
| `otc_admin` | OTC Administrator |
| `otc_coordinator` | OTC Service Coordinator |

Only `customer_admin`, `fleet_authorizer`, `driver` are assignable in the UI. Note the collapse:
five distinct keys all render as "Fleet Authorizer". That is legacy accumulation, and a real
redesign should decide whether those are one role or five.

**The "Fleet Authorizer" is the central concept of this product.** Authorization of repair work by
the fleet customer is the workflow everything else orbits.

### Service workflow (`active_services.stage`)

`draft` → `submitted` ("Submitted to OTC") → `evaluating` ("OTC Diagnosing") →
`ready_to_authorize` → `in_progress` ("Repair in Progress") → `completed`

### Driver issue workflow (`driver_issues.status`)

`submitted` → `waiting_authorizer_review` → `approved_for_otc` | `declined` | `handle_internally`
→ `sent_to_otc` → `scheduled` → `in_service` → `completed`

The `declined` / `handle_internally` branch is a genuine business rule: the fleet can take a
repair in-house instead of sending it to OTC.

### Driver-reported issue taxonomy (12 presets)

Taillight out · Headlight out · Check engine light · Low tire · Flat tire · Brake noise ·
Oil leak · No start · Damage · Inspection concern · Trailer light issue · Other

### Tables observed via PostgREST (13)

`units`, `active_services`, `driver_issues`, `invoices`, `fullbay_invoices`, `profiles`,
`user_roles`, `fleet_groups`, `fleet_taxonomy_options`, `insurance_policies`,
`insurance_policy_units`, `insurance_documents`, `insurance_proofs`, `vehicle_registrations`,
`asset_compliance_requirements`

### Columns confirmed

- **`units`**: `id, unit_number, nickname, year, make, model, vin, plate, status, severity,
  location, driver, next_pm_date, photo_url, asset_category, asset_type, fuel_type, duty_class,
  fleet_group_id, mileage`
- **`active_services`**: `id, unit_id, stage, severity, first_concern, estimate_number,
  estimate_total, last_update, created_at`
- **`profiles`**: `id, full_name, email, company_name, company_id, created_at, deactivated_at`
- **`user_roles`**: `id, user_id, role`
- **`invoices`**: `balance, status`
- **fleet group (server fn shape)**: `id, name, groupType, description, status, vehicleCount,
  authorizerCount, viewerCount, fullbayCustomerName`
- **branding (server fn shape)**: `companyId, isDemo, displayName, accentHex, logoPath, themeMode,
  toolbarMode, disabledFeatures[], enabledFeatures[], myFleetGroupIds[]`

`severity=down` is a first-class concept — a vehicle being down drives the dashboard.

## Feature Catalog (14 flags, with his own descriptions)

Extracted from the branding chunk. This is a feature inventory in the builder's own words.

| Flag | Label | His description |
|---|---|---|
| `service` | Service requests | Active service list and new service requests |
| `driver_reports` | Driver reports | Driver issue reporting and the reports inbox |
| `driver_report_routing` | Driver report routing | — |
| `calendar` | Calendar | Fleet calendar and scheduled work |
| `fleet` | Fleet & vehicles | Vehicle list and vehicle detail pages |
| `fleet_groups` | Fleet Groups | — |
| `billing` | Billing & invoices | Invoices and payment pages |
| `fullbay_billing` | Live Fullbay billing | — |
| `reports` | Reports | Reporting dashboard |
| `fleet_tracking` | Fleet tracking | Live vehicle locations |
| `insurance_registration` | Insurance & registration | — |
| `vendors` | Vendors | Vendor list and vendor application links |
| `vehicle_lifecycle` | Vehicle lifecycle | Planned purchases through disposal |
| `service_history` | Service history calendar | Twelve-month service history report |

Plus `company_settings` and `company-branding` as admin surfaces.

**Only one flag was enabled on the sandbox tenant**, so the crawled nav is a subset of the product.

## Route Inventory

### Customer-side, crawled (17)

`/` · `/driver-issues` · `/active-services` · `/schedule` · `/units` · `/fleet-groups` ·
`/billing` · `/report-issue` · `/my-issues` · `/reports` · `/fleet-tracking` ·
`/insurance-registration` · `/vendors` · `/vehicle-lifecycle` · `/admin/qr-codes` ·
`/configuration` · `/help`

### Detail / flow routes (from the route table)

`/units/$unitId` · `/active-services/$serviceId` · `/active-services/$serviceId/authorize` ·
`/billing/invoices/$invoiceId` · `/vendors/$vendorId` · `/vendors/new` · `/request-service` ·
`/service-history` · `/devices` · `/report-vehicle/$qrTokenId` · `/q/$token` · `/qr-continue` ·
`/vendor-apply/$token` · `/reset-password`

### Admin routes (all render; content role-gated)

`/admin/users` · `/admin/customers` · `/admin/company-settings` · `/admin/audit-log` ·
`/admin/vehicle-access` · `/admin/notifications` · `/admin/subscription` ·
`/admin/integrations/verizon` · `/admin/fullbay` · `/admin/fullbay-form-test` · `/admin/qr-codes`

## Integrations

- **FullBay** — server-side API key. Invoice sync (`fullbay_invoices`), unit import, shop list,
  customer-name mapping on fleet groups, a "repair form test" harness, and a live-billing flag.
- **Verizon Connect** — telematics, powering `/fleet-tracking` ("Live vehicle locations").
- **QR stickers** — physical sticker per vehicle; anonymous/tokenized driver issue reporting via
  `/q/$token` and `/report-vehicle/$qrTokenId`. A genuinely good idea and a differentiator worth
  preserving.
- **Vendor self-service** — tokenized application links (`/vendor-apply/$token`) with invite
  expiry and revocation.

## Row Counts on the Sandbox Tenant

| Entity | Rows | Read |
|---|---|---|
| units | 101 | Real seeded fleet |
| asset_compliance_requirements | 101 | One per unit |
| fleet_groups | 9 | Exercised |
| vehicle_registrations | 36 | Partially populated |
| insurance_proofs | 34 | Partially populated |
| driver_issues | 4 | Lightly exercised |
| active_services | 0 | **Not exercised** |
| invoices | 0 | **Not exercised** |
| insurance_policies | 0 | Table exists, unused |
| vehicle lifecycle assets | 0 | `setup: false` |
| vendors | 0 (1 pending invite) | Barely started |

The two emptiest tables — `active_services` and `invoices` — are the two most important to the
business. Either the sandbox was never driven through a full workflow, or those flows are less
finished than the UI implies. **Worth confirming before trusting the service/billing screens as
specifications.**

## Gaps — What This Crawl Cannot Reach

1. **The entire OTC-internal shop side.** Work orders, technicians, labor time, parts, inventory,
   estimate construction. Needs an `otc_admin` account. This is the biggest gap by far, and it is
   exactly the surface FullBay actually sells.
2. **13 of 14 feature modules**, switched off on the sandbox tenant.
3. **Server-function internals** — the business logic for fleet groups, scheduling, tracking,
   lifecycle, vendors, and QR codes. Only the repo shows these.
4. **Full DDL** — constraints, indexes, enums, and RLS policies. Needs `supabase/migrations/`.

Resolved by this recon: the FullBay API's real capability (invoice read only, no writes).

## Asks

In priority order:

1. GitHub repo read access (Lovable syncs to GitHub).
2. `supabase/migrations/*.sql` — the complete DDL, unobtainable any other way.
3. An `otc_admin` account, or a sandbox tenant with all 14 features enabled.
4. `supabase/functions/` plus the server-function source.
5. Whatever **export** capability FullBay offers from the vendor side — CSV, report builder,
   scheduled extract, or a paid data-dump. Now the critical path for historical migration, since
   the API cannot supply it.

## Related

- [[Feature Inventory]] — the flag catalog above should populate it
- [[Domain Model]] — roles, stages, and issue statuses above are source material
- [[FullBay Analysis]] — the API finding changes Phase 3
- [[Open Questions]] — "no usable FullBay API" needs revisiting
- Raw artifacts: `/Users/dweaver/Projects/ai/xerro-agent/recon/`
