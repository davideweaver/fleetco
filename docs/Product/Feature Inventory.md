---
status: current
summary: The scope-control document: smallest feature set that works
created: 2026-10-08
updated: 2026-10-30
tags: [fleetco, features, scope, product]
source: Claude Code (Xerro)
---

## Overview

The scope-control document. Its job is to answer one question honestly: **what is the smallest
feature set that lets Fleetco run the ~~pilot customer's~~ *graphics department's* work entirely in
the new system?**

Everything else gets explicitly deferred. In a replacement project, the inventory *is* the
schedule — and the single most valuable column below is "cruft."

> **✅ Superseded for graphics 2026-10-28 by [[V1 Scope from Punch List]].** Cameron returned all
> 217 rows marked: **62 V1, 127 Later, 28 Not needed.** That document is the scope of record now.
> Three items need his confirmation before it's a contract — the portal being out of V1, two-way
> QuickBooks sync being in it, and GoHighLevel.
>
> This file stays as the scoring framework and the starting point for the **shop** phase.

**Status (2026-10-28):** the pilot changed, then the punch list came back the same week. The
walkthrough section below was the first pass at V1; Cameron's marks replace it.

## Scoring Framework

Every feature gets exactly one tier. No "sort of" tier — ambiguity is how scope creeps.

| Tier | Meaning | Phase |
|---|---|---|
| **P0** | Pilot customer cannot be served without it. Blocks go-live. | Phase 1 |
| **P1** | Any shop needs it eventually; pilot can survive weeks without it or with a manual workaround. | Phase 2 |
| **P2** | Real value, no urgency. | Later |
| **CRUFT** | Exists in FullBay, nobody at Fleetco uses it. **Do not build.** | Never |
| **RESELL** | Only needed when selling to a second fleet company. | Gated on the resale decision |

Two rules that make this work:

- **A manual workaround counts as shipped.** If a service advisor can export a CSV and handle
  something in a spreadsheet for three months, that feature is P1, not P0. Say so explicitly and
  record the workaround.
- **CRUFT needs a name attached.** "Nobody uses this" must come from a specific person who would
  know, not from an assumption.

## V1 — Graphics Department

**Added 2026-10-28** from [[2026-10-23 Cameron Walkthrough Debrief]]. Cameron proposed piloting the
**graphics department** — himself plus one installer (Jason) — and would **stop using FullBay for
graphics entirely.** This is the scope that matters now; the draft tiering below is background.

### Why the department cut works where the customer cut didn't

Graphics doesn't share the three resources that made a one-customer pilot unworkable: one
installer (no payroll split), its own shelf with two billable parts, and its own QuickBooks class.
Customer overlap with service is minimal, and Cameron would hand-bill the rare exception out of
FullBay.

### P0 — graphics cannot operate without it

| Area | Note from the walkthrough |
|---|---|
| Customers, contacts, units | **Units must allow non-vehicles** — he wraps walls and makes signs; today he creates a fake unit named "sign" |
| Estimate build | Customer → unit → work description → labor rate → material → design charge → color samples → estimated hours |
| Send for approval + approve/decline | Email-driven |
| **Internal self-authorization** | What he actually uses — *"a lot of my customers aren't inclined to press authorize or decline"* |
| Estimate → SO conversion | With the authorization gate blocking technician clock-in |
| **Time clock — both modes** | Against a work order **and** standalone categories (general, drive time, graphics production, shop/property maintenance). Billable vs. non-billable split drives payroll. See [[Open Questions]] Q2-in-brief |
| Parts billed on an order | He bills exactly two: Avery 1105 vinyl, and design |
| Parts records, POs, receiving | Separate from billable parts: PO emailed to vendor → mark received → stock increments → last cost updates |
| Vendors with terms + tax-exempt status | Both load-bearing |
| Invoice generation, email, payment link | |
| **Deposits** | At estimate approval, by link, and in the portal. The FullBay workaround is a fake part named "50% deposit" on a counter sale |
| **Scheduling with priority** | Graphics needs real dates and job ordering. FullBay's scheduler is unused company-wide |
| Customer portal (graphics flavor) | Estimates, approval, invoices, payment. **No QR driver reports** — that's a fleet service |
| Staff auth, roles, audit log | Foundational |

### P1 for graphics — real, but survivable with a workaround

