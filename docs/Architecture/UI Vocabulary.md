---
created: 2026-11-03
tags: [fleetco, architecture, ui, design-system, vocabulary, agents]
status: live — the names in here are the component names in `fleetco-ui/src`
source: Claude Code (Xerro), from the device lab
---

## What this is

**The shared names for the parts of a screen.** [[Domain Model]] fixes the words for the
*business* — job, estimate, customer line, component, stage. This fixes the words for the
*interface* — rail, list column, detail pane, chip.

**Why it exists:** eight parallel lanes will otherwise invent eight names for the same box. One
agent writes `Sidebar`, the next `NavRail`, the third `LeftNav`, and six months later nobody can
grep for the thing they mean. It is the same failure the single route table prevents, one level up.

> **The component name is the vocabulary.** This document is a map from the picture to the code,
> not a second source of truth. If a name here disagrees with `fleetco-ui/src`, **the code is
> right and this file is stale** — fix the file.

![The shell, expanded rail, list and detail](media/ui-vocabulary.png)

## The shell

```
┌────────────┬──────────────────┬─────────────────────────────────┐
│            │ ② section header │ ⑤ detail header                 │
│ ① rail     ├──────────────────┼─────────────────────────────────┤
│            │                  │                                 │
│  ⑦ search  │   ③ list rows    │   ⑥ detail pane                 │
│  ⑧ nav     │                  │     ├ stat strip                │
│  ⑨ badge   │                  │     └ detail section            │
│            │                  │                                 │
│ ⑩ collapse │                  │                                 │
│ ⑪ context  │  ← list column → │                                 │
│    cluster │                  │                                 │
└────────────┴──────────────────┴─────────────────────────────────┘
                   ④ bottom bar (phone only, replaces the rail)
```

| # | Name | Component | What it is |
|---|---|---|---|
| ① | **Rail** | `AppShell` | The left navigation. **Expanded** (208px, labels) or **collapsed** (56px, icons). Not "sidebar" — that was the discarded variant |
| ② | **Section header** | `SectionHeader` | The **band** at the top of the list column: section name, count and actions. `ListHeader` on list sections, `PageHeader` on wide ones. **There is no top banner** — it duplicated this |
| ③ | **List row** | `ListRow` | One record in the list column. A **row**, never a card |
| ④ | **Bottom bar** | `AppShell` | The phone's navigation. Four items plus **More**, which opens the **More sheet** |
| ⑤ | **Detail header** | `DetailHeader` | A **band** carrying the eyebrow and the actions, then the title and subtitle below it |
| ⑥ | **Detail pane** | `ListDetailLayout` | The right pane. Holds a **stat strip** (the row of labelled numbers) and **detail sections** |
| ⑦ | **Search palette** | `SearchPalette` | Global search. Opened from the rail, `⌘K`, or the phone magnifier. Not a search *field*; there is nowhere to put one |
| ⑧ | **Nav item** | `AppShell` | One entry in the rail. Grouped into **nav groups** (work / sales / shop / admin) separated by a hairline |
| ⑨ | **Nav badge** | `NavBadge` | A **count** or a **dot** on a nav item. **Overlay** placement on an icon chip, **inline** at the end of a labelled row |
| ⑩ | **Collapse toggle** | `AppShell` | Switches the rail between expanded and collapsed |
| ⑪ | **Context cluster** | `ContextCluster` | Avatar, department and account, at the foot of the rail |

## Smaller parts

| Name | Component | Notes |
|---|---|---|
| **Chip** | — | The rounded tinted box behind an active icon. The one "you are here" cue, used identically in the rail and the bottom bar |
| **Pill** | `Pill` | A small outlined status label — stage, invoice status, priority |
| **Stat strip** | `Stat` in a grid | The row of labelled numbers under a detail header |
| **Detail section** | `Section` | A titled block inside the detail pane, usually wrapping a table |
| **More sheet** | `AppShell` | The full-screen list the phone's More button opens |
| **Empty state** | `ListDetailLayout` | What the detail pane shows with nothing selected |

## The band

