---
created: 2026-11-03
tags: [fleetco, architecture, testing, ci, factory, spec]
status: spec — ready to build in Stage 0. Not started
source: Claude Code (Xerro), from [[Software Factory]]
---

## Why this is the highest-leverage thing in the project

[[Rules Catalog]] already carries the instruction: *"Every test names the rule it proves. CI fails
if a Confirmed, Inferred or Proposed V1 rule has no test."* Nothing enforces it today, which means
checking the code against the spec is Dave's job, by hand, forever.

This gate makes **the spec review the agents**. It is the difference between a factory Dave
supervises and a factory Dave is a part of.

What it does *not* do: judge whether a test is any good. Presence is not quality. Mutation testing
on the money modules ([[Testing Strategy]]) is the only real answer there, and it only covers money.
Be honest about that split — this gate catches *missing*, not *weak*.

## Approach: parse the catalog, do not duplicate it

Three options were considered:

| Option | Verdict |
|---|---|
| **Parse `Rules Catalog.md` directly** into `factory/rules.json` | **Chosen.** Zero duplication, one source of truth, and the prose stays readable for Cam. Cost: the format becomes a contract, enforced by a linter |
| Keep the prose and add a fenced YAML block per rule | Rejected. Two things to keep in step, and the thing that rots is the one nobody reads |
| Move rules into YAML and generate the markdown | Rejected. The catalog is a client-legible document that Cam marks up. Generated prose invites nobody to edit it |

The parser is a single script with **no new dependencies** — the dependency allowlist in
[[Code Standards and Guardrails]] applies to tooling too. Hand-rolled regex over ~1,000 lines of
markdown with a strict format contract is about 120 lines.

## The format contract

The catalog is already consistent. The parser requires exactly this and the linter fails anything
else:

```
## <n>. <Section name> (<PREFIX>)          ← section, establishes the ID prefix

### <PREFIX>-<nnn> <Rule name>             ← one rule
**Rule:** <statement>                       ← required
**Examples:**                               ← optional
- Given … when … then …
**Source:** <codes> · **Status:** <status> · **Phase:** <phase>
```

Parsing rules:

1. **Fenced code blocks are skipped.** §"How to read a rule" contains a sample `### EST-007`
   heading inside a fence; a naive parser picks it up as a duplicate.
2. `Status` is the **first word or two before any parenthetical**: `Confirmed (same-customer
   Inferred)` → `Confirmed`. The parenthetical is kept as `statusNote`.
3. `Source` may be absent (several Decision-needed rules have only Status and Phase).
4. `Decision needed (D-C10)` → `status: "Decision needed"`, `decisions: ["D-C10"]`.
5. The ID prefix must match its section's prefix. `JOB-004` under `## 7. Time and payroll (TIME)`
   is a filing error and fails the linter.
6. IDs are unique, permanent, never reused. A `Retired` status is legal; deletion is not.
7. §14 is a table of `FUT-nnn` constraints and §15 is tables of `D-*` decisions. Both are extracted
   so cards can reference them, but neither is testable.

## The registry

`factory/rules.json`, regenerated on every CI run and never committed by hand:

```json
{
  "generatedAt": "2026-11-03T14:02:00Z",
  "sourceHash": "sha256:…",
  "rules": [
    {
      "id": "JOB-006",
      "section": "JOB",
      "name": "Billable jobs need authorized scope before production",
      "rule": "a billable job can't enter Ready for Production without…",
      "examples": ["Given a billable job with no authorized line, when…"],
      "status": "Proposed",
      "statusNote": null,
      "phase": "V1",
      "decisions": [],
      "sourceCodes": ["PL 2.9"],
      "hash": "sha256:…",
      "buildable": true,
      "line": 430
    }
  ],
  "decisions": [{ "id": "D-C2", "owner": "Cam", "question": "…", "rules": ["ROLE-008"] }],
  "futureConstraints": [{ "id": "FUT-003", "note": "…", "v1Impact": "…" }]
}
```

`buildable` is derived: `phase === "V1" && status ∈ {Confirmed, Inferred, Proposed}`. That set comes
straight from the catalog's own status table — *Decision needed* means "don't build," so it is not
buildable and not expected to have a test.

## Test naming convention

```ts
it('JOB-004: stages are stored as data and can be renamed', …)
it('JOB-005, JOB-012: a stage move leaves priority and amounts untouched', …)
```

Contract: `^(?<ids>[A-Z]{3,4}-\d{3}(?:,\s*[A-Z]{3,4}-\d{3})*):\s`. One test may prove several rules.
A test with no rule prefix is legal — plumbing, edge cases and regression tests do not need one.

**Coverage is read from the test runner, not from the source.** `vitest --reporter=json` gives the
tests that actually **ran and passed**. Grepping source files would count a commented-out test, a
string in a fixture, and an `it.skip`. A skipped or `todo` test does not count as coverage — this is
the detail that keeps stub generation honest.

## Gate behaviour

