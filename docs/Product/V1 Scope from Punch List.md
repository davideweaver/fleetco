---
created: 2026-10-28
tags: [fleetco, otc, scope, v1, product, punch-list]
source: Cameron's completed punch list, returned 2026-10-28
status: scope drafted from Cameron's marks — portal and QBO answered 2026-10-30, accounting handoff still to pick
---

**Source:** `Meetings/Punchlist From Cam for v1/` — `Key decisions.md`, `Notes left on items.md`,
`Full marks JSON.md` (the raw file is the one to trust; it has all 217 rows with marks and notes)
**Returned:** 2026-10-28
**Marked by:** Cameron, with AI assistance — the notes are far more specified than the tool asked for

---

## Tally

**All 217 rows marked. Nothing left blank.**

| | Count |
|---|---|
| **V1 — needed day one** | **62** |
| Later | 127 |
| Not needed — do not build | 28 |

| Section | V1 | Later | Not needed |
|---|---|---|---|
| Roles & Who Does What | 3 | 4 | 0 |
| Service Orders | 11 | 13 | 3 |
| Estimates & Customer Authorization | 6 | 7 | 2 |
| Parts & Inventory | 7 | 22 | 4 |
| Labor & Technician Time | 8 | 2 | 1 |
| Preventive Maintenance | 0 | 12 | 0 |
| Inspections & DVIR | 1 | 1 | 2 |
| Invoicing & Payments | 11 | 10 | 5 |
| **Customer Portal** | **0** | **20** | 0 |
| The 38 Reports | 10 | 28 | 1 |
| Mobile & Tablets | 2 | 3 | 1 |
| Integrations | 3 | 5 | 9 |

---

## Three Things to Confirm Before This Is a Scope Contract

### 1. The customer portal is out of V1 — and that contradicts the meeting

> **Confirmed 2026-10-30:** portal out, no in-app email or texting. See
> [[2026-10-30 Cameron Reply to V1 Alignment]].

**All 20 portal rows are marked Later**, with the same note repeated: *"Full customer portal is
outside graphics V1."* Approval links are out too (2.12, 1.2): *"No customer approval links in V1;
portal approvals are Later."*

On 2026-10-23 Cameron said the opposite. Dave: *"our V1, you're going to want a customer portal."*
Cameron: *"I am."*

**This is the largest single change from the meeting and it needs a direct yes/no.** It is
defensible — graphics customers mostly phone Cameron, he self-authorizes nearly everything, and
customer messaging already lives in GoHighLevel. It also makes V1 meaningfully smaller.

But say the consequence out loud: graphics customers lose FullBay's portal at cutover and get
email + PDF + a Stripe payment link instead. That is **less** than they have today for paying
invoices, and the portal was the most visible differentiator from FullBay. Worth confirming he
means "later," not "never," and that he's fine with the gap.

### 2. QuickBooks Online two-way sync is marked **required**, and manual entry was explicitly rejected

> **Reversed 2026-10-30:** Cameron says two-way sync is not a firm requirement and asked for the
> simplest practical handoff, manual steps allowed. See [[2026-10-30 Cameron Reply to V1 Alignment]].

7.24, 11.3, and 7.25 all point the same way. 7.25 — *"Could the bookkeeper key or import invoices by
hand at first?"* — is marked **Not needed** with the note: **"NO — user requires QuickBooks Online
synchronization in V1, including two-way relevant updates. Manual entry/import is not the selected
launch workaround."**

Scope as written: customers, invoices, payments, and deposits; invoice changes and payments entered
in QBO must flow **back** so balances stay current. Explicitly not a full two-way copy of every
accounting entity.

**This is the most expensive and highest-risk item in the 62, and it's the one Dave flagged in the
meeting as the fiddly part.** Two-way accounting sync with field mappings, edit ownership, conflict
handling, duplicate prevention, and migration of existing open balances is a project inside the
project — against a bus factor of one.

