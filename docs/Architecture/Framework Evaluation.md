---
status: decided
summary: Why NestJS, decided by spike. Recorded as ADR-027
created: 2026-10-09
updated: 2026-10-30
tags: [fleetco, architecture, framework, nestjs, fastify, adonisjs, evaluation]
source: Claude Code (Xerro)
---

## Overview

> **DECIDED 2026-10-13 — NestJS. See ADR-027 for the full reasoning and costs.**
>
> The spike ran as designed: the same `customers` module built four times, then two further
> modules (`vehicles`, `workorders`) built on the winner to test what one module could not.
> The headline result is that **the strongest argument against NestJS did not survive contact** —
> the predicted drift toward `interface IFooService` and abstraction-per-service produced zero
> application interfaces across three modules. `@Module({ exports })` as a tier-1 boundary and
> the agent-corpus advantage carried the rest. The costs are real and enumerated in ADR-027:
> ~83 lines of framework tax, a mandatory CommonJS build, two Vitest-bridging dev dependencies,
> and a route-enumeration hack on private Express internals that will break on a major.

Which Node framework the API is built on. **Open, and deliberately not resolved by argument** —
the candidates are close enough that reading real code is the only honest tiebreaker.

**Why this gets a full evaluation:** it is the longest-lived decision in the stack. Database,
hosting, and auth are all swappable behind seams we designed. The framework is the thing every
file touches, and it will be lived with for a decade by one person who did not write any of it by
hand.

> **Process note.** This document exists because an earlier recommendation flipped from Fastify to
> NestJS and back within two exchanges — once on a framework-familiarity argument, then on a stated
> dislike of dependency injection. Neither was an evaluation. The decision is now gated on a spike.

## Candidates

| | Shape | Status |
|---|---|---|
| **NestJS** | Opinionated, DI container, decorators, batteries included | Candidate |
| **Fastify + our own structure** | Minimal, explicit, conventions enforced by lint | Candidate |
| **AdonisJS** | Laravel-shaped, batteries included, lighter IoC | Candidate |
| **Ported `authors-api` pattern** | Dave's own `Process`/`AppModule`, modernised to Fastify + Drizzle | Candidate — see below |

**Rejected, with reasons:**

- **Hono** — excellent and fast, but in Fastify's category. Adds nothing Fastify lacks for a
  long-lived backend, and has a smaller plugin ecosystem for boring needs.
- **Encore.ts** — interesting, too young, couples deployment to their tooling.
- **Express** — unmaintained in spirit; no typed-first story.
- **Ts.ED, FoalTS** — NestJS-shaped but far smaller communities. Not viable for a decade bet.
- **Effect-based stacks** — violates "boring is a requirement" outright.
- **Next.js as the backend** — wrong shape. The API is versioned with long-lived SSE connections.

## Prior Art: `davideweaver/authors-api`

Dave's own service template, built before coding agents. Express + Apollo + Mongoose + tsoa.
Read in full on 2026-10-09; it is the single best evidence of what he will actually be
comfortable maintaining for a decade.

### The Headline Finding

**He already built NestJS by hand, minus the container.**

- `lib/app/Process.ts` — an abstract lifecycle class: signal handling, `uncaughtException` and
  `unhandledRejection`, a readiness delay before shutdown, graceful exit
- `lib/app/AppModule.ts` — a module base class with `init()` / `close()`
- `app/index.ts` — `App extends Process`, modules as public fields (`http`, `db`, `events`,
  `schema1`), with **explicit startup and shutdown ordering**

That is a module system with lifecycle hooks. He wanted the structure NestJS provides and wrote it
himself rather than adopt a framework.

### He Uses Decorators — The Objection Is Narrower Than Stated

`controllers/v1/authorsController.ts` is tsoa:

```ts
@Route('/v1/authors')
export class AuthorsController extends Controller {
  @Get('{id}')
  @Security('jwt', [AuthRole.Read])
  public async get(@Path() id: string): Promise<Author | null> { ... }
}
```

That is nearly identical to NestJS controller syntax. **The objection is to DI containers
specifically, not to decorators or to annotation-driven routing.** That materially narrows the gap
to NestJS — the delta is the container alone, not the whole idiom.

What he does instead of a container: explicit construction. `new AuthorsDataSource()` at module
scope; modules receive the parent `app` via constructor and reach siblings through
`this.app.schema1`. Manual, ordered, greppable.

### Established Habits That Match Our Architecture Already

| Observed in `authors-api` | Our document |
|---|---|
| `Process` handles SIGTERM with a readiness delay and `http-terminator` draining | ADR-022 rule 7 — SSE draining. **He has already solved this** |
| One typed `Environment` interface, all `process.env` parsing in one file | ADR-022 rule 2 |
| `authorTransformer` mapping data models to API types | Our `contracts.ts` / repository separation |
| tsoa generates routes *and* the OpenAPI spec from source | ADR-014 — OpenAPI generated from schemas |
| Structured logging with tag arrays: `logging.info(msg, ['lifecycle'], { port })` | [[Infrastructure Checklist]] P0 |
| `test/unit/**` and `test/integration/**` mirroring `src/` | [[Testing Strategy]] layers |
| release-please, conventional commits, separate build/check/push workflows | Release versioning, P1 |
| `.env.development` / `.test` / `.integration` / `.production` + `RUNTIME_ENV` | [[Environments]] |

