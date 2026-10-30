---
created: 2026-10-08
updated: 2026-10-09
tags: [fleetco, domain-model, schema, ubiquitous-language]
status: corrected against a live FullBay account — aggregates and vocabulary validated, field detail deferred
source: Claude Code (Xerro)
---

## Overview

Domain model for the Fleetco platform.

**Revised 2026-10-09.** The first draft was a hypothesis built from general domain knowledge. It
has now been **corrected against a logged-in walkthrough of a real FullBay account** plus direct
answers from Fleetco — see [[Feature Inventory Draft]]. Several terms were wrong and are fixed
below.

**Deliberate altitude: aggregates, relationships, and enumerations — not fields.** Field lists,
nullability, and validation rules are *not* here, because we have roughly a dozen genuinely
observed field names rather than complete forms, and because [[Roadmap]] M3 (client markup) and M4
(scope lock) will cut entities before field detail is worth writing. **Correct the model now;
expand it after scope is locked.**

Confidence markers used throughout: **✓** observed in the live account · **~** inferred ·
**?** unknown.

## Corrections From the First Draft

| Was | Now | Why |
|---|---|---|
| Complaint / Cause / Correction | **Concern / Cause / Correction** ✓ | The literal labels on a real customer-facing estimate |
| `ServiceOrderLine` | **`ActionItem`** (abbrev. **SOAI**) ✓ | FullBay's own term, visible in the UI as a "By SOAI Status" filter |
| "Service advisor" | **Service writer** ✓ | A literal column heading on the customer-facing estimate |
| VMRS as core vocabulary and a field | **Removed** ✓ | Fleetco doesn't use it; the live configuration was empty. See Rejected below |
| Authorization as threshold-only | **Thresholds *and* four named delegate roles** ✓ | Both mechanisms exist and are distinct |
| Technician with flat-rate / flagged hours | **Clocked hours only, manager-approved** ✓ | Answered directly by Fleetco — removes commission logic entirely |

## Ubiquitous Language

The industry's words, not invented ones. These end up in table names, API paths, and UI labels, so
they are expensive to change later.

| Term | Meaning | Confidence |
|---|---|---|
| **Unit** | The thing being serviced — tractor, trailer, reefer, excavator. HD shops say "unit," never "vehicle" | ✓ |
| **Service Order** (SO) | The job, intake through invoice | ✓ |
| **Action Item** (SOAI) | One repair line on a service order. Carries its own parts and labor | ✓ |
| **Concern / Cause / Correction** | The three C's — the structure of an Action Item. *Concern*, not "complaint" | ✓ |
| **Service writer** | The person building estimates and running the SO day to day | ✓ |
| **Authorizer** | The recorded name of whoever approved the work — a stored field, not a role | ✓ |
| **Authorization** | Customer approval to perform quoted work. Per-line, with a toggle-all | ✓ |
| **Expected Hours** | Guide- or estimate-sourced labor time, distinct from actual clocked hours | ✓ |
| **Canned job / Global Service** | Reusable labor + parts template. Terms used interchangeably | ✓ |
| **Part kit** | A pre-bundled parts list for one repair — a canned-job sub-type | ✓ |
| **Core charge** | Deposit on a rebuildable part, refunded when the old one is returned | ✓ |
| **Sublet** | Work performed by an outside vendor, recorded on our SO | ✓ |
| **Shop Supplies** | A named fee line on the invoice, separate from labor, parts, and tax | ✓ |
| **Counter sale** | A walk-in parts sale with no service order | ✓ |
| **Yard check** | Physically verifying which units are on site | ✓ |
| **PM** | Preventive maintenance, scheduled by mileage, engine hours, or calendar | ✓ |
| **DVIR** | Driver Vehicle Inspection Report — defects feed service orders | ~ |
| **Labor guide** | Third-party standard repair times (MOTOR, Mitchell 1) | ✓ |

### Rejected Vocabulary

- **VMRS** (Vehicle Maintenance Reporting Standards) — **do not build.** Fleetco's contact wasn't
  familiar with it and the live configuration was empty. It appears in industry literature, which
  is why the first draft included it.
- **"Work order"** — the fleet-side synonym. Use Service Order consistently.
- **"Complaint"** — superseded by Concern.

## Enumerations

**The highest-value new material here.** These are observed values, and they end up in state
machines, filters, and badges — expensive to retrofit. All are **shop-configurable** in FullBay,
so model them as data, not as hard-coded enums.

**Service Order Urgency** ✓ — `None` (scheduled) · `WIP` · `Parts` (ordered, awaiting arrival) ·
`Pending` (approval or scheduling)

**Service Request Urgency** ✓ — a separate, earlier-stage intake priority —
`Schedule as soon as possible` (default) · `Schedule repair today` ·
`Emergency – get this fixed right away` · `Remember for the next visit`

**Unit Status** ✓ — `No status` · `New` · `Confirmed` · `Out of Service` · `Owner-Operator` ·
`Shop-Company Owned` · `Sold` · `Transferred`