**Every header at the top of a column is one height**, set by `--spacing-band` and used as
`h-band`. **No exceptions** — the rail's logo row, the section header, the first row of a detail
header, and the back row all share it. The result is a single horizontal line running across the
rail, the list column and the detail pane.

The no-exceptions part is deliberate. A rule with one carve-out is a rule eight parallel lanes will
get wrong; the back row could have been shorter, since it only appears on a narrow screen where
there is nothing beside it to line up with, and it is `h-band` anyway because the simpler rule is
worth more than sixteen pixels of phone height.

Two consequences worth knowing before changing anything:

- **The detail header's actions sit in the band, not beside the title.** That is what makes them
  line up with the section header's button, and it keeps them in one place however long the title
  runs.
- **The rail's logo row has no bottom border.** The band sets the height, which is what does the
  aligning. A rule under the logo only chops the rail in two.

Before this rule the three headers centred at 28px, 24px and 33px. Retune the single token in the
visual pass; never hand-pick a height for one header.

## Surfaces

Three tones, `--surface-1/2/3`, named by depth rather than by component so the shell can be
re-layered without renaming tokens. 1 is furthest back (the rail and the phone's bottom bar), 3 is
the front (the detail pane).

**Panes are separated by tone, not by a rule.** The rail and the list column have no border on
their right edge; the step in tone does that work. Borders stay for **discrete objects** — cards,
inputs, tables, and the rows inside a list.

### Dark nav

`[data-nav="dark"]` puts a dark rail and bottom bar on an otherwise light app. The rail is chrome,
not content — a dark frame around the work keeps the brightest surface where the money is.

It is a **scoped token override**, not a pile of `dark:` classes: the rule redefines `--foreground`,
`--accent`, `--border`, `--brand` and friends on `.nav-surface`, and every utility inside already
reads those variables, so the nav items, separators, context cluster and its popover all re-skin
with **no component changes**. That is the token layer earning its keep.

> **The gotcha, and it cost a bug:** custom properties inherit, but a plain `<span>` with no colour
> class inherits the *computed* colour from `<body>`, resolved against the light `--foreground`
> before the scope existed. The scope must therefore also set `color: var(--foreground)` on itself.
> Any future scoped override needs the same line.

## Overlays

One primitive, `Overlay`, with two presentations. Both are a Radix Dialog underneath, so focus
trapping, escape, scroll lock and the aria wiring are identical and are not each lane's problem.

| Name | What it is for | Desktop | Phone |
|---|---|---|---|
| **Dialog** | A decision or a short form that **blocks** you. You answer, then carry on | Centred card | Full screen |
| **Panel** | Inspecting or editing a record while its **context stays on screen** behind it | From the right, full height | A sheet up from the bottom, capped so the context still shows |
| **Search palette** | Global search only. Not a general overlay | Centred, near the top | Full screen |

**The rule that stops agents guessing: a list section never uses a panel.** Those screens already
have a detail pane, and a panel over it is a second detail view of the same record. Panels exist
for `pane: "wide"` screens — the board, the schedule, timesheets — which have no detail pane. A
board card opens a panel; a customer row does not.

Dialogs go full screen on a phone rather than shrinking, because a centred card on a 390px screen
is a postage stamp with a keyboard over it.

## Forms

| Name | Component | Notes |
|---|---|---|
| **Field** | `Field` | Label, control, and one line of hint **or** error. Never both |
| **Field row** | `FieldRow` | Two fields on a line where the container is wide enough |
| **Form body** | `FormBody` | The `@container` wrapper. Forms adapt to the width they are given, so the same form works in a panel and on a page |
| **Money input** | `MoneyInput` | Parses to integer cents (`PLAT-001`), `$` as an adornment, tabular and right-aligned |
| **Date input** | `DateInput` | Shop time, `America/New_York`, and the hint says so (`PLAT-003`) |

Three decisions, so no lane re-makes them:

1. **Labels sit above the field.** A label beside the field needs a second layout the moment
   the form is in a 390px phone or a 26rem panel, and this app puts forms in both.
2. **Optional is marked, not required.** Nearly every field in a shop system is required, so an
   asterisk on nine fields in ten is noise that stops being read.
3. **Controls are 40px tall** — taller than the shadcn default, because the primary device is an
   iPad on a shop floor and the primary hand may be gloved.

**A form lives in a panel or a page, never a dialog.** Dialogs are for a decision and at most two
or three fields; anything longer needs somewhere to scroll without fighting a keyboard.

## States

Four of them, and every UI card ships a screenshot of each — factory gate 8.

| Name | Component | The decision inside it |
|---|---|---|
| **Loading** | `LoadingRows` | **Skeletons, not a spinner.** A spinner says something is happening; a skeleton says what is about to appear and holds the layout, so nothing jumps when it lands |
| **Empty** | `EmptyState` | Says what is missing and offers the one action that fixes it |
| **Error** | `ErrorState` | What failed, plus a retry. **Never the raw error** — a stack trace tells Cam nothing and tells an attacker something |
| **Not found** | `NotFoundState` | Doubles as "not yours". See below |

**A technician who opens someone else's job gets "no such job", not "you do not have access".**
`ROLE-003` enforces assignment across lists, the board, the calendar, job records **and direct URL
access**. "You do not have access to this job" confirms the job exists and leaks its number; "no
such job" tells the only person who should care — the one who mistyped — exactly as much as they
need.

## Dense tables

| Name | Component | Notes |
|---|---|---|
| **Cell input** | `CellInput` | Editing inside a table. Transparent until hovered or focused, so the table reads as a table and edits as a form |
| **Money cell** | `MoneyCell` | Formatted while you read it (`$2,019.00`), raw while you type it (`2019.00`) |
| **Kind tag** | — | The small outlined label on a component: material, labor, allowance, custom item |

**Dense tables do not use the 40px form control.** A grid of forty bordered boxes is unreadable;
the border arrives on hover and focus instead. Money columns are always `tnum` and right-aligned —
an editable cell showing `2019.00` beside a computed one showing `$2,019.00` makes a column stop
lining up, which is the only thing a money column is for.

**Column priority, not horizontal scroll.** The estimate editor drops Margin below 1280 and Cost
below 1024, and the approval pill moves under the line name below `@md`. The line name and the
price never drop — they are what the screen is for.

## Naming rules

1. **Pane, column, bar, sheet — pick by behaviour, not by looks.**
   *Pane* fills the remaining space. *Column* has a fixed width. *Bar* is a thin full-width strip.
   *Sheet* covers the screen and is dismissed.
2. **The thing is named for what it holds, not where it sits.** "List column", not "left column" —
   it is the only pane on a phone and sits nowhere in particular.
3. **No synonyms.** Sidebar, nav bar, menu, drawer and panel are all **banned** in favour of the
   names above. A review comment saying "this is the rail, not the sidebar" is doing its job.
4. **Two words for two things.** A **count badge** says how many are waiting; a **dot badge** says
   something is off. Never call either a "notification".
5. **Layout names are role-independent.** There is no "technician rail" — there is a rail, filtered
   by role.
6. **A new name needs a component.** If there is nothing in `fleetco-ui/src` to point at, the thing
   does not need a name yet.

## Known gaps

Parts the design system does not have yet, so they have no agreed name. Each gets one when it is
built, and that is the moment to add it here rather than later:

- The board's columns and cards (`pane: "wide"`, nothing extracted yet)
- The calendar's entries and lanes
- The photo gallery and its capture control
- Toasts and other after-action feedback
- Confirm-destructive dialogs, which probably want their own variant (`INV-012` voiding,
  `JOB-011` cancelling)
- Anything on a customer-facing surface (estimate PDF, invoice PDF, payment page) — that is a
  **second design surface** with its own vocabulary, and `ROLE-009` means it cannot borrow internal
  components wholesale

## Related

- [[Domain Model]] — the business vocabulary this sits alongside
- [[Software Factory]] — why one vocabulary matters across parallel lanes
- [[Work Cards]] — cards name screens; those names come from here
- [[Code Standards and Guardrails]] — naming sits in Tier 4, conventions
- `fleetco-ui/README.md` — how to run the device lab and see all of this
