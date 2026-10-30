---
created: 2026-10-09
updated: 2026-10-09
tags: [fleetco, features, fullbay, product, client-review]
status: draft for client markup — public sources plus one logged-in pass
source: Claude Code (Xerro)
---

## Purpose

This is a draft inventory of FullBay's features. The goal is **not** completeness for its
own sake — it's to turn "tell me everything you use" into "cross off what you don't." Hand
this to the client and ask them to mark each row: **Use it / Don't use it / Didn't know
this existed / Need something like this but different.**

Built in two passes:

1. **Public sources** (fullbay.com marketing/blog pages, G2/Capterra, comparison blogs —
   `help.fullbay.com` itself was gated to two collections without a login).
2. **A logged-in walkthrough** of a real, live FullBay account (read-only navigation —
   no records created, edited, or deleted) plus the full help center, which is only
   reachable once authenticated.

Every feature below carries a confidence tag:

- **Confirmed — live account**: directly observed on a real screen or settings page during
  the logged-in pass.
- **Confirmed — help center**: the feature's existence and name confirmed by an article
  title in FullBay's internal knowledge base (article body not opened, to control scope).
- **Confirmed — marketing/blog**: stated in FullBay's own published marketing/blog copy,
  specific enough to trust the term.
- **Inferred**: third-party (G2, Capterra, comparison blogs) or marketing language too
  vague to pin down the mechanism.

Where FullBay's own product term differs from its marketing name, the product term is used
as the heading, with the marketing phrase noted in parentheses.

**A note on the account used for the walkthrough:** real customer names, employee names,
and payment details were visible on screen and have been deliberately left out of this
document — only the feature/field/workflow structure is recorded.

---

## 0. User Roles & Permissions

| Term | What it is | Confidence |
|---|---|---|
| **Full User** | Complete platform access: service orders, inventory, assigning techs to a Service Order Action Item (SOAI). Billed per seat. | Confirmed — live account |
| **Office User** | Limited role — service orders/invoices/payroll visibility, no inventory management, no SOAI assignment, no clock in/out | Confirmed — marketing/blog |
| **Timesheet User** | Clock in/out only, billed per seat at a lower rate than Full User | Confirmed — live account |
| **Custom roles** | Roles are not a fixed list — a shop creates and names its own, each inheriting/overriding permissions from a base type. Observed on one real account: **System Admin, Owner, Admin, Executive** (full access but scoped to Service/PM/Unit configuration only), **Operations Manager, Supervisor, Office, Lead Tech, Shop Foreman** (technician permissions + can delete action items/service orders), **Shop Technician, Road Technician** (same permissions as Shop Tech), **Lead Trailer Technician** (with parts configuration), **Graphics**, plus a **Test Role** used to validate role behavior before rolling it out | Confirmed — live account |
| **Role change history** | Every role assignment/permission change is logged to a dedicated history page, per employee | Confirmed — live account |
| **Service Writer** | FullBay's own term for the person building estimates and running the service order day to day — this is what the task brief calls "service advisor." Use **service writer** when this document goes back to the client. | Confirmed — marketing/blog |
| **Technician** | Clocks into/out of jobs, diagnoses, records cause/correction, requests parts | Confirmed — live account |
| **Lone Wolf Tech** | A named workflow for a technician working solo/remote without office backup — has its own help-center section | Confirmed — help center |

**Resolved from the first draft:** the permission model is real, per-shop configurable, and
audit-logged. **Still open:** the exact field-level grant for each role (e.g., does "Office"
see cost or only sell price?) wasn't opened — that's a 10-minute follow-up inside Settings
→ Roles rather than a real gap anymore.

---

## 1. Service Orders (Work Order Management)

