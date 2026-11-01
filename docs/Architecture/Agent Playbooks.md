---
created: 2026-10-09
tags: [fleetco, architecture, agents, playbooks, checklists]
source: Claude Code (Xerro)
---

## Overview

Step-by-step recipes for the recurring tasks in this codebase.

**Why checklists rather than guidance:** the dominant agent failure mode on routine work is not
writing bad code — it is **skipping a step**. A field gets added to the schema but not the Zod
contract. An endpoint ships without leak coverage. A migration lands without a backward-compatible
deploy path. Each is individually small and collectively corrosive.

A numbered list with a verification step at the end fixes that, and it is the cheapest guardrail
in this whole architecture.

**How to use these:** paste the relevant playbook into the task prompt. Every one ends with a
verification block that must actually be run, not asserted.

> **Framework decided: NestJS (2026-10-13, ADR-027).** File names and mechanisms here still assume
> Fastify plus our own structure, and get rewritten against NestJS. See [[Framework Evaluation]].
> The *steps* are framework-independent; only the file names move.

## Playbook: Add a Field to an Existing Entity

The most common task, and the one most often left half-finished.

1. **Domain first.** Confirm the name against [[Domain Model]]. If the shop has a word for this,
   use the shop's word.
2. **Migration** — a new forward-only SQL file. **Nullable, or with a default.** Never `NOT NULL`
   without a default on an existing table; that breaks the expand/deploy/contract rule in
   [[Operations]].
3. **Schema** — add to the module's Drizzle table. Use the branded type if it is money, time, or
   an identifier.
4. **Zod contract** — add to `contracts.ts`. Types are *derived* from the schema, never declared
   separately.
5. **Repository** — include in reads and writes. Confirm tenant scope is still applied.
6. **Service** — any business rule the field participates in.
7. **Route** — usually nothing; the contract change flows through.
8. **Tests** — update the factory in the test-data module. Add an assertion only if the field has a
   rule; a plain data field needs no test of its own.
9. **Outbox** — if the field change is meaningful to the portal or audit log, include it in the
   event payload.

**Verify:** typecheck passes · migration applies to an empty *and* a seeded database ·
`repository.test.ts` passes · the generated OpenAPI document contains the field.

**Do not:** backfill in the same migration that adds the column — separate them. Rename a column
without a deprecation step.

## Playbook: Add an Endpoint

1. **Contract** — request and response Zod schemas in `contracts.ts` first. The contract is the
   specification.
2. **Service method** — the business logic, with the narrowest possible signature. Takes a
   `Principal`, never a raw request.
3. **Repository method** if new data access is required. Tenant scope is applied here,
   unconditionally.
4. **Route** — parse with Zod, authorize, call **one** service method, serialize. No logic.
5. **Authorization** — explicit. Which plane may call this: vendor, tenant, or portal? A portal
   principal must be scoped to its `customer_id`. See [[Tenancy Model]].
6. **Leak test** — **mandatory, and the build fails without it.** Authenticate as tenant A, request
   tenant B's resource, assert refusal. Then two customers inside one tenant.
7. **Unit tests** from the acceptance criterion, in a separate pass from the implementation — see
   [[Testing Strategy]].
8. **OpenAPI** — regenerate and commit.

**Verify:** leak suite covers the new route (the suite enumerates routes from OpenAPI, so an
uncovered route fails) · contract test passes · typecheck passes.

**Do not:** put business logic in the route. Trust any value from the request body for tenant or
customer scope — both come from the `Principal`.

## Playbook: Add a Module

1. **Scaffold:** `npm run new:module <name>`. Do not hand-create the structure.
2. **Confirm the boundary.** What does this module own, and what does it need from others? If it
   needs another module's *tables*, the boundary is wrong — rethink before writing code.
3. **Schema** — its own Postgres schema per [[Evolution Path]] rule 1. `tenant_id` on every table.
4. **Public interface** — `index.ts` is the only legal import surface. Export functions and types;
   never export the schema.
5. **Cross-module calls** go through the other module's `index.ts`. Never query its tables —
   enforced by lint.
6. **Events** — define outbox events in `events.ts` for state changes other modules or the portal
   care about.
7. **Tests at all four layers** — unit, property, integration, leak.
8. **Follow `modules/customers` exactly.** When the golden module and instinct disagree, the golden
   module wins.

**Verify:** the module's tests pass in isolation · no lint violation for cross-module imports ·
the table-has-`tenant_id` test passes.

