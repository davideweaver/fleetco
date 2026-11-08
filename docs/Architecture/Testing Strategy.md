---
status: current
summary: Test layers and the CI gates
created: 2026-10-09
updated: 2026-10-30
tags: [fleetco, architecture, testing, quality, agents]
source: Claude Code (Xerro)
---

## Overview

How correctness is established and kept, given that **the code will be written by a fleet of AI
agents and reviewed by one person.**

That delivery model changes what testing is *for*. The bottleneck is not writing code; it is
**verifying it**. Tests are the mechanism that makes agent output safe to accept at volume, which
makes this document load-bearing rather than hygiene.

**Two rules matter more than the shape of the test pyramid:**

1. **Tests are derived from the specification, not from the implementation.**
2. **Coverage is the wrong metric.** The useful question is whether a test *fails when the code is
   broken*.

## Rule 1: Tests Come From the Spec

**An agent that writes both the code and its tests will test what it built — bugs included.** It
will produce tests that pass, are well-named, and confirm the implementation's own assumptions.
This is the single biggest quality risk in agent-driven development, and it is invisible in a
coverage report.

**Process requirement:**

- Acceptance criteria live in the [[PRD]], written in domain language before implementation
- Tests for business rules are written in a **separate pass, from the acceptance criteria**, by a
  different agent invocation than the one that wrote the implementation
- The test-writing agent is given the spec and the interface signature — **not** the implementation
  body
- Where a test and the implementation disagree, **the spec decides**, not whichever is easier to
  change

This is cheap to do and nearly impossible to retrofit, because once implementation-shaped tests
exist nobody can tell which ones are circular.

## Rule 2: Coverage Is the Wrong Metric

Agents reliably produce tests that execute code without asserting anything meaningful — a call
inside a `try`, an assertion that the result is not null, a mock verified against itself.

**What to use instead:**

- **Mutation testing** (StrykerJS) on the modules where money is computed. Run it periodically
  rather than per-commit; it is slow and the signal does not change fast. A surviving mutant in
  invoice calculation is a real finding.
- **The reviewer's question on every PR:** "if I broke this function, would a test catch it?"
- Coverage tracked but never used as a gate. It is a smoke detector, not a standard.

## The Layers

| Layer | Tool | What belongs here | Speed |
|---|---|---|---|
| **Pure unit** | Vitest | Calculation and state machines — no I/O | Milliseconds |
| **Property-based** | fast-check | Invariants over generated inputs | Seconds |
| **Integration** | Vitest + real Postgres | Repositories, services, transactions, the outbox | Seconds |
| **Contract** | Generated from Zod/OpenAPI | Request and response shapes | Fast |
| **Cross-tenant leak** | Vitest + two seeded tenants | **Every endpoint and every subscription** | Seconds |
| **End-to-end** | Playwright | A handful of critical paths only | Minutes |

### Pure Unit — Where Correctness Is Non-Negotiable

Invoice totals, tax, parts markup, labor rate application, inventory movements, service-order state
transitions. These are **pure functions over plain data**, which is the point: pull the arithmetic
out of anything that touches the database so it can be tested exhaustively and cheaply.

If a calculation is hard to unit test, that is a design smell — it has I/O mixed into it. Fix the
design rather than reaching for a mock.

### Property-Based — The Highest-Value Tests in This System

Invariants are cheap to state, catch what example-based tests miss, and are exactly what you want
when an agent wrote the implementation. For this domain:

```
An invoice total always equals the sum of its line items
Inventory on hand never goes negative
A posted invoice never changes
Applying then reversing a parts issue returns inventory to its starting value
A service order's status only moves along legal transitions
Labor cost is monotonic in hours
Any sequence of authorized line items sums to no more than the authorization limit
```

Each of those is a handful of lines with fast-check and tests thousands of cases.

### Integration — Against Real Postgres, Never a Mock

**Mocking the database hides precisely the bugs that matter here**: a missing `tenant_id`
predicate, a transaction that does not actually roll back, an outbox row written outside the
transaction it was supposed to be atomic with, a cascade that deletes more than intended.

Use Testcontainers or a Docker Postgres in CI. The schema comes from the real migrations, run from
scratch, which doubles as a migration test — see [[Environments]] tier 2.

**Must be covered here:**
- Every repository method, asserting tenant scoping is applied
- The outbox: state change and outbox row commit atomically, and a rollback leaves neither
- The dispatcher: `SKIP LOCKED` behaviour with concurrent workers, idempotent redelivery
- `LISTEN/NOTIFY` fires after commit, never before
- Migrations apply cleanly from empty **and** against a seeded database

### Cross-Tenant Leak Suite — The Most Important Asset

A distinct, **required** CI gate with no override, per [[Tenancy Model]].

- Seed two tenants, each with two customers
- For **every** endpoint: authenticate as tenant A, request tenant B's resources, assert refusal
- For **every** SSE topic: subscribe as tenant A, assert nothing from tenant B ever arrives
- Then repeat for two customers *inside* one tenant — the portal case, which is the one that
  matters on day one
- A new endpoint without leak coverage **fails the build**. Enumerate routes from the OpenAPI
  document so the suite cannot silently fall behind

### End-to-End — Deliberately Thin

Playwright, on the paths whose failure means the shop cannot operate:

1. Create a service order, add labor and parts, authorize, post an invoice
2. Portal user logs in and sees only their own vehicles and invoices
3. A technician records time and finds a defect
4. SSE: a change in one browser appears in another

That is the list. E2E tests are slow and brittle; everything else belongs in a lower layer.

## Test Data

**One factory module, used everywhere.** No test invents its own customer or service order inline —
that is how fixtures drift and how tests start depending on each other.

- `makeTenant()`, `makeCustomer()`, `makeServiceOrder()` with sensible defaults and overrides
- Deterministic by default; seeded randomness only in property tests
- Every test runs in a transaction that rolls back, or against a per-test schema
- **The same factories seed local development** (P0 on the [[Infrastructure Checklist]]), so the
  realistic dataset and the test fixtures never diverge

## What Does Not Get Tested

Saying this explicitly prevents agents from generating noise:

- Framework behaviour — Fastify routing, Drizzle query building
- Third-party libraries. Better Auth's password reset is Better Auth's problem
- Getters, constructors, and pass-through mappers with no logic
- Generated code — Zod-derived types, the OpenAPI client
- Exact log output or error message strings

## CI Gates

In order, fail fast:

1. Typecheck
2. Lint, including the custom architecture rules in [[Code Standards and Guardrails]]
3. Unit and property tests
4. Integration tests against real Postgres
5. **Cross-tenant leak suite** — required, no override
6. Contract tests
7. E2E on `main` only, not per-PR, for speed

Periodic rather than per-commit: mutation testing on money modules, and a dependency audit.

## Open Questions

- **How is invoicing verified against FullBay?** Pre-cutover, the strongest possible test is
  running the same real service orders through both systems and reconciling the totals to the
  cent. That needs the Q1 data export and belongs in the M5 spike.
- **Does the pilot customer have edge cases that belong in the test suite as regression
  fixtures?** Odd tax situations, warranty splits, fleet-rate agreements. Collect these during the
  Q4 shadowing day.

## Related

- [[Code Standards and Guardrails]] — the enforceable rules the lint layer carries
- [[Agent Playbooks]] — step-by-step recipes that include the test step
- [[Tenancy Model]] — the leak suite requirement
- [[Realtime and Events]] — outbox and dispatcher behaviour under test
- [[Infrastructure Checklist]] — seed data, CI gates
- [[PRD]] — where acceptance criteria live
