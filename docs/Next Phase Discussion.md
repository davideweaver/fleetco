---
created: 2026-10-11
tags: [fleetco, planning, discussion, m1, meeting]
source: Claude Code (Xerro)
status: draft for Dave's next Fleetco meeting — M1 deliverable
audience: Fleetco (business readers, not engineers)
---

## Purpose

Discussion notes for the next Fleetco meeting. Plain language on four things: what we found when
we looked closely at both systems, what that means for how a migration can actually work, what
can realistically get stood up over the next few months, and the decisions only Fleetco can make.

This is the [[Roadmap]] **M1** deliverable. Nothing here is a commitment — it is a shared picture
to argue with.

> **⚠️ Partly superseded 2026-10-28** by the 2026-10-23 walkthrough — see
> [[2026-10-23 Cameron Walkthrough Debrief]].
>
> - **§1 "A one-customer pilot does not actually work"** was right about *customers* and is now
>   moot in practice. Cameron proposed piloting the **graphics department** instead. Graphics has
>   its own installer, its own parts shelf, and its own QuickBooks class, so the shared-resource
>   trap mostly doesn't apply. Read §1 as the reason the pilot is a *department*.
> - **§2 "The Fork"** is effectively decided: Cameron wants Option B, starting with graphics, and
>   wants the portal's backend moved onto the new platform. The A/B framing still belongs in the
>   Dan conversation, because Dan hasn't heard it.
> - **§4's 90-day shape** still holds, except the export spike is no longer the top risk for V1 —
>   graphics is in its first year and almost certainly starts fresh.
> - **§5's decision list** is partly answered. Q19–Q22 in [[Open Questions]] are the live ones now,
>   plus compensation.

---

## 1. What We Learned

Three findings, in order of how much they change the plan.

### The new app is a customer portal, not a FullBay replacement

Cam's app is better built than anyone expected — a real database design, a proper permission
system, and a genuinely good customer experience. But it does not contain the repair shop. There
is nothing in it for work orders, technicians, labor time, parts, inventory, or building an
estimate. The repair still happens in FullBay; the app shows the customer what FullBay decided and
collects their approval.

That matters because FullBay's bill is for shop operations. The app, as good as it is, replaces
roughly none of that. It replaces the part FullBay does worst — the customer portal — and does it
better.

### FullBay's API gives you invoices and nothing else

Confirmed from both sides now. Fleetco said the API only exposes invoice detail; the integration
code proves it. Seven endpoints were tried — customers, units, service orders, invoices,
preventive maintenance, PM schedules — and only invoices answers usefully.

Two consequences follow:

- **Vehicle lists have to be guessed from invoice history.** The app's unit importer scans up to
  two years of invoices and infers which trucks exist from the ones that show up. A truck not
  serviced inside that window is invisible to it.
- **There is no way to write anything back into FullBay.** The one attempt replays FullBay's
  public web request form, and it was switched off because every submission creates a brand-new
  FullBay customer instead of matching the real one.

### A one-customer pilot does not actually work

This is the finding that changes the plan most, and it was not obvious until we worked through it.

The plan has been to move one smaller customer onto the new system as a proof of concept. Moving
one customer's *data* is fine. The problem is that their work still flows through things the whole
shop shares:

| Shared thing | What breaks |
|---|---|
| **Technicians** | A tech would clock into FullBay for one customer's truck and the new system for another. Only one of those numbers can feed payroll. |
| **Parts inventory** | Parts come off one physical shelf. Two systems each counting their own stock means neither count is true within a week. |
| **Accounting** | QuickBooks reconciles one set of invoices. Two sources into one ledger and month-end stops closing. |

So the pilot does not avoid running two systems — it moves the problem from "which customer" to
"which technician, which shelf, which ledger," where it is harder to see and harder to live with.

**The honest conclusion: replacing the shop system is all-or-nothing.** All customers, every role,
one cutover. There is no gradual ramp.

---

## 2. The Fork

Knowing that, this is really two different projects. They are not phases of one thing, and there
is no gentle path from the first to the second.

### Option A — Deepen the portal

FullBay stays the shop system. We make the customer side excellent and expand what the fleet
customer can do for themselves.

- **Risk:** low. Each piece ships on its own and nothing breaks if we stop.
- **Timeline:** useful improvements in weeks, not quarters.
- **What it does to the bill:** nothing. FullBay keeps getting paid.
- **What you get:** the best customer portal in the industry for this trade, plus compliance and
  driver-reporting features FullBay does not offer at all.

### Option B — Replace the shop system

Build work orders, estimating, parts, inventory, labor and technician time, then cut the whole
shop over in one move.

- **Risk:** high, and concentrated on a single date.
- **Timeline:** cannot be honestly dated until we know what FullBay will let us export. The scale
  is quarters-to-years, not weeks.
- **What it does to the bill:** eliminates it, eventually.
- **The hard part is not the database.** It is the depth of the screens. FullBay's service order
  page alone has 13 tabs and 7 view modes; there are 38 built-in reports and 68 help articles just
  on parts. That depth came from years of real users asking for things, and it is what makes the
  software usable rather than merely correct.

### A note worth sitting with

If you ask what could be built *without* touching technicians, parts, or the ledger, the answer is:
service requests, estimate approval, status visibility, driver-reported issues, compliance
tracking, and invoice presentment.