Worth pushing back on, with a concrete alternative rather than a complaint: **one-way push to QBO at
launch**, payments recorded in the shop system as the source of truth, and a reconciliation report
instead of a return path. If the honest answer is still no, it's in — but it should be priced and
sequenced as its own phase, not folded into "V1" silently. The note itself says the behavior has to
be defined with the bookkeeper before implementation, so that conversation is required either way.

### 3. GoHighLevel is new information and it changes the integration picture

Never mentioned in the walkthrough. OTC runs **GoHighLevel** as a separate CRM: leads, the
sales/design pipeline, and automated SMS/email follow-ups. Cameron's instruction is explicit — keep
it, don't rebuild it, and **no API integration in V1.** Approved work gets typed into the shop
system by hand.

Two things follow. First, store external GoHighLevel contact and opportunity IDs on customers and
jobs now, even with no integration, so a later link is cheap. Second, this partly explains why the
portal can wait: customer communication already has a home.

Also noted: **Univerge** handles phones and texting for OTC Fleet Services. Context for the
mechanical phase, not V1.

---

## V1 — The 62, Grouped by What Gets Built

The graphics business is referred to throughout as **OTC Fleet Graphix**, and the new system is
described as the internal shop application, separate from the customer-facing `myOTCFleet.com`.

### Roles and permissions (0.1, 0.3, 0.4)

**Exactly two roles: Owner and Technician.** No per-seat licensing. Owner is unrestricted.

Technician is **assigned jobs only** — job instructions, attachments, photos, status, and schedule
limited to their own assignments, enforced across lists, Kanban, calendar, job records, and direct
URL access. Technicians **cannot see material costs, markup, or job profit** (3.30). They mark work
finished with completion photos; Owner reviews and closes.

Explicitly framed as permissions, not Owner-only forever: Office/Manager/Accounting roles and
per-user Inherit/Allow/Deny overrides are Later. **Build the permission model so roles are data,
not hardcoded.**

### Jobs and the production pipeline (1.1, 1.2, 1.3, 1.8, 1.9, 1.11, 1.12, 1.24)

- One job record behind everything — Quick SO, Quick Estimate, and the full flow all use it. No
  separate data models.
- **Production & Installation Kanban**, six stages: Ready for Production → In Production →
  Production Complete → Ready for Installation → Installation in Progress → Completed. Owner can
  move backward or skip. Cards show customer, job/vehicle, job number, assignee, scheduled date,
  priority. Delays go in job notes — **no hold or waiting-for-materials flags.**
- Navigation is **not** FullBay's 13 tabs: a Jobs page (Active / Completed / All), an Estimates
  page, a Customers page.
- Searchable jobs table alongside the Kanban, same records, filters for stage, customer, assignee,
  priority, scheduled date. Not FullBay's seven list modes.
- **Scheduling calendar with separate production and installation entries** on the same job, each
  with its own date/time and one or more assignees, filterable by employee. Not a full workforce
  scheduler.
- **Mandatory review before close:** Technician attaches completion photos and marks finished →
  Owner reviews and closes → **closing auto-creates an unsent draft invoice.**
- Re-authorization on change: record who approved, when, and how, or use a permission-controlled
  **Manual Override.**

### Estimates (2.1, 2.3, 2.4, 2.8, 2.12, 2.15, 1.20, 1.21)

- Graphics-specific estimate: customer, vehicle/project, scope, packages or line items, quantities,
  pricing, photo and file attachments.
- **Expected hours entered manually**, kept separate from actual time, compared for job costing.
- Material catalog with manually maintained cost and selling price. **No automatic markup rules.**
- **Partial approval** — approve or decline individual items; declined items don't reach the invoice
  but stay visible internally.
- All approval is **recorded, not collected** — staff mark that the customer approved by phone or
  email, or use Manual Override. Matches how Cameron actually works.
