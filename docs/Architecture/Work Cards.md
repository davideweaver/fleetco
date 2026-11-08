---
status: current
summary: The card format — one card, one agent, one PR
created: 2026-11-03
updated: 2026-11-03
tags: [fleetco, architecture, agents, factory, cards, process]
source: Claude Code (Xerro), from [[Software Factory]]
---

## What a card is

The unit of agent work. **One card = one agent invocation = one branch = one PR, reviewable in
about ten minutes.** [[Rules Catalog]] says what must always be true; a card says what to build and
how we will know it is built.

Cards are markdown files with frontmatter in `factory/cards/<lane>/<id>.md`. No queue service, no
database, no bespoke tooling — the coordinator reads the folder, CI reads the frontmatter, and git
history is the audit trail.

**Why cards and not just the Rules Catalog:** a rule is an invariant, not a job. `INV-006 Invoice
arithmetic` is one rule and a week of work; `JOB-012 Priority never moves dates or prices` is one
rule and an afternoon. The card deck is where that gets sized and sequenced, and it is the artifact
the [[PRD]] has been waiting to become.

## Frontmatter

```yaml
---
id: JOB-BOARD-01            # permanent. lane-ish prefix + number. never reused
title: Job board stages, moves and priority
kind: module                # platform | module | ui | report | integration | migration | dependency
lane: 2-jobs                # which lane brief applies
status: ready               # see lifecycle below
size: M                     # S ≤ half a day of agent time, M ≤ a day, L → split it
module: jobs                # the NestJS module this lands in
owns:                       # tables this card creates. one lane owns each table, forever
  - jobs.job_stages
  - jobs.job_stage_moves
consumes:                   # other modules used, through their index.ts only
  - estimates
rules:                      # the rule IDs this card must satisfy. drives the coverage gate
  - JOB-004
  - JOB-005
  - JOB-006
  - JOB-012
screens:                    # wireframe keys from docs/Product/v1-video, so UI and API cards pair up
  - "2.1"
depends_on:
  - JOB-CORE-01
blocked_by: []              # decision IDs from Rules Catalog §15, e.g. D-C2
playbook: Add a Module      # which Agent Playbooks checklist applies
---
```

## Lifecycle

```
ready → building → tests → review → merged
  ↑                            ↓
blocked ←───────────────── changes requested
```

| Status | Meaning | Who moves it |
|---|---|---|
| `ready` | Dependencies merged, no open decision, lane free | Coordinator |
| `blocked` | Waiting on a `blocked_by` decision. Blocks itself, never the lane | Coordinator |
| `building` | Builder agent has the branch | Coordinator |
| `tests` | Implementation done; test author has the spec and the signatures, **not the body** | Coordinator |
| `review` | All gates green, reviewer agent clean, in Dave's batch | CI |
| `merged` | Dave said yes | Coordinator (owns git) |
| `parked` | Deliberately deferred. Needs a one-line reason | Dave |

## The eight rules for writing cards

1. **One card, one PR, ten minutes of review.** If the diff cannot be judged in ten minutes the
   card was too big. Shrink cards; do not add agents. Review capacity is the bottleneck
   ([[Software Factory]]).
2. **Every card names its rule IDs.** A `kind: module` card with `rules: []` is a bug in the card,
   not a card without rules. Only `platform` cards legitimately have none.
3. **A card may never contain a Decision-needed rule.** Split the card: build the confirmed part,
   and open a second card with `blocked_by: [D-Cn]`. This is what keeps one open question from
   stalling a lane.
4. **One lane owns each table.** Declared in `owns`. Every other lane reaches it through the
   module's `index.ts` — the rule [[Evolution Path]] already requires, and the thing most likely to
   go wrong in a parallel swarm.
5. **No card adds a dependency.** `kind: dependency` is its own card, needs the justification from
   the "Add a Dependency" playbook, and is approved by a human via CODEOWNERS on `package.json`.
6. **UI cards name their wireframe key.** `docs/Product/v1-video/flows/` is already a complete
   screen inventory for all eight flows; it is the layout spec, and the design system supplies the
   look.
7. **Acceptance criteria are Given/When/Then and quote the rule.** Copy the examples out of the
   Rules Catalog rather than paraphrasing them. Where a test and the implementation disagree, the
   spec decides.
8. **Done is mechanical, then human.** All gates green, reviewer agent with no unresolved findings,
   then Dave's yes. In that order, never skipping to the last.

## Card body

Six sections, in this order. Prose is for the reviewer, not the agent — the agent's instructions
are the lane brief and the playbook.