That is almost exactly what Cam already built. They found the furthest you can get without a full
migration. That is a much better reason to respect their work than how it looks.

---

## 3. What Can Be Stood Up, and What Cannot

### Can be stood up in the next few months

These are real, shippable, and valuable **on either path** — which makes them a no-regret first
move while the bigger decision gets made.

| Work | Why it matters |
|---|---|
| **Security hardening of the portal** | There are roughly 200 data-access rules protecting each customer's information and no automated tests behind them. This is the highest-priority item in the codebase. One customer seeing another's data is not a bug you recover from. |
| **Fix the staff impersonation mechanism** | When OTC staff "open" a customer's account, the system temporarily changes that staff member's company. It works, but an interrupted session can leave someone pointed at the wrong customer. |
| **Close the fleet-group gaps** | Departments inside a large customer are scoped correctly on four screens and not on eight others. That is an access-control gap, not a missing feature. |
| **Finish what is half-built** | Vehicle lifecycle and the vendor module are scaffolded but unused. Either complete them or drop them. |
| **Turn on the switched-off features** | Thirteen of fourteen modules were disabled on the test account. Some are finished and simply not enabled. |

### Cannot be stood up without a full migration

Work orders · estimate building · parts and inventory · technician time and payroll · PM
automation · shop reporting · QuickBooks accounting.

Not because they are hard to design, but because each one needs to own a resource the whole shop
shares, and those cannot live in two systems at once.

### Not yet known

Whether **preventive maintenance** could be the one real exception. PM work is scheduled,
predictable, usually pre-authorized, and light on parts. If PMs could run end-to-end in the new
system while everything else stayed in FullBay, that would be a genuine incremental wedge. It still
touches technician time and some parts, so it probably does not survive scrutiny — but it is worth
testing, because it is the only candidate.

---

## 4. A Shape For The Next 90 Days

Deliberately front-loaded with the things that unblock every later decision.

| When | What | Why now |
|---|---|---|
| **Weeks 1–2** | Three recorded walkthrough sessions — shop floor, portal, money and integrations | Everything downstream depends on knowing how the shop really runs, not how we think it does |
| **Weeks 1–3** | **The export spike**: get a real export out of FullBay and load it | The single highest-risk unknown. If the answer is "there is no export," the whole timeline changes, and that must be known before any date is promised |
| **Weeks 2–4** | Feature list validated and crossed off by Fleetco | Turns a long list into a short one. The cross-offs are where the savings are |
| **Week 4** | Engagement terms agreed | Weeks of real work are about to start |
| **Weeks 4–10** | Portal hardening — the no-regret list above | Valuable whichever path is chosen |
| **Weeks 10–12** | First genuinely new portal capability, chosen from the interviews | Something visible that came from what they told us |

By the end of 90 days there should be a defensible answer to Option A versus Option B, and a
portal that is safe to put real customers on.

---

## 5. Decisions Only Fleetco Can Make

Bring these to the meeting as questions, not as positions.

1. **Option A or Option B?** Nothing else can be sequenced until this is answered, and it is a
   business decision rather than a technical one.
2. **Is a hard, all-at-once shop cutover acceptable?** If the answer is no, Option B is off the
   table and the conversation is only about how good the portal gets.
3. **What can FullBay actually export?** Any report, CSV, or data dump. The API cannot supply
   history, so this is the only path.
4. **What does the $5,000 a month actually buy?** FullBay's published price is $188–258 per month
   per shop. Even at two shops with many users, the gap is large. The cost comparison is the
   headline of any plan, and an unverified figure will not survive the first five minutes of
   scrutiny. **Settle this before presenting numbers.**
5. **Who maintains this afterward, and what is Cam's role?** They built something good. Whether they
   continues, and in what capacity, changes the engagement shape considerably.
6. **Is resale a real ambition or a someday?** Workflow depth is workflow-specific; the next fleet
   company will want it differently. This affects what gets built generically versus directly.

---

## 6. Next Meeting Agenda

A suggested order, roughly 60 minutes.

1. **What we found** (10 min) — the three findings in section 1. Lead with the app being better
   than expected; the credit is deserved and it sets the tone.
2. **The shared-resource problem** (10 min) — walk through the technicians / parts / ledger table.
   This is the part most likely to be new to them, and it reframes everything.
3. **The fork** (15 min) — Option A versus Option B, honestly costed in risk rather than dollars.
4. **The no-regret list** (10 min) — what gets done regardless, starting now.
5. **The asks** (10 min) — export capability, FullBay access for the walkthroughs, a staff-level
   account, and the $5,000 question.
6. **Terms** (5 min) — raise it here. A plan without "and here is what I need in return" invites
   scope creep by default.

**One framing note.** Walk in leading with what is *good* — the app, the schema, the portal
experience, the QR reporting idea. The hard news in section 1 lands very differently after
genuine credit than it does cold, and all of that credit is real.

---

## Related

- [[Roadmap]] — this is M1; note the correction to M8
- [[myotcfleet Codebase]] — the evidence behind section 1
- [[myotcfleet Recon]] — the frontend findings
- [[FullBay Analysis]] · [[Feature Inventory Draft]] — the FullBay surface
- [[Data Export Feasibility]] — the export spike
- [[Open Questions]] — Q1, Q7, Q13, Q18
- `functional-surface-map.html` — the browsable version of both systems
- `interview-session-1-shop-floor.html` — the walkthrough instrument
