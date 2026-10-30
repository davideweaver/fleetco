---
created: 2026-10-28
date: 2026-10-23
tags: [fleetco, otc, meeting, debrief, requirements, action-items]
source: Claude Code (Xerro), from [[2026-10-23 Cameron Walkthrough Transcript]]
status: findings recorded; planning docs updated 2026-10-28
---

**Meeting:** October 23, 2026, on site at OTC — Dave + Cameron. Dan did not attend.
**Transcript:** [[2026-10-23 Cameron Walkthrough Transcript]]
**Prep doc:** [[Meeting Brief 2026-10-23]]

---

## The Headline

**Cameron proposed a pilot that dissolves the problem the last two weeks of planning were built
around.** V1 is the **graphics department**, not a pilot customer — and because graphics shares
almost nothing with the service shops, the shared-resource trap that made a one-customer pilot
unworkable mostly disappears.

Five things changed, in order of how much they move the plan:

1. **The pilot is a department, not a customer.** Graphics = Cameron + one installer (Jason), a few
   hundred of its own customers, two billable parts, its own QuickBooks class. Cameron would
   **stop using FullBay for graphics entirely.** No two-silo seam on technicians, no shared parts
   shelf, no split ledger — because graphics doesn't share those with the shops today.
2. **Historical data is probably not needed at go-live.** Graphics is in its *first year*. The
   highest-leverage scoping question in the project looks answerable as "start fresh."
3. **Nobody uses FullBay scheduling** — but graphics *needs* it. The shops run a physical queue
   (keys on a board). First real divergence between the two businesses.
4. **This is a growth play, not a cost play.** Cameron, flatly: *"We're not looking at this as a
   cost savings opportunity… we're looking at this as a growth opportunity."* FullBay covers
   **~30%** of what OTC wants to do. The project is the other 70%.
5. **Compensation did not get decided** — neither side has a number. Cameron wants Dan in the room
   for it. Dave floated the structure (upfront fee + tapering retainer) without pricing it.

---

## 1. V1 Scope — Graphics as the Pilot

**Feeds:** [[Feature Inventory]] · [[PRD]] · [[Next Phase Discussion]] §1 and §4b

### Why graphics works as the pilot

| Shared resource | Status in graphics |
|---|---|
| **Technicians** | One installer (Jason) + Cameron. Nobody else clocks graphics work. No payroll split. |
| **Parts inventory** | Own shelf in the graphics shop. Two billable parts total. Inventory tracking is already manual. |
| **Accounting** | Own QuickBooks class, already separated from Keystone, Lancaster service, mobile, and postal. |
| **Customers** | A few hundred graphics-only customers. *"Not a whole lot of overlap"* with service; the rare overlap Cameron would bill out of FullBay by hand. |

Cameron's words: *"It would affect two people, myself and my installer. That's it. So we'd be the
ones testing the smaller things."*

**This supersedes the "a one-customer pilot does not work" finding** — not by refuting it (it was
right about customers) but by finding a cut line the shared resources already respect.

### What graphics actually does in FullBay today

The full per-job loop, with language that doesn't fit and workarounds at every edge:

