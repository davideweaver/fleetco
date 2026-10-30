---
created: 2026-10-08
updated: 2026-10-28
tags: [project, business, fleetco, questions, blockers]
source: Claude Code (Xerro)
---

## Overview

The unknowns that gate the Fleetco decision. **These come before any deeper architecture work.**
Several can kill or fundamentally reshape the project, and answering them is cheap compared to
designing around a wrong guess.

Status key: `OPEN` · `ASKED` · `PARTIALLY ANSWERED` · `ANSWERED` · `BLOCKED`

**Updated 2026-10-28** from the 2026-10-23 Cameron walkthrough — twelve questions moved. The jump
table is in [[#Answered by Fleetco]]; four new questions (Q19–Q22) were added there too.

## Tier 1 — Could Kill or Reshape the Project

### Q1. Does FullBay have a usable data export or API? `PARTIALLY ANSWERED`

**Cameron, 2026-10-23 ([[2026-10-23 Cameron Walkthrough Debrief]] §6).** From inside the product:
**there is no master export.** Reporting exports run **one area and one shop at a time**, and
there are four shops. Reports do produce real lists (all customers, all customer vehicles,
contacts); large ones get **emailed** rather than downloaded. Report access is role-gated and
Cameron isn't sure he can reach all of them.

The API question is settled separately and finally: **invoices only** (see §5 of the debrief and
[[Next Phase Discussion]] §1).

**Still open:** whether FullBay will provide a full dump on request. **Asked 2026-10-28** — Cameron
confirmed he is working his internal contact on "an entire export on all of our company data,"
framed as a routine audit/backup request. He expects resistance. Awaiting FullBay's answer.

**The risk has dropped, though.** Graphics is in its first year of business, so V1 almost certainly
does not need history migrated. The export now gates the **shop** cutover, not V1.

### Q2. What is the existing prototype, and is it an asset? `ANSWERED`

**Answered across the code audit and the 2026-10-23 walkthrough.** It is a customer portal, not a
shop system — see [[myotcfleet Codebase]] and [[Next Phase Discussion]] §1. One account (LGH) is
wired to the FullBay API and it's a demo with known mapping errors; **Senior Helpers is the only
genuinely live customer** (6 vehicles, QR driver reports and insurance tracking, still paying
invoices in FullBay's portal).

Cameron's own account of *why* it's broad-but-shallow closes the question: *"I built this to get Dan
on board… I started building as many things as possible so I could show Dan."* The half-built
modules are demo scaffolding, not abandoned work.

**Asset or not:** the schema and permission model are an asset; Cameron agrees the backend should
move onto the new platform (*"whatever sets us up for growth"*). He owns front-end design going
forward.

### Q3. What is Dave's role and compensation structure? `ASKED — DEFERRED TO DAN`

**Raised 2026-10-23.** Cameron asked directly what the compensation would be. Dave described the
structure — **upfront project fee plus a retainer that tapers** as OTC takes over day-to-day — and
gave his contractor reference rate (~$150/hr) while saying plainly that isn't what he'd charge for
part-time work. **No numbers agreed.**

Cameron: *"I don't know what our budget is… we're a little new to this game."* He wants Dan in the
room for it.

Also answered in part: **Cameron is the maintainer** (see Q13), and resale stays deprioritized
(Q7), which keeps the IP question theoretical for now.

### Q4. How much of FullBay does the pilot actually touch? `ANSWERED — AND THE PILOT CHANGED`

**The pilot is a department, not a customer.** Cameron proposed **graphics** — himself plus one
installer (Jason) — and would stop using FullBay for graphics entirely.

That changes the question's answer completely. Graphics touches: estimates, authorization, SO
conversion, technician time (both clock modes), two billable parts, parts records for cost and POs,
invoicing, payment, and a customer portal. It does **not** touch multi-shop global settings,
margin/markup tables, labor guides, DVIR, PM automation, telematics, or most of the 38 reports.

Full per-job walkthrough recorded in [[2026-10-23 Cameron Walkthrough Debrief]] §1.

**Still not done:** the heaviest FullBay user in the company is **Brian**, the Lancaster service
manager, who is in it ~90% of his day. He has not been interviewed. That interview sizes the
*shop* replacement, not V1.

### Q5. Is there a mobile or offline requirement? `OPEN — but the V1 risk looks low`

**Promoted to Tier 1 on 2026-10-09.** This is the single largest outstanding architectural input.

Technicians in bays on tablets with poor Wi-Fi changes the architecture more than any
monolith-vs-services decision. If genuinely offline-capable tablets are required, the answer is a
**sync engine** (PowerSync, Electric SQL, Zero) rather than a request/response API with a realtime
layer — and that reopens ADR-001 and invalidates ADR-015. It is not a feature to add later; it is
a different shape of system.

*Ask Fleetco:* Does FullBay have a tech-facing mobile app? Do your technicians actually use it, or
do they work off paper and a shared terminal? What is the Wi-Fi like in the bays — honestly? If
the connection drops mid-inspection, what happens today?

*Architectural consequence:* build the outbox regardless (it is correct either way), but **do not
build the SSE layer until this is answered.** See [[Realtime and Events]].

**CLOSED 2026-10-28 by the punch list.** Row 10.3: *"Confirmed launch decision: Online-only V1 is
acceptable. Offline capture/synchronization is not required at launch and may be revisited later if
needed."* Row 10.1 asks for a **mobile-friendly web app** bookmarkable to the home screen, on
phones and iPads. Row 10.2, a native app, is marked **Not needed.**

**Architectural consequence: ADR-001 and ADR-015 stand. No sync engine.** The SSE decision in
[[Realtime and Events]] is released from this gate.

Still worth asking Brian about bay Wi-Fi before the **shop** phase is scoped — graphics has one
installer on a browser, which is not the same problem as twenty techs in bays.

## Tier 2 — Shapes the Architecture

### Q6. What integrations are load-bearing today? `MOSTLY ANSWERED`

**From the 2026-10-23 walkthrough:**

| Integration | Status |
|---|---|
| **QuickBooks Online** | Load-bearing, but **reporting-only** — all billing and payment happens in FullBay; QBO is the accounting ledger. Separated by **class** (graphics, Keystone, Lancaster service, mobile, postal). Sync breaks for a day or two a few times a year; postal then hand-keys ~100 invoices/hour of backlog. No lost business, real pain. |
| **Payment processing** | Card (~30% of customers), ACH, check. **3% card surcharge passed through.** FullBay charges no transaction fee beyond processing. |
| **Vendor ordering** | FullBay **emails the PO to the vendor** — that's the whole integration. No catalog integration, no PartsTech. |
| **Email** | Everything runs on email chains. Cameron uses no SMS; the shops may (he has to ask Brian). |
| **MOTOR** | A labor-rate/benchmark feed FullBay aggregates and emails back. Not load-bearing. |
| **Telematics / DVIR / FleetNet** | Not used. |

**Still open:** whether QBO sync is in V1 at all. Graphics is one class and a few hundred invoices
a year — manual entry may be acceptable for the pilot. Confirm with Cameron.

### Q7. Is the resale ambition real or aspirational? `ANSWERED`

**Answered by Dave, 2026-10-09: a small possibility, and explicitly not worth complicating the
system for before it is real.**

This turned out to change more architecturally than originally assumed. It resolved ADR-006 to
pooled deployment, withdrew subdomain tenant routing (ADR-008 and ADR-017), and deferred the
separate vendor-plane application — removing roughly a few weeks from phase one. See
[[Tenancy Model]].

Still unresolved on the *business* side: if resale ever becomes real, Dave's role and the IP
ownership question (Q3) become urgent rather than theoretical.

### Q8. How many users, vehicles, and service orders per month? `PARTIALLY ANSWERED`

**From 2026-10-23:**

- **~20 technicians** on the service side; **1 installer + Cameron** in graphics
- **~3,200 lifetime shop customers**; **a few hundred** graphics-only customers
- **10 years** of FullBay data
- **Postal department does ~100 invoices an hour** — easily the highest-volume operation in the company
- Four shops in FullBay: Lancaster, mobile, postal, graphics (Berks retired but still present)

Confirms the sizing intuition: one Postgres instance is sufficient by orders of magnitude. **Still
needed:** service orders per month and total unit count, which the data dump would give for free.

The technician number also feeds Q18 — 20 × $45 = $900, not $5,000.

### Q9. Are there compliance or regulatory requirements? `OPEN`
DOT inspection records, DVIR retention, warranty claim submission to OEMs. Some of these have
legal retention periods that affect the data model and audit logging.

### Q14. How much does physical data isolation actually matter to buyers? `ANSWERED`

**Closed 2026-10-09 without needing Fleetco's input**, since Q7 resolved first: resale is a small
possibility, so paying for physical isolation up front is paying for a hypothetical.

**Decision: pooled — one shared database.** The deciding argument was that the two migrations are
asymmetric. Pooled → siloed is easy (filter by `tenant_id`, dump the subset, point that tenant at
its own database); siloed → pooled is hard (colliding keys, drifted schemas). Pooled-first is the
reversible choice. See ADR-006.

*Still worth asking if resale ever becomes real:* has any prospective buyer asked, unprompted,
whether their data would be physically separate from a competitor's?

### Q16. Does Neon-managed Better Auth run in our process, and who owns its DDL? `ANSWERED`

**Closed 2026-10-09 without needing an answer.** ADR-023 dropped Neon entirely, so Better Auth is
self-hosted per ADR-012. The two conditions recorded here — where auth endpoints execute, and who
owns the auth tables' DDL — remain the right test for any future managed-auth offering.

*Original framing, retained for the trail — the two conditions in ADR-020:*

1. **Do the auth HTTP endpoints execute in our Node process, or on Neon's infrastructure?** If the
   latter, there is a network hop and a vendor in the login path, which is what disqualified
   Supabase Auth under ADR-010.
2. **Can we take ownership of the auth tables' migrations?** Two systems writing DDL to one
   database is a real hazard against a bus factor of one.

*Outcome:* moot. Better Auth is self-hosted, which satisfies both conditions trivially.

### Q18. What exactly makes up the $5,000/month FullBay bill? `OPEN`

**Added 2026-10-09, from the architecture audit.** The most consequential open question in the
knowledgebase, and it was hiding in plain sight.

`$5,000/month` was marked **Confirmed**, called "the real market signal," and used as the
denominator in every cost comparison — including the headline for the M1 plan presentation. But
this same knowledgebase records FullBay's published list price at **$188/month Basic and $258/month
Pro**, and uses that range to size the resale revenue ceiling.

**That is a 20–26x gap with no explanation anywhere.** Plausible causes: per-user or per-technician
scaling, an Elite/Enterprise quote, multiple shop locations, add-on modules, or payment-processing
fees bundled into the number.

*Ask Fleetco:* Can we see an actual FullBay invoice? What is the line-item breakdown? How many
shops, users, and technicians does it cover? Are payment processing or add-on modules included?

**New data 2026-10-23 — and it deepens the gap rather than closing it.** Cameron: *"Somewhere like
that. They charge us per technician assigned to it, so it's like forty-five a person a month."*
He separately put the service side at **~20 technicians**.

**20 × $45 = $900/month.** To reach $5,000 the billable seat count has to be ~110, which would mean
FullBay bills for far more than technicians (advisors, managers, back office across four shops), or
there are add-ons, or the $5,000 is a loose recollection. **Q18 stays open and the $5,000 stays
unusable in any comparison until an invoice is seen.**

Mitigating: Cameron said directly that OTC is **not** doing this to save money — *"we're looking at
this as a growth opportunity"* — so the ROI headline matters less than it did when the brief was
written. The number still needs to be right before it appears in a document.

**Why it matters beyond accuracy.** If the $5,000 covers multiple shops or a large user count, then
our **$200–400/month is not comparable** — the replacement would have to serve the same scale, and
the ROI story in M1 is overstated. If it includes payment processing, that is revenue FullBay
captures which we are not planning to replace at all.

The $5,000 has lost its `Confirmed` status until an invoice is seen. Closely related to Q8
(volumes).

### Q17. Does Fleetco have an existing AWS account? `OPEN`

**Narrowed 2026-10-09.** ADR-021 and ADR-023 settled on AWS on the merits — Aurora fast clone,
S3 Object Lock, and better SSE handling through an ALB. The remaining question is only
administrative.

**Added 2026-10-09.** ADR-021 selected **AWS ECS Fargate**, with Dave's existing AWS experience as
the tiebreaker over Google Cloud Run — the two are close on the merits.

*Ask Fleetco:* Do you already have an AWS account? Any existing commitments or credits? Whose
name should the account and the billing be in — and who owns it if Dave stops working on this?

*Why it matters:* account ownership is really a **Q3 question in disguise.** If Fleetco owns the
account, Dave needs durable access. If Dave owns it, Fleetco's business depends on infrastructure
in someone else's name. Settle it in writing before production holds real data.

### Q15. What are the real support expectations? `OPEN`

**Added 2026-10-09.** Flows from [[Operations]]. Replacement software generates support load
immediately and permanently, and this is the part most likely to go unspoken until it is a problem.

*Ask Fleetco:* What are your actual business hours, and is there evening or weekend shop work?
What does one hour of total downtime cost you, in dollars and in customer trust? If something
breaks at 6am on a Tuesday, what is your expectation of response time? Who at Fleetco is the
intake point — do you want a shared channel rather than texting Dave?

*Why it matters:* if the honest answer is "we cannot be down during business hours at all," the
architecture is fine but the **staffing** is not, and that reshapes Q3 and Q13 rather than the
stack.

**Progress 2026-10-23 — the problem is named by both sides, the numbers aren't.** Cameron raised it
unprompted: *"That's the only thing I don't like about this arrangement. I'm a single point of
failure."* Dave agreed and named his own limits (2am, vacation, day-job meetings).

Agreed path: graphics launches with Dave on support (two users, low stakes) → Dave teaches Cameron
monitoring and AWS basics → **Cameron takes tier-1 support** → escalates to Dave → later a hire or
a retained firm. **AI monitoring from day one** — surface issues, triage logs, possibly auto-fix.

**Still open:** actual hours, response-time expectation, cost of an hour of downtime, and the
intake channel. Ask with Dan present.

## Tier 3 — Needed Before the PRD

### Q10. What does Fleetco actively hate about FullBay? `PARTIALLY ANSWERED`

**Cameron's list, 2026-10-23.** His summary judgment is worth keeping verbatim: *"FullBay does have
a good A to Z work order system. Their processes are pretty good. It's just their UI that's pretty
awful… you have to change three settings to change one thing."*

Specific complaints:

1. **Deposits are effectively unsupported** — no deposit by payment link or portal. He invented a
   fake part named "50% deposit" on a counter sale as a workaround. His biggest single gripe.
2. **No customer hierarchy** — every department of a large customer is a separate, unlinked
   customer. Named by him as *the* downside.
3. **Card payments can't cover a balance** — one invoice at a time, while checks and ACH can be
   applied to a total.
4. **Every part shows on the invoice** — "global services" pre-select parts but don't roll them up.
   *"You got a hundred different parts. It just looks stupid."*
5. **Repair-only language** everywhere, with no way to relabel for a non-repair business.
6. **Units are mandatory and must be vehicles** — he creates fake units named "sign" to quote walls.
7. **Weak reporting**, and a dead "Office" tab that should just be reporting.
8. **QuickBooks sync drops** for a day or two at a time.
9. **No master data export.**
10. **Per-user pricing** — *"I hate user fees."*

**Still open:** the same list from **Brian** (Lancaster service manager, in FullBay ~90% of his day)
and from a technician. Cameron is the graphics view, not the shop view.

### Q11. What do Fleetco's *customers* say about the FullBay portal? `PARTIALLY ANSWERED`

**One real data point, 2026-10-23.** Senior Helpers (6 vehicles, healthcare) is live on Cameron's
portal and **still uses FullBay's portal to pay invoices** — two portals for one vendor, which
Cameron and Dave both called out as absurd. Cameron tailored features to them and they put OTC
through a security questionnaire, which is a useful signal about what healthcare fleet customers
will ask for.

Cameron's framing of the portal's value: *"There aren't many mechanic shops that have portals to
log into their stuff."* The base tier (pay invoices, see your fleet) is the giveaway; the fleet
**management** features are the product.

**Still open:** anything from the larger customers — LGH/Penn Medicine, Canteen — in their words.

### Q12. What's the real deadline or forcing function? `ANSWERED — there isn't one`

**Confirmed 2026-10-23 by omission and by motive.** No renewal date, price increase, or at-risk
customer came up. Cameron framed the project as growth — *"we're not looking at this as a cost
savings opportunity"* — and OTC covers ~30% of what it wants to do today.

No forcing function is good news for scoping and bad news for momentum. The cadence agreement
(**at least every other week**) is the substitute, and it's worth protecting.

### Q13. Who maintains this besides Dave? `ANSWERED`

**Cameron, explicitly and unprompted, 2026-10-23:** *"Just like I've done everything in this
company: build it, systemize it, pass it."* He intends to go deep enough to own it, then manage it
at a high level — servers, change requests, AI-assisted edits — **not write code long-term.** He
accepted tier-1 support as his: *"I'll take on that responsibility and really get into it."*

He also owns front-end design (*"I do graphic design. I make things look good"*) and is the
operational source of truth for both businesses.

**Longer term:** a hire, or a retained software firm. Cameron ruled out offshore server management
outright. No timeline on either.

**Residual risk:** this is still a bus factor of two, one of whom isn't a developer. Real, but
named and being worked.

## Resolved Architecturally (Not by Fleetco)

Decided internally on 2026-10-09 without needing input from Fleetco. Recorded here so they are
not re-litigated.

- **API style** — REST with OpenAPI generated from Zod schemas. GraphQL rejected. See ADR-014.
- **Deployment isolation** — pooled, one shared database. See ADR-006 and Q14 above.
- **Tenant routing** — withdrawn; a single hostname, no subdomains. See ADR-018.
- **Auth provider** — Better Auth behind our own authN port, after dropping Supabase. See
  [[Auth and Identity]].
- **Backend platform** — plain managed Postgres (Aurora), not Supabase. See [[Stack Evaluation]].
- **Realtime mechanism** — server-owned SSE fed by the outbox, *contingent on Q5*. See
  [[Realtime and Events]].
- ~~**Neon platform services**~~ — superseded; Neon was dropped entirely. The *policy* survives
  and generalizes: take a platform's infrastructure primitives, refuse anything that would hold
  business logic or authorization. See ADR-019 and ADR-023.
- **Hosting** — AWS ECS Fargate, not Kubernetes. Deferred with a trigger list. See ADR-021 and
  [[Hosting and Deployment]].
- **Platform** — AWS-native: Aurora Serverless v2 + S3, Neon dropped, Redis eliminated. See
  ADR-023 and [[Platform Choice]].
- **Environments** — one non-prod to start, two at cutover; separate AWS accounts; IaC from the
  second environment. See ADR-024 through ADR-026 and [[Environments]].

## Answered by Fleetco

### 2026-10-23 — Cameron walkthrough

Source: [[2026-10-23 Cameron Walkthrough Debrief]] (transcript:
[[2026-10-23 Cameron Walkthrough Transcript]]).

| Question | Movement |
|---|---|
| **Q1** — export | No master export; per-shop, per-area reports only. Full dump requested, outcome unknown. **Gates the shop cutover, not V1.** |
| **Q2** — the prototype | Closed. Portal, not shop system; built broad to persuade Dan. Backend moves to the new platform. |
| **Q3** — role and comp | Structure floated, **no numbers**. Deferred to Dan. |
| **Q4** — pilot surface | **The pilot changed: graphics department, not a pilot customer.** Full loop documented. |
| **Q5** — mobile/offline | Narrowed — no offline need visible for V1. Returns at the shop cutover. |
| **Q6** — integrations | QBO (reporting-only, class-based), card/ACH/check, PO-by-email. No telematics, no DVIR, no catalog. |
| **Q8** — volumes | ~20 service techs, ~3,200 lifetime shop customers, a few hundred graphics customers, 10 years of data. |
| **Q10** — FullBay complaints | Ten specific items, in his words. Brian still uninterviewed. |
| **Q11** — customer view of the portal | One live customer (Senior Helpers), using **two** portals. |
| **Q12** — forcing function | **None.** Growth-motivated, not cost-motivated. |
| **Q13** — who maintains it | **Cameron**, taking tier-1 and long-term ownership. |
| **Q15** — support | Problem named by both sides; path agreed; numbers still open. |
| **Q18** — the $5,000 | **$45/user/month** confirmed. 20 techs × $45 = $900. The gap got *worse.* Still open. |

### New questions raised by this meeting

- **Q19. Charge for the portal's fleet-management features, or give them away?** Cameron described
  tiers ($10/unit/month, up to "OTC runs your fleet against a budget") and believes he can sign
  ~100 existing customers. Dave argued subscription friction may cost more than it earns versus
  giving it away to lock customers into service work. **Cameron is undecided, and the answer changes
  what gets built.**
- **Q20. Is QuickBooks sync in V1, or is manual entry acceptable for graphics?** `ANSWERED — and
  the opposite of what was hoped.` **Two-way QuickBooks Online sync is required in V1.** Punch
  list 7.25 asked directly whether the bookkeeper could key invoices by hand at first and Cameron
  marked it **Not needed** with: *"NO — user requires QuickBooks Online synchronization in V1,
  including two-way relevant updates. Manual entry/import is not the selected launch workaround."*
  Scope is customers, invoices, payments, deposits, with changes flowing back from QBO.

  **This is now the most expensive and highest-risk item in V1.** Worth pushing back with a
  concrete alternative — one-way push plus a reconciliation report — and if the answer holds,
  pricing and sequencing it as its own phase rather than folding it into V1 silently. See
  [[V1 Scope from Punch List]] §2.
- **Q21. Do the shops use FullBay's SMS?** Cameron doesn't and doesn't know. He's asking Brian.
  Decides whether SMS is V1 infrastructure.
- **Q22. What does Brian need?** The heaviest FullBay user in the company (~90% of his day) has not
  been interviewed. Gates the *shop* scope, not V1 — but gates it completely.

### Added 2026-10-28, from the completed punch list

See [[V1 Scope from Punch List]] for the full analysis.

- **Q23. Is the customer portal really out of V1?** `OPEN — needs a direct answer` All 20 portal
  rows came back **Later**, along with customer approval links. On 2026-10-23 Cameron said he wanted
  a portal for graphics (*"I am"*). Both can be true if he means "later," but the consequence has to
  be said plainly: **graphics customers lose FullBay's portal at cutover and get email + PDF + a
  payment link instead**, which is less than they have today for paying invoices. This is also the
  most visible differentiator from FullBay, now deferred. **Highest-priority confirmation.**
- **Q24. What is GoHighLevel's role, and does V1 need to anticipate it?** New information, never
  mentioned in the walkthrough. OTC runs GoHighLevel as a separate CRM for leads, the sales/design
  pipeline, and automated SMS/email. Cameron's instruction: keep it, don't rebuild it, **no API
  integration in V1**, type approved work into the shop system by hand. Later, inbound requests
  should generate *draft* estimates for Owner review, never auto-send. **Cheap action now:** store
  external GoHighLevel contact and opportunity IDs on customers and jobs.
- **Q25. Sales tax rates and taxability settings?** `OPEN — blocks go-live, not development` Punch
  list 7.23 requires matching the current configuration; rates were not supplied. Ask accounting.
  Do not guess.
- **Q26. Current invoice number, format, and the OTC prefix?** `OPEN — blocks go-live` Punch list
  7.18. Cameron wants the prefix but didn't have the range. A colliding sequence is an accounting
  mess, and migration of open invoices has to respect it.
- **Q27. Does FullBay process OTC's card payments, and what are the fees?** `OPEN` Punch list 7.11 —
  Cameron doesn't know; verify with accounting. **Feeds Q18:** if processing is bundled into the
  $5,000, part of that bill isn't software, and we aren't replacing it.

## Related

- [[Roadmap]] — which milestone each question gates
- [[Architecture Decisions]]
- [[Operations]]
- [[Project Brief]]
- [[FullBay Analysis]]
- [[Fleetco Overview]]
