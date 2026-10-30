---
created: 2026-10-29
tags: [fleetco, otc, v1, alignment, client-facing]
status: draft for Dave to send to Dan and Cameron
audience: OTC (Dan and Cameron). Business readers, not engineers.
source: Claude Code (Xerro), from [[V1 Scope from Punch List]] and [[V1 Vision and Gaps]]
---

**To:** Dan, Cameron
**From:** Dave
**Date:** October 29, 2026

---

## Why you're reading this

This is what I believe we agreed V1 will be, based on our October 23 walkthrough and Cam's
completed punch list. Read it and tell me where I have it wrong.

Section 4 is the part that needs your answers. Nothing here commits to a date or a price yet, and
section 6 explains what has to close first.

## 1. What V1 is

**A new internal system that runs OTC Fleet Graphix end to end, so graphics can stop using FullBay
completely.**

Cam quotes a job, the customer approves it, the job gets scheduled and worked, time and material
costs land against it, and it goes out as an invoice the customer can pay by card. Two users to
start, Cam and Jason. The Lancaster, mobile and postal shops are not touched and stay on FullBay.

Why graphics first: it has its own installer, its own material shelf, and its own class in
QuickBooks. That means it can move off FullBay without disrupting the rest of the company. It also
runs the same basic loop the shops do, so what works for graphics becomes the foundation for the
shops later.

**How we will know it worked.** Cam runs a full month of graphics work in the new system, invoices
it, gets paid, and closes the books with accounting, without going back to FullBay once.

## 2. What V1 delivers

**Jobs and scheduling**
- Job records with scope, photos, files, assignments and notes
- A production and installation board, six stages from ready for production through completed
- A scheduling calendar with separate production and installation dates
- A review step before closing. Jason attaches completion photos, Cam reviews and closes the job

**Estimates**
- Graphics estimates built from the full material list, itemized while you work on them
- **One high-level line per vehicle on the customer's invoice.** The inks, vinyl, laminate, solvents
  and everything else roll up underneath it. You see every component and the customer sees the
  package and the price
- Reusable groups, so a job like a two door wrap can be added in one step and pull in all its
  materials
- Partial approval, so a customer can accept some items and decline others
- A record of who approved, when, and how

**Materials and purchasing**
- A material catalog with your costs and selling prices
- Vendor purchase orders as PDFs, with receiving and automatic cost updates
- No live stock counts. See section 3

**Time and payroll**
- A daily punch clock for attendance, separate from job time
- Job timers, one at a time, so hours cannot be double counted
- Shop and admin time tracked separately from billable job time
- Cam reviews and approves timesheets, then exports hours for payroll

**Invoicing and payments**
- A draft invoice created automatically when a job closes, for Cam to review before it goes out
- Card payment by link, with invoice balances updating on their own
- Each invoice lists that customer's other unpaid invoices
- Deposits applied against the final invoice
- A QuickBooks Online connection

**Reports**
- Ten reports: accounts receivable aging, revenue, ready to invoice, payments, work in progress
  (two views), clocked hours, job hours, and timesheets. All of them export to a spreadsheet and
  print

**Access and devices**
- Two roles. Cam sees everything. Jason sees only his assigned jobs, and no costs, markup or profit
- Works in a browser on phones and iPads, saved to the home screen. Nothing to download

## 3. What V1 does not deliver

Being explicit here on purpose. This list is what protects the schedule.

| Not in V1 | Why |
|---|---|
| Customer portal and customer logins | Deferred on the punch list. Needs confirming, see 4.1 |
| Live inventory and stock counts | Cam tracks materials by eye today and confirmed we can launch without it |
| The repair shops (Lancaster, mobile, postal) | Graphics first. The shops are a separate and much larger phase |
| Preventive maintenance, inspections, DVIR | Mechanical work, not graphics |
| Labor guides (MOTOR, Mitchell 1), VMRS coding | Mechanical reference data |
| Vendor portal, vendor payments, parts marketplaces | No vendor uses FullBay's portal today |
| A phone app from the app store | Browser app instead, saved to the home screen |
| Switching between shops or departments | One department at launch |
| ACH payments | Card link at launch. Checks and ACH recorded by hand |
| Ten years of history | Open work moves over. FullBay stays readable for history |
| GoHighLevel integration | GoHighLevel stays as it is. Approved work gets typed in by hand |
| Fleet management features, QR driver reports, insurance tracking | Those live in myOTCFleet and stay there |

## 4. Open items that need your answers

These are places where the meeting and the punch list point in different directions, or where
nobody has decided yet. Each one changes what gets built, so I would rather settle them now than
guess.

**4.1 Customer portal.** The punch list defers it. In the meeting Cam said he wanted one for
graphics. I think deferring is reasonable, but be clear on the tradeoff: graphics customers lose the
FullBay portal they use to pay invoices today, and get an emailed invoice with a payment link
instead. Confirm that is acceptable.