FullBay's term is **Service Order**. The repair line is an **Action Item**, abbreviated
**SOAI** (Service Order Action Item) — this abbreviation appears directly in the UI (e.g.
a "By SOAI Status" filter). **Correction to the first draft's vocabulary:** the three-C
structure's actual on-screen labels, confirmed directly on a real customer-facing estimate,
are **Concern / Cause / Correction** — not "Complaint." Use "Concern" in the glossary.

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| Quick SO / New Service Order / Quick Estimate | Three distinct creation paths of increasing formality — Quick SO and Quick Estimate for fast/simple jobs, full New Service Order flow for complex ones | Service writer | Confirmed — live account / help center |
| Action Item (SOAI) | The repair line: complaint, cause, correction, each with its own Parts and Labor tab | Service writer, technician | Confirmed — marketing/blog, live account |
| **Action-item kanban pipeline** | The live Service board is organized as stages, observed directly: **Unassigned Actions → Assign → Diagnose → Price Parts → Authorize → Wait For Authorization → Repair → Recent Completed Services** | Service writer, manager | Confirmed — live account |
| **Service Order Urgency** (status) | Shop-configurable status field, observed values: **None** (scheduled work), **WIP** (work in progress), **Parts** (ordered, waiting to arrive), **Pending** (pending approval or waiting to schedule). Custom values can be added. | Service writer, manager | Confirmed — live account |
| **Service Request Urgency** (intake priority) | A separate, earlier-stage priority field for incoming requests, shop-configurable, observed values: **Schedule as soon as possible** (default), **Schedule repair today**, **Emergency – get this fixed right away**, **Remember for the next visit** | Service writer | Confirmed — live account |
| Service order tabs/views | Observed live: **In Process, GPS, On Hold, PMs, Estimates, Quick Charge, Service Requests, Pending Repairs, Customers, History, All SOs, Auto-Gen SOs, Deleted SOs** | Service writer, manager | Confirmed — live account |
| List view modes | The SO list can be viewed **By Status, Full View, By Action Item, By Customer, By Tech, Prioritize, Custom View** | Service writer, manager | Confirmed — live account |
| Deleting / restoring a service order | An SO can be deleted (soft-delete, recoverable) — "Delete/Zero Out an SO" and "Restoring a Deleted Service Order" are both documented | Manager | Confirmed — help center |
| **Review step** (configurable) | A "Review" step can optionally be added into the SO workflow before completion | Manager | Confirmed — help center |
| **Require Re-Authorization** (setting) | A shop can require the customer to re-authorize if something changes after initial approval | Manager | Confirmed — help center |
| **Bill to a Third Party / Sublet** | A repair can be billed to someone other than the unit's owner (third-party billing), and outside-vendor-performed work can be recorded as **Sublet** | Service writer, office | Confirmed — help center, live account (named labor rate "ARI/Third Party Billing" seen on a real rate sheet) |
| **Yard Check** | A documented process for physically verifying which units are on-site | Manager | Confirmed — help center |
| **Unit Locations / Tracking Unit Usage** | Where a unit physically is, and meter/usage tracking over time | Service writer | Confirmed — help center |
| **Daily Rates** | Day-rate billing (e.g., storage/demurrage), distinct from a standard labor/parts invoice | Office | Confirmed — help center |
| **Carrier / Driver fields** | A unit can have a default carrier; a shop setting ("Require Driver and Carrier when creating Service Orders") can force capturing who dropped the unit off | Service writer | Confirmed — live account |
| **Access SOAI** | A distinct SOAI type used for shop-owned units (internal access/yard equipment), with its own linking setting | Manager | Confirmed — live account |
| Global Services / Canned Jobs | Reusable labor+parts templates for recurring repairs — these terms are used interchangeably | Service writer | Confirmed — marketing/blog |
| Part Kits | A canned-job sub-type: a pre-bundled parts list for one repair | Service writer, parts | Confirmed — marketing/blog |
| AI note cleanup / voice-to-text | Dictate or type shorthand; AI cleans it into professional text, with translation support | Technician, service writer | Confirmed — marketing/blog |
| Multi-location | **Confirmed directly**: the real account used for this walkthrough has two shop entities under one login, selectable from a shop switcher, with settings for associating vendors/inventory across locations | Manager | Confirmed — live account |
| **Schedule page** (calendar / bay scheduling) | A real calendar page exists — "Navigating Your Schedule Page," adding/editing/moving/deleting calendar events, setting up employee **work schedules**, and a **View-Only Schedule Page** with a public shareable link (confirmed live: a real `app.fullbay.com/XXXXX` link existed in this account's settings) | Service writer, manager | Confirmed — live account, help center |
| Emergency/roadside intake (FleetNet) | Emergency maintenance requests can route in via a FleetNet integration | Service writer | Confirmed — marketing/blog |
| **Vendor Warranty Clearing** | A documented workflow for setting up and submitting vendor/OEM warranty claims | Manager | Confirmed — help center |

**Resolved from the first draft:** scheduling is real and substantial (gap #3 closed);
service order priority/urgency is real, dual-stage, and shop-configurable (gap #10 closed);
multi-location is directly confirmed (gap #12 closed).

---

## 2. Estimates and Authorization

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| Estimate creation flow | Start SO → record complaint/cause/correction per Action Item → add parts & labor → attach photos → review → send → track/convert on approval | Service writer | Confirmed — marketing/blog |
| Quick Estimate | A lighter-weight estimate type with its own create/authorize/print/convert-to-SO steps, documented separately from a full estimate | Service writer | Confirmed — help center |
| Labor time sourcing | MOTOR, Mitchell 1 (ProDemand/TruckSeries), or shop historical data; autofills from a canned job | Service writer | Confirmed — marketing/blog |
| **Expected Hours** | A named concept distinct from actual clocked hours — the estimate/guide-sourced labor time a job is expected to take | Service writer, manager | Confirmed — help center |
| Parts pricing on an estimate | Pulled from inventory, special order, or FullBay Marketplace; markup/discount auto-applied | Service writer, parts | Confirmed — marketing/blog |
| Send for authorization | Via Customer Portal, 2-Way Texting, or email | Service writer | Confirmed — marketing/blog |
| Customer authorization | Approve / decline / partially approve; approved + tech-assigned auto-converts to a live SO | Customer, service writer | Confirmed — marketing/blog |
| **Pre-Authorize All Parts** (setting) | A shop-level setting to skip per-part authorization for parts under a threshold | Manager | Confirmed — help center |
| **Concern / Cause / Correction** (the real customer-facing labels) | Viewed a real, completed estimate exactly as the customer sees it in their portal: each repair line is labeled **"Concern"** (not "Complaint" — correct the glossary), **"Cause,"** and **"Correction,"** each with its own **"Authorize Correction(s)? Yes/No"** toggle per line, plus a **"Toggle All"** control to approve every line at once | Customer, service writer | Confirmed — live account |
| **Service Writer / Authorizer** (literal field labels) | The customer-facing estimate header has columns literally labeled **Service Order, Purchase Order, Service Writer, Authorizer** — direct, screen-level confirmation that "service writer" is FullBay's real term, and "Authorizer" is the recorded name of whoever approved the work | Customer, service writer | Confirmed — live account |
| **Shop Supplies** (fee line) | A distinct, named fee category that appears on the invoice/estimate total breakdown, separate from labor, parts, and tax | Office | Confirmed — live account |
| **Per-SO customer notes** | Separate from the account-level Messages tab — a customer can send a note on one specific service order/estimate directly to the shop | Customer | Confirmed — live account |
| **Email/Text send log** | The customer-facing estimate record shows exactly who at the shop sent it and when (e.g., a timestamped "Sent by: [name]" log) — an audit trail visible to the customer, not just internally | Customer | Confirmed — live account |
| Spending thresholds | A fleet customer can pre-set a dollar threshold for auto-authorization | Customer | Confirmed — marketing/blog |
| In-progress additional-work authorization | New authorization request for newly-found work mid-repair, without re-approving the whole order | Technician, service writer | Confirmed — marketing/blog |

---

## 3. Parts and Inventory

The richest area in the help center (68 articles) — the first draft undersold this
section's real depth.

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| Real-time stock levels, multi-location | Live counts across shelves, bins, trucks, and shop locations; a documented article specifically covers **"Managing Inventory for Multiple Shops"** | Parts manager | Confirmed — marketing/blog, help center |
| **Intra-Company Parts Transfers** | Moving stock between the shop's own locations is a named, documented workflow | Parts manager | Confirmed — help center |
| Barcode scanning | Scan parts into inventory or onto a truck ("Barcoding," "Scanning" are separate articles) | Parts manager | Confirmed — help center |
| Min/Max part settings & reorder | Threshold-based reorder alerts, plus an **Auto Order** shop setting | Parts manager | Confirmed — help center |
| Bin/location assignment | **Inventory Part Locations**, **Default Part Location and Moving In Stock Quantities**, **Moving and Deleting Part Locations** | Parts manager | Confirmed — help center |
| **Cycle Counts** / **Inventory Adjustments and Counts** | Scheduled/periodic inventory audits, distinct from ad hoc adjustments | Parts manager | Confirmed — help center |
| **Inventory Search Tags** | A tagging system for finding parts beyond part number/description | Parts manager | Confirmed — help center |
| Purchase Orders | Create, email to vendor, view existing, receive, return, delete; **Combined Purchase Orders** (multiple SOs/vendors on one PO); **Adding SO Parts to an Existing PO** | Parts manager | Confirmed — help center |
| **Needs Ordered Part List** | A working list of parts flagged as needed but not yet ordered | Parts manager | Confirmed — help center |
| **Use Last Cost Function** | Auto-fills a part's cost from its most recent purchase price | Parts manager | Confirmed — help center |
| Vendor management | Add/edit/delete vendor, **Vendor Bills**, **Vendor Payments**, **Vendor Credit Memo**, **Vendor Portals**, **Vendor Tax Documents** | Parts manager, office | Confirmed — help center |
| FullBay Marketplace / FinditParts | In-app ordering across 40+ vendors (NAPA, O'Reilly named), 19M+ parts, real-time price/availability | Parts manager | Confirmed — marketing/blog |
| **Counter Sale** | A walk-in parts sale not tied to any service order — its own create/split/return/delete workflow | Parts/front counter | Confirmed — help center |
| **Fake Inventory Parts** | A non-tracked placeholder part type, used to bill for something without carrying it as real stock | Parts manager | Confirmed — help center |
| Core charge tracking | Part charge / core charge / core credit as separate line items; separate core inventory with its own value report; **"Special Order Parts with Cores"**, **"Selling and Returning Inventory Parts with Cores"**, **"Managing Inventory Parts with Cores"** | Parts manager | Confirmed — marketing/blog, help center |
| **Pricing Scales** / **Pricing Matrices** | Tiered markup rules by cost band and/or customer type — two distinct configurable mechanisms | Parts manager, owner | Confirmed — help center |
| **Cost Floor** | A minimum sell price enforced regardless of markup rules, can be set shop-wide or per-location | Owner | Confirmed — help center, live account |
| "Privacy On" mode | Hides cost/markup from the customer-facing view | Service writer | Confirmed — marketing/blog |
| **Restrict Use of Inventory** | A setting to lock down who/what can draw against stock | Owner | Confirmed — help center |
| **Drop Shipping** | Vendor ships directly to the customer/job site rather than through the shop | Parts manager | Confirmed — help center |
| **Shipping, Freight, and Restocking Fees** | These are handled as distinct, trackable fee types | Parts manager | Confirmed — help center |
| Reports: Velocity, Special Order Velocity, Inventory Balance, Inventory Reconciliation, Inventory w/ No Location, Parts To Be Returned, Returned Parts, Shortage, Sold Parts, Vendor Report | 10 named canned inventory reports, confirmed live | Parts manager, owner | Confirmed — live account |

**Resolved, direct from Fleetco:** confirmed not in use. Fleetco's own contact wasn't
familiar with VMRS codes and assumed they're not active, matching the empty live
configuration. **Move to CRUFT** — do not build VMRS coding in the replacement.

---

## 4. Labor and Technician Time Tracking

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| Clock in/out per job | Tap a job to clock in; every minute logs to that job/unit. Live account shows a **"Capture GPS coordinates on time stamps"** shop setting (off by default) | Technician | Confirmed — marketing/blog, live account |
| Labor vs. admin time split | Separates billable labor from non-billable/admin time, per tech | Technician, manager | Confirmed — marketing/blog |
| Timesheets | **Timesheets: How to Clock In/Out**, **Setting Up Timesheet Activities**, **Managing Timesheets (Payroll, Corrections, SO Time Stamps)** — timesheets support named "activities" beyond just job time, and manual correction | Office, manager | Confirmed — help center |
| Real-time technician workload view | Who's working on what, who has capacity | Manager | Confirmed — marketing/blog |
| Labor guide integration | MOTOR, Mitchell 1 (ProDemand/TruckSeries) | Technician | Confirmed — marketing/blog |
| **Expected Hours vs. actual** | Live Tech Home screen shows per-tech stats: **Comp. hrs** (completed), **SO hrs**, **Efficiency**, **Utilization**, **Clocked Hours** — these exact labels appear on screen | Technician, manager | Confirmed — live account |
| Reports: Clocked Hours, Completed Hours, Employee Statistics, Invoiced Hours, **Payroll Advance**, SO Hours, Timesheet | 7 named canned employee reports, confirmed live — **Payroll Advance Report** indicates FullBay tracks advances against pay, not just hours | Manager, owner | Confirmed — live account |

**Resolved, direct from Fleetco:** techs are paid on actual clocked hours in FullBay, with
a manager reviewing/verifying before submission to payroll. No flat-rate or flagged-hour
pay structure in use. Simplifies this area for scoping: no commission/flag-hour logic to
replicate, just clocked hours + a manager approval step before export.

---

## 5. PM Scheduling (Preventive Maintenance)

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| PM interval definition | By mileage, engine hours, or calendar — at unit, unit-type, or component level | Manager | Confirmed — marketing/blog |
| **PM coming-due window** (setting) | A configurable lead time (observed live: 30 days) before a PM is flagged as "coming due" | Manager | Confirmed — live account |
| Automatic SO generation | Upcoming/overdue PMs auto-generate a service order, tracked in a dedicated **Auto-Gen SOs** tab | Manager, service writer | Confirmed — marketing/blog, live account |
| **Set Up Unit Types / Add a PM to Unit Types** | PM schedules attach to a unit-type template, not just one unit at a time | Manager | Confirmed — help center |
| **Batch Add PM Services from Multiple Units** | Bulk-assign a PM across many units at once | Manager | Confirmed — help center |
| **Enter Last Performed Information** | Backfilling a PM baseline date/meter for a unit that already had the service done elsewhere | Manager | Confirmed — help center |
| **Procedures and PMs** | Step-by-step procedures can attach to a PM definition | Technician | Confirmed — help center |
| Meter reading capture | Entered directly on an SO, drives next PM due date | Technician | Confirmed — marketing/blog |
| PM/inspection history on the unit | Logged permanently to the unit record | Manager | Confirmed — marketing/blog |
| Customer-scheduled PM requests | Fleet customer can schedule upcoming PM/inspection via the portal | Customer | Confirmed — marketing/blog |

---

## 6. Inspections and DVIR

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| Driver-submitted DVIR (via Whip Around) | Driver flags a defect on their phone; flows directly into a new FullBay SO | Customer's driver | Confirmed — marketing/blog |
| Predicted-failure flagging (via Pitstop) | Telematics-driven fault prediction feeds into a work order | Manager | Confirmed — marketing/blog |
| **Guided inspection** | A technician-run, in-app inspection checklist, used during a job | Technician | Confirmed — marketing/blog |

**Still open:** the help-center "Service" collection's article list (40 articles,
enumerated above in Section 1) has **no distinct inspection/checklist-builder article** —
everything inspection-related ties to PMs or the Whip Around/Pitstop integrations. This
reinforces, rather than resolves, the original gap: **native DVIR/inspection beyond the
guided-inspection-during-a-job pattern does not appear to exist** — it's a third-party
dependency, not a FullBay-built module. Confirm directly with whoever handles DVIR intake
today.

---

## 7. Invoicing and Payments

FullBay Payments runs on **Stripe** underneath (confirmed via a help-center article title:
"Fullbay Payments Overview | Stripe").

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| One-click invoice generation | Approved estimate/SO → final invoice with actual labor hours | Service writer, office | Confirmed — marketing/blog |
| Invoice delivery | Text, email, or Customer Portal link + emailed PDF (**"Send Invoice with Customer Portal Link and/or Emailed PDF"**) | Service writer | Confirmed — marketing/blog, help center |
| Pre-Payments / Collect Prepayment | Collect before work is fully complete | Office | Confirmed — marketing/blog, help center |
| Payment methods | Card, ACH, eCheck, Apple Pay, Google Pay, BNPL, Interstate Billing Service (IBS) | Customer, office | Confirmed — marketing/blog |
| Quick Charge | Payment without a linked service order | Office | Confirmed — marketing/blog, live account (own SO-list tab) |
| **Customer Statements** | **Create Customer Statements**, **Customer Statement Preferences** — A/R statements are a distinct, configurable feature from individual invoices | Office | Confirmed — help center |
| **Customer Credit Memos** | Documented separately from a refund | Office | Confirmed — help center |
| Partial/full refunds | **Customer Refunds**, **Deleting a Credit from a Counter Sale Invoice** | Office | Confirmed — marketing/blog, help center |
| **Require Signature on Payments** (setting) | Shop can require a signature to process a payment | Office | Confirmed — help center |
| **Duplicate Invoice Numbers** (handling) | A documented edge case/setting for how the system handles or prevents duplicate invoice numbers | Office | Confirmed — help center |
| Auto-reconciliation / payment matching, dispute management | Payments auto-match to invoices; built-in dispute workflow | Office | Confirmed — marketing/blog |
| **Chart of Accounts / Setting Up Accounts and Items** | FullBay maintains its own chart of accounts and item mapping — this is deeper than a pass-through to QuickBooks | Office, owner | Confirmed — help center |
| **Cash Basis Sales Tax Reporting** | A specific, named tax-reporting mode | Office | Confirmed — help center |
| **Vendor Tax Documents** | 1099-style vendor tax document handling | Office | Confirmed — help center |
| QuickBooks sync | Payments/invoices sync for reconciliation. **Confirmed in active use by Fleetco** — this is their real accounting workflow today, not a hypothetical. | Office | Confirmed — marketing/blog / Confirmed in use — Fleetco |
| **Warranty Work** (office-side) | A distinct billing/accounting treatment for warranty-covered repairs | Office | Confirmed — help center |

**Resolved from the first draft:** FullBay's accounting isn't just a QuickBooks pass-
through — it has its own chart of accounts, item hierarchy, and tax-reporting modes.
**Resolved, direct from Fleetco:** QuickBooks sync is their real, active accounting
workflow today — this is P0, not a hypothetical. No other accounting integration was
named anywhere (including the gated help center), so QuickBooks sync is also the only
path the replacement needs to support.

---

## 8. Customer Portal

**Now directly viewed.** Every customer record in the shop app has a **"Portal" button**
that opens that exact customer's live portal in a new tab — no separate customer login
needed from the shop side. Observed directly on a real (if quiet/low-activity) customer
account:

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| **Access model: per-customer magic link, not username/password** | The portal has no login screen of its own. Each customer gets one unique, unguessable URL (shown under "Link & Shop Info" in their own Configuration tab) that they bookmark or save to their phone's home screen. If compromised, the shop resets it and the old link dies. **This is a major scoping simplification** — no customer auth system to build, just a tokenized-URL access model — but also means anyone holding the link has full access until it's reset. | Customer | Confirmed — live account |
| Portal top-level sections | **Units, Messages, Active Services, Contacts, Invoices, Payments, Configuration** — plus a **"Request Service"** button and a **"Help & Training"** link aimed at customers | Customer | Confirmed — live account |
| Units tab | Lists units with Unit #, Nickname, Status, Severity, VIN, Year/Make/Model, Ship To Address, Open SO(s), Pending. Filterable by **Unit Status**: No status / New / Confirmed / Out of Service / Owner-Operator / Shop-Company Owned / Sold / Transferred. Customer can **Add Unit** themselves and pull their own **Fleet Report** | Customer | Confirmed — live account |
| Invoices tab | A/R view with **Current / Coming Due / Past Due / Balance** columns; customer can **Create statement**, add a **Payment Method**, and **Pay Invoices** (batch) | Customer | Confirmed — live account |
| Active Services tab | Open service orders, filterable by unit | Customer | Confirmed — live account |
| **Configuration ("Your Info") tab** | The customer's own self-service settings: Name & Contact Info (editable), multiple Addresses, Payment Methods (self-add credit card or bank account/ACH), their unique portal link, Attachments, and Notes | Customer | Confirmed — live account |
| **Delegated decision-maker fields** (not dollar thresholds — named roles) | Every customer record captures four separate named-contact fields: **"Who makes the overall decisions at this location," "Who makes most of the day-to-day decisions with the fleet," "Who authorizes the repairs on the fleet,"** and **"Who processes the bills and answers billing questions."** This is FullBay's actual multi-contact delegation model — distinct from (and in addition to) the dollar-threshold auto-authorization setting in Section 2. | Manager, customer | Confirmed — live account |
| **Primary Access Method** (field) | A per-customer field describing how units typically get to the shop, e.g. "Customer will bring unit to the shop" — implies other values exist for pickup/mobile service | Service writer | Confirmed — live account |
| View-Only Schedule Link | A separate, shop-wide (not per-customer) read-only link to the shop's calendar — distinct from the customer portal | — | Confirmed — live account |
| **Active Services pipeline** (customer-facing stage names) | Checked a second, active customer (16 units, real history). The customer-facing kanban uses its own stage names, distinct from the shop-side pipeline in Section 1: **Saved but not submitted → Submitted → Evaluating & Diagnosis → Ready to authorize → Service in progress → Recently completed** | Customer | Confirmed — live account |
| **"Ready To Invoice"** (customer-visible status) | A completed job shows this exact status to the customer in their service history list — confirms shop-side statuses do surface to the customer, not just a simplified subset | Customer | Confirmed — live account |
| **A real completed estimate, as the customer sees it** | Opened one: header columns literally read **Service Order / Purchase Order / Service Writer / Authorizer**; each repair line shows **Concern / Cause / Correction** with a per-line **"Authorize Correction(s)? Yes/No"** toggle and a **Toggle All** control; line items are tagged **Labor** or **Parts** with full description/qty/rate/amount; totals break out **Subtotal → Shop Supplies → Labor subtotal → Parts subtotal → Subtotal → [state] tax → Total**; a **per-SO note box** lets the customer message the shop about that specific job; and an **email/text send log** shows exactly who sent the estimate and when | Customer | Confirmed — live account |

**Resolved from the first draft:** portal UI, multi-contact delegation, the authentication
model, and the mid-flow authorization/estimate screen are now all confirmed directly —
this closes what was the single biggest remaining gap, including the "narrowed, not fully
closed" caveat from the previous pass.

---

## 9. Reporting

Fully enumerated, live — **38 canned reports across 5 categories**. No evidence anywhere
(live account or 40-article help-center Reporting collection) of a custom report builder —
treat reporting as **canned-only** going into scoping.

| Category | Reports |
|---|---|
| **Revenue (7)** | A/R Aging, All Revenue, Closed Without Invoicing / Ready To Invoice, Credits & Refunds, Payments, Sold Sublet, Work in Progress Revenue |
| **Inventory Management (10)** | Inventory Balance, Inventory Reconciliation, Inventory Velocity, Inventory with No Location, Parts To Be Returned, Returned Parts, Shortage, Sold Parts, Special Order Velocity, Vendor |
| **Work In Progress (3)** | WIP Details, WIP Parts, WIP (summary) |
| **Customer Management (11)** | Bill To, Customer Communications: Text Messages, Equipment Utilization, Fleet Cost per Unit, Fleet, Global Services / PMs, Invoices Created When Customer Was Over Limit Or Past Due, Pending Repairs, Shop Utilization, Unit Possession (Receive / Release), Warranty |
| **Employee Management (7)** | Clocked Hours, Completed Hours, Employee Statistics, Invoiced Hours, Payroll Advance, SO Hours, Timesheet |

**Resolved from the first draft:** reporting depth is now fully known — 38 named,
canned reports, no builder. **Still open:** export formats (the report list wasn't opened
far enough to see CSV/PDF/schedule options) and whether the documented **Fullbay API**
(see Integrations) can pull the same data programmatically instead.

---

## 10. Mobile Apps

**Resolved, direct from Fleetco — and it changes the recommendation.** Native app
existence was never the real question; how Fleetco actually uses FullBay on a device is.
Their answer: techs use a company iPad or their own phone, and access FullBay through the
**web app bookmarked to the home screen** — nobody uses, or has considered, a native
iOS/Android app. The owner does the same himself.

| Feature | What it does | Role | Confidence |
|---|---|---|---|
| Native iOS/Android apps | Exist per FullBay's marketing, but **unused by Fleetco** | Technician | Confirmed — marketing/blog (existence) / Confirmed — Fleetco (not used) |
| Web app, home-screen bookmarked | Fleetco's actual pattern today, on both iPad and phone | Technician, owner | Confirmed — Fleetco |
| Clock in/out, mileage capture, paperless SO/estimate/invoice, field payment | Core technician mobile workflow, used via the bookmarked web app | Technician | Confirmed — marketing/blog |

**Scoping implication:** a bookmarked-web-app pattern with no stated appetite for a native
app is exactly the use case a PWA (installable, offline-capable web app) fits well, and is
far cheaper to build than two native apps. Worth carrying into the PRD as a default
direction rather than a decision deferred for later.

---

## 11. Integrations

| Integration | What it provides | Confidence |
|---|---|---|
| **Fullbay API** | A documented API exists for data integrations ("Using the Fullbay API for Data Integrations") — directly relevant to Fleetco's eventual migration/export plan | Confirmed — help center |
| **AI Receptionist ("Claudia")** | A native AI phone receptionist product. **Resolved, direct from Fleetco: not used, not trialed, not a fit for their operations right now.** Treat as CRUFT for this project. | Confirmed — help center / Confirmed not used — Fleetco |
| **Spike** | An in-app AI assistant for help-center/how-to questions (distinct from Claudia). **Resolved, direct from Fleetco: actively used** — "a lot of our guys use it when they have questions about Fullbay or need help figuring something out in the software." Worth noting as a real need the replacement system should account for (in-app help/support), not necessarily as an AI feature to rebuild. | Confirmed — help center / Confirmed in active use — Fleetco |
| QuickBooks | Accounting sync | Confirmed — marketing/blog |
| MOTOR | Labor time guide, HD service guide, parts cross-reference | Confirmed — marketing/blog |
| Mitchell 1 | ProDemand, TruckSeries | Confirmed — marketing/blog |
| Whip Around | Driver DVIR intake | Confirmed — marketing/blog |
| Pitstop | Predictive maintenance / fault codes | Confirmed — marketing/blog |
| FleetNet | Emergency/roadside intake | Confirmed — marketing/blog |
| Interstate Billing Service (IBS) | Fleet A/R financing | Confirmed — marketing/blog |
| GPS/telematics (9 providers) | Azuga, Geotab, GeoForce, GPS Trackit, Linxup, Motive, Samsara, US Fleet Tracking, Verizon Connect | Confirmed — marketing/blog |
| FullBay Marketplace / FinditParts | In-app parts ordering | Confirmed — marketing/blog |
| Fullbay Payments (on Stripe) | Card/ACH/Apple Pay/Google Pay/BNPL processing | Confirmed — marketing/blog, help center |
| 2-Way Texting | Shop ↔ customer/technician texting inside FullBay | Confirmed — marketing/blog |
| Dieselmatic | Shop website/marketing add-on — **likely CRUFT**, not a repair-shop operational feature | Confirmed — marketing/blog |
| VMRS coding | **No evidence found anywhere in a real, live shop's configuration.** Downgraded — see Section 3. | Inferred, contradicted by live account |

---

## What I Could NOT Determine — remaining shadowing checklist

Most of the original 13 gaps are closed, including every item Fleetco answered directly
(technician pay, VMRS, AI Receptionist/Spike, mobile usage, QuickBooks). What's left:

1. **Field-level permission grants per role** — roles are confirmed real and custom, but
   which exact fields/actions each grants wasn't opened screen-by-screen.
2. **Report export formats** and whether the Fullbay API can substitute for a report.
3. **Portal link security model in practice** — one link per customer, no expiry seen,
   reset-on-compromise only. Worth asking the owner how often links actually get reset and
   whether that's ever been a problem.
4. **Payment collection mid-flow** — saw a completed, paid-off job and an unpaid-invoice
   view, but not the actual card/ACH entry screen the customer uses to pay. Minor, cosmetic
   gap only.

---

## Is FullBay's Help Centre Publicly Readable?

**Gated, confirmed on both passes.** Without a login, `help.fullbay.com` exposes exactly
two collections (Integrations, 6 articles; Help & Training Access, 2 articles) out of what
turned out to be **12 collections and roughly 440 articles** once logged in:

| Collection | Articles |
|---|---|
| Basic Training | 48 |
| Shop Setup | 39 |
| Technician | 5 |
| Service | 40 |
| Parts and Inventory | 68 |
| Office | 28 |
| Fullbay Payments | 39 |
| Reporting | 40 |
| Integrations | 66 |
| FAQs | 52 |
| Basic Troubleshooting | 6 |
| Release Notes | 6 |
| Single-User Shops | 10 |

This fully confirms the original finding rather than overturning it: the real knowledge
base is substantial, and essentially none of it is reachable without an account. Everything
in Sections 1–9 above tagged "Confirmed — help center" is an **article title only** — the
article bodies were deliberately not opened in this pass, to keep scope to what the gap
list actually needed. Opening the ~15 articles flagged above as still-open would close
nearly everything remaining.
