---
status: living
summary: Dated log of Charlie's apprenticeship — what he built each session, what was reviewed, what is next
created: 2026-11-12
updated: 2026-11-12
tags: [fleetco, apprenticeship, charlie, journal]
source: Claude Code, from Dave's session notes
---

## Overview

A running log of the apprenticeship, newest first. Dave adds an entry every day or two. The plan
itself lives in [[Apprenticeship Overview]], [[Shop Tracker Handbook]] and
[[Local AI Detour]]; this is what actually happened.

Hours are recorded in Charlie's timesheet, not here. The sheet is the record for pay; this journal
records the work.

**Charlie's repositories**

| Repo | What it is |
|---|---|
| `Cdweave24/shop-tracker` | The training project. [[Shop Tracker Handbook]] |
| `Cdweave24/test-test` | Week 1 multiple-choice quiz. Finished, kept as a baseline |
| `Cdweave24/ollama-chat` | Not started. [[Local AI Detour]] Project A |
| `Cdweave24/quiz-ai` | Not started. [[Local AI Detour]] Project B |

---

## 2026-11-12 — Reviewing the first session, and planning the AI interlude

No session with Charlie. Dave read both repositories and planned what comes next.

**Decided**

- **Hours are capped at 10 a week**, at $25 an hour, tracked by Charlie in a Google Sheet.
- **Slack.** Charlie is invited to Dave's Slack workspace, and it becomes the normal channel for
  questions between sessions.
- **The AI interlude is the next work**, before Week 3 of the handbook: a console chat app against
  a local Ollama server, then the quiz rebuilt so the model writes the questions and grades
  free-text answers. Written up as [[Local AI Detour]].
- **Week 2 comes first**, and its practice issues are no longer invented: the review below is the
  backlog.

**The pacing concern.** Charlie covered most of Week 1 in a single three-hour session, with a lot
of help from Codex. The handbook is not a race, and finishing early is only worth something if the
understanding came with it. Standing rule added to [[Apprenticeship Overview]]: before a session
ends, Charlie explains one thing he submitted that day, and the measure of a week is what he can
explain, not what he shipped.

### Code review: `shop-tracker`

Four commits, all straight onto `main`. `summary.js` reads `units.json` and prints it through
`printTable.js`, a hand-rolled replacement for `console.table` with borders, column widths derived
from the content, title-cased headings and colored statuses. `addUnit.js` prompts for a new unit,
validates each field, shows it for confirmation and appends it to `units.json`.

It works, and it is more than Week 1 asked for. The stated goal — replace `console.table` with
your own — was a good instruction and it landed.

**Who wrote what.** `printTable.js` and `addUnit.js` are Codex's work, and not subtly:
`Object.hasOwn`, ANSI escape codes by number, a `paint` helper, and a comment explaining that
padding has to happen before coloring so the escape codes do not break alignment. `test-test`'s
`test.js`, by contrast, is unmistakably Charlie's own hand. That contrast is the most useful thing
in the review, and the questions below are built on it.

**Findings, in order of what they teach**

1. **The README no longer matches the repo.** It still says to download `summary.js` and run it.
   `summary.js` now requires `printTable.js` and `units.json`, so following the README gets you a
   crash. Week 1's acceptance criterion was "someone else can follow your README and run your
   program," and right now it fails. Instructions are part of the deliverable.
2. **A commit message is not a prompt.** Commit `58e04c7` reads "Modify summary.js to include a
   more detailed list of units with additional attributes such as unitType and status. The updated
   array should contain at least five different units..." — that is the instruction Charlie gave
   the AI, pasted in as the message. A commit message says what changed and why, for whoever reads
   it in a year.
3. **No `package.json`.** Neither repo has one, so there is no `npm start`, no `npm test`, no place
   for dependencies and no way for anyone to know what the project is. Week 1 said understand npm;
   this is the missing half of it.
4. **`year` is a string, `unitNumber` is a number.** In `units.json`, `"year": "2001"` but
   `"unitNumber": 183324`. Both came from the same prompt loop, and only one got converted. Fine
   today; the day something sorts or compares years, it is a bug. A good first taste of why
   TypeScript arrives in Week 6.
5. **`units.json` is read, modified and written whole.** Two sessions of `addUnit.js` at once and
   one silently erases the other's unit. Codex knew, and quietly added "Use one data-entry session
   at a time" to the README instead of solving it. Worth asking Charlie whether he noticed that
   sentence appear, and what it is admitting.