**Shop-side board stages** ✓ —
`Unassigned Actions → Assign → Diagnose → Price Parts → Authorize → Wait For Authorization → Repair → Recent Completed Services`

**Customer-facing portal stages** ✓ — *deliberately different names for the same underlying
progression* —
`Saved but not submitted → Submitted → Evaluating & Diagnosis → Ready to authorize → Service in progress → Recently completed`

> **Design note.** Two stage vocabularies over one state machine is a real modelling requirement,
> not a presentation detail. The customer sees a different label set than the shop — plus
> `Ready To Invoice`, which *is* surfaced to customers. Model the canonical status once and map it
> per audience.

## Entity Map

Grouped by prospective module, aligning with the schema-per-module rule in [[Evolution Path]].

### Tenancy & Identity (`platform.*`)
```
Tenant                 the fleet management company — see [[Tenancy Model]]
User                   a person (shop staff)
Membership             User ↔ Tenant, carrying role
Role                 ✓ custom, per-shop, named by the shop; not a fixed list
RoleChangeLog        ✓ every role/permission change, logged per employee
```

> **Open contradiction — portal access.** FullBay has **no customer login** ✓. Each customer gets
> one unguessable URL, resettable on compromise. Our [[Auth and Identity]] models portal users as
> principals with memberships and SSO-readiness. If Fleetco accepts FullBay's model, that whole
> subsystem nearly disappears; if hospital customers want real logins with SSO, we build *more*
> than FullBay has. **A scope decision, not a detail** — see Open Questions below.

### Customers & Assets (`customers.*`)
```
Customer             ✓ the fleet whose equipment is serviced
  ├─ four named delegate contacts ✓ — overall decisions / day-to-day fleet /
  │    authorizes repairs / processes bills.  Distinct from dollar thresholds.
  ├─ Primary Access Method ✓ e.g. "Customer will bring unit to the shop"
  └─ portal link ✓ tokenised URL, resettable
CustomerContact      ✓
CustomerAddress      ✓ multiple per customer
Unit                 ✓ Unit #, Nickname, Status, Severity, VIN, Year/Make/Model,
                       Ship To Address, default Carrier
MeterReading         ✓ odometer / engine hours over time — drives PM
Component            ~ serialized major assembly (engine, transmission)
```

### Service Orders (`workorders.*`)
```
ServiceOrder         ✓ the central aggregate. Urgency, customer, unit, dates
ActionItem (SOAI)    ✓ one repair: Concern / Cause / Correction,
                       each with its own Parts and Labor tabs
LaborLine            ✓ expected vs actual hours
PartLine             ✓
TimeEntry            ✓ technician clock in/out against a job
ServiceRequest       ✓ pre-SO intake, own urgency scale
Sublet               ✓ outside-vendor work recorded on our SO
DailyRate            ✓ day-rate billing (storage/demurrage), not labor+parts
Attachment           ✓ photos, signed authorizations
Note                 ✓ internal vs customer-visible; plus per-SO customer messages
CalendarEvent        ✓ bay / schedule page
WorkSchedule         ✓ employee working hours
```

### Estimating & Authorization (`workorders.*`)
```
Estimate             ✓ an SO state, not a separate document
Authorization        ✓ per-line Yes/No + Toggle All; records Authorizer and timestamp
                       → immutable audit record (legally and commercially important)
AuthorizationThreshold ✓ per-customer dollar auto-approval
SendLog              ✓ who sent the estimate and when — visible to the customer
CannedJob            ✓ labor + parts template
PartKit              ✓
LaborRate            ✓ named rate sheets, incl. third-party billing rates
```

### Parts & Inventory (`parts.*`)
```
Part                 ✓ catalog entry
FakePart             ✓ non-tracked placeholder, billable without carrying stock
InventoryItem        ✓ Part × Location, quantity on hand
PartLocation         ✓ shelf, bin, service truck; multi-shop
InventoryTransaction ~ every movement, append-only
InventoryAdjustment  ✓ ad hoc
CycleCount           ✓ scheduled audit, distinct from an adjustment
PartTransfer         ✓ intra-company, between the shop's own locations
Vendor               ✓ + VendorBill, VendorPayment, VendorCreditMemo, VendorTaxDocument
PurchaseOrder/POLine ✓ incl. combined POs across SOs/vendors
CounterSale          ✓ walk-in sale, no SO
Core                 ✓ charge / credit / return, with its own inventory and value report
PricingScale         ✓ tiered markup by cost band
PricingMatrix        ✓ markup by customer type — a second, distinct mechanism
CostFloor            ✓ minimum sell price, shop-wide or per-location
```

### Scheduling & Maintenance (`scheduling.*`)
```
PMDefinition         ✓ interval by mileage, hours, or calendar
PMAssignment         ✓ attaches to a Unit or a UnitType template
UnitType             ✓ PM templates hang off this
PMDue                ✓ computed; configurable coming-due window (30 days observed)
Procedure            ✓ step-by-step, attachable to a PM
Inspection           ~ guided, in-app, during a job
InspectionDefect     ~ a finding → may generate an ActionItem
```