The operational maturity here is notable — `keepAliveTimeout`, `headersTimeout`, a readiness delay
commented against Kubernetes `failureThreshold * periodSeconds`. This is someone who has run
services in production, which supports the [[Operations]] posture.

### Where His Established Style Conflicts With What We Wrote

These need a deliberate decision rather than silent drift, and some reflect **pre-agent
ergonomics** that should not carry forward:

| `authors-api` | Our docs | Recommendation |
|---|---|---|
| `"@typescript-eslint/no-explicit-any": "off"` | `any` banned | **Depart.** Permissive typing is a reasonable convenience when a careful human writes every line; it is a liability when agents do. Types are tier-1 enforcement |
| No service layer — data sources hold logic *and* data access | routes → service → repository | **Depart.** Fleetco has real domain logic (invoicing, state machines) that must be unit-testable without a database |
| Class-based data sources, instantiated inline | Plain functions with explicit deps | **Open** — settle in the spike. His pattern works and is familiar |
| Light ESLint, essentially Prettier only | Custom architecture rules | **Depart.** Lint is tier-2 enforcement for agent output |
| Mongoose | Drizzle + Postgres | Already decided, ADR-002 |

### A Fourth Candidate This Surfaces

**Port the `authors-api` pattern**: keep `Process` and `AppModule`, swap Express for Fastify,
Mongoose for Drizzle, and tsoa or Zod for contracts.

This is literally "tried-and-true patterns" — his own, proven in production, and already aligned
with our graceful-shutdown, config, and logging requirements. It is a sharper version of the
"Fastify + our own structure" candidate: not inventing a structure, but **modernising one that
already exists and that he likes.**

Its cost is the same as that candidate's: roughly 800 lines of `lib/` scaffolding that he owns and
maintains forever, rather than a framework's.

**Added to the spike as candidate four.**

## Criteria, Weighted for This Project
## Criteria, Weighted for This Project

Weighted for a boring B2B application, written by agents, operated by one person, expected to run
for ten years.

| Criterion | Weight | Why |
|---|---|---|
| **Agent output quality** | **High** | Every line is agent-written. Both how good it is, *and* whether the framework's idiom matches our rules |
| **Enforceability of our rules** | **High** | Module boundaries, layering, tenant scoping — see [[Code Standards and Guardrails]] |
| **Fit with "boring is a requirement"** | **High** | Does the idiom pull toward over-abstraction? |
| **Solo maintainability, 10 years** | **High** | Upgrade churn, and how much framework must be understood at 6am |
| **Dave's ergonomic comfort** | **Med-High** | He operates it alone. Disliking it daily is a real, compounding cost |
| **Batteries vs. hand-built** | **Medium** | SSE, API versioning, config validation, scheduling, health checks, OpenAPI |
| **Ecosystem longevity** | **Medium** | Will it be maintained in 2036? |
| **Extraction path to services** | **Low** | [[Evolution Path]] concludes extraction may never happen |
| ~~Vendor observability offering~~ | **Zero** | Swappable and framework-independent. See below |

### Explicitly Not a Criterion: Bundled Observability

NestJS markets a first-party observability SaaS (request monitoring, tracing, error monitoring,
job monitoring, profiling, releases, custom metrics, per-user activity; alerting and SLOs on paid
tiers).

**It is a commercial product, not a framework capability, and it must not weigh in this decision.**
Roughly 90% of that list is already specified in [[Infrastructure Checklist]] via Sentry, PostHog,
and CloudWatch. Distributed tracing is an explicit non-goal in [[Evolution Path]] — one deployable
does not need it. The vendor-neutral replication path is **OpenTelemetry**, which has
auto-instrumentation for both Fastify and Nest and points at any backend.

**Evaluated and declined, 2026-10-12 — see ADR-028.** The product was installed on the spike
harness and measured rather than read about. It cannot trace an SSE endpoint at all, and the
200ms outbox dispatcher has to be excluded from it on cost grounds, so both of our P0 reliability
concerns sit in its blind spots. Being backend-only, it also adds to Sentry rather than replacing
it. None of this changes the decision below, which is the point: the framework choice was made
without it, correctly.

Two of its features *are* genuinely interesting for agent-driven development — "copy agent prompt"
(turning a failed request into a self-contained coding-agent prompt) and an MCP server for
querying telemetry. Both are buildable against OpenTelemetry under either framework, and adding a
vendor cuts against the consolidation in [[Platform Choice]].

## Analysis

### NestJS

