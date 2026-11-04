---
created: 2026-11-04
tags: [fleetco, architecture, ui, design-system, backlog]
status: live — tick items as they land in `fleetco-ui`
source: Claude Code (Xerro)
---

## What this is

What the design system still has to define before the factory can assemble screens from
it. Ordered by **what it would cost to get wrong**, not by size.

Vocabulary and rules for everything already built live in [[UI Vocabulary]]. This is the
queue.

## Done

- [x] Shell — rail (collapsing), bottom bar, More sheet, context cluster
- [x] One route table, three renderers
- [x] List-detail layout, section / page / detail headers, the band
- [x] Surfaces, palettes (neutral + warm), dark nav, dark theme
- [x] Overlays — dialog and panel, one primitive
- [x] Search palette
- [x] Forms — field, money, date, validation, the panel-not-dialog rule
- [x] States — loading, empty, error, not-found-vs-not-yours
- [x] Dense tables — cell input, money cell, column priority
- [x] Estimate line editor (`EST-002`/`003`/`006`, `AUTH-005`, `ROLE-005`)
- [x] Job board — drag, and **how to refuse** (`JOB-006`)
- [x] Calendar — week grid, overlap layout, `JOB-015` separation
- [x] Photos — per-photo upload state, the `JOB-008` gate (G13)
- [x] Badges and attention — one derivation for the rail and the list
- [x] List rows — monogram, attention reason, filter chips
- [x] **Approval capture** (`AUTH-002`/`003`/`004`) and the reason-required confirm
- [x] Row action menu — the action sits in the cell that shows the state

## Next

### Tier 1 — build before the swarm

- [ ] **Report shell + print.** Nine reports (`RPT-001`), all export **and** print. One
      shell or nine. Print is always discovered late and is a requirement here.
- [ ] **Timer, punch clock, timesheet.** The technician's main control. `TIME-002` one
      running timer, `TIME-004` needs an active punch, `TIME-013` left-running flag,
      `TIME-009` approval locks a period.
- [ ] **Date range picker.** Shared by reports and the schedule's week nav. Built twice
      is the default outcome.

### Tier 2 — real decisions

- [ ] **Long lists.** 200 customers, 60 invoices. No pattern for sort, pagination or
      virtualisation; the backend already does keyset pagination and the UI has nothing.
- [ ] **Customer-facing surfaces.** Estimate PDF, invoice PDF, emailed templates, hosted
      payment page. A **second design surface** — `ROLE-009` forbids borrowing internal
      components, with no toggle that can defeat it.
- [ ] **Settings forms**, especially **QuickBooks connection states** — connected,
      expired, needs reauth, error. Fiddly and easy to leave half-designed.
- [ ] **File attachments** on jobs, separate from photos.

### Tier 3 — before anything ships

- [ ] **Focus and keyboard pass.** Nothing systematic yet. Cheap now, tedious across
      forty screens later.
- [ ] **Negative, zero and credit amounts.** `tnum` is in place; the conventions are not.
- [ ] **Accessibility audit** — contrast across both palettes, both themes, and the
      nav-active chip.
- [ ] **Visual regression gate.** Factory gate 8 expects a screenshot contact sheet per
      card, and the lab is the obvious source. **Run it against `dev`, not a production
      build** — a StrictMode-only bug got through precisely because preview was checked.

## Open questions, not design work

These block a screen but are answered by people, not by drawing:

- [ ] **Who sets a photo's tag** (`JOB-008` requires one, nothing says how it is applied).
      Recommendation and options in [[UI Vocabulary]]. Adjacent to **D-C9**.
- [ ] **Can a technician drag a board card** — `ROLE-008`, **D-C2**. Read-only until
      answered.
- [ ] **Board columns scroll horizontally** even at 1440 with no list column. Accept, or
      narrow the cards?
- [ ] **Frontend ADRs still unwritten** — 029 tokens/shadcn, 030 container queries,
      031 one route table, 032 board and calendar (**answered: build, dnd-kit only**).

## Related

- [[UI Vocabulary]] — the names and the rules for what is built
- [[Software Factory]] — why the design system has to exist before the lanes run
- [[Work Cards]] — the `ui` card kind still has no playbook
- [[Rules Catalog]] — every item above cites the rule it serves