- "Sent" is a manual flag: who sent the PDF and when. No delivery or read tracking.
- Reusable job/estimate templates with preset line items.
- **The roll-up (1.21) is the sharpest spec in the whole list, and it's exactly the meeting
  conversation:** one customer-facing line such as "Full Vehicle Wrap" with a detailed internal
  breakdown — vinyl, laminate, labor, **ink allowance, alcohol, Goo Gone** and other supplies, as
  estimated cost allowances rather than measured usage. Customer sees the package and the price;
  internal component costs stay for job costing.

### Parts, materials, purchasing (3.2, 3.12, 3.14, 3.16, 3.17, 3.25, 3.30)

- **No live stock counts. Confirmed go-live without them** (3.2). No quantities, no automatic
  deductions, no inventory count project before launch.
- Vendor POs: vendor details, items, quantities, prices → **downloadable PDF, sent by hand through
  existing email.** No built-in sending. Whole-PO received / not received only, **no partial
  receipts.**
- Editing an already-issued unreceived PO is in, with an updated PDF to resend.
- **Last Cost updates the catalog default when the PO is marked received**, not while draft.
  Manual correction allowed.
- Basic vendor records for purchasing. Not AP, not a vendor portal.
- Non-stock / one-off custom lines without a catalog item.
- **Privacy is a permission, not a toggle:** customer-facing documents never show internal costs,
  markup, profit, or roll-up components.

### Labor and time (4.1, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 4.11)

Confirms the walkthrough read, and 4.1 is explicit that **both** are needed in the new system —
don't assume FullBay's punch clock carries any of it.

- **Standalone daily attendance punch** for payroll hours, separate from job timers.
- **Per-job timers**, one active at a time; starting another stops the previous. No double-counting.
- Billable job labor separated from shop/admin time.
- Editable non-job activity categories — cleanup, meetings, training, general shop work. Owner
  maintains the list.
- Manual timesheet corrections.
- **Owner reviews and approves the pay period** before export.
- Live team workload view: who's on what, elapsed time, scheduled assignments. No forecasting.
- **Payroll export: CSV + printable report by date range.** No payroll provider API, no wage
  calculation.

### Invoicing and payments (7.1, 7.5, 7.6, 7.13, 7.15, 7.17, 7.18, 7.19, 7.23, 7.24, 7.26)

- Closing a billable job creates an **unsent draft invoice**; Owner finalizes and exports a PDF to
  send by hand. Non-billable internal jobs never generate one.
- **Deposits are recorded, not collected** in V1 — log a prepayment taken elsewhere, apply it to the
  final invoice, show the remaining balance.
- **Card payments by invoice-linked hosted payment link** (Stripe named as the likely provider, not
  final). No card data stored in the app. **ACH is Later.** Successful payments auto-update the
  invoice balance; payments taken elsewhere are entered by hand.
- **No standalone statements.** Instead, each invoice carries an "Other Unpaid Invoices" section for
  that billing customer — number, due date, amount.
- Refunds executed in the provider dashboard and recorded in the app.
- **Unique invoice numbers with the OTC prefix**, non-colliding with FullBay's existing range.
- Sales tax must match the current configuration — **rates and taxability not supplied, must come
  from accounting.**
- Warranty / rework jobs: flagged no-charge, linked to the original job, costs tracked, **no
  automatic customer billing on close.**

### Inspections (6.3)

One row only: a basic in-app **job checklist for vehicle condition before installation and final
quality checks**, alongside job photos. Checklist items still to be defined. Full DVIR is out.

### Reports — 10 of 38 (9.1, 9.2, 9.3, 9.5, 9.18, 9.20, 9.32, 9.37, 9.38, 9.39)

A/R Aging · All Revenue · Closed Without Invoicing / Ready To Invoice · Payments · WIP Details ·
WIP Summary · Clocked Hours · SO Hours · Timesheet.

**All need CSV export and printable/PDF output** (9.39) — screen-only isn't acceptable. No report
builder, no scheduled delivery.

### Mobile (10.1, 10.5)