**For:**
- **Module boundaries move from a lint rule to a framework constraint.** `@Module({ exports })`
  means a module *cannot* reach another's internals. That is tier 1 of our enforcement hierarchy,
  and the strongest structural argument any candidate has.
- **Batteries that map directly onto our specification:** `@Sse()`, `enableVersioning()`,
  ConfigModule, ScheduleModule, Terminus health checks, exception filters, `@nestjs/testing`,
  CLI generators.
- **Largest agent training corpus** of any Node backend framework, by a wide margin.
- Microservice transports productize the strangler-fig path in [[Evolution Path]] — though that
  path is weighted Low.
- Genuinely mature: 2017, heavy enterprise use, excellent documentation.

**Against:**
- **Agents will reproduce NestJS's heavier idioms** — `interface IFooService` with token
  injection, abstraction per service, decorators everywhere. That is our "no abstraction until two
  call sites" rule being violated *by convention* rather than by accident. **This is the strongest
  argument against, and it is independent of personal taste.**
- Wiring errors surface at bootstrap rather than at compile time.
- Dave actively dislikes DI, and will operate this alone for a decade.
- More framework concepts to hold; heavier upgrade churn across majors.

### Fastify + Our Own Structure

**For:**
- Explicit. An agent — and a reviewer — sees the dependency in the import line rather than
  resolving a provider token.
- Minimal concepts. Very little framework to understand during an incident.
- Dependencies as explicit function arguments, composed once in a `wire.ts`. Testing needs no
  harness; call the function with fakes.
- Matches Dave's instincts, which matters for the person who maintains it.
- Fastify itself is very well represented in training data — **the corpus gap was only ever about
  our bespoke conventions, not about Fastify.**

**Against:**
- **Roughly ten things get hand-built and then maintained**: SSE plumbing, API versioning, config
  validation, scheduling, health checks, scaffolding, error mapping, test fixtures.
- Module boundaries stay at tier 2 (`dependency-cruiser` in CI) rather than tier 1.
- Our conventions exist only in prose plus the golden module. That is weaker than a framework the
  agent already knows — though the golden module closes most of the gap.

### AdonisJS

**For:** Laravel-shaped and batteries-included, which is literally our use case — boring CRUD with
auth, validation, scheduling, and mail in the box. Its IoC container is far less in-your-face than
Nest's. Good documentation.

**Against:** a much smaller training corpus than either alternative, and the v5→v6 rewrite is a
churn signal for a decade commitment. Its ORM (Lucid) pulls against our Drizzle decision.

**Honest read:** likely third, but it earns a place in the spike because "batteries for boring
CRUD" is exactly the problem, and it may land between the other two on the thing Dave dislikes.

## The Spike — How This Actually Gets Decided

**Build the same module four times. Read the results. Decide.**

**What to build:** the `customers` module from [[Code Standards and Guardrails]] — schema,
migration, repository with tenant scoping, service, CRUD routes, Zod contracts, generated OpenAPI,
one outbox event, and tests at all four layers. **Plus one SSE endpoint**, since that is our only
genuinely non-trivial requirement.

**Method:** agent-written in all four, same prompt, same architecture documents supplied, no
hand-correction. Timebox one day each. The point is to see what the agents *actually produce*, not
what a careful human could produce.

**What to judge — decided in advance, so the spike is not rationalized after the fact:**

1. **Did the agent follow our rules unprompted?** Tenant scoping applied, layering respected, no
   speculative abstraction, no unapproved dependencies.
2. **Concept count.** How much must someone understand to change one endpoint safely?
3. **Traceability.** Pick a request. How many hops to find every line that runs?
4. **Testability.** How much ceremony to test the service in isolation?
5. **Over-abstraction.** Count interfaces with exactly one implementation.
6. **Volume.** Lines of application code, and lines of framework scaffolding.
7. **How it reads in review** — the thing that will consume Dave's scarcest resource.

**What would make each a clear winner:**

- **NestJS** wins if the agent output is clean and rule-following and the DI indirection turns out
  to be a non-issue in reading.
- **Fastify** wins if its output is comparably structured — meaning the golden module plus
  `dependency-cruiser` did the job that NestJS does with a container.
- **AdonisJS** wins only if it is clearly better than the others on agent output, which would be a
  surprise.
- **The ported pattern** wins if its output matches Fastify's on structure while costing less to
  build, since the scaffolding already exists and is already liked.

## Timing

This blocks nothing today. It must be settled **before M6** in [[Roadmap]], because M6's walking
skeleton *is* the golden module and must be built in the chosen framework. Running the spike *as*
M6's first step is the efficient sequencing — the spike's winner becomes the reference
implementation.

## Related

- [[Code Standards and Guardrails]] — the rules each framework must enforce
- [[Testing Strategy]] — the verification layer, largely framework-independent
- [[Agent Playbooks]] — recipes to be rewritten against the winner
- [[Stack Evaluation]] — currently lists Fastify; pending this decision
- [[Evolution Path]] — module boundaries, extraction path
- [[Roadmap]] — M6
