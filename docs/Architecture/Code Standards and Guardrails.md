---
created: 2026-10-09
tags: [fleetco, architecture, standards, guardrails, agents, typescript]
source: Claude Code (Xerro)
---

## Overview

The conventions the codebase follows, and — more importantly — **how each one is enforced.**

Written for a codebase produced by AI agents and reviewed by one person. That constraint drives
the whole approach:

> **A rule that is only written down is a rule that will be broken.** Prose gets dropped under
> deadline pressure and deep in a long context window. A type error, a lint failure, or a red test
> does not get dropped.

> **Framework-dependent sections.** The enforcement *mechanisms* below assume Fastify plus our own
> structure. The framework was decided on 2026-10-13 as **NestJS** (ADR-027, [[Framework Evaluation]]),
> so these mechanisms are due to be rewritten for it. Under NestJS several
> rules move from tier 2 to tier 1 (module boundaries become framework-enforced rather than
> lint-enforced). The *rules themselves* are framework-independent and stand either way. Branded
> types, the layering direction, the dependency allowlist, and "boring is a requirement" do not
> change.

## The Enforcement Hierarchy

Prefer the strongest available tier for every rule. Most teams write only tier 4 and then wonder
why standards erode.

| Tier | Mechanism | Why it works |
|---|---|---|
| **1** | **Types** — branded types, exhaustive unions, `satisfies` | The code does not compile |
| **2** | **Lint and CI gates** — ESLint rules, required test suites | The build fails |
| **3** | **Scaffolding and reference code** — `new:module`, the golden module | There is nothing to invent |
| **4** | **Prose** — this document, CLAUDE.md, the ADRs | Explains *why*, so the constraints are not fought |

## Tier 1: Branded Types — The Highest-Leverage Guardrail

**Agents produce code that type-checks, reads correctly, and wires the wrong value into the wrong
place.** Branded types turn that entire category of error into a compile failure.

```ts
// Identifiers — one brand per entity
type TenantId       = string & { readonly __brand: 'TenantId' }
type CustomerId     = string & { readonly __brand: 'CustomerId' }
type ServiceOrderId = string & { readonly __brand: 'ServiceOrderId' }
type VehicleId      = string & { readonly __brand: 'VehicleId' }

// Money — integer minor units, never a float, never a bare number
type Cents = number & { readonly __brand: 'Cents' }

// Time — UTC instants, distinct from a wall-clock date
type Instant  = string & { readonly __brand: 'Instant' }   // ISO 8601, UTC
type LocalDay = string & { readonly __brand: 'LocalDay' }  // YYYY-MM-DD, shop-local
```

What this buys, concretely:

- `getOrder(customerId)` will not compile. The most common agent mistake becomes impossible.
- `total: number` will not satisfy `Cents`, so floating-point money cannot enter the system.
- Mixing an instant with a shop-local day — the classic invoice-date bug — is a type error.

**Construction is the only place a brand is minted**, through a validating constructor:
`toCents(n)` rejects non-integers; `CustomerId.parse(s)` rejects a non-UUID. Casting is banned by
lint.

### Other Tier 1 Patterns

- **Exhaustive switches** on service-order status via a `never` check, so adding a status produces
  compile errors at every site that must handle it
- **`readonly` by default** on domain objects; state changes return new values
- **No `any`, no non-null assertions (`!`), no type assertions** outside parsing boundaries —
  all three are lint-banned
- **Zod at every boundary**, with types *derived* from the schema rather than declared alongside
  it, so validation and types cannot disagree

## Tier 2: Lint Rules and Gates

The architecture already declares several rules as non-negotiable. Each needs teeth:

| Rule | Source | Enforcement |
|---|---|---|
| `tenant_id` on every domain table | [[Tenancy Model]] | Test enumerating tables; fails if one lacks it |
| No cross-module queries | [[Evolution Path]] rule 2 | ESLint `no-restricted-imports` on another module's schema. **Not** database grants — those break cross-schema FKs |
| No unscoped queries | [[Tenancy Model]] | Raw `db.select()` banned outside `*/repository.ts` |
| Config from env only | ADR-022 | `process.env` banned outside `config.ts` |
| No business logic in the database | ADR-011 | Migration review checklist; triggers and functions require explicit approval |
| No local filesystem writes | ADR-022 | `fs` write APIs banned outside designated temp paths |
| Money is never a float | this doc | `Cents` brand plus a ban on `parseFloat` in domain code |
| Cross-tenant leak coverage | [[Testing Strategy]] | Required CI gate; routes enumerated from OpenAPI |
| No new dependencies | this doc | `package.json` changes require human approval — see below |

### The Dependency Allowlist

**Agents reach for packages constantly.** Every added dependency is supply-chain surface, an
upgrade obligation, and a thing only Dave will ever patch.

- The dependency set is **locked**. Adding one requires explicit human approval, enforced by a
  CODEOWNERS entry on `package.json` and `package-lock.json`
- Default answer is no. The standard library and the existing stack cover the boring cases, and
  **customer one is boring by design**