| # | Check | Result |
|---|---|---|
| 1 | Every `buildable` rule has ≥1 passing test naming it | **Fail**, listing missing IDs with catalog line numbers |
| 2 | Every rule ID named by a test exists in the registry | **Fail** — typo and stale-ID catcher |
| 3 | A test names a `Decision needed` rule | **Fail** — something was built that we agreed not to build |
| 4 | A test names a `Later` or `Retired` rule | **Fail** — scope leak, or a test that outlived its rule |
| 5 | Every card's `rules:` entries exist, and none is `Decision needed` | **Fail** — rule 3 of [[Work Cards]] |
| 6 | Catalog format lints clean (every `###` under §1–13 parses, prefixes match, no duplicate IDs) | **Fail** |
| 7 | A rule's text changed since its test last passed | **Report**, into Dave's review queue. See spec rot |
| 8 | A `buildable` V1 rule appears in no card | **Report** — unplanned scope, the quiet failure |
| 9 | A waiver has expired | **Fail** |

Checks 1–6 and 9 block. 7 and 8 are reports, because failing a build over a prose edit or an
unwritten card is the wrong kind of strict.

### Structural rules

Some rules are enforced by a type or a lint rule rather than a behaviour. `PLAT-001 Money is
integer cents` is enforced by the `Cents` brand plus the ban on `parseFloat`; writing a behaviour
test for it is theatre.

`factory/rule-enforcement.yml` maps those:

```yaml
PLAT-001:
  enforcedBy: type        # type | lint | schema-test
  provenBy: platform/__tests__/money.brand.test.ts
  note: Cents brand plus the parseFloat ban. The test proves the guardrail exists, not the behaviour.
```

A rule listed here still needs a passing test naming it — the test just proves the *guardrail* is in
place. This keeps the "every rule has a test" invariant whole instead of carving an exception into
it.

### Waivers

`factory/rule-waivers.yml`, CODEOWNERS-protected so only Dave can add one:

```yaml
- rule: QBO-003
  reason: QuickBooks sandbox not provisioned yet; card QBO-SYNC-02 blocked on D-A4
  owner: dave
  expires: 2026-12-15
```

An expired waiver fails the build. A waiver with no expiry is not valid. This is the pressure valve
that stops the gate becoming the reason to disable the gate.

## Stub generation

`npm run rules:stubs <SECTION>` emits, for every buildable rule with no coverage:

```ts
it.todo('JOB-006: a billable job cannot enter Ready for Production without an authorized line')
// Rule: a billable job can't enter Ready for Production without at least one authorized line.
//       Internal jobs are exempt; warranty jobs are exempt.
// Examples: (copied from the catalog)
// Status: Proposed · Source: PL 2.9 · Catalog line 430
```

This is the **test author's** input, and it is the mechanism behind factory shape D (spec compiler):
the card is done when its stubs are implemented and green. `it.todo` contributes nothing to
coverage, so generating stubs cannot accidentally satisfy the gate.

The stub text deliberately carries the rule and its examples, and deliberately carries **no
interface and no implementation** — the test author gets the spec and the signatures only
([[Testing Strategy]]).

## Spec rot

Each rule's `hash` is stored in `factory/rule-hashes.json` when its tests last passed. When the
catalog text changes, the hash moves and the rule is flagged `stale`:

- The coordinator reports stale rules with their cards and tests
- Clearing it requires a human to re-read the test against the new text and re-bless the hash with
  a one-line reason in the commit

Without this, a rule can be corrected in the catalog and the code quietly keeps the old behaviour,
with a green build and a test whose name still cites the rule. That is the most dangerous failure
mode this gate has, and it is cheap to detect.

## Honest limits

1. **Presence, not quality.** A test can name `INV-006` and assert almost nothing. Mutation testing
   on money is the backstop; the reviewer agent's question is still *"if I broke this function,
   would a test catch it?"*
2. **The parser is a dependency on prose.** The format linter makes breakage loud rather than
   silent, but a catalog rewrite means a parser change.
3. **Rule granularity is uneven.** `JOB-012` is an afternoon and `INV-006` is a week. Coverage
   counts both as one. Cards, not rules, are the unit of progress — see [[Work Cards]].
4. **Cross-rule interactions are uncovered.** Every rule green does not mean the workflow works.
   That is what the handful of Playwright end-to-end paths and the canonical G-1048 story are for.
5. **The catalog has internal errors today** and the linter will not catch them: `JOB-008`'s note
   cites `JOB-016` for the quality checklist, but checklists are `JOB-017`. Worth a pass over
   cross-references before generating anything from it.

## Build order

Stage 0, roughly a day of supervised work, in this order:

1. Parser + format linter + `rules.json` (fails loudly on today's catalog until it is clean)
2. Fix whatever the linter finds in the catalog, including the cross-reference errors
3. Coverage check off the vitest JSON reporter, checks 1–4
4. Card cross-check, checks 5 and 8 — after the card deck exists
5. Waivers and structural enforcement
6. Stub generator
7. Hashes and spec-rot reporting

Steps 1–3 are enough to turn the gate on. The rest can land while the factory runs.

## Related

- [[Software Factory]] — gate 4 of ten, and why it matters most
- [[Work Cards]] — where `rules:` comes from
- [[Rules Catalog]] — the parsed source
- [[Testing Strategy]] — the spec-not-implementation rule this enforces
- [[Code Standards and Guardrails]] — the other tiers of enforcement