### Labor & Payroll (`workorders.*`)
```
Employee             ✓ + Timesheet, TimesheetActivity
                     ✓ pay is CLOCKED HOURS ONLY, manager-approved before payroll export.
                       No flat-rate, no flagged hours, no commission.
```

### Billing (`billing.*`)
```
Invoice / InvoiceLine ✓ totals break out: Subtotal → Shop Supplies → Labor →
                        Parts → Subtotal → tax → Total
Payment              ✓ card / ACH / eCheck / Apple Pay / Google Pay / BNPL
PaymentMethod        ✓ customer self-adds in the portal
CreditMemo           ✓
Refund               ✓
Statement            ✓ A/R statements, configurable preferences
ChartOfAccount       ✓ FullBay keeps its own — deeper than a QuickBooks pass-through
TaxRule              ✓ incl. a cash-basis sales-tax reporting mode
WarrantyClaim        ✓ vendor/OEM clearing + a distinct office-side billing treatment
AccountingSync       ✓ QuickBooks — confirmed in active use, P0, and the only one needed
```

### Portal (`portal.*`)
A read-scoped projection of the above. Sections observed ✓: **Units · Messages · Active Services ·
Contacts · Invoices · Payments · Configuration**, plus Request Service.
```
PortalActivity       feeds from the outbox — see [[Realtime and Events]]
```
**No new entities, and no portal user table** under FullBay's model.

### Platform (`platform.*`)
```
AuditLog             append-only, from day one. Cannot be backfilled
OutboxEvent          see [[Evolution Path]]
Notification
```

## The Central Workflow

Everything above exists to serve this sequence. If the product can't do this cleanly end to end,
nothing else matters.

```
Unit arrives, or a PM comes due, or a DVIR defect is filed
  → Service Order opened; Concerns recorded as Action Items
  → Technician diagnoses, records Cause
  → Estimate built (labor from guide or canned job; parts priced and marked up)
  → ESTIMATE SENT  — portal link, text, or email; send is logged
  → Customer authorizes per line, or Toggle All        ← the critical gate
  → Work performed; parts issued; time clocked against Action Items
  → Correction recorded; optional Review step
  → Invoice generated; Shop Supplies and tax applied
  → Payment collected
  → Synced to QuickBooks
  → Visible to the customer in the portal
```

**The authorization gate is the heart of the product** and the main thing separating heavy-duty
shop software from general auto repair. Fleet customers will not accept surprise invoices, the
approval model has both dollar thresholds *and* four named delegate roles, and the record of who
approved what and when must be immutable. If one thing is designed carefully, it is this.

## Scope Reality Check

Roughly nine modules and **~58 entities** to support one shop serving one customer — about 20 of
which are genuinely core. See `fullbay-surface-map.html` (same folder) for the screen-level view: 64 screens
reducing to 8 page archetypes.

This is the honest answer to "how big is this?", and the reason M3 must ruthlessly separate
must-have from cruft before any timeline is credible.

## Validation — Now Mostly Answered

| Question | Status |
|---|---|
| The three C's | ✓ **Concern** / Cause / Correction |
| Does Fleetco use VMRS? | ✓ **No.** Removed from the model |
| Technician pay structure | ✓ Clocked hours, manager-approved. No flat-rate |
| Inventory: one stockroom or trucks too? | ✓ Multi-location, bins, service trucks, intra-company transfers |
| Accounting integration | ✓ QuickBooks, in active use, and the only one needed |
| Warranty work in scope? | ✓ Exists in FullBay (vendor clearing + billing treatment). **Phase-one scope still open** |
| Labor rate structure | ~ Named rate sheets exist, incl. third-party billing. Exact per-customer/per-skill structure **open** |
| Tax: single jurisdiction? | ? State tax observed on one estimate. Multi-state **unconfirmed** |
| Which entities the pilot never touches | ? **This is M3.** The single biggest scope lever |

## Open Questions

1. **Portal authentication model** — adopt FullBay's tokenised URL, or build real logins? Affects
   [[Auth and Identity]] materially, and hospital customers with SSO push the other way.
2. **Warranty in phase one?** It exists and is non-trivial — vendor claims plus a separate billing
   treatment. A strong candidate for deferral.
3. **Does the pilot customer use cores, sublet, counter sales, or daily rates?** Each is a real
   subsystem and each is plausibly skippable for customer one.
4. **Money and rounding rules** — where rounding happens on markup, tax, and shop supplies.
   Unknown, and it must be exact. See [[Code Standards and Guardrails]].

## Related

- [[Feature Inventory Draft]] — the validated source for this revision
- `fullbay-surface-map.html` — screens, archetypes, navigation depth
- [[Tenancy Model]] · [[Auth and Identity]] · [[Evolution Path]] · [[Testing Strategy]]
- [[Roadmap]] — M3 markup, M4 scope lock