- Renovate handles patch upgrades automatically; minors and majors are reviewed

## Tier 3: Scaffolding and the Golden Module

**The most effective instruction to an agent is "make this look exactly like that."** Agents
pattern-match well and invent badly.

### The Golden Module

**M6's walking skeleton is designed as the reference implementation**, not merely a proof of life.
Pick one boring entity — `customers` or `vehicles` — and build it completely and canonically:

```
modules/customers/
  schema.ts          Drizzle table, tenant_id, branded ids
  migrations/        plain SQL, forward-only
  repository.ts      the ONLY place queries happen; tenant scope applied here
  service.ts         business logic, pure where possible
  contracts.ts       Zod schemas; types derived, OpenAPI generated
  routes.ts          Fastify handlers, thin — no logic
  events.ts          outbox event definitions
  index.ts           the module's public interface — the only legal import surface
  __tests__/
    service.test.ts        pure unit
    invariants.test.ts     property-based
    repository.test.ts     integration, real Postgres
    leak.test.ts           cross-tenant
```

Every later module's instruction is then: **"follow `modules/customers` exactly."** That single
sentence outperforms any style guide.

### The Scaffold Command

`npm run new:module <name>` generates the structure above with `TODO` markers and a passing
skeleton test. This removes the invention step entirely rather than relying on an agent to
remember the shape.

## Tier 4: Conventions

### Layering — Strictly One Direction

```
routes  →  service  →  repository  →  database
```

- **Routes** parse, authorize, call one service method, serialize. No logic, no queries.
- **Services** hold business rules. They may call other modules only through `index.ts`.
- **Repositories** are the only code that touches the database, and apply tenant scope
  unconditionally.
- Nothing calls backwards. A repository never imports a service.

### Naming

- Files `kebab-case.ts`; types and classes `PascalCase`; functions and variables `camelCase`
- Database tables and columns `snake_case`, tables plural (`service_orders`)
- Booleans read as assertions: `isPosted`, `hasDefects`, `canAuthorize`
- Domain vocabulary comes from [[Domain Model]] — **if the shop calls it a "unit," the code calls
  it a unit**, not a vehicle or an asset. Ubiquitous language is a hard rule, because inconsistent
  naming is what makes an agent guess.

### Errors

- A domain error taxonomy (`NotFound`, `Forbidden`, `Conflict`, `ValidationFailed`,
  `BusinessRuleViolated`) mapped once to HTTP status codes at the route layer
- Never throw strings; never swallow an error silently
- Errors carry structured context — `tenantId`, entity id, the rule violated — never raw PII

### Comments

- Comment **why**, never **what**. The code says what it does.
- Every non-obvious business rule cites its source: the PRD section, or the person who said it
- `// TODO` requires an owner and a tracking reference, enforced by lint

### Money, Time, and Identifiers

These three cause the most expensive bugs in this domain:

1. **Money:** integer `Cents` throughout. Rounding happens once, at presentation, with the rule
   written down. Totals recompute from line items — never store a total that can drift from its
   parts.
2. **Time:** store UTC (`timestamptz`), render in shop-local. A shop's timezone is configuration,
   not a constant. `new Date()` is banned in business logic; time is injected so it can be frozen
   in tests.
3. **Identifiers:** UUIDv7, branded per entity, generated in the application rather than the
   database so an id exists before insertion and offline generation stays possible (Q5).

## "Boring Is a Requirement"

Stated as a rule, because agents default to novelty:

- **No new abstraction until there are two real call sites.** Not one plus an anticipated one.
- **No clever TypeScript.** No conditional-type gymnastics, no decorators, no metaprogramming. If
  a reviewer has to work out what a type does, it is wrong for this codebase.
- **Prefer the dumbest thing that works.** An explicit `if` beats a strategy pattern at this scale.
- **No new dependency without approval.**
- **Follow the golden module** even when a different shape seems nicer.

Customer one's functionality is genuinely boring — service orders, parts, labor, invoices. There is
no novel problem here, so there is no excuse for novel code. **Novelty in the implementation is a
defect, not a contribution.**

## The Review Layer

Dave's review capacity is the real constraint, so the gates exist to spend it well.

**What CI decides, so a human never has to:** formatting, types, lint, tenant scoping, leak tests,
migration validity, dependency changes.

**What only Dave can decide:**
- Is this what a shop actually needs?
- Is the domain language right?
- Is the business rule correct — not merely consistently implemented?
- Is this the boring solution?

**PR requirements:** one module or one vertical slice per PR; the acceptance criterion it satisfies
named; tests written from the spec, not the implementation; no unrelated refactoring.

## Related

- [[Testing Strategy]] — the verification layer
- [[Agent Playbooks]] — the step-by-step recipes
- [[Evolution Path]] — the module boundary rules these enforce
- [[Tenancy Model]] — tenant scoping and the leak suite
- [[Domain Model]] — the ubiquitous language
- [[Architecture Decisions]] — ADR-011, ADR-022
