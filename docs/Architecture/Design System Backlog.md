---
status: living
summary: Design-system work, ticked off as it lands
created: 2026-11-04
updated: 2026-11-05
tags: [fleetco, architecture, ui, design-system, backlog]
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
- [x] **Time** — the day/job clock, timesheet review, corrections, the period lock.
      The technician's card was rebuilt 2026-11-04: the two clocks are two cards rather
      than one nested in the other, pay is named once, and job hours read as a part of the
      day instead of a second addable number. See [[UI Vocabulary]] for why nesting failed.

## Next

### Tier 1 — build before the swarm


- [ ] **Wire the time reports to the time data.** `src/data/time.ts` now exists, so
      Clocked hours, Job hours and Timesheets can be real. `RPT-007` expected-vs-actual
      still needs `EST-011` expected hours, which the estimate does not carry yet.
- [ ] **Payroll export** (`TIME-010`) — approved periods only, CSV and printout, hours by
      employee and date, no wages. The report shell already does both halves.
- [ ] **Pay period length is `D-C12`** — ask Cam: weekly or fortnightly, and which day
      it starts. Review now steps whole weekly periods, Mon–Sun, and says on screen that
      this is an assumption. Only the step size changes when it is answered.
- [ ] **Approved periods are not persisted** — approving is in-page state, so stepping
      away and back forgets it. Needs the real thing before anyone trusts `TIME-010`.
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



### Tier 1 — Today, the rest of it

Built 2026-11-05 as the screen signing in lands on. Three organising principles went into
the lab — by time, by kind of obligation, by urgency — and **by-kind won for the Owner**;
the other two are deleted rather than parked behind a flag. The Owner gets two columns
(scheduled work left, decisions right); the technician gets one column that **is** the
clock screen, so `/app/time` redirects them here.

- [ ] **Name the parts in [[UI Vocabulary]].** The lede, the block, the day-sheet row and
      the roll-up have no agreed names yet, and the naming rules say a kept thing gets one.
- [ ] **The roll-up has no attention rule of its own**, by design — `attentionAll` walks
      the sections that do. Today's gaps are therefore theirs: estimates and the schedule
      contribute nothing because neither has a rule yet (see below).
- [ ] **`phone: 0` pushed Invoices off the owner's bottom bar.** Four slots, and Today
      took one. Decide whether Invoices or Schedule goes behind More.
- [ ] **No empty state has been designed.** A shop with a clear day and nothing waiting
      gets two sentences saying so, which is correct but has not been looked at.
- [ ] **The technician has no payroll view at all now.** Correct for V1 — `TIME-008` says
      they cannot change their own time — but "what am I getting paid this period" is a
      question they will ask, and the answer is currently nowhere.

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

- [ ] **Long lists — the rest of it.** `Jobs.tsx` has a 25-row page with load-more, a
      count and scope chips, and the lab has a Long list screen for judging it, so the
      pattern exists. Sort and virtualisation do not, and nothing matches the backend's
      keyset pagination yet.
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
      - **Known and open:** `confirm.tsx` hardcodes `text-white` on `bg-destructive`, which
        is 2.87:1 in dark mode. `--destructive-foreground` now exists (added 2026-11-04 for
        the clock in/out buttons) and fixes it in one line. This is the case the audit
        predicts, and the reason the colour lint in the parked section is worth having.
- [ ] **Check every table at 390px before it lands.** Two tables shipped this session
      that only worked on a desktop. A dense table is the component most likely to be
      built at one width and never looked at again — the lab's Phone toggle exists for
      exactly this and was not used.
- [ ] **Visual regression gate.** Factory gate 8 expects a screenshot contact sheet per
      card, and the lab is the obvious source. **Run it against `dev`, not a production
      build** — a StrictMode-only bug got through precisely because preview was checked.

## Parked — until OTC reviews and approves the screens

**Why parked:** all of it hardens rules about screens OTC has not signed off on yet. If the
review moves the Time card again, or changes what a job detail shows, a lint rule and a
contact sheet built against today's screens are work done twice. Approval first, then the
guardrails. Gated on the review coming back, not on a date — agreed 2026-11-04.

### Turning the vocabulary into something an agent can follow

The guide is largely written: [[UI Vocabulary]] is 942 lines of it. What is missing is the
parts that make prose *followable* rather than readable.

- [ ] **The non-negotiables as code, not sentences.** `fleetco-ui` has no ESLint, no tests
      and no agent instructions file — `typecheck` is the only gate, so every rule in
      [[UI Vocabulary]] is on the honour system. Three rules cover most of what has actually
      gone wrong:
      - ban raw colours (`text-white`, `bg-neutral-*`, hex) outside `index.css` and `lab/`
      - a contrast test across every fg/bg pair in all four themes, failing under 4.5:1
      - ban bare `<button>` outside `components/ui/` and `shell/`, so `Btn` stays the one button
- [ ] **A parts page in the lab** (`/lab/parts`) — every primitive in every state, not only
      the nineteen assembled screens. One page does three jobs: the agent's catalogue of
      what already exists, the human's visual diff, and something for the screenshot gate
      to compare primitives against.
- [ ] **The `ui` card playbook.** [[Work Cards]] lists `kind: ui` and says the playbook does
      not exist. It is the actual handoff: pick the layout, pick the header, wire the four
      states, check at 390px, screenshot it.
- [ ] **Split the audience.** [[UI Vocabulary]] keeps the *why* for humans — the arguments
      and the rejected alternatives, which is what stops a settled question being
      re-litigated. Agents get a short, always-loaded `fleetco-ui/CLAUDE.md`: file map, hard
      rules, what already exists, and pointers into the long doc by section. 56KB is about
      14k tokens, and an agent fixing a table should not be loading the Time rules.
- [ ] **Prove it with one screen.** Hand an agent only the guide and one unbuilt screen —
      QuickBooks connection states is the right size — with no conversation, and see what
      comes back. That finds the holes faster than re-reading the document.

**The line to hold:** anything that cannot be linted, an agent will eventually violate.
Anything that cannot be seen in the lab, a human will not catch. The written guide is the
narrow middle — the judgement calls that are neither mechanical nor visible.

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