1. Customer calls or emails (graphics almost never uses portal service requests — that's a shop flow)
2. Cameron builds an **estimate**: customer → unit → work description → labor rate → material →
   design charge → color samples for new customers → estimated hours
3. Sends for approval by email; **self-authorizes most of the time** (*"a lot of my customers aren't
   inclined to press authorize or decline"*)
4. Converts to **SO**, assigns Jason with estimated hours. Jason can't clock in until authorized.
5. Jason clocks into the job from his tech home screen; time tracks against the SO
6. Invoice → emailed → paid by card (3% passed through), ACH, or check → syncs to QuickBooks class

Example from the walkthrough: SO 243483, Bright Eyes Solar, invoiced 32.5 hours, 11 hours in,
four days to go.

### V1 must include (because graphics leaves FullBay completely)

- Customers, contacts, **units — including non-vehicle assets** (see §3)
- Estimate build + send + approve/decline + **internal self-authorization**
- Estimate → SO conversion; authorization gate blocking clock-in
- **Time clock, both kinds** — against a work order *and* standalone categories (see §2)
- Parts billed on an order; parts records for cost tracking + POs + receiving
- Invoice generation, email delivery, payment link
- **Scheduling / job prioritization** — graphics needs it, FullBay's is unused
- Customer portal for graphics customers: estimates, approval, invoices, payment
- **Deposits** (see §4)
- Staff auth, roles, audit log

### Can be deferred for graphics

- Real-time stock decrement from service orders (Cameron doesn't do it and doesn't want to)
- Multi-shop global settings, margin/markup tables, labor-guide integration (MOTOR)
- DVIR, PM automation, telematics, the 38 reports
- QuickBooks sync — graphics is one class; manual entry for a few hundred invoices is survivable
  (confirm with Cameron)
- QR driver reports for graphics customers — Cameron: *"No, you're right"*, that's a fleet service,
  not a graphics one

### Dave's stated V1 approach

Two passes inside V1: **(a) functional** — working screens, real data, close to FullBay's layout so
staff recognize it; **(b) a UI pass** with Cameron driving the design. Cameron owns look-and-feel:
*"I do graphic design. I make things look good. That's part of my job."*

---

## 2. Time Clock — Answered, and It Lands In V1

**Feeds:** [[Feature Inventory]] (the #2 sizing question in [[Meeting Brief 2026-10-23]]) · [[Domain Model]]

**FullBay's punch clock does stand alone.** There are two independent things:

- **Clock into a work order** — billable labor against the SO
- **Clock into a global category** — "general," drive time, graphics production, shop maintenance,
  property maintenance. Shop-wide **global settings**, shared across all four shops.

A tech's whole day is on one of these; pressing clock-in on a new thing clocks you out of the last.
Payroll reporting separates billable from non-billable hours from this.

The nuance that matters: **drive time is billable when it's on the work order and non-billable when
it isn't.** *"If I charge you a hundred dollars to drive to you, it's on the work order."*

**Consequence:** the brief hoped FullBay's punch clock could stand alone and stay behind, keeping
labor time out of V1. It *can* stand alone — but since graphics leaves FullBay entirely, Jason has
nowhere else to clock in. **Time tracking is P0.** Both modes, plus configurable non-billable
categories.

---

## 3. Product Requirements Surfaced

**Feeds:** [[Feature Inventory]] · [[Domain Model]] · [[PRD]]

New requirements that came out of the walkthrough, with the FullBay gap each one closes.

| # | Requirement | FullBay today | Priority |
|---|---|---|---|
| R1 | **Customer hierarchy — parent with sub-customers** (departments), roll-up reporting + drill-down | Each department is a separate, unlinked customer | **High** — Cameron's #1 FullBay gap |
| R2 | **Global user accounts**, assignable to many customers / fleet groups | Users belong to one customer; a manager over two departments needs two portals | **High** |
| R3 | **Non-vehicle units** — signs, walls, buildings | Estimate *forces* a vehicle; Cameron creates a fake unit called "sign" | **High** (V1 blocker for graphics) |
| R4 | **Deposits** — collect at estimate approval, by payment link, in the portal | Impossible. Workaround: a fake part named "50% deposit" on a counter sale | **High** |
| R5 | **Pay whole balance / multiple invoices with one card payment** | Card = one invoice at a time. Checks and ACH can be applied to a balance | **High** |
| R6 | **Kits with configurable invoice display** — roll up to one line, or split materials / design / labor | "Global services" pre-select parts + labor but the customer still sees every line | **High** |
| R7 | **Scheduling with priority** — real dates, which job comes first | Exists, essentially unused. Graphics is verbal today | **High** for graphics |
| R8 | **Shop-type terminology switch** — relabel "repair" language per business; same data model | None. All repair language | Medium |
| R9 | **QR driver reports wired straight into the work queue** | Cameron's portal emails OTC; staff re-key it | Medium (easy win) |
| R10 | **Proper staff impersonation** — "viewing as Kent," with a banner, no identity rewrite | Cameron's portal switches the staff user's company | Medium (security) |
| R11 | **Better reporting, with vendor reporting folded in** | The "Office" tab is dead weight; Cameron: *"I just need a better reporting section"* | Medium |
| R12 | **AR dunning automation** — flag outstanding balances, send reminders | Manual, monthly, by Joanna — *"almost non-existent"* | Medium |
| R13 | **In-app AI help** on every front end | Cameron bolted ChatGPT into Lovable, scoped away from backend details | Low |
| R14 | **Vendor portal** | Exists; **zero vendors use it** | **CRUFT — do not build** |

### Parts and purchasing (how it actually works)

Graphics bills exactly **two** things: Avery 1105 vinyl and design. Separately, Cameron keeps
*tracked* part records for cost and purchasing — note the deliberate split: the vinyl he **orders**
and the vinyl he **sells** are two different part records, one tracked and one not.

The purchasing loop, which the new system has to reproduce: part has a preferred vendor → create PO
→ FullBay **emails the vendor the PO** → vendor ships and invoices → mark received → stock
increments and last cost updates → adjust actual cost if the price moved.

Vendors carry **payment terms** and **tax-exempt status** (OTC is exempt when reselling to a
customer). Both are load-bearing.

Why Cameron won't track consumables per job: *"I can't track how much ink I'm using on a job… It
would be stupid."* This is exactly why R6 (kits) matters — he wants one material line, not forty.

### Credit and terms

- Credit application lives on OTC's **website** (Lovable), not FullBay; submitting emails accounting
  + the managers' inbox
- Approval is manual: Joanna calls references, Kevin confirms OTC can carry the exposure
- Default **net 30**; net 60/90 only for large customers (LGH is net 60)
- No credit account → deposit always. Over $5,000 → deposit always.

---

## 4. Payments and Money Movement

**Feeds:** [[Feature Inventory]] · [[PRD]] · [[Architecture Decisions]] (payments not yet ADR'd)

- **~30% of customers pay by card**; the rest ACH or mailed check
- **3% card surcharge passed through** to the customer
- FullBay charges no transaction fee beyond card processing
- A single check can be applied across many invoices; a card payment cannot (R5)
- Payment links work for final invoices only — never deposits (R4)
- Portal subscription billing **must look like an OTC invoice**, not a separate Stripe charge:
  *"There's customers so accustomed to seeing our name at the top of an invoice… I've got to be
  careful with those relationships."* Several customers have OTC set up as an approved vendor.

---

## 5. The Portal — Product and Business Model

**Feeds:** [[Tenancy Model]] · [[Auth and Identity]] · [[myotcfleet Codebase]] · [[PRD]]

### Technical state, confirmed from Cameron

- **FullBay's API returns invoices and nothing else.** Confirmed from his side. He derives customer,
  unit, and parts data *out of invoice detail*.
- **No background sync, no local cache.** Screens read the FullBay API live.
- **One account is wired up — LGH — and it's a demo, not live.** Mapping is guesswork: "coming due"
  was a 15-day guess; the open-invoice count disagreed with FullBay (19 vs. 15 on screen).
- **Senior Helpers is the one genuinely live customer** — 6 vehicles, using QR driver reports and
  insurance/registration tracking. They still pay invoices in **FullBay's** portal. Two portals.
  They also put OTC through a healthcare security questionnaire.
- **Calendar view is built and wired to nothing.**
- Portal email goes out through Supabase.

### Roles as built

`driver` · `fleet authorizer` · `fleet authorizer admin` · `OTC admin`. Customers can add their own
drivers and authorizers. Gap identified live: a user cannot be assigned to multiple customers (R2),
and fleet-group assignment isn't wired to permissions yet.

### Agreed architecture direction

- **Portal management belongs inside the new shop system** — a "manage portals" menu item, not a
  separate app. Portal customers are just customers in the new system.
- **Move off Supabase onto the new backend.** Cameron: *"Whatever sets us up for growth is a bigger
  concern. I think it makes sense to switch our backend. And I can handle making things look nice."*
- Open: rewrite the portal front end, or retarget Cameron's existing front end at the new API. Dave
  to assess the lift.
- Cameron's viral idea worth keeping: a fleet manager can **invite peer departments** to join the
  parent account — self-service org growth, enabled by R1 + R2.

### The subscription model Cameron described

| Tier | What it is |
|---|---|
| **Free** | Pay invoices, see your fleet. Given away — *"not many mechanic shops have portals"* |
| **Paid add-ons** | Insurance/registration tracking, QR driver reports — à la carte, watch the monthly total tick up |
| **Tier 3** | **OTC manages your fleet for you**, against an agreed service budget |

Real numbers: Senior Helpers is on a free trial, then **$10/unit/month** — 6 units = $60/month.
Cameron believes he can sign **~100 of his larger existing customers** "pretty easily." At $100/mo
that's **$10k/month**, which Dave pointed out would cover the entire platform's running cost.

**Open tension, raised and left open:** charge for the management features, or give them away to
lock customers into OTC service work? Dave argued the friction of a subscription may cost more than
it earns; Cameron is still thinking. Also floated: discount service work for tier-3 subscribers.

This is also the **first concrete appearance of "fleet management as a product"** — OTC's actual
positioning is *"you outsource your accounting department; now you outsource your fleet
department."* That framing explains the 30% number better than any feature list.

---

## 6. FullBay Data Export — Narrowed, Not Resolved

**Feeds:** [[Data Export Feasibility]] · [[Open Questions]] Q1 · [[Roadmap]] M5

What Cameron confirmed from inside the product:

- **No master download.** *"They don't have one master download to download all of your data."*
- Reporting exports work **one area and one shop at a time** — and there are four shops
  (Lancaster, mobile, postal, graphics; Berks retired)
- Reports produce real lists — all customers, all customer vehicles, contacts. Large reports get
  **emailed** rather than downloaded.
- Report access is **role-gated**; Cameron wasn't sure he could reach some of them (Taylor can)
- **Ten years of data** for the shops; 3,200 lifetime shop customers; a few hundred graphics customers
- Cameron expects resistance: *"They're usually pretty reluctant on things like that"* — but he has
  a friendlier internal contact he'll use

**Agreed framing for the ask:** a routine backup/audit request — the company is growing, going
through audits, and not holding its own data is a liability; we want a dump every 6–12 months.
**Do not signal a migration.**

Dave's reason it's worth real effort: the reports expose maybe half the fields FullBay actually
tracks. A full dump reveals the schema, *"and that'll be priceless and save us so much time."*

**Note the risk has dropped.** Under the graphics-first plan, graphics is in year one and almost
certainly doesn't need its history migrated. The export blocks the *shop* cutover, not V1.

---

## 7. Cost, Compensation, and Support

**Feeds:** [[Engagement Terms]] · [[Open Questions]] Q3, Q15, Q18 · [[Operations]]

### The $5,000 question — a real data point, and it doesn't add up yet

Cameron: *"Somewhere like that… they charge us per technician assigned to it, so it's like
forty-five a person a month."* Elsewhere he put the service side at **~20 technicians**.

**20 × $45 = $900/month, not $5,000.** So either the headcount is much larger than the technician
count (service advisors, managers, back office, four shops), or there are add-ons, or the $5,000 is
loose. **Q18 stays open** — an actual invoice is still the only thing that settles it. Do not use
$5,000 in a comparison until then.

### Running cost Dave quoted

AWS, ~$200/month; **under $500/month all in** with email/SMS/QuickBooks transactional costs; he'd
*"not see it growing more than a thousand a month"* with redundancy at full scale. Caveat he
delivered honestly: the real cost isn't hosting, it's **someone watching it** — *"that's where
FullBay is. They have guys working on this every day."*

### Compensation — structure floated, nothing agreed

- Dave's full-rate reference: **~$150/hour** as a contractor — explicitly *not* what he intends to
  charge, since this isn't his full-time work
- Proposed shape: **upfront project fee + retainer**, retainer higher during heavy build, tapering
  as OTC takes over day-to-day
- Dave's capacity: **10–20 hours/week**, probably not more than 20
- **Neither side has a budget.** Cameron: *"I don't know what our budget is… we're a little new to
  this game."* He wants Dan present for the numbers.
- Dave's framing of why not a software shop: they'd spend months on requirements, quote a big
  number, deliver in ~6 months against month-one requirements, and OTC would be stuck with it.
  Iterative is both cheaper and a better fit for a client who can't specify everything up front.

### Support and the bus factor — both named it out loud

Cameron raised it unprompted: *"That's the only thing I don't like about this arrangement. I'm your
— I'm a single point of failure."* Dave agreed and named the risk himself (2am, vacation, day-job
meetings).

The agreed path: graphics launches with Dave on support (two users, low stakes) → Dave teaches
Cameron monitoring and AWS basics → **Cameron takes tier-1** → escalate to Dave → later, hire, or
retain a software firm. **AI monitoring from the start** — surface issues, triage logs, possibly
auto-fix bugs.

### Cameron's role — answered

*"Just like I've done everything in this company: build it, systemize it, pass it."* He wants to
go deep enough to hand it off, then manage it at a high level — servers, change requests, AI-assisted
edits — **not write code long-term**. He also owns front-end design and is the operational source of
truth: *"I know all operations. I know everything."*

### Resale — deprioritized again, by Cameron

*"I'm not super worried about that right now. I think just phase one is our own stuff."* Confirms
Q7. Build the data structures so it stays possible; don't pay for it now.

---

## 8. Action Items

### Cameron's homework

**Status update 2026-10-28** (message from Cameron): **C1 is done** and **C2 is in flight.** One
catch on C1 — the punch list saves to **browser localStorage only**, so his answers haven't
actually left his machine. He has to open it, hit **Build summary** then **Copy to clipboard**, and
paste the result over. The export ends with a `--- raw ---` JSON blob of full state, which reloads
into the tool, so keep it. A cache clear or a switch to another device loses all 217 answers.

| # | Item | Notes |
|---|---|---|
| C1 | **Answer the punch list — V1 only** | ✅ **Done 2026-10-28.** Export still needs collecting (see note above). 217 items. |
| C2 | **Request a full FullBay data dump** | 🔄 **In progress 2026-10-28** — working his internal contact. Frame as audit/backup. Don't mention migrating. |
| C3 | **Competitor notes** | ShopMonkey and others; what he likes, what he hates about FullBay. He has old screen recordings from when he demoed everything. FullBay v2 is coming and *"still not fixing a lot of their big issues."* |
| C4 | **Export his ChatGPT history / notes** on the project | He already set this up. Dave will cross-reference against the knowledgebase. |
| C5 | **Send a batch of FullBay outbound emails** | PO to vendor, estimate for approval, invoice, payment link. He'll use a test vendor and forward them. |
| C6 | **Send the meeting recording** | ✅ Done — this is it. |
| C7 | **Confirm whether the shops use FullBay's SMS** | He doesn't; needs to ask Brian (Lancaster service manager). |

### Dave's action items

| # | Item | Why it's next |
|---|---|---|
| D1 | **Send Cameron the punch list link** | Blocks C1, which blocks all scoping and any timeline |
| D2 | **Rewrite V1 scope around graphics** | [[Feature Inventory]] + [[PRD]]; the whole shared-resource framing changes |
| D3 | **Assess the Supabase → own-backend lift** for Cameron's portal | Decides rewrite vs. retarget; Cameron is fine either way |
| D4 | **Research QuickBooks Online class-based accounting** | Graphics is one class. Dave's QBO knowledge is stale and he flagged it as the fiddly part |
| D5 | **Build the compensation proposal** for the Dan meeting | Upfront fee + tapering retainer, with actual numbers |
| D6 | **Draft the project plan** | Cameron asked for it; feeds the biweekly cadence |
| D7 | **Design the customer-hierarchy + global-user model** (R1, R2) | Highest-value product gap, and it's a data-model decision — cheap now, expensive later |
| D8 | **Update the planning docs** with these findings | ✅ Done 2026-10-28 |

### Open questions for the Dan meeting

1. **Compensation and structure** — the only item Cameron explicitly deferred to Dan
2. **Budget** — neither side has one
3. **What is the actual FullBay invoice?** (Q18 — $45/user doesn't reach $5,000)
4. **AWS account ownership and billing** — Q17, still unasked
5. **Portal pricing: charge or give away?** — Cameron is undecided and it changes what gets built
6. **Support expectations** — hours, response time, who's the intake point (Q15)

### Cadence agreed

**At least every other week**, in person where it makes sense. Cameron is responsive by phone,
email, or text. Dave: 10–20 hours/week. Cameron: *"Even if I got you for just one day, I think we
could crack out a decent bit."*

---

## 9. Loose Ends Worth Not Losing

- **Shop names and structure:** Lancaster (across the street, Brian = service manager), **mobile**
  (goes to the customer), **postal** (USPS vehicles only, ~100 invoices/hour), **graphics**. Berks is
  retired but still in FullBay. Keystone is a separate QuickBooks class.
- **Brian lives in FullBay ~90% of his day** — assigning techs, phones, sending estimates. He is the
  heaviest user in the company and **has not been interviewed yet.**
- **The shop floor is a queue, not a schedule:** keys hang in a spot, you grab keys, find the work
  order, clock in. Scheduling only gets used when someone's out.
- **FullBay↔QuickBooks sync breaks** for a day or two at a time, a few times a year. Postal then
  hand-keys the backlog. No lost business, but real pain.
- **"MOTOR"** in FullBay's nav is a labor-guide/benchmark feed (FullBay aggregates shop data and
  emails back average labor rates). **FleetNet America** is a FullBay/Cox thing OTC doesn't use.
- **Taylor** (one-man trailer sales) is building his own DMS in Lovable — a 5-step sales process.
  Separate from this project, but the same build pattern.
- **Cameron built `myotcfleet` to get Dan on board**, deliberately broad rather than deep: *"I
  started building as many things as possible so I could show Dan, like look what we can do."* That
  explains the half-built modules better than any code review will.

---

## Related

- [[2026-10-23 Cameron Walkthrough Transcript]] — the source
- [[Meeting Brief 2026-10-23]] — what Dave planned to cover; compare for what got dropped
- [[Next Phase Discussion]] — §1 and §4b superseded by the graphics pilot
- [[Open Questions]] — Q1, Q2, Q4, Q8, Q10, Q13, Q15, Q18 all moved
- [[Feature Inventory]] · [[PRD]] · [[Domain Model]] · [[Engagement Terms]] · [[Roadmap]]
