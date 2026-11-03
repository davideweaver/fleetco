---
created: 2026-11-03
tags: [fleetco, architecture, agents, factory, delivery, plan]
status: plan — does not start before M2 (signed terms). Shape, budget and cadence are Dave's call at that point
source: Dave + Claude Code (Xerro), brainstorm 2026-11-03
---

## Overview

How V1 actually gets built: a **software factory** of Claude Code agents producing the code, with
Dave making decisions and reviewing output rather than writing it. [[Fleetco Overview]] already
records the delivery model as *"agent fleet, Dave reviews, no hand-written code"* and the real
bottleneck as *"review and verification capacity, not code volume."* This document is what follows
from taking both of those seriously.

> **Start gate: nothing in here begins before [[Roadmap]] M2 — engagement terms agreed in
> writing.** Weeks of agent output on an unsigned project is a business risk, not a technical one.
> The factory shape, the budget, and the cadence all get decided at M2 as well.

**The one idea.** Agent throughput is cheap and getting cheaper; Dave's attention is fixed and
irreplaceable. Every design choice below is judged by one question: *does this verify work without
consuming Dave's attention?* That is why the gates, the rule-coverage check and the screenshot
contact sheets matter more than parallelism does.

## The Precedent: We Already Built One

The V1 guide in `docs/Product/v1-video/` was produced by a factory, and it worked. Its shape is
the shape to reuse:

| Mechanism | Where it lives | Why it worked |
|---|---|---|
| One brief, read before anything | `flows/BRIEF.md` | Every agent starts from the same constraints |
| Per-agent work folders | `flows/<area>/` | "Write only inside your own folder" eliminates collisions |
| Hard rules, stated as prohibitions | BRIEF "Hard rules" | Negative constraints are easier to follow than taste |
| Shared primitives nobody may edit | `lib/wire.js`, `lib/wire.css` | One visual language across eight independent agents |
| A canonical story | G-1048, Ridgeline, $2,019.00 | Output is consistent without coordination |
| Self-check before handoff | "shoot pictures, Read the PNGs" | Agent catches its own defects |
| Loop breaker | "fix what you find once, re-record once, don't loop" | Caps the cost of a bad card |
| Machine-readable handoff | `manifest.json` per area | The coordinator assembles without reading prose |
| Coordinator owns git | "Do not run git" | One person decides what lands |

Carry all nine into the code factory. They are not metaphors — they map one-to-one.

## The Pipeline

```
Rules Catalog  →  rules.json  →  Work Cards  →  Lanes  →  Gates  →  Review queue  →  main
   (spec)         (registry)      (the unit)   (agents)   (CI)      (Dave)
                       ↓                                     ↓
                 Decision queue  ←──────────────────────  blocked cards
                     (Dave)
```

**[[Rules Catalog]] is the spec.** 131 rules, stable IDs, Given/When/Then examples, a status per
rule, and a standing instruction that every test names the rule it proves. It is already most of
the way to being machine-readable; [[Rule Coverage Gate]] finishes the job.

**Work cards are the unit of agent work.** The Rules Catalog says what must be true; cards say what
to build. One card is one agent, one branch, one PR, reviewable in about ten minutes. Format and
rules in [[Work Cards]].

**Lanes are groups of related cards** with an owner agent role and a fixed set of folders they may
write. A lane is the code equivalent of a `flows/<area>/` folder.

**Gates are CI.** Nothing reaches Dave's review queue that has not already passed every mechanical
check. See *The Gates* below.

**Two queues reach Dave**, and only two:

- **Decision queue** — cards blocked on a question only he or OTC can answer. Blocked cards block
  themselves, never the lane.
- **Review queue** — cards that are green and want a human yes. Batched, with the diff, the rules
  it claims to satisfy, and (for UI) a screenshot contact sheet.

## Separation of Duties

The single biggest quality risk in agent delivery is already named in [[Testing Strategy]]: an
agent that writes both the code and its tests tests what it built, bugs included. So roles are
separate agent invocations with separate inputs, and the separation is enforced by what each may
read and write.

| Role | Gets | Must not get | Writes |
|---|---|---|---|
| **Builder** | The card, the rule text, the golden module, the playbooks | — | Implementation + unit tests of its own calculations |
| **Test author** | The card, the rule text, the interface signatures, the OpenAPI document | **The implementation body** | `__tests__/` rule tests |
| **UI builder** | The card, the design system, the wireframe for its screen, the contracts | The service internals | `ui/` only |
| **Reviewer** | The diff, the card, the rule text, the screenshots | — | Review comments only. No code |
| **Coordinator** | Everything | — | Branch merges, card status, the queues. Owns git |

The test author's prohibition is the load-bearing one, and it is a prompt-and-tooling constraint,
not a hope: the test-authoring invocation is given the spec and the signatures, and the lane brief
forbids reading the implementation file.