```markdown
## Why
One or two sentences. What the shop can do after this card that it could not before.

## Scope
**In:** the specific behaviour.
**Out:** everything a reasonable agent might add unasked, named explicitly.

## Acceptance criteria
Given/When/Then per rule, each prefixed with its rule ID.

## Interface
The Zod contracts and service signatures this card adds or changes. The contract is the spec
(ADR-014) — write it here and the implementation follows.

## Verification
The commands that must pass, plus anything the standard gates do not cover.

## Notes for the reviewer
What was chosen rather than specified, and where to look first. The agent fills this in.
```

## Worked example

`factory/cards/2-jobs/JOB-BOARD-01.md`, using the frontmatter above.

```markdown
## Why
The owner can see every open graphics job on one board and move it through production and
installation. This is the screen Cam lives on.

## Scope
**In:** the six stages as data; moving a job to any stage with `job.move_stage`; an audit record
per move; the authorized-scope precondition for Ready for Production; job priority.
**Out:** calendar entries and dates (JOB-014, JOB-015 — the calendar owns dates, the board owns
stage, and they are separate cards). Technician stage and priority permissions (ROLE-008 is
Decision needed, D-C2 — see JOB-BOARD-02). Drag-and-drop in the UI (card 2.1-UI).

## Acceptance criteria
- **JOB-004** Given a new department, when it is set up, then its stages are Ready for Production →
  In Production → Production Complete → Ready for Installation → Installation in Progress →
  Completed, stored as rows, renameable without a code change.
- **JOB-005** Given a user with `job.move_stage`, when they move a job from Completed back to In
  Production, then the move succeeds and one stage-move audit row records who, when, from and to.
- **JOB-006** Given a billable job with no authorized line, when a move to Ready for Production is
  attempted, then it is refused. Given the same job with one authorized line, then it succeeds.
- **JOB-006** Given an internal job and given a warranty job, each with no authorized line, when
  moved to Ready for Production, then both succeed (exempt).
- **JOB-012** Given a job scheduled for Tuesday at $2,019.00, when its priority changes to Rush,
  then the stage, the calendar entries and every amount are unchanged.
- **JOB-012** Given a new job, when it is created without a priority, then its priority is Normal.

## Interface
`POST /v1/jobs/:id/stage` → `{ stageId }`, returns the job.
`PATCH /v1/jobs/:id` → `{ priority: 'normal' | 'high' | 'rush' }`.
`jobs.moveStage(principal, jobId, stageId)` and `jobs.setPriority(principal, jobId, priority)`.
Outbox: `job.stage_changed` (carries from, to, jobId, tenantId).

## Verification
`npm run typecheck && npm run lint && npm run test:all`
Rule coverage: JOB-004, JOB-005, JOB-006, JOB-012 each named by a test.
Leak: both new routes present in the leak suite via OpenAPI enumeration.
Migration applies to an empty and a seeded database.

## Notes for the reviewer
(filled in by the agent)
```

Two things that example demonstrates deliberately: **JOB-006 is `Proposed`, so it gets built and
flagged**, and **ROLE-008 is `Decision needed`, so it is carved out into its own blocked card**
instead of stalling the board.

## Card kinds and which playbook applies

| Kind | Typical content | Playbook |
|---|---|---|
| `platform` | Branded types, guards, outbox, test harness, CI gates | None — supervised Stage 0 work |
| `module` | A domain module or a slice of one | Add a Module / Add an Endpoint / Add a Field |
| `ui` | Screens assembled from the design system | (to be written — the frontend playbook does not exist yet) |
| `report` | One of the nine V1 reports, with export and print | Add an Endpoint |
| `integration` | QuickBooks, the card provider, email | Add an Endpoint + supervised |
| `migration` | Schema change or data backfill | Write a Migration |
| `dependency` | A single package request with its justification | Add a Dependency |

`ui` has no playbook yet, and that is a Stage 0 gap worth naming: eight lanes writing screens with
no checklist is exactly the condition the playbooks exist to prevent.

## What the coordinator reports each run

- Cards merged, cards in review, cards blocked and on which decision
- **V1 rules with no card** — unplanned scope, the quiet failure mode
- **Rules whose catalog text changed after their test was written** — spec rot
- Cards that have been through `changes requested` twice — a signal the card is wrong, not the agent

## Related

- [[Software Factory]] — the pipeline these cards flow through
- [[Rule Coverage Gate]] — how `rules:` becomes a CI check
- [[Rules Catalog]] — the source of every acceptance criterion
- [[Agent Playbooks]] — the per-kind checklists
- [[Code Standards and Guardrails]] — what the gates enforce
