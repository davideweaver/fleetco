---
created: 2026-10-09
tags: [fleetco, roadmap, milestones, planning, tracking]
source: Claude Code (Xerro)
---

## Overview

The plan of record for getting from "interesting idea with a finished architecture" to "the pilot
customer runs on this and FullBay is off."

**How tracking is split:**

| Where | What lives there |
|---|---|
| **This document** | Milestones, what gates each, what the deliverable is. The durable plan |
| **xerro todos, project `Fleetco`** | The working queue — `xerro todo list -p Fleetco`. Ten items, seeded 2026-10-09 |
| [[Open Questions]] | The reference list of unknowns, Q1–Q17, with the detail behind each |

Every open question maps to exactly one milestone below. Nothing is orphaned.

## The Milestones

### M1 — High-level plan presented to Fleetco

**Deliverable.** A short document or deck: the approach in plain language, rough cost, rough
roadmap, and an explicit list of what Dave needs *from them*. **Drafted 2026-10-11:**
[[Next Phase Discussion]].

**Gated by:** Q1 (FullBay data export), Q4 (how much of FullBay the pilot customer touches),
Q8 (volumes), Q12 (real deadline), **Q18 (what the $5,000 actually buys)**.

> **Q18 is the one to settle before presenting.** The cost comparison is the headline of this
> deliverable, and FullBay's published list price is $188–258/month per shop — a 20–26x gap from the
> $5,000 figure the plan leans on. Present an unverified denominator and the whole ROI argument is
> exposed in the first five minutes.

**Present it with assumptions stated rather than waiting for perfect information.** Cost and
timeline will be ranges, and that is correct at this stage — the alternative is stalling. Label
the assumptions so they can be corrected rather than quietly inherited.

**Exit criteria:** Fleetco has seen the approach, the cost order of magnitude, and the asks.

### M2 — Engagement terms agreed in writing

**Deliverable.** Role, compensation structure, IP ownership, scope boundaries, support
expectations.

**Gated by:** Q3 (role and compensation), Q7 (is resale real), Q13 (who else maintains this),
Q15 (support expectations), Q17 (AWS account ownership).

> **Placed second deliberately.** M3's feature inventory is weeks of work. Doing weeks of work for
> a friend's business with no agreement in place is the standard way these engagements go wrong —
> for the project *and* the friendship. The plan presentation in M1 is the natural moment to raise
> it, because a plan without "and here is what I need in return" invites scope creep by default.
>
> Also note Q17 is a Q3 question in disguise: if Fleetco owns the AWS account Dave needs durable
> access, and if Dave owns it their business depends on infrastructure in someone else's name.

**Exit criteria:** something written and signed, however lightweight.

### M3 — Feature inventory validated by Fleetco

**Deliverable.** The FullBay feature surface, inventoried from hands-on use, scored by necessity,
with Fleetco's cross-offs and additions.

**Gated by:** Q2 (the existing prototype), Q4 (read-only FullBay login), Q5 (mobile/offline),
Q10 (what they hate about FullBay), Q11 (what their customers say about the portal).

**Why Q10 and Q11 matter here:** they turn a flat list into a *prioritized* one. The complaints
are the product differentiation, and they are free to collect.

**Exit criteria:** a scored list Fleetco has actually marked up. [[Feature Inventory]].

### M4 — Phase-one scope locked

**Deliverable.** A written scope with an explicit **out-of-scope** list, acceptance criteria, and
a credible timeline. This is the [[PRD]].

**Gated by:** M3's output, plus Q6 (load-bearing integrations) and Q9 (compliance retention).

> **This is a distinct milestone, not a formality.** A feature list with cross-offs is not a
> scope. Turning "they want these sixty things" into "phase one is these eighteen, and here is
> what is explicitly deferred" is the hard step, and it is where replacement projects live or die.
> "One smaller customer" reduces data volume, not feature surface.

**Exit criteria:** Fleetco has agreed in writing to what phase one does *not* include.

### M5 — Data migration feasibility proven

**Deliverable.** A real export from FullBay, loaded into the schema, reconciled against source
totals.

**Gated by:** Q1.

> **Run this as a spike before committing to any date.** It is the highest-risk unknown in the
> project. If the answer turns out to be screen-scraping, the timeline changes by months — and
> that needs to be known before a date is promised, not discovered during the build.

**Exit criteria:** sample data round-trips with matching totals, and the extraction method is
understood.

### M6 — Walking skeleton deployed

**Deliverable.** Auth, tenancy, and one end-to-end slice — create a service order, see it in the
customer portal — deployed to `staging`, with the P0 items from the
[[Infrastructure Checklist]] in place.

**Gated by:** M4's scope, and Q5 answered (offline can reshape the architecture per ADR-001 and
ADR-015).

**Why it is its own milestone:** it proves the architecture in anger and gives Fleetco something
real to react to, well before the feature build is committed.

