---
created: 2026-10-31
updated: 2026-10-31
tags: [fleetco, otc, v1, rules, business-logic, spec, testing]
status: first draft — mined from existing docs, no new FullBay access; awaiting Cam's answers
source: Claude Code (Xerro), from Cam's punch list notes, the 10/23 debrief, V1 Vision and Gaps, Domain Model, Code Standards
---

## What this is

The business rules the system must obey, written so that each one can become a test. This is the
part of the spec that agents build from and test against. [[Domain Model]] says **what exists**;
this says **what must always be true** and **what happens when**.

**Scope of this draft:** every rule V1 needs, plus a short section of Later rules that constrain how
V1's data must be shaped (§14). Mechanical-shop rules are not catalogued yet. They come from the
targeted FullBay pass and the export.

**Where the rules came from:** almost all of them are from Cam's own punch-list notes, which turned
out to be far more rule-like than a feature list. Nothing here came from new FullBay access.

## How to read a rule

```
### EST-007 Catalog values are copied, not linked          ← stable ID + one-line name
**Rule:** the statement, in domain language.
**Examples:** Given / When / Then, with concrete numbers where money or time is involved.
**Source:** where it came from · **Status:** · **Phase:**
```

**Status**

| Status | Meaning | What an agent does |
|---|---|---|
| **Confirmed** | Cam said it, or it was observed in FullBay and Cam kept it | Build and test it |
| **Inferred** | Follows directly from confirmed rules but nobody stated it | Build it; flag in review if it feels wrong |
| **Proposed** | Our default, chosen to fill a hole | Build it unless told otherwise; listed for Cam to veto |
| **Decision needed** | Can't be built correctly until someone answers | Don't build. Answer lives in §15 |

**Source codes:** `PL 2.8` punch-list row in `Meetings/Punchlist From Cam for v1/Notes left on
items.md` · `MTG 00:30:55` transcript timestamp · `DBF` [[2026-10-23 Cameron Walkthrough Debrief]]
· `G6` gap in [[V1 Vision and Gaps]] · `FB` observed in the live FullBay account · `STD` our own
architecture standards · `DAVE` Dave's resolution.

**Rules for the catalog itself**

- **IDs are permanent.** Never renumber, never reuse. A dropped rule is marked **Retired**, not
  deleted.
- **Every test names the rule it proves** — e.g. `it('EST-007: catalog cost change does not reprice
  an existing estimate')`. CI fails if a Confirmed, Inferred or Proposed V1 rule has no test.
- **Tests are written from this file, not from the code.** See [[Testing Strategy]].
- **Changing a rule is a spec change.** It goes through review like code and gets a change-log line.
- **Examples use illustrative numbers.** They are not OTC's real prices, rates or tax settings.

---

## 1. Cross-cutting (PLAT)

### PLAT-001 Money is integer cents
**Rule:** every amount is stored and computed as an integer number of cents. No floating-point
money anywhere, including in calculations, API payloads and exports.
**Source:** STD (Code Standards: Money) · **Status:** Confirmed · **Phase:** V1

### PLAT-002 Where rounding happens
**Rule:** an extended line amount (quantity × unit price) is rounded to the cent, half-up, **once per
line**. Line totals are summed without further rounding. Tax is computed on the taxable subtotal
and rounded half-up once per tax rate per invoice.
**Examples:**
- Given 12.5 sq ft at $4.99, the line amount is $62.38 (6237.5 cents rounds up to 6238).
- Given three lines of $62.38, $10.00 and $0.01, the subtotal is exactly $72.39.
**Source:** PL 7.23 ("consistent rounding"), Domain Model open Q4 · **Status:** Decision needed
(D-A1: must match how FullBay and QuickBooks round today) · **Phase:** V1
> **Note on STD:** Code Standards says "rounding happens once, at presentation." That is wrong for
> invoices: a finalized invoice's rounded amounts are the legal record and must be stored as issued
> (INV-003). Update Code Standards when this rule is confirmed.

### PLAT-003 Time is stored in UTC and shown in shop time
**Rule:** timestamps are stored in UTC and displayed in the shop's time zone, which is a setting.
OTC Fleet Graphix is `America/New_York`. Day boundaries (timesheets, "today", aging) use shop time.
**Example:** a punch at 23:30 Eastern on Mar 9 belongs to Mar 9's timesheet, even though it is
Mar 10 in UTC.
**Source:** STD · **Status:** Confirmed (time zone Inferred: Lancaster, PA) · **Phase:** V1

### PLAT-004 Sensitive changes leave an audit record
**Rule:** these actions write an append-only audit record with actor, timestamp, and before and
after values: approvals and overrides, proof approval, board stage moves, job close and cancel,
time corrections, pay-period approval, invoice finalize and void, payments, refunds, manual cost
corrections, role and permission changes. Audit records can't be edited or deleted by anyone.
**Source:** PL 1.12, 2.1, 4.6, 3.16; Domain Model (AuditLog) · **Status:** Confirmed · **Phase:** V1

### PLAT-005 Financial records are never hard-deleted
**Rule:** finalized invoices, payments, deposits, refunds and approval records are never deleted.
They are voided or reversed, and the original remains. Canceling a job never removes its financial
records.
**Source:** PL 1.10 · **Status:** Confirmed · **Phase:** V1

### PLAT-006 Every business record belongs to a department
**Rule:** jobs, estimates, invoices, POs, catalog materials and time entries each carry a
department. V1 has one department, Graphics, and the UI never shows it.

**Design choice, not a FullBay fact:** in the new system, one company is one customer record shared
by every department. A customer has no department.

This is **not** how FullBay appears to work. Customer lists export one shop at a time (MTG
00:00:45), a customer is "set up with the Lancaster shop" (MTG 00:04:52), and myOTCFleet uses a
separate FullBay API key per shop. What FullBay shares across shops is configuration (parts markups,
labor rates; MTG 00:22:53), not customers. We chose one shared record because Cam's biggest FullBay
complaint was one company split into many customer records (G5).