**4.2 Estimate approval.** With no portal, every approval becomes Cam recording that the customer
said yes. FullBay at least emails an approve or decline link today, and the customer's own click is
the record. I would like to add a one-click approve link to the emailed estimate. No login, no
portal, small amount of work. Do you want it?

**4.3 Deposits.** The punch list has us recording deposits collected elsewhere. Card payments are
already in V1, so collecting a deposit by link is nearly free, and this was Cam's loudest complaint
about FullBay. Confirm you want it.

**4.4 Design proofs.** Nothing in V1 covers artwork approval or revisions, and it is the heart of
the graphics business. FullBay has no feature for it, so it never came up as a question. Cam, walk
me through a real proof cycle. Where does artwork live, how many revisions is typical, and should
the job record which version the customer approved?

**4.5 QuickBooks.** The punch list requires a two-way connection in V1 and rules out hand entry.
That is the single largest piece of work on the list, and the riskiest, because two systems editing
the same invoices and payments has to be got exactly right. A simpler version, where the new system
sends invoices to QuickBooks and owns payments itself, would cut real time and risk. Worth a
conversation before we commit to the full version.

**4.6 Signs and walls.** Graphics works on things that are not vehicles, and in FullBay you create a
fake vehicle called "sign" to get around it. Confirm we track those properly, as a customer asset
with a type, so this stops being a workaround.

**4.7 Work in progress.** Two work in progress reports are in V1 and nobody has defined what counts.
My guess is printed material sitting on the rack for a job that is not installed yet, because that is
real money in the building. Tell me if that is what you want to see.

**4.8 Switchover data entry.** Open jobs and unpaid invoices get typed into the new system by hand,
probably a few dozen records. Who does that, and when? This is small but it is the kind of task that
quietly delays a launch.

**4.9 What done means.** I would propose this as the bar for calling graphics live: one full month
of graphics billing in the new system with no falling back to FullBay. Agreed?

## 5. What we need from accounting

Three answers I cannot guess at. All three block going live rather than development, so earlier is
better.

1. **Sales tax.** Current rates and what is taxable. Design and labor may be treated differently
   from materials, and I do not want to guess at tax.
2. **Invoice numbering.** The current invoice number and format, so the new system does not collide
   with FullBay's numbering or with records already in QuickBooks.
3. **Card processing.** Whether FullBay handles your card payments today, and what the fees are.

## 6. What is not settled on my side

- **No date yet.** I am not going to give you one built on open items and an unverified data export.
  A date that moves costs more trust than it buys. Once section 4 closes and we have tested a sample
  export, a date becomes a real number.
- **No price yet.** Compensation is the one thing Cam and I could not settle without Dan. I have a
  structure in mind, an upfront project fee plus a monthly retainer that scales down as Cam takes
  over the day to day. Worth an hour with the three of us.
- **FullBay data export.** Cam is asking his contact about a full export. Useful news: graphics is in
  its first year, so V1 most likely does not need history moved at all. The export matters much more
  for the shops later.
- **Support.** Early on that is me. The plan is to get Cam able to handle first line support once
  graphics is running, with automated monitoring from the start. Worth agreeing on expectations when
  we talk about terms.

## In short

Graphics comes off FullBay completely, on a system built around how you actually work, with two
people using it and no risk to the shops.

Seven of the nine items in section 4 are small decisions. Two of them, the portal and QuickBooks,
change the size of the job meaningfully. Answer those and I can give you a real plan.

---

## Internal notes (remove before sending)

- Sources: [[V1 Scope from Punch List]] (the 62 V1 items) and [[V1 Vision and Gaps]] (the 15 gaps
  with provenance). Section 4 maps to the type B, C and D gaps; type A gaps that only need accounting
  became section 5.
- **Deliberately left out:** the $5,000 per month figure, any hourly rate, any timeline, and item
  counts. The FullBay number is still unverified ($45 per user per month does not reach $5,000 at 20
  technicians) and should not appear in writing until an invoice is seen.
- **Gaps not surfaced to OTC** because they are Dave's to decide: G5 customer hierarchy in the
  schema, G8 whether the board or the calendar owns dates, G12 duplicate customers from manual
  GoHighLevel entry, G13 photo upload behavior on shop wifi. All tracked in [[V1 Vision and Gaps]].
- Dan has not been in a meeting yet, so section 1 doubles as his first briefing. Keep it that way.
- **G7 closed 2026-10-29 by Dave**, so the invoice layout question came out of section 4 and became
  a delivered feature under Estimates. Estimate itemized, invoice rolled up. The mechanism (reusable
  material groups vs. a per-item display flag) is spec work, not a question for Cameron. Note for the
  spec: tax (section 5 item 1) has to be answered **before** the roll-up is built, because one
  collapsed line can only carry one tax treatment.