> **Framework spike: done.** [[Framework Evaluation]] was settled by spike on 2026-10-13 —
> **NestJS** (ADR-027), over Fastify and AdonisJS. The golden module gets built in NestJS, and the
> spike's NestJS output is the starting point for the reference implementation.
>
> **Design it as the golden module.** M6 is not just a proof of life — it is the reference
> implementation every later module is told to copy. Pick one boring entity (`customers` or
> `vehicles`) and build it completely and canonically: schema, migration, repository, service,
> routes, Zod contracts, outbox event, and tests at all four layers. "Follow `modules/customers`
> exactly" is a stronger instruction to an agent than any style guide. See
> [[Code Standards and Guardrails]].

### M7 — Phase-one feature build

The actual build, against M4's locked scope. Sequenced in the PRD.

### M8 — Pilot customer cutover

> ### ⚠️ Premise broken — 2026-10-11
>
> **A single-customer cutover does not work.** Moving one customer's *data* is fine; their *work*
> still flows through resources the whole shop shares, and those cannot straddle two systems:
>
> - **Technicians** — a tech would clock into FullBay for one customer's truck and the new system
>   for another's. Only one of those numbers can feed payroll.
> - **Parts inventory** — parts come off one physical shelf. Two systems each decrementing their
>   own count means neither is true within a week.
> - **The general ledger** — QuickBooks reconciles one set of invoices. Two sources, one ledger,
>   and month-end stops closing.
>
> The pilot does not avoid running two systems. It relocates the split from the customer dimension
> into the shared-resource dimension, where it is harder to see and harder to live with.
>
> **Therefore replacing the shop system is atomic**: all customers, every role, one cutover. There
> is no incremental ramp, and "one smaller customer" reduces neither feature surface nor risk — it
> only reduces data volume.
>
> **Consequence for this roadmap.** M8 as written is not achievable. The project forks into two
> genuinely different programmes — deepen the portal (incremental, low risk, FullBay stays) or
> replace the shop system (atomic, high risk, gated on an export path not yet proven to exist).
> That fork has to be settled with Fleetco before M4 can lock a scope. See
> [[Next Phase Discussion]].
>
> **Possible exception, untested:** PM work may be isolated enough to run end-to-end in the new
> system — scheduled, formulaic, often pre-authorized, light on parts. It still touches technician
> time and some parts, so it probably does not survive scrutiny, but it is the only incremental
> wedge candidate and is worth testing in the shop-floor interview.

**Deliverable (superseded).** The pilot customer's work runs entirely in the new system; their
people log into the new portal; FullBay is off for them.

**Gated by:** migrated data, trained staff, the support process from Q15, and the P1 items from
the [[Infrastructure Checklist]].

**Exit criteria:** a full billing cycle completed in the new system without falling back.

## Question-to-Milestone Map

| Milestone | Gating questions |
|---|---|
| M1 — Plan presented | Q1, Q4, Q8, Q12 |
| M2 — Terms agreed | Q3, Q7, Q13, Q15, Q17 |
| M3 — Feature inventory | Q2, Q4, Q5, Q10, Q11 |
| M4 — Scope locked | Q6, Q9 |
| M5 — Migration proven | Q1 |
| M6 — Walking skeleton | Q5 |
| M8 — Cutover | Q13, Q15 |

Q14 and Q16 are closed. See [[Open Questions]].

## How the Questions Actually Get Answered

They group into four conversations rather than seventeen separate asks. This is how the working
queue is organised:

1. **Access and data** — Q1, Q2, Q4, Q8, Q12. The practical one: can Dave see the system and get
   the data out?
2. **Engagement terms** — Q3, Q7, Q13, Q15, Q17. The business one.
3. **Product and users** — Q5, Q10, Q11. Interview the service advisors and technicians
   *separately from the owner*, or the answers come back filtered.
4. **Integrations and compliance** — Q6, Q9. The scope-expanding one.

## What Is Already Done

Worth stating, because it is a lot and it is the reason M1 can happen soon:

- Architecture is complete and internally consistent — 27 ADRs, and the `Architecture/` folder
  carries the detail behind them
- Platform, hosting, tenancy, auth, realtime, operations, environments, and the infrastructure
  checklist are all decided and written
- Cost model is credible: **$200–400/month against FullBay's $5,000**
- Build discipline for agent-driven delivery is written: [[Testing Strategy]],
  [[Code Standards and Guardrails]], [[Agent Playbooks]]

**What is not done is everything that requires Fleetco.** The architecture could not be more
ready; the project is entirely gated on information only they have.

## Related

- [[Open Questions]] — the questions behind every gate
- [[Project Brief]] — the decision criteria and risks
- [[Feature Inventory]] — M3's deliverable
- [[PRD]] — M4's deliverable
- [[Stack Evaluation]] — the cost figures for M1
- [[Fleetco Overview]] — knowledgebase index