**Consequence:** if FullBay holds one record per shop, the shop cutover must merge duplicates across
shop exports and match them to QuickBooks (QBO-005). See D-C18.
**Source:** PL 1.23 (switcher Later), V1 Alignment §1 (QuickBooks class), G5 · **Status:** Proposed
(FullBay's actual behavior is D-C18) · **Phase:** V1 (data), Later (UI)

### PLAT-007 External IDs are stored, not synced
**Rule:** customers and jobs can store a GoHighLevel contact ID and opportunity ID. Migrated
records store their FullBay ID. These are references only; nothing syncs in V1.
**Source:** PL 1.5, 11.17; Q24 · **Status:** Confirmed (FullBay ID Proposed) · **Phase:** V1

### PLAT-008 Permissions belong to roles, and roles are data
**Rule:** code checks for a **permission** (e.g. `job.close`), never for a role name. Roles are
records that hold a set of permissions. V1 seeds two roles (ROLE-001).
**Example:** granting `job.close` to a future Office role requires no code change.
**Source:** PL 0.4, 1.11, 1.12, 3.30 ("do not permanently hard-code") · **Status:** Confirmed ·
**Phase:** V1

### PLAT-009 Human-readable numbers are unique and never reused
**Rule:** estimates, jobs, invoices and POs each get a unique, sequential number within their type.
A number is never reused, even if the record is canceled or voided. Invoice numbering has its own
rule (INV-004).
**Source:** PL 1.5 ("unique customer/job/SO IDs"), 7.17 · **Status:** Confirmed (format Proposed) ·
**Phase:** V1

---

## 2. Roles and access (ROLE)

### ROLE-001 V1 has exactly two roles
**Rule:** Owner and Technician. No seat licensing, no other roles, no per-user overrides in V1.
**Source:** PL 0.1–0.4 · **Status:** Confirmed · **Phase:** V1

### ROLE-002 Owner can do everything V1 implements
**Source:** PL 0.1 · **Status:** Confirmed · **Phase:** V1

### ROLE-003 Technicians see only their assigned jobs
**Rule:** a Technician sees a job only if they are assigned to it. This applies to the jobs list,
the board, the calendar, the job record, search, reports, and direct links or API calls.
**Examples:**
- Given job J-1042 is assigned only to Mike, when Jason opens its link, then he gets "not found"
  (not "forbidden", which would confirm the job exists).
- Given Jason is assigned only to the installation entry of J-1043, then he can see J-1043.
**Source:** PL 0.4, 4.8 · **Status:** Confirmed · **Phase:** V1

### ROLE-004 What "assigned" means
**Rule:** a Technician is assigned to a job if they are assigned on the job itself **or** on any of
its calendar entries.
**Source:** PL 1.3, 1.24 · **Status:** Proposed · **Phase:** V1

### ROLE-005 Technicians never see costs, markup or profit
**Rule:** for a Technician, internal costs, component cost breakdowns, markup, margin and job
profit are absent from every screen, API response, report, export and PDF. They are removed on the
server, not hidden in the browser.
**Example:** the job API response for a Technician has no cost fields at all, not cost fields set
to null.
**Source:** PL 3.30, 0.4, 10.5 · **Status:** Confirmed · **Phase:** V1

### ROLE-006 Can Technicians see selling prices?
**Rule:** open. PL 10.5 gives Technicians access to customer-facing estimate and invoice documents
on mobile, which contain selling prices, but also says "not unrestricted invoicing controls."
**Source:** PL 10.5 · **Status:** Decision needed (D-C1) · **Phase:** V1

### ROLE-007 What Technicians can do
**Rule:** on their assigned jobs, a Technician can: punch in and out, start and stop their own
timers, upload photos, complete checklists, add internal notes, and mark work finished.
They **cannot**: close a job, record customer approvals, use overrides, edit or finalize invoices,
record payments, correct time entries (their own or anyone's), or edit catalog, vendors or POs.
**Source:** PL 0.4, 1.11, 1.12, 4.6 · **Status:** Confirmed (catalog/PO restriction Inferred) ·
**Phase:** V1

### ROLE-008 Can Technicians move board cards or change priority?
**Rule:** open. PL 1.5 gives the Owner stage moves; PL 1.7 says Technician priority permission
"remains to be defined."
**Source:** PL 1.5, 1.7 · **Status:** Decision needed (D-C2) · **Phase:** V1

### ROLE-009 Customer-facing documents never expose internals
**Rule:** estimate PDFs, invoice PDFs and the payment page show only customer-facing lines,
descriptions and selling prices. Internal components, costs, markup and profit never appear. The
document generator enforces this; there is no toggle that can turn it off.
**Source:** PL 3.30, 7.2, 2.1 · **Status:** Confirmed · **Phase:** V1

---

## 3. Customers and assets (CUST)

### CUST-001 The job's customer is the bill-to
**Rule:** the customer on a job is the company that receives and pays the invoice. There is no
separate third-party bill-to in V1.
**Source:** PL 1.13 · **Status:** Confirmed · **Phase:** V1

### CUST-002 Customers can have a parent
**Rule:** a customer may reference one parent customer. Parents can't form a loop. V1 never shows
this in the UI, but the column exists.
**Example:** Given A is the parent of B, setting B as A's parent is rejected.
**Source:** G5; MTG 01:28:13 · **Status:** Proposed · **Phase:** V1 (data), Later (UI)

### CUST-003 Assets are real records with a type
**Rule:** an asset belongs to a customer and has a type: vehicle, trailer, sign, wall, building or
other. Vehicle details (VIN, year/make/model, unit number) are optional. A job references zero or
more of its customer's assets, and can carry a free-text description instead.
**Example:** a sign job for Whitmer Group references an asset of type `sign`; nobody has to create
a fake vehicle called "sign."
**Source:** G4; V1 Alignment 4.6; MTG 01:02:03 · **Status:** Proposed (zero-or-more Decision needed,
D-C3) · **Phase:** V1

### CUST-004 An asset belongs to exactly one customer at a time
**Rule:** a job can reference only assets that belong to the job's customer.
**Source:** Domain Model · **Status:** Inferred · **Phase:** V1

### CUST-005 Payment terms come from the customer
**Rule:** every customer has payment terms in days. The default is Net 30; Net 60 and Net 90 are
allowed.
**Example:** a Net 60 customer (e.g. LGH) invoiced on Mar 1 has a due date of Apr 30.
**Source:** DBF (Credit and terms) · **Status:** Confirmed · **Phase:** V1

### CUST-006 Customers have a credit-account flag
**Rule:** a customer either has an approved credit account or doesn't. Approving credit happens
outside the system (Joanna and Kevin); the system only records the result and who set it.
**Source:** DBF (Credit and terms) · **Status:** Confirmed · **Phase:** V1

### CUST-007 Duplicate-name warning
**Rule:** creating a customer whose name closely matches an existing one shows a warning with the
matches. It does not block.
**Source:** G12 · **Status:** Proposed · **Phase:** V1

### CUST-008 Tax-exempt customers
**Rule:** open. PL 7.23 requires "exemptions where applicable" but nothing says how an exemption is
recorded or evidenced (certificate on file, expiry).
**Source:** PL 7.23 · **Status:** Decision needed (D-T2) · **Phase:** V1

---

## 4. Estimates (EST)

### EST-001 Estimates and jobs are linked, one to one
**Rule:** an estimate converts to at most one job, and the two stay linked. A job may also be
created without an estimate (Quick job).
**Source:** PL 1.1, 1.2, 2.9 · **Status:** Confirmed (job-without-estimate Inferred) · **Phase:** V1

### EST-002 An estimate is customer lines with internal components
**Rule:** an estimate has one or more **customer lines** (what the customer sees, e.g. "Full wrap
— 2019 Ford Transit"). Each customer line has zero or more **components**: catalog material,
custom material, labor, or allowance. Components are internal.
**Source:** PL 1.21, 2.1; G7 (DAVE) · **Status:** Confirmed · **Phase:** V1

### EST-003 How a customer line is priced
**Rule (proposed):** a customer line's price is the sum of its components' selling amounts, unless
the Owner sets a price on the line, in which case the set price wins and the component total is
kept for comparison. A line with no components has a directly entered price.
**Example:**
- Given components selling at $600.00 (vinyl), $300.00 (laminate), $40.00 (ink allowance) and
  $1,360.00 (labor), the line price is $2,300.00.
- When the Owner sets the line price to $2,500.00, then the customer sees $2,500.00, and job
  costing still knows the components totalled $2,300.00.
**Source:** PL 1.21, 2.4 · **Status:** Decision needed (D-C4: does Cam price packages by summing
materials, or by setting a package price?) · **Phase:** V1

### EST-004 Line cost and margin
**Rule:** a customer line's cost is the sum of its components' cost amounts (quantity × unit cost,
rounded per PLAT-002). Margin is line price minus line cost. Both are internal (ROLE-005).
**Example:** components costing $300.00 + $150.00 + $40.00 + $640.00 = $1,130.00. At a price of
$2,500.00, margin is $1,370.00.
**Source:** PL 1.21 (job costing) · **Status:** Inferred · **Phase:** V1

### EST-005 Labor cost rate for job costing
**Rule:** open. Labor components need an internal cost per hour for job costing. Options: one shop
rate, or per-employee rates (which would expose wages; PL 0.2 says a future Office role must not
see pay rates).
**Source:** PL 1.21, 0.2 · **Status:** Decision needed (D-C5) · **Phase:** V1

### EST-006 Consumables are allowances
**Rule:** an allowance component has a description and an estimated cost (and optional selling
amount), with no quantity tracking. Used for ink, alcohol, Goo Gone and similar.
**Source:** PL 1.21; DBF ("I can't track how much ink I'm using") · **Status:** Confirmed ·
**Phase:** V1

### EST-007 Catalog values are copied, not linked
**Rule:** adding a catalog material copies its current default cost and selling price onto the
component. Later changes to the catalog (including Use Last Cost, PUR-006) never change existing
estimates or jobs.
**Example:** Given vinyl costs $2.50/sq ft when estimate E-210 is built, when a PO later updates
vinyl to $2.80, then E-210 still costs vinyl at $2.50.
**Source:** PL 2.4, 3.16 · **Status:** Confirmed · **Phase:** V1

### EST-008 Custom items need no catalog record
**Rule:** a component or line can be custom: description, quantity, cost and selling price, with no
catalog item. Labelled "custom item," not "fake part."
**Source:** PL 3.25 · **Status:** Confirmed · **Phase:** V1

### EST-009 Templates are copied in
**Rule:** applying a template copies its customer lines and components into the estimate as normal,
editable lines. Editing or deleting the template later never changes estimates that used it.
Template components that reference catalog materials take the catalog's **current** values at the
moment of applying (EST-007), not values saved in the template.
**Source:** PL 1.20, 1.21; G7 · **Status:** Confirmed (copy semantics and current-values Proposed)
· **Phase:** V1

### EST-010 No Shop Supplies fee line
**Rule:** graphics estimates and invoices never get an automatic Shop Supplies fee. Supplies are in
the package price.
**Source:** PL 2.13 · **Status:** Confirmed · **Phase:** V1

### EST-011 Expected hours are entered by hand and never overwritten
**Rule:** expected hours are the sum of the hours on labor components. Actual time (TIME rules)
never changes them, and they never change actual time.
**Source:** PL 2.3 · **Status:** Confirmed (sum-of-labor-components Proposed) · **Phase:** V1

### EST-012 Estimate status
**Rule:** Draft → Sent → Approved, Partially approved, or Declined. Derived from line approvals
(AUTH-001) except Draft and Sent. Marking an estimate sent records who and when. It is a manual mark,
not delivery tracking.
**Source:** PL 2.15, 2.8 · **Status:** Confirmed (status set Proposed) · **Phase:** V1

### EST-013 Expiry
**Rule:** open. Nothing says whether estimates expire or carry a "valid until" date.
**Status:** Decision needed (D-C6) · **Phase:** V1

---

## 5. Approval and authorization (AUTH)

**This is the most important section.** It is the record that protects OTC in a dispute.

### AUTH-001 Approval is per customer line
**Rule:** each customer line is Pending, Approved, Declined, or Overridden. "Approve all" sets every
pending line at once and records one approval per line.
**Source:** PL 2.8; FB (Toggle All) · **Status:** Confirmed · **Phase:** V1

### AUTH-002 What an approval records
**Rule:** a customer approval or decline records: the customer contact who gave it (name), when they
gave it, how (phone, email, in person, text, other), who in OTC recorded it, and when it was
recorded.
**Source:** PL 2.1, 1.12, 2.8 · **Status:** Confirmed · **Phase:** V1

### AUTH-003 Approval records are permanent
**Rule:** an approval record can't be edited or deleted. Correcting a mistake writes a new record
that supersedes it; both stay visible in the line's history.
**Source:** Domain Model (immutable authorization) · **Status:** Confirmed · **Phase:** V1

### AUTH-004 Override is not customer approval
**Rule:** an override authorizes a line without customer approval. It is recorded with type
`override`, the actor, the time, and a required reason. Reports and the line history always show it
as an override, never as customer approval. Needs the `approval.override` permission (Owner in V1).
**Source:** PL 1.12, 2.8 · **Status:** Confirmed (required reason Proposed) · **Phase:** V1

### AUTH-005 Only authorized lines are billable
**Rule:** a line is **authorized** if its latest approval state is Approved or Overridden. Only
authorized lines become job scope and invoice lines. Declined and pending lines never reach an
invoice, but stay on the estimate as a record of what was offered.
**Example:** Given an estimate with lines A ($2,500, approved), B ($400, declined) and C ($150,
pending), when the job closes, then the draft invoice contains only A.
**Source:** PL 2.8, 2.9 · **Status:** Confirmed · **Phase:** V1

### AUTH-006 Converting to a job
**Rule:** Convert to Job is a manual action that needs the `estimate.convert` permission and at
least one authorized line. It never happens automatically on approval or on assignment. It carries
customer, scope and pricing over without retyping.
**Source:** PL 2.9 · **Status:** Confirmed (at-least-one Inferred) · **Phase:** V1

### AUTH-007 Changing an approved line needs approval again
**Rule:** changing an authorized line's description, quantity or price returns it to Pending. Its
earlier approval stays in history. Changing only internal components (cost) does not affect
approval.
**Example:** Given line A was approved at $2,500, when the Owner changes it to $2,800, then A is
Pending and the approval at $2,500 remains in its history.
**Source:** PL 1.12 · **Status:** Proposed (what counts as a "change") · **Phase:** V1

### AUTH-008 Added work is approved on its own
**Rule:** lines added after work has started need their own approval or override. Lines that
were already authorized and haven't changed keep their authorization.
**Source:** PL 2.12 · **Status:** Confirmed · **Phase:** V1

### AUTH-009 Proof approval is separate from price approval
**Rule:** approving a price never approves artwork. A job can't enter **Ready for Production** until
a proof is approved, or a proof override is recorded (with actor, time and reason, needing the
`proof.override` permission). A job can exist before proof approval.
**Source:** PL 2.1, 2.9 · **Status:** Confirmed · **Phase:** V1

### AUTH-010 Proof versions
**Rule:** proofs are versioned files on the job. At most one version is the approved one at any time.
Approving a newer version supersedes the older approval, and both stay in history. A proof approval
records who, when and how, like AUTH-002.
**Source:** G1; V1 Alignment 4.4 · **Status:** Decision needed (D-C7: confirm the shape after Cam
walks through a real proof cycle) · **Phase:** V1

### AUTH-011 V1 approvals are recorded by staff
**Rule:** in V1, every approval is recorded by an OTC user. There is no customer-facing approval
link, unless D-C8 adds one, in which case the approval method gains a `link` value and the
customer's click is the record.
**Source:** PL 2.5, 2.8; G2; V1 Alignment 4.2 · **Status:** Confirmed (pending D-C8) · **Phase:** V1

---

## 6. Jobs, board and schedule (JOB)

### JOB-001 One job record for all job types
**Rule:** the quick path and the full path create the same kind of job record.
**Source:** PL 1.1, 1.3 · **Status:** Confirmed · **Phase:** V1

### JOB-002 Job billing type
**Rule:** every job is exactly one of: **billable** (customer work), **internal** (OTC's own
vehicles and property, nonbillable) or **warranty/rework** (no charge).
**Source:** PL 1.19, 7.26, 1.11 · **Status:** Confirmed · **Phase:** V1

### JOB-003 Warranty jobs point at the original job
**Rule:** a warranty/rework job must reference the original job, and both must belong to the same
customer.
**Source:** PL 7.26 · **Status:** Confirmed (same-customer Inferred) · **Phase:** V1

### JOB-004 Board stages
**Rule:** Ready for Production → In Production → Production Complete → Ready for Installation →
Installation in Progress → Completed. Stages are stored as data, so they can be renamed later.
**Source:** PL 1.5 · **Status:** Confirmed · **Phase:** V1

### JOB-005 Owner can move a card anywhere
**Rule:** with the `job.move_stage` permission, a user can move a job to any stage, including
backward or skipping stages, subject only to AUTH-009 for Ready for Production. Every move is
audited.
**Source:** PL 1.5 · **Status:** Confirmed · **Phase:** V1

### JOB-006 Billable jobs need authorized scope before production
**Rule:** a billable job can't enter Ready for Production without at least one authorized line.
Internal jobs are exempt; warranty jobs are exempt.
**Source:** PL 2.9 (only authorized scope proceeds) · **Status:** Proposed · **Phase:** V1

### JOB-007 Finished and closed are different
**Rule:** a job has a lifecycle separate from the board: Open → Work finished → Closed, or Canceled.
A Technician marks work finished; a user with `job.close` closes it after review. Marking work
finished moves the card to Completed. Closing removes it from the active board.
**Source:** PL 1.11 · **Status:** Confirmed (board interaction Proposed) · **Phase:** V1

### JOB-008 Finishing work needs a completion photo
**Rule:** work can't be marked finished without at least one photo tagged as a completion photo.
**Source:** PL 1.11 · **Status:** Confirmed · **Phase:** V1
> Whether the quality checklist (JOB-016) must also be complete is D-C9.

### JOB-009 Closing a billable job creates one draft invoice
**Rule:** closing a billable job creates exactly one unsent draft invoice from its authorized lines
(INV-001). Closing an internal or warranty job creates none. The invoice is never sent
automatically.
**Examples:**
- Given a billable job with two authorized lines, when it is closed, then one draft invoice with two
  lines exists and nothing has been sent.
- Given an internal job, when it is closed, then no invoice exists, and it does not appear in Ready
  to Invoice (RPT-004).
**Source:** PL 1.11, 7.1 · **Status:** Confirmed · **Phase:** V1

### JOB-010 Reopening a closed job
**Rule:** open. Not covered anywhere. Proposed default: a user with `job.close` may reopen a job
whose invoice is still a draft; the existing draft is kept, not duplicated. A job with a finalized
invoice can't be reopened.
**Status:** Decision needed (D-C10) · **Phase:** V1

### JOB-011 Canceling a job
**Rule:** a job can be canceled with a required reason. Its record and history are kept. Canceled is
not a board stage. A job with a finalized, unvoided invoice can't be canceled.
**Source:** PL 1.10 · **Status:** Confirmed (reason and invoice block Proposed) · **Phase:** V1

### JOB-012 Priority never moves dates or prices
**Rule:** priority is Normal, High or Rush (Normal by default). It is shown on the job and the board.
Changing it never changes the schedule, the stage or any price.
**Source:** PL 1.7 · **Status:** Confirmed · **Phase:** V1

### JOB-013 Arrived and Picked Up
**Rule:** a job records when the vehicle or item arrived and when it was picked up, with who recorded
each. Picked Up requires Arrived. Both are independent of stage and priority.
**Source:** PL 1.15 · **Status:** Confirmed (ordering Inferred) · **Phase:** V1

### JOB-014 Calendar entries
**Rule:** a calendar entry is either **production** or **installation**, belongs to exactly one job,
has its own start and end, and has one or more assigned employees. A job can have several entries
of each type.
**Source:** PL 1.24 · **Status:** Confirmed · **Phase:** V1

### JOB-015 The calendar owns dates; the board owns stage
**Rule:** moving a card never changes a calendar entry. Changing a calendar entry never moves a card.
The card shows the job's next upcoming calendar entry.
**Source:** G8 · **Status:** Proposed · **Phase:** V1

### JOB-016 Overlapping assignments are allowed
**Rule:** an employee can be assigned to overlapping entries. V1 doesn't warn or block.
**Source:** PL 1.24 ("overlap handling… not finalized") · **Status:** Proposed · **Phase:** V1

### JOB-017 Checklists
**Rule:** a job has a pre-installation condition checklist and a final quality checklist. The items
are configurable and not yet defined.
**Source:** PL 6.3 · **Status:** Decision needed (D-C9: the items, and whether completion is
required) · **Phase:** V1

### JOB-018 Notes are internal
**Rule:** job notes are internal only in V1. There are no customer-visible notes or messages.
**Source:** PL 2.14 · **Status:** Inferred · **Phase:** V1

---

## 7. Time and payroll (TIME)

### TIME-001 Attendance and job time are separate
**Rule:** a daily punch in and out (attendance) is separate from timers on jobs or activities.
**Source:** PL 4.1 · **Status:** Confirmed · **Phase:** V1

### TIME-002 One running timer per employee
**Rule:** an employee has at most one running timer, on a job or a non-job activity. Starting a new
one stops the running one at the same instant, so there is no gap and no overlap.
**Example:** Given Jason's timer on J-1042 started at 08:00, when he starts J-1043 at 10:30, then
J-1042 has an entry of 08:00–10:30 (2.50 h) and J-1043's timer starts at 10:30.
**Source:** PL 4.2, 4.5 · **Status:** Confirmed · **Phase:** V1

### TIME-003 Several people can time the same job
**Source:** PL 4.2 · **Status:** Confirmed · **Phase:** V1

### TIME-004 Timers need an active punch
**Rule:** open. Can a job timer run while the employee isn't punched in? Proposed default: starting a
timer while not punched in is refused with a prompt to punch in.
**Status:** Decision needed (D-C11) · **Phase:** V1

### TIME-005 Punching out stops the timer
**Rule:** punching out stops any running timer at the same instant.
**Status:** Proposed · **Phase:** V1

### TIME-006 Only attendance is payable
**Rule:** payable hours come from attendance punches only. Job and activity time never adds payable
hours.
**Example:** Given Jason punched 07:00–15:30 and logged 6.0 h on jobs and 1.5 h on cleanup, his
payable hours are 8.50, not 16.00.
**Source:** PL 4.7, 4.11, 9.32 · **Status:** Confirmed · **Phase:** V1

### TIME-007 Activity categories
**Rule:** non-job time is classified by an activity category. Seed categories: Cleanup, Meetings,
Training, General shop. Owner can add, rename and deactivate them; deactivated ones stay on old
entries.
**Source:** PL 4.5 · **Status:** Confirmed · **Phase:** V1

### TIME-008 Corrections are done by the Owner, with a reason
**Rule:** Technicians can't edit time entries, even their own; they flag an entry for correction.
A user with `time.correct` can change any entry, with a required reason. The before and after values
are kept.
**Source:** PL 4.6 · **Status:** Confirmed · **Phase:** V1

### TIME-009 Approving a pay period locks it
**Rule:** the Owner approves a pay period. Entries in an approved period can't be changed unless the
period is reopened, which is audited.
**Source:** PL 4.7 · **Status:** Confirmed (lock Proposed; period length is D-C12) · **Phase:** V1

### TIME-010 Payroll export uses approved periods only
**Rule:** the payroll CSV and printout include only approved periods, showing hours by employee and
date with totals. No wages are calculated.
**Source:** PL 4.11 · **Status:** Confirmed · **Phase:** V1

### TIME-011 Job time feeds costing, never charges
**Rule:** time logged to a job is used for costing and expected-versus-actual. It never adds a charge
to an invoice and never changes an agreed package price.
**Source:** PL 4.4, 7.1, 9.35 · **Status:** Confirmed · **Phase:** V1

### TIME-012 Time precision
**Rule:** entries are stored to the second. Hours are shown to two decimals. No rounding to quarter
hours.
**Status:** Proposed · **Phase:** V1

### TIME-013 Timers left running are flagged
**Rule:** a timer or punch still running after 12 hours is flagged in timesheet review. It isn't
stopped automatically.
**Status:** Proposed · **Phase:** V1

### TIME-014 No time on closed or canceled jobs
**Rule:** a timer can't be started on a closed or canceled job.
**Status:** Inferred · **Phase:** V1

---

## 8. Materials, vendors and purchase orders (PUR)

### PUR-001 Catalog materials
**Rule:** a catalog material has a name, unit of measure, default cost, default selling price, and
an optional preferred vendor. Selling prices are entered by hand; there is no automatic markup in V1.
**Source:** PL 2.4 · **Status:** Confirmed · **Phase:** V1

### PUR-002 Vendors
**Rule:** a vendor has a name and business contact details. Payment terms and tax-exempt status are
recorded but used by nothing in V1.
**Source:** PL 3.17; DBF (vendors carry terms and exempt status) · **Status:** Confirmed ·
**Phase:** V1

### PUR-003 PO lines and charge lines
**Rule:** a PO belongs to one vendor and has material lines (catalog or custom: quantity and unit
price) and charge lines (shipping, freight and similar: description and amount).
**Source:** PL 3.12, 3.33 · **Status:** Confirmed · **Phase:** V1

### PUR-004 PO status
**Rule:** Draft → Issued → Received, or Canceled. Receiving is all-or-nothing for the whole PO.
**Source:** PL 3.12 · **Status:** Confirmed (Canceled Proposed) · **Phase:** V1

### PUR-005 Only unreceived POs can be edited
**Rule:** Draft and Issued POs can be edited, including adding lines. A Received or Canceled PO is
locked.
**Source:** PL 3.14 · **Status:** Confirmed (lock Inferred) · **Phase:** V1

### PUR-006 Use Last Cost
**Rule:** when a PO is marked received, each catalog material line sets that material's default
cost to the line's unit price. Charge lines and custom lines never change any cost. If one PO has
several lines for the same material, the material takes their quantity-weighted average.
**Examples:**
- Given vinyl's default cost is $2.50, when a PO with vinyl at $2.80 is received, then vinyl's
  default cost is $2.80.
- Given a PO with $45.00 freight, when it is received, then no material cost changes because of
  the freight.
- Given an issued PO with vinyl at $2.80 that is not yet received, vinyl's cost is still $2.50.
**Source:** PL 3.16, 3.33 · **Status:** Confirmed (weighted average Proposed) · **Phase:** V1

### PUR-007 Units of measure must match
**Rule:** open. The debrief notes vinyl is **ordered** and **sold** as two different part records in
FullBay (e.g. by the roll and by the sq ft). Use Last Cost only works if units match or convert.
**Source:** DBF (Parts) · **Status:** Decision needed (D-C13) · **Phase:** V1

### PUR-008 Manual cost corrections
**Rule:** a user with `catalog.edit` can correct a default cost by hand. It's audited.
**Source:** PL 3.16 · **Status:** Confirmed · **Phase:** V1

### PUR-009 Receiving never changes stock
**Rule:** V1 has no stock quantities. Receiving changes costs only.
**Source:** PL 3.2, 3.12 · **Status:** Confirmed · **Phase:** V1

### PUR-010 POs go out as PDFs
**Rule:** a PO produces a PDF for manual sending. Marking it issued records who and when. Editing
an issued PO allows exporting an updated PDF.
**Source:** PL 3.12, 3.14 · **Status:** Confirmed · **Phase:** V1

---

## 9. Invoicing (INV)

### INV-001 A draft invoice copies authorized lines
**Rule:** the draft invoice created on close (JOB-009) contains one invoice line per authorized
customer line, at its authorized price and description. Components are not copied to the customer
document (they stay on the job for costing).
**Source:** PL 7.1, 1.21 · **Status:** Confirmed · **Phase:** V1

### INV-002 Drafts can be edited before finalizing
**Rule:** a user with `invoice.edit` can edit a draft: add custom lines (storage, shipping,
restocking and similar), edit lines, and set the PO/reference number. Changes to authorized lines'
prices are audited.
**Source:** PL 1.17, 3.33, 1.13 · **Status:** Confirmed (price-change audit Proposed) · **Phase:** V1

### INV-003 A finalized invoice never changes
**Rule:** finalizing assigns the invoice number, invoice date and due date, and freezes every line,
tax amount and total exactly as issued. Afterwards only payments, refunds and voiding affect it.
A mistake is fixed by voiding and issuing a new invoice (credit memos are Later).
**Example:** Given an invoice finalized with 6% tax, when the tax setting later changes to 6.5%,
then the finalized invoice still shows 6%.
**Source:** PL 7.17; STD · **Status:** Proposed (void-and-reissue) · **Phase:** V1

### INV-004 Invoice numbers
**Rule:** invoice numbers carry the OTC prefix and are unique across new invoices, migrated FullBay
invoices and invoices already in QuickBooks. A number is assigned at finalization, never to a
draft. Numbers are sequential and never reused, including after a void. The starting number is set
before launch and must be above every existing number.
**Source:** PL 7.17, 7.18; G14 · **Status:** Confirmed (assign-at-finalize Proposed; format and
start are D-A2) · **Phase:** V1

### INV-005 Due date
**Rule:** due date = invoice date + the customer's terms (CUST-005).
**Example:** finalized Mar 1 for a Net 30 customer → due Mar 31.
**Source:** DBF · **Status:** Inferred · **Phase:** V1

### INV-006 Invoice arithmetic
**Rule:** subtotal = the sum of line amounts. Tax per INV-007. Total = subtotal + tax. Balance due =
total − applied deposits − payments + refunds. Balance due is never stored; it's computed.
**Example:** subtotal $2,500.00, tax $150.00, total $2,650.00, deposit applied $1,250.00, card
payment $1,000.00 → balance due $400.00.
**Source:** PL 7.5, 7.19 · **Status:** Inferred · **Phase:** V1

### INV-007 Sales tax
**Rule:** open, and it **must not be guessed**. Needed: the rates, which line types are taxable
(materials, design, installation labor), how a rolled-up package line that mixes them is taxed, and
how exemptions apply.
**Source:** PL 7.23; G10 · **Status:** Decision needed (D-T1, accounting) · **Phase:** V1
> This blocks the shape of EST-003 and INV-001, not just the rate: one rolled-up line can carry only
> one tax treatment. Answer before the invoice layout is built.

### INV-008 Other unpaid invoices on each invoice
**Rule:** an invoice document lists every **other** finalized, unvoided invoice of the same customer
with a balance above zero, overdue or not. It shows number, due date and remaining balance, and a
total of those balances, clearly separate from this invoice's amount due. The current invoice is
never in the list. The section is hidden when the list is empty. Balances are as of when the
document is generated, and that date is printed.
**Example:** Given the customer has OTC-1001 ($400 open, overdue), OTC-1005 ($0, paid) and OTC-1007
($1,200 open, not yet due), the OTC-1007 document lists only OTC-1001 ($400), with "other unpaid
total $400.00."
**Source:** PL 7.13 · **Status:** Confirmed (as-of date Proposed) · **Phase:** V1

### INV-009 References print on the invoice
**Rule:** if a PO or authorization reference number is entered on the job or invoice, it prints on
the invoice. Neither is required.
**Source:** PL 1.13 · **Status:** Confirmed · **Phase:** V1

### INV-010 Invoice status is derived
**Rule:** Draft → Open → Partially paid → Paid, derived from balance due. Void is separate. Overdue
is Open or Partially paid past the due date. Status is computed, not set by hand.
**Status:** Proposed · **Phase:** V1

### INV-011 One final invoice per billable job
**Rule:** a billable job has exactly one invoice (plus any replacements after a void). There is no
progress billing in V1; deposits handle up-front money.
**Source:** PL 7.5 ("apply them to the job's final invoice") · **Status:** Inferred · **Phase:** V1

### INV-012 Voiding
**Rule:** a user with `invoice.void` can void a finalized invoice with a required reason, only if
it has no net payments (payments minus refunds) applied. Deposits applied to it return to the job,
unapplied.
**Status:** Proposed · **Phase:** V1

---

## 10. Payments, deposits and refunds (PAY)

### PAY-001 When a deposit is required
**Rule:** a deposit is required when the customer has no credit account (CUST-006), or when the
job is over $5,000.
**Open parts:** "over $5,000" of what (authorized lines before tax, or the total with tax), and is it
a warning or a hard block on starting production?
**Source:** DBF (Credit and terms); MTG 00:30:55 · **Status:** Confirmed (threshold); Decision
needed for basis and enforcement (D-C14) · **Phase:** V1

### PAY-002 Deposit amount
**Rule:** open. The FullBay workaround was a "50% deposit" part, which suggests 50%, but nobody has
said it is always 50%.
**Source:** MTG 00:31:43 · **Status:** Decision needed (D-C14) · **Phase:** V1

### PAY-003 Deposits belong to a job
**Rule:** a deposit is recorded against a job, with amount, method, reference and date. In V1 it's
recorded after being collected elsewhere, unless D-C15 adds collection by link.
**Source:** PL 7.5; G6; V1 Alignment 4.3 · **Status:** Confirmed (pending D-C15) · **Phase:** V1

### PAY-004 Deposits apply to the final invoice automatically
**Rule:** when a job's invoice is finalized, all of the job's unapplied deposits are applied to it.
**Example:** Given a $1,250.00 deposit on J-1042, when its $2,650.00 invoice is finalized, the
balance due is $1,400.00.
**Source:** PL 7.5 · **Status:** Confirmed · **Phase:** V1
> **Open:** what happens if deposits exceed the invoice total (e.g. a line declined after the
> deposit was taken)? Credits are Later, so this is a refund or a manual hold. D-C16.

### PAY-005 Card payments are provider-hosted
**Rule:** each finalized invoice can produce a payment link from the card provider. Card numbers
never touch the app. A card payment applies to one invoice only.
**Source:** PL 7.6, 8.12; DBF (R5) · **Status:** Confirmed · **Phase:** V1

### PAY-006 Provider payments post themselves, exactly once
**Rule:** a successful provider payment updates the invoice automatically. A repeated notification
for the same provider transaction never records a second payment.
**Example:** Given the provider sends the same "payment succeeded" event twice, the invoice has one
payment.
**Source:** PL 7.19 · **Status:** Confirmed · **Phase:** V1

### PAY-007 Partial payments are allowed
**Source:** PL 7.19 · **Status:** Confirmed · **Phase:** V1

### PAY-008 Manual payments can cover several invoices
**Rule:** a payment collected elsewhere (check, ACH, cash) is recorded with method, reference and
date, and can be split across several of the same customer's invoices. The split amounts must add
up to the payment amount exactly.
**Example:** a $3,000.00 check split $1,200.00 to OTC-1001 and $1,800.00 to OTC-1007 is accepted. A
split of $1,200.00 + $1,700.00 is refused.
**Source:** PL 7.19; DBF (R5: "a single check can be applied across many invoices") ·
**Status:** Confirmed · **Phase:** V1

### PAY-009 No overpayment
**Rule:** a manual payment can't exceed the invoice's balance due. A payment link always asks for
the current balance due.
**Status:** Proposed · **Phase:** V1

### PAY-010 Refunds are recorded, not executed
**Rule:** refunds are done in the provider's dashboard, then recorded in the app against the
original payment. Total refunds on a payment can't exceed that payment.
**Source:** PL 7.15 · **Status:** Confirmed (cap Inferred) · **Phase:** V1

### PAY-011 The 3% card surcharge
**Rule:** open. OTC passes a 3% surcharge to card payers today. Not mentioned in the punch list.
Needs: does V1 add it, does it appear on the invoice or only at checkout, and how does it reach
QuickBooks? Surcharging also has card-network and state rules that accounting should confirm.
**Source:** DBF (Payments: "3% card surcharge passed through") · **Status:** Decision needed
(D-A3) · **Phase:** V1

---

## 11. QuickBooks Online (QBO)

**Most of this section is waiting on one conversation** with Cam and the bookkeeper (V1 Alignment
4.5, PL 7.24 says the rules must be defined "before implementation").

### QBO-001 Which system owns which record
**Rule:** open. Proposed default: the app owns customers it creates, invoices and deposits; payments
can originate in either system; QuickBooks owns nothing else that the app reads.
**Source:** PL 7.24, 11.3 · **Status:** Decision needed (D-A4) · **Phase:** V1

### QBO-002 Invoices go to QuickBooks on finalize
**Rule:** finalizing an invoice sends it to QuickBooks with the same invoice number, lines as they
appear to the customer, and the Graphics class.
**Source:** PL 7.24; V1 Alignment §1 (graphics has its own class) · **Status:** Proposed ·
**Phase:** V1

### QBO-003 Payments made in QuickBooks come back
**Rule:** a payment recorded in QuickBooks against an app-originated invoice appears in the app and
updates the balance.
**Source:** PL 7.24 · **Status:** Confirmed · **Phase:** V1

### QBO-004 No duplicates
**Rule:** every synced record stores its QuickBooks ID. Syncing the same record again updates it and
never creates a second one. A payment recorded in both systems (e.g. manually in the app and in
QuickBooks) must be caught before it is counted twice.
**Source:** PL 7.24 · **Status:** Confirmed (how to detect double entry is D-A4) · **Phase:** V1

### QBO-005 Matching existing QuickBooks customers
**Rule:** open. Graphics customers already exist in QuickBooks from the FullBay sync. Proposed:
link each app customer to its existing QuickBooks customer once, by hand, at setup.
**Status:** Decision needed (D-A4) · **Phase:** V1

### QBO-006 Edits made in QuickBooks
**Rule:** open. What happens if someone edits a finalized invoice inside QuickBooks?
**Status:** Decision needed (D-A4) · **Phase:** V1

---

## 12. Reports (RPT)

### RPT-001 Every report exports and prints
**Rule:** each of the ten V1 reports exports to CSV and has a printable view. Reports with financial
figures need a financial-view permission (Owner in V1).
**Source:** PL 9.39 · **Status:** Confirmed · **Phase:** V1

### RPT-002 Revenue means invoiced, not collected
**Rule:** open. Revenue = finalized, unvoided invoices by invoice date, kept separate from cash
received. Before or after tax? Including or excluding deposits?
**Source:** PL 9.2 ("reconcile definition with accounting") · **Status:** Decision needed (D-A5) ·
**Phase:** V1

### RPT-003 A/R aging buckets
**Rule:** open balances grouped by days past due: Current, 1–30, 31–60, 61–90, 90+, by customer.
**Source:** PL 9.1 · **Status:** Proposed (buckets) · **Phase:** V1

### RPT-004 Ready to Invoice
**Rule:** closed billable jobs whose invoice is still a draft. Internal and warranty jobs never
appear.
**Source:** PL 9.3 · **Status:** Confirmed · **Phase:** V1

### RPT-005 What work in progress means
**Rule:** open. Proposed: jobs in Production Complete or Ready for Installation, i.e. printed material
waiting to be installed.
**Source:** PL 9.18, 9.20; G9; V1 Alignment 4.7 · **Status:** Decision needed (D-C17) · **Phase:** V1

### RPT-006 Clocked hours and job hours are never added together
**Source:** PL 9.32, 9.37 · **Status:** Confirmed · **Phase:** V1

### RPT-007 Expected versus actual
**Rule:** per job, expected hours (EST-011) next to actual job-timer hours, with the difference.
**Source:** PL 2.3, 9.37 · **Status:** Confirmed · **Phase:** V1

---

## 13. Migration and cutover (MIG)

### MIG-001 What migrates
**Rule:** graphics customers with open work, open estimates and jobs, and unpaid invoices with their
balances. History stays readable in FullBay.
**Source:** PL 11.2 · **Status:** Confirmed · **Phase:** V1

### MIG-002 Migrated invoices keep their FullBay numbers
**Rule:** a migrated invoice keeps its original number, is marked migrated, and is linked to the
QuickBooks record that already exists rather than being sent again.
**Source:** G14 · **Status:** Proposed · **Phase:** V1

### MIG-003 Cutover criterion
**Rule:** graphics is live when Cam runs one full month of graphics billing in the new system without
falling back to FullBay.
**Source:** G15; V1 Alignment 4.9 · **Status:** Proposed · **Phase:** V1

---

## 14. Later rules that shape V1's data

Not built in V1. Listed because V1's schema must not make them hard. Each is a one-line constraint
for whoever designs the tables.

| ID | Later rule | What it means for V1's data |
|---|---|---|
| FUT-001 | Office, Manager, Accounting roles; per-user Inherit / Allow / Deny overrides; Office never sees pay rates (PL 0.2, 0.4) | Permissions as data (PLAT-008); wage data separately permissioned |
| FUT-002 | Graphics, Mechanical and Mobile departments with a switcher (PL 1.23) | Department on every record (PLAT-006) |
| FUT-003 | Parent customers with departments; contacts across several customers (G5) | Parent column now (CUST-002); contacts not owned by one customer only |
| FUT-004 | Mechanical service orders with Action Items: Concern / Cause / Correction, each with parts and labor (PL 1.4) | Customer line + components must generalize to Action Item + part and labor lines |
| FUT-005 | Live stock per location; templates deduct stock (PL 1.21, 3.x) | Catalog material IDs stable; components keep a catalog reference |
| FUT-006 | Soft delete and restore of jobs, preserving financials (PL 1.10) | Financial records never cascade from a job delete |
| FUT-007 | Portal approvals and approval links (PL 2.5) | Approval method is open-ended; approver may be a customer contact record |
| FUT-008 | Customer standing spending thresholds (PL 2.11) | Approval method can be `threshold` |
| FUT-009 | Sublet: vendor cost with markup (PL 1.14) | A component type can be added without reshaping lines |
| FUT-010 | Meter readings, PM schedules on units and unit types (PL 1.16, 5.x) | Assets are real records (CUST-003) |
| FUT-011 | Customer credit memos applied across invoices (PL 7.14) | Balance is computed from applications, not a stored field |
| FUT-012 | GoHighLevel creates draft estimates, never sends them (PL 1.5) | External IDs on customer and job (PLAT-007) |

---

## 15. Decisions needed

Grouped by who answers. Each references the rules it unblocks.

### For Cam (when he's back)

| # | Question | Rules |
|---|---|---|
| D-C1 | Should Jason see **selling prices** on jobs and customer documents, or only scope? | ROLE-006 |
| D-C2 | Can Jason move cards on the board, or change priority? | ROLE-008 |
| D-C3 | Does every job need an asset (vehicle, sign, wall), or can it be just a description? Can one job cover several vehicles? | CUST-003 |
| D-C4 | When you price a wrap, do you add up the materials and labor, or set a package price and fill in the materials behind it? | EST-003 |
| D-C5 | For job costing, what labor cost per hour should we use: one shop rate, or each person's rate? | EST-005 |
| D-C6 | Do estimates expire? | EST-013 |
| D-C7 | Walk us through a real proof cycle: files, revisions, who signs off | AUTH-010 |
| D-C8 | Do you want a one-click approve link on the emailed estimate? (Alignment 4.2) | AUTH-011 |
| D-C9 | What goes on the condition and quality checklists, and must they be done before work is finished? | JOB-008, JOB-017 |
| D-C10 | Should you be able to reopen a closed job? | JOB-010 |
| D-C11 | Can someone run a job timer without being punched in? | TIME-004 |
| D-C12 | Pay period: weekly or every two weeks, and what day does it start? | TIME-009 |
| D-C13 | Vinyl ordered by the roll and sold by the foot: how should cost carry over? | PUR-007 |
| D-C14 | Deposits: 50% always? "Over $5,000" before or after tax? Warning, or block production until paid? | PAY-001, PAY-002 |
| D-C15 | Collect deposits by card link? (Alignment 4.3) | PAY-003 |
| D-C16 | If a deposit ends up bigger than the final invoice, refund it or hold it? | PAY-004 |
| D-C17 | What should work in progress show you? (Alignment 4.7) | RPT-005 |
| D-C18 | If a company uses both graphics and the Lancaster shop, is it one customer in FullBay or two? Roughly how many graphics customers also use the shops? Is it the same in QuickBooks? | PLAT-006, QBO-005, MIG-001 |

### For accounting

| # | Question | Rules |
|---|---|---|
| D-T1 | Sales tax rates, and what is taxable: materials, design, installation labor | INV-007 |
| D-T2 | How tax-exempt customers are recorded and evidenced | CUST-008 |
| D-A1 | Rounding: per line or per invoice? Match a real FullBay invoice | PLAT-002 |
| D-A2 | Current invoice number, format and prefix | INV-004 |
| D-A3 | The 3% card surcharge: on the invoice, at checkout only, and how it is booked | PAY-011 |
| D-A4 | QuickBooks: who owns what, matching existing customers, edits made in QuickBooks, catching double-entered payments | QBO-001, -004, -005, -006 |
| D-A5 | What "revenue" means on the revenue report | RPT-002 |

### Proposed defaults Cam should glance at

Everything marked **Proposed** above gets built as written unless someone objects. The ones most
worth a look: AUTH-007 (what counts as changing an approved line), JOB-006 (no production without
authorized scope), JOB-007 (finished moves the card to Completed), JOB-011 (no canceling after
invoicing), INV-003 (void and reissue instead of editing), and PUR-006 (weighted average cost).

---

## 16. Coverage of this draft

Counted by each rule's leading status. Many Confirmed rules carry a smaller Proposed or Inferred
detail in brackets; those details are what Cam should skim.

| Section | Rules | Confirmed | Inferred | Proposed | Decision needed |
|---|---|---|---|---|---|
| PLAT Cross-cutting | 9 | 7 | 0 | 1 | 1 |
| ROLE Roles and access | 9 | 6 | 0 | 1 | 2 |
| CUST Customers and assets | 8 | 3 | 1 | 3 | 1 |
| EST Estimates | 13 | 9 | 1 | 0 | 3 |
| AUTH Approval | 11 | 9 | 0 | 1 | 1 |
| JOB Jobs, board, schedule | 18 | 12 | 1 | 3 | 2 |
| TIME Time and payroll | 14 | 9 | 1 | 3 | 1 |
| PUR Materials and POs | 10 | 9 | 0 | 0 | 1 |
| INV Invoicing | 12 | 5 | 3 | 3 | 1 |
| PAY Payments and deposits | 11 | 8 | 0 | 1 | 2 |
| QBO QuickBooks | 6 | 2 | 0 | 1 | 3 |
| RPT Reports | 7 | 4 | 0 | 1 | 2 |
| MIG Migration | 3 | 1 | 0 | 2 | 0 |
| **Total** | **131** | **84** | **7** | **20** | **20** |

Plus 12 Later constraints (§14) and 25 questions (§15).

**Where the risk sits:** the Decision-needed rules cluster in money: tax, rounding, deposits,
surcharge, QuickBooks. Those are also the rules hardest to change after invoices exist. Workflow
and permissions are mostly Confirmed, because Cam's notes were precise about them.

## Change log

| Date | Change |
|---|---|
| 2026-10-31 | First draft. Mined from Cam's punch-list notes, the 10/23 debrief, V1 Vision and Gaps, V1 Alignment, Domain Model and Code Standards. No new FullBay access. |
| 2026-10-31 | PLAT-006 reworded: shared customers is our design choice, and evidence suggests FullBay keeps customers per shop. Added D-C18. |

## Related

- [[Domain Model]] — entities and relationships these rules act on
- [[V1 Vision and Gaps]] · [[V1 Alignment]] · [[V1 Scope from Punch List]]
- [[Testing Strategy]] — how rules become tests
- [[PRD]] — will reference rules by ID rather than restating them