## The Gates

A card is not reviewable until all of these are green. Each one is a thing Dave would otherwise
have to check by hand.

| # | Gate | Replaces |
|---|---|---|
| 1 | `typecheck` + `lint` (branded types, no `any`, no casts, no `process.env` outside `config.ts`, no cross-module imports) | Reading for type sloppiness |
| 2 | Four test projects pass: unit, property, integration (real Postgres), leak | Reasoning about correctness |
| 3 | **Cross-tenant leak coverage**, routes enumerated from OpenAPI — an uncovered route fails | Remembering to check authorization |
| 4 | **Rule coverage** — every V1 rule the card claims has a test naming its ID. See [[Rule Coverage Gate]] | Checking the code against the spec |
| 5 | Migration applies to an empty **and** a seeded database; previous image still boots against the new schema | Migration review |
| 6 | `package.json` unchanged, or the card is flagged for human approval (CODEOWNERS) | Dependency policing |
| 7 | OpenAPI regenerated and committed | Noticing drift |
| 8 | **Screenshot set** for every UI state (empty, loading, error, technician-filtered) + visual regression diff | Opening the app for every card |
| 9 | Mutation testing (StrykerJS) on money modules — scheduled, not per-card | Trusting invoice arithmetic |
| 10 | Reviewer-agent pass with no unresolved findings | The first read-through |

Gates 3, 4 and 8 are the ones that buy the most review time, and none of the three exists yet.

## Stage 0: What Must Exist Before the Factory Runs

This is foundation work, done with close supervision. It is not factory output, and trying to make
the factory build its own floor is how this goes wrong.

| # | Item | Why it blocks |
|---|---|---|
| 1 | **`rules.json` + the rule-coverage gate** | Without it the spec cannot review the agents, and Dave does it by hand forever. Highest leverage item in the project |
| 2 | **Work card deck for V1**, cards written and sequenced | The factory has nothing to consume. The [[PRD]] is still an outline; cards are what it is *for* |
| 3 | **`npm run new:module` scaffold** | Tier 3 of our own enforcement hierarchy, referenced by [[Agent Playbooks]], does not exist |
| 4 | **Playbooks rewritten for NestJS** | They still name Fastify files. ADR-027 settled the framework on 2026-10-13 |
| 5 | **Real auth** — Better Auth behind the `AuthN` port (ADR-012), opaque sessions (ADR-013) | Identity is a request header today, and the guard refuses to boot in production on purpose |
| 6 | **CI actually wired** — all ten gates, on a real runner | A gate that is not automated is a gate Dave is |
| 7 | **Lane briefs** — one `BRIEF.md` per lane, modelled on the video factory's | Agents need the hard rules in front of them, not in a doc they might read |
| 8 | **Canonical fixture story** — promote `wire.js`'s G-1048 into the seed factories | One story shared by tests, seeds, screenshots and the client demo |
| 9 | **Design system + reference screens, approved** | See *The Design System Track* |

Item 8 is small and unusually valuable: the client-facing guide, the test fixtures and the demo
data all telling the same story means a screenshot from CI is something Cam recognises.

## Factory Shapes

Four genuinely different arrangements. **Dave picks at M2.**

**A — Assembly line.** One module at a time, built to completion through the UI, merged, demoable.
Slowest wall-clock, cheapest review, every merge is real progress. Low risk, low ceiling.

**B — Layered waves.** All schemas, then all contracts, then all services, then all UI. Maximum
parallelism, nothing demoable until the end, and review arrives as forty PRs of plumbing that
cannot be evaluated in isolation. **Not recommended** — it optimises the resource that is not
scarce.

**C — Flow swarm.** The eight flows from the V1 guide become eight parallel lanes, each going
vertical through to UI against a frozen domain spine. Matches the wireframes, the client's mental
model, and the video factory's proven structure. The risk is shared entities: `job` and `invoice`
get touched by several lanes, so **one lane owns each table** and the others consume through
`index.ts` — the rule [[Evolution Path]] already requires.

**D — Spec compiler.** Invest first in rules → generated failing test stubs, then agents only fill
implementations until red goes green. Highest upfront cost, strongest autonomy, best fit for the
money rules where improvisation is least welcome.

### The recommendation, if it helps the M2 decision

Staged, not chosen once:

| Stage | What | Supervision |
|---|---|---|
| 0 | Foundation above | Dave, close |
| 1 | **Freeze the domain spine** — schema + Zod contracts for job, estimate, invoice, material, time entry | One agent, Dave's full attention. Everything downstream depends on this being right, so it is the cheapest place to spend review |
| 2 | **Flow swarm (C) over the spec compiler (D)** — eight lanes, each vertical through UI, every card carrying rule IDs | Gates + reviewer agent, Dave batches |
| 3 | **Money and QuickBooks** | Supervised, card by card. Never autonomous |

