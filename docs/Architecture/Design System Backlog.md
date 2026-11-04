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
- [x] **Attention** — the one derivation behind badges, dots, chips and filters
- [x] List rows — monogram, attention reason, filter chips
- [x] **Approval capture** (`AUTH-002`/`003`/`004`) and the reason-required confirm
- [x] Row actions — the action sits in the cell that shows the state
- [x] Destructive confirm with a required reason (`INV-012` void, and the override branch)
- [x] **Dates** — one grid, `DatePicker` and `DateRangePicker`, presets, shop-local
- [x] **Report shell + print + CSV** (`RPT-001`/`004`/`006`) — one shell, nine reports
- [x] **Time** — punch clock, timer, timesheet review, corrections, the period lock

## Next

### Tier 1 — build before the swarm


- [ ] **Wire the time reports to the time data.** `src/data/time.ts` now exists, so
      Clocked hours, Job hours and Timesheets can be real. `RPT-007` expected-vs-actual
      still needs `EST-011` expected hours, which the estimate does not carry yet.
- [ ] **Payroll export** (`TIME-010`) — approved periods only, CSV and printout, hours by
      employee and date, no wages. The report shell already does both halves.
- [ ] **Pay period length is `D-C12`.** The review screen shows one undated period; it
      cannot show real boundaries until someone answers weekly or fortnightly.
- [ ] **Reopening an approved period is audited** (`TIME-009`) and has no UI yet.
- [ ] **The four time reports have no data.** Payments, Clocked hours, Job hours and
      Timesheets render the shell and their definitions but no rows — they wait on the
      timer below. `RPT-007` expected-vs-actual needs the variance conventions from the
      negative-amounts item in Tier 3.
- [ ] **"Page 1 of 3" on paper.** Browsers will not put a page count into the document
      without a paged-media polyfill. Chrome's own print footer can carry it; decide
      whether that is good enough before promising it.
- [ ] **A technician can reach Reports by URL** and sees the nine names. The financial
      ones refuse, but the non-financial ones render. Correct per `RPT-001`, possibly
      not per intent — ask.



### Tier 1 — Attention, the rest of it

`Attention` is the summarised state of a record that bubbles up as a chip, a filter count
and a rail badge. The mechanism is built and the four current rules are wired; what is
left is coverage and the parts no screen has needed yet.

- [ ] **Attention on the remaining sections.** Estimates, schedule, time and parts have no
      rules yet. Each one needs a reason that is derivable, not a per-user "unread".
- [ ] **Attention inside a record.** A job needing a photo (`JOB-008`) or an estimate line
      waiting on an answer is attention at line level, and nothing bubbles it to the
      record's own chip yet.
- [ ] **Zero and overflow.** What the filter does when the count drops to zero while you
      are looking at it, and what the badge shows past 99.
- [ ] **Does it belong in a report?** The AR report and the attention count answer nearly
      the same question. If they disagree, one of them is wrong.
- [ ] **The completion photo tag is brand amber** (`photos.tsx`), which sits close to the
      attention amber in the warm palette while meaning the opposite — a `JOB-008` gate
      *satisfied*. Decide whether that tag keeps a colour at all.

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

- [ ] **The popover does not flip.** It opens below its trigger and stays there, so a
      date field low on a long scrolling panel has its footer clipped. Fine where the
      pickers sit today (headers, the top of forms); fix it before one lands at the foot
      of a page.
- [ ] **Keyboard on the calendar grid.** Arrows, PageUp/Down and Enter are not wired —
      part of the focus pass below, but listed here because a date picker is the control
      people most expect to drive from the keyboard.
- [ ] **Wire the schedule's week nav to `DateRangePicker`.** Its arrows and "Nov 2 – 6"
      are still hardcoded, because `WEEK` in the sample data is strings rather than real
      dates. Moving it is what makes the picker and the grid agree.
- [ ] **Focus and keyboard pass.** Nothing systematic yet. Cheap now, tedious across
      forty screens later.
- [ ] **Negative, zero and credit amounts.** `tnum` is in place; the conventions are not.
- [ ] **Accessibility audit** — contrast across both palettes, both themes, and the
      nav-active chip. The light-warm `--brand` was found at 4.06:1 and fixed; assume
      others are lurking, and check with a measurement rather than by eye.
- [ ] **Visual regression gate.** Factory gate 8 expects a screenshot contact sheet per
      card, and the lab is the obvious source. **Run it against `dev`, not a production
      build** — a StrictMode-only bug got through precisely because preview was checked.

## Open questions, not design work

These block a screen but are answered by people, not by drawing:

- [ ] **Who sets a photo's tag** (`JOB-008` requires one, nothing says how it is applied).
      Recommendation and options in [[UI Vocabulary]]. Adjacent to **D-C9**.
- [ ] **Can a technician drag a board card** — `ROLE-008`, **D-C2**. Read-only until
      answered.
- [ ] **How often does Cam override?** Recording what the customer said on the phone is an
      approval (`AUTH-011`), not an override — overrides are for when nobody answered. The
      dialog currently treats override as the quieter path. If it is his daily path, it
      should be a peer of Approved and Declined. Ask alongside **D-C8**.
- [ ] **Board columns scroll horizontally** even at 1440 with no list column. Accept, or
      narrow the cards?
- [ ] **Frontend ADRs still unwritten** — 029 tokens/shadcn, 030 container queries,
      031 one route table, 032 board and calendar (**answered: build, dnd-kit only**).

## Related

- [[UI Vocabulary]] — the names and the rules for what is built
- [[Software Factory]] — why the design system has to exist before the lanes run
- [[Work Cards]] — the `ui` card kind still has no playbook
- [[Rules Catalog]] — every item above cites the rule it serves