## Playbook: Write a Migration

The highest-risk routine task, because it runs against a live shop's data.

1. **Forward-only.** Never edit an applied migration.
2. **Backward-compatible with the currently deployed code.** Expand, deploy, then contract as a
   separate later migration. Never a breaking schema change and a code deploy in one step.
3. **No business logic** — no triggers or functions encoding domain rules (ADR-011). Constraints,
   foreign keys, `NOT NULL`, and `CHECK` are emphatically *not* business logic and should be used
   aggressively.
4. **Keep cross-schema foreign keys.** [[Evolution Path]] rule 2 restricts *queries* in
   application code, not database-level integrity.
5. **Index deliberately.** Any new column used in a `WHERE` with `tenant_id` wants a composite
   index with `tenant_id` first.
6. **Large-table changes:** `CREATE INDEX CONCURRENTLY`, and avoid a rewriting `ALTER` that takes
   a long lock.
7. **Data backfill is its own migration**, idempotent and batched.

**Verify:** applies cleanly to an empty database · applies cleanly to a seeded database · the
previous application image still works against the new schema · a rollback path is written down.

**Do not:** destructive change without a backup taken immediately prior — enforced in the deploy
script, not by memory.

## Playbook: Add a Domain Event

1. **Name it past-tense and factually:** `service_order.authorized`, not
   `service_order.should_notify`. Events are statements about what happened.
2. **Define the payload** in `events.ts` with a Zod schema. Include `tenant_id` and, where portal
   visibility applies, `customer_id`.
3. **Write it inside the same transaction** as the state change. This is the entire point of the
   outbox — see [[Realtime and Events]].
4. **Handlers are idempotent**, keyed on the outbox row id. Delivery is at-least-once.
5. **Decide SSE visibility** — which topic, and which principals may subscribe. Authorization uses
   the same code path as REST.
6. **Integration test:** the state change and the outbox row commit atomically, and a rollback
   leaves neither.

**Do not:** publish an event from outside the transaction. Put large payloads in an event — carry
ids and let consumers read.

## Playbook: Add a Dependency

The default answer is **no**.

1. **Justify it:** what does this do that the existing stack cannot? How many lines would writing
   it ourselves take?
2. **Check the stack first** — Fastify, Drizzle, Zod, Better Auth, and the Node standard library
   cover most boring cases, and **customer one is boring by design**.
3. **Assess it:** maintenance activity, transitive dependency count, install size, license.
4. **Get human approval.** `package.json` is CODEOWNERS-protected; this cannot be self-approved.
5. **Record why** in the PR description, so the next person does not have to re-derive it.

See the dependency allowlist in [[Code Standards and Guardrails]].

## Playbook: Fix a Bug

1. **Reproduce it in a failing test first**, at the lowest layer that exhibits it. No fix without a
   test that fails before and passes after.
2. **Find the root cause.** If a symptom appears in three places, fix the cause, not the three
   places.
3. **Check the class, not the instance.** Does the same mistake exist elsewhere? An agent-written
   codebase repeats patterns, including wrong ones — `graft`-style search for the pattern.
4. **Keep the regression test** named after the bug.
5. **If a guardrail would have prevented it**, add the guardrail. A recurring bug class means a
   missing lint rule or a missing branded type — that is the compounding fix.

Step 5 is the one that matters most over time.

## Anti-Patterns to Reject in Review

Observed failure modes worth naming so they can be rejected quickly:

| Pattern | Why it is wrong |
|---|---|
| A new abstraction with one call site | Speculative. Wait for the second — [[Code Standards and Guardrails]] |
| A mocked database in a repository test | Hides the bugs that actually matter |
| Tests written by the agent that wrote the code | Circular. They encode the bugs |
| `as any` or `!` to satisfy the compiler | The type is telling you something true |
| Business logic in a route handler | Breaks the layering, untestable without HTTP |
| A new package for something small | Supply-chain surface nobody will patch but Dave |
| Clever TypeScript | If review requires working out what a type does, it is wrong here |
| Reaching into another module's tables | The boundary violation that makes extraction impossible |
| A `TODO` without an owner | Lint-banned |

## Related

- [[Code Standards and Guardrails]] — the rules these recipes apply
- [[Testing Strategy]] — the spec-not-implementation rule
- [[Evolution Path]] — module boundaries
- [[Realtime and Events]] — outbox semantics
- [[Operations]] — migration and deploy discipline
- [[Domain Model]] — the ubiquitous language