Stock decrement from service orders (Cameron deliberately doesn't do this) · QuickBooks sync
(one class, modest volume — see [[Open Questions]] Q20) · pay-whole-balance by card · kit/roll-up
line items · multi-shop global settings, margins and markups · better reporting.

### CRUFT — named, with a name attached

| Item | Who says so |
|---|---|
| **Vendor portal** | Cameron: *"Not a single one of our vendors uses that."* They want the PO email. |
| **FullBay's "Office" tab** | Cameron: *"I really don't use anything in here"* — it's vendor reporting wearing a hat |
| **The service-order funnel graph** | Cameron: *"It says nothing. It's just a good-looking graph."* |
| **MOTOR labor guide** | Not used; he didn't know what it was |
| **FleetNet America** | Not used |
| **FullBay's scheduler** | Used only when someone is out of office |

### New requirements this produced

Full table with FullBay gaps in [[2026-10-23 Cameron Walkthrough Debrief]] §3. The structural ones,
because they are **data-model decisions and therefore cheap now and expensive later**:

1. **Customer hierarchy** — parent customer with sub-customers (departments), roll-up reporting and
   drill-down. Cameron's #1 FullBay gap.
2. **Global user accounts** — a user assignable to many customers and fleet groups. A manager over
   two departments needs one login, not two portals.
3. **Non-vehicle units** — signs, walls, buildings as first-class assets.
4. **Kits with configurable invoice display** — roll up to one line, or split materials / design /
   labor. Cameron wants three lines; the shops want far fewer than forty.
5. **Shop-type terminology switch** — same data model, different labels per business.

---

## Draft Tiering

Informed guesses from [[Domain Model]] and [[FullBay Analysis]], to be corrected by observation.
**Superseded for graphics by the V1 section above**; still the starting point for the shop phase.

### Likely P0 — the irreducible core
| Area | Why it blocks go-live |
|---|---|
| Customers, contacts, units | Nothing works without the assets |
| Service order lifecycle | The spine of the product |
| Three C's on repair lines | How the work is documented |
| Technician time tracking | Drives both labor billing and payroll |
| Estimates | Prerequisite for authorization |
| **Customer authorization workflow** | The gate. No shop operates without it. |
| Parts on a service order | Even if inventory is thin, parts must bill |
| Invoicing + PDF output | How Fleetco gets paid |
| Customer portal: view work, authorize, see invoices | The visible promise of the project |
| Shop staff auth, roles, tenancy | Foundational |
| Audit log | Cannot be backfilled; build it first |

### Likely P1
PM scheduling · inventory with real stock levels and counts · purchase orders and vendor
ordering · DVIR/inspections · canned jobs · accounting sync · payments · reporting ·
core charge tracking · labor guide integration · meter reading capture

### Likely P2
Predictive maintenance · advanced reporting and dashboards · AI note cleanup and voice-to-text ·
telematics integration · multi-location inventory · warranty/OEM claim submission ·
appointment and bay scheduling

### Likely RESELL
Vendor/operator admin plane (minimal version is P0 — see [[Tenancy Model]]) · tenant
self-provisioning · per-tenant branding · usage metering and billing · SSO · tenant-configurable
workflows

### Expected CRUFT
Unknown until the walkthrough, and **this is the most valuable bucket to find.** Mature SaaS
products accumulate features for a loud minority of customers. Expect a meaningful share of
FullBay's surface to be irrelevant to Fleetco. Every item moved here is schedule returned.

## Hard Questions to Resolve Before Scoping Is Credible

**Four of five moved on 2026-10-23.** Answers below; the originals are kept so the reasoning trail
survives.

1. **Can the pilot go live without inventory?** → **Mostly yes.** Cameron tracks graphics inventory
   manually today and doesn't want per-job consumable tracking at all (*"I can't track how much ink
   I'm using on a job"*). But **parts records, POs, and receiving are P0** because that's how he
   tracks cost and reorders. Real-time stock decrement from service orders is P1.
2. **Can accounting sync be a CSV export at first?** → **Likely, not confirmed.** Graphics is a
   single QuickBooks Online class with modest volume. Tracked as [[Open Questions]] Q20.
3. **Does the pilot need the portal on day one?** → **Yes.** Cameron: *"You're going to want a
   customer portal." "I am."* Graphics flavor: estimates, approval, invoices, payment — no QR
   driver reports.
4. **Is historical data migration P0?** → **Almost certainly no, and this is the big win.** Graphics
   is in its **first year of business**. Starting fresh is credible, which defuses the project's
   largest unknown for V1 and pushes the export problem to the shop cutover.
5. **Mobile for technicians: P0 or P1?** → **P1 for graphics.** One installer, clocking in from a
   browser. Nothing suggests offline tablets. [[Open Questions]] Q5 reopens at the shop phase, and
   it was never asked directly — ask Brian.

## Population Plan

1. ~~Get FullBay access~~ — done by walkthrough instead; Cameron drove, Dave recorded
2. ~~Enumerate every screen, menu item, and field~~ — `fullbay-punch-list.html`, 217 items
3. ~~**Cameron answers the punch list for V1 only**~~ — ✅ **done, and collected 2026-10-28.**
   Lives in `Meetings/Punchlist From Cam for v1/`; analyzed in [[V1 Scope from Punch List]].
4. Tier each item *with Fleetco present* — tiering alone invites disagreement later
5. Get the owner's written sign-off on the P0 list **and the out-of-scope list**. Friend or not,
   this is the scope contract — and Dan hasn't been in a meeting yet.
6. Feed the result into [[PRD]]
7. **Shop phase only:** interview Brian (Lancaster service manager, in FullBay ~90% of his day) and
   a technician. Not needed for V1; blocks the shop scope completely.

## Related

- [[2026-10-23 Cameron Walkthrough Debrief]] — where the V1 section came from
- [[Domain Model]]
- [[FullBay Analysis]]
- [[PRD]]
- [[Open Questions]]