Stage 2 has plenty to chew on today: jobs, board, schedule, estimate structure, materials, POs,
time and payroll, report plumbing. Invoicing waits for accounting's answers.

## The Design System Track

**Decided direction: build the design system before the flow swarm, and get it approved before any
screen is built on it.** This follows Stage 1 and gates Stage 2.

The question that prompted it was "basic UI now and a fancy design later, or the fancy UI as we
go?" Both are wrong for a factory:

- *Harness UI now, redesign later* makes the redesign a rewrite of every screen, and shows Dan and
  Cam something they will react to for the wrong reasons.
- *Fancy UI per card* puts a design decision inside every card. Eight lanes invent eight visual
  languages and the result is the generic AI look, eight times.

**The third option: a design system first, and the factory only assembles screens from it.** In an
agent factory a design system is not polish — it is a constraint that shrinks agent decision space,
exactly the way branded types do on the backend. It is the frontend's golden module.

How it gets built:

1. **Promote `lib/wire.css` and `lib/wire.js` into real design tokens plus a React component kit** —
   frames, tables, boards, pills, modals, menus, the phone shell, the `.ph` image slot. The
   wireframes are already a complete screen inventory for all eight flows; they become the layout
   spec and the design system supplies the look.
2. **Fully design three or four reference screens** — job details, the board, an estimate, an
   invoice — with Dave's full attention and the `frontend-design` skill.
3. **Approval gate.** Dave approves, then Dan and Cam sign off on the look before the swarm starts.
   Every V1 screen inherits from it, so this is the last cheap moment to change direction.
4. After that the final design pass is a token and component change, not a rewrite of every screen.

Two constraints on what "fancy" means here:

- **Fast, dense, keyboard-friendly, and usable on an iPad with gloves on.** For a two-person shop
  this is the quality bar. A beautiful consumer-grade UI that is slow to key a job into is the
  expensive mistake.
- **UI needs its own review-throughput mechanism.** Promote the guide factory's `shoot.mjs`
  pattern: every UI card produces screenshots of every state, the reviewer agent reads them, Dave
  skims a contact sheet. Without it the UI lane consumes all of Dave's attention and the backend
  lanes stall behind him.

Still undecided and needed before the UI lanes run: **a frontend ADR.** There are twenty-eight
ADRs and not one of them is about the client. Router, data fetching, forms, and specifically the
**kanban board and the calendar** — the two components nobody wants hand-written, against a
dependency policy whose default answer is no. Decide it deliberately, not mid-card.

## What the Factory Never Builds Autonomously

Straight from the [[Rules Catalog]] coverage table: the twenty decision-needed rules cluster in
money — tax, rounding, deposits, the card surcharge, QuickBooks — and those are also the rules
hardest to change once invoices exist.

- Tax and rounding (PLAT-002, INV-006, INV-007)
- Deposits, refunds, the 3% surcharge (PAY-001…011)
- QuickBooks Online sync (QBO-001…006) — the largest and riskiest item in the 62, against a bus
  factor of one
- Anything touching migration of real open balances (MIG-001…003)
- Auth, tenancy scope, and the leak-test harness itself

Pattern: **the factory may not build the things that verify the factory, or the things that cannot
be corrected after the fact.**

## Honest Risks

| Risk | Note |
|---|---|
| Dave's review becomes the queue | The whole point of the ten gates. If the queue still backs up, cards are too big — shrink them, do not add agents |
| Agents repeat a wrong pattern consistently | An agent-written codebase repeats patterns, including bad ones. [[Agent Playbooks]] "Fix a Bug" step 5 is the compounding fix: a recurring bug class means a missing lint rule |
| Spec rot | A rule changed in the catalog with no re-run of the affected cards. The rule registry should report rules whose text changed after their test was written |
| Rules with no card | Silent scope loss. The coordinator reports uncovered V1 rules every run |
| Cost and plan limits | A continuously running factory will outrun a base personal subscription. Bounded nightly batches or separate API billing — Dave decides at M2 |
| Green but wrong | Presence of a test is not quality of a test. Mutation testing on money modules is the only real answer, and it only covers money |
| Foundation built by the factory | Stage 0 is supervised on purpose. A factory that pours its own floor cannot be trusted to inspect it |

## Related

- [[Work Cards]] — the card format and the rules for writing them
- [[Rule Coverage Gate]] — making the Rules Catalog machine-checkable
- [[Rules Catalog]] — the spec the factory builds from
- [[Testing Strategy]] — why roles are separated
- [[Code Standards and Guardrails]] — the four-tier enforcement hierarchy
- [[Agent Playbooks]] — the per-task checklists agents follow
- [[Roadmap]] — M2 is the start gate; this document is how M7 happens
- [[AI Readiness]] — the one-API discipline that lets the factory's own test agents drive the system