6. **`printTable.js` prefixes statuses with `● ` and then does `value.slice(2)` to look up the
   color.** Two pieces of code silently agreeing that the marker is exactly two characters long.
   Works; will break the first time someone changes the marker. A clean small example of coupling.

### Code review: `test-test`

Five questions, four options each, `readline/promises`, a score at the end. Charlie's own code
throughout, and it does what was asked.

1. **Answers are compared case-sensitively.** `response === questions[i].Answer` with `Answer` set
   to `"A"`, so typing `a` is marked wrong. This is the bug to hand him first: it is real, a user
   hits it immediately, and he can fix it in one line once he has reproduced it.
2. **Invalid input is counted as wrong.** Typing `E`, or pressing Enter, scores zero for that
   question with no complaint. Compare with `addUnit.js`, where Codex wrote a re-prompting `ask`
   helper — the same problem, solved in one repo and not the other. Which is a question about
   whether the solution in `addUnit.js` is understood or just present.
3. **`questionsCorrect` and `len` are module-level.** Run `test()` twice in one process and the
   score keeps climbing. Also: `len` is `questions.length`, and `for...of` would remove the need
   for both the counter and the index.
4. **The four options are printed with four near-identical `console.log` lines.** The data is an
   object, so it can be looped. Nothing is wrong with it — it is the natural shape of a first
   version — which makes it a good place to practice a refactor that changes no behavior.
5. **`async`/`await`, the reason for it.** Asked why, Charlie said the error told him to. Honest,
   and the right thing to say rather than inventing a reason. [[Local AI Detour]] exists to replace
   that answer with a real one.
6. **The name.** A quiz app called `test-test`, in a file called `test.js`, in a trade where "test"
   means automated test. Naming is a real engineering skill and this is a cheap place to learn it.

### Questions for the next session

Not a quiz. These are the places where the answer tells Dave whether the code is Charlie's.

1. In `printTable.js`, what are `\x1b[32m` and `\x1b[0m`, and what happens if you delete the
   second one?
2. Why does the code pad a cell to its column width *before* coloring it? What goes wrong the
   other way round?
3. `columns` is built with `[...new Set(rows.flatMap((row) => Object.keys(row)))]`. Walk that from
   the inside out. What does it do if one unit is missing `status`?
4. `addUnit.js` re-prompts until the input is valid. Why doesn't `test.js`?
5. In `addUnit.js`, which lines could fail in a way you cannot prevent, and what does the program
   currently do about it?
6. What is `await` waiting for in `test.js`? What would happen without it?

### Next

1. Week 2 of the handbook: issues, a branch per issue, a pull request Dave reviews, and a
   deliberate merge conflict. The issues come from the two reviews above — start with the
   case-sensitive answer bug and the stale README.
2. Add a `package.json` to both repos.
3. Then [[Local AI Detour]], Project A.

---

## 2026-11-11 — First session, three hours

Charlie's first paid session, done on his own after the setup walkthrough. Roughly three hours,
and most of Week 1 in it.

**What he did**

- Created a GitHub account (`Cdweave24`).
- Set up his Windows desktop: VS Code, Git on the command line, Node.js.
- Created `shop-tracker`, his first repository, and cloned it.
- Built a JSON structure of fleet units — unit number, type, year, make, model, customer, status —
  and printed it with `console.table`.
- On Dave's instruction, replaced `console.table` with his own `printTable`, implemented from
  scratch, then extended it with options for a title and colored output.
- Added `addUnit.js`, which prompts for a new unit and saves it to `units.json`, so data survives
  the program exiting.
- Created a second repository, `test-test`, and built a five-question multiple-choice quiz that
  reads answers from the terminal and reports a score.

**How it went.** Four commits on `shop-tracker`, four on `test-test`, all onto `main` — branches
and pull requests are Week 2. Codex did a lot of the work on `shop-tracker`; `test-test` looks
hand-written. Dave asked about the `async`/`await` in the quiz and Charlie said the error message
told him it was needed, which is at least honest.

Reviewed in the 2026-11-12 entry above.

---

## Entry template

```markdown
## YYYY-MM-DD — <a few words>

<What happened, in a sentence or two. Hours go in the timesheet, not here.>

**What he built**

- …

**What came up**

- <Questions asked, things that stuck, anything that needed explaining twice.>

**Decided**

- …

**Next**

1. …
```