**Mobile-friendly web app**, bookmarkable to the home screen, usable on phones and iPads. Job,
photo, time-entry, and document workflows. **No native app** (10.2 is Not needed). Role permissions
apply on mobile too.

### Migration (11.2)

**Target: graphics customers and open work only** — active estimates and jobs, unpaid invoices and
balances. Completed history stays accessible in FullBay rather than migrating.

Two cautions in Cameron's own note: test sample exports, fields, identifiers, attachments, and
completeness **early**, because bulk export is still unconfirmed; and **coordinate open invoice and
payment migration with QuickBooks Online to avoid duplicate accounting records.**

---

## Not Needed — The 28, and Why It Matters

Every item here is schedule returned. Grouped:

**Mechanical / heavy-duty, irrelevant to graphics:** labor guides (2.2, 4.10), MOTOR (11.7),
Mitchell 1 (11.8), VMRS coding (11.6), core charges (Later, not V1), FleetNet roadside intake
(1.26, 11.11), Whip Around DVIR (6.1, 11.9), Daily Rates (1.17).

**Vendor-side suites:** vendor payments (3.19), **vendor portals (3.21 — confirms the walkthrough:
zero vendors use FullBay's)**, vendor tax documents (3.22), FullBay Marketplace / FinditParts
(3.23, 11.14), Dieselmatic (11.16).

**Payments and billing exotica:** buy-now-pay-later (7.9), Interstate Billing Service (7.10),
signature on payment (7.16), cash-basis sales tax reporting (7.22), third-party bill-to (1.13) —
though 1.13 carries a **separate V1 requirement**: optional PO / authorization reference fields on
jobs and invoices, displayed but never mandatory.

**Other:** native mobile app (10.2), auto-convert estimate on approval (2.9), FullBay API as an
ongoing connection (11.1 — one-time migration investigation only), AI Receptionist (11.5), Bill To
report (9.21), paper forms (6.4).

---

## Needs Accounting Input Before Launch

Three rows resolve to "ask Joanna or Kevin," and all three block go-live rather than development:

1. **Sales tax rates and taxability settings** (7.23) — not supplied. *Do not guess.*
2. **Current invoice number and format** (7.18) — Cameron wants the OTC prefix but didn't have the
   range. A colliding sequence is an accounting mess.
3. **Whether FullBay processes OTC's card payments and what the fees are** (7.11) — Cameron doesn't
   know. **This also feeds [[Open Questions]] Q18**, the $5,000 question: if payment processing is
   bundled into that number, part of the bill isn't software at all.

---

## What This Means for the Plan

**V1 is an internal shop application, not a platform.** Jobs, Kanban, scheduling, estimates with
roll-ups, materials and POs, two kinds of time clock, invoicing with card links, ten reports, a
mobile web view, two roles. No portal, no approval links, no live inventory, no PM, no DVIR, no
mechanical anything.

**It is smaller than the meeting implied in surface area and larger in depth.** Several of the 62
are real subsystems rather than screens: the permission model, the two-clock time system with a
no-double-count rule, the roll-up with internal cost breakdown, two-way QBO sync, and payment
provider integration. Honest framing for Dan: this is not a small build, and the QBO item alone
deserves its own estimate.

**The architecture holds.** Nothing here reopens an ADR. Online-only is confirmed (10.3), which
closes [[Open Questions]] Q5 and finally releases the SSE decision in [[Realtime and Events]].
Pooled tenancy, REST, Postgres, and the outbox are all still right. The only new structural
requirements are external-ID columns for GoHighLevel and a roles-as-data permission model, both
cheap now.

---

## Related

- [[2026-10-23 Cameron Walkthrough Debrief]] — the meeting this punch list came out of
- [[Feature Inventory]] — superseded for graphics by this document
- [[Open Questions]] — Q5 closed, Q20 answered the opposite way, new questions added
- [[PRD]] — write it from this
- [[Domain Model]] · [[Auth and Identity]] · [[Realtime and Events]]
