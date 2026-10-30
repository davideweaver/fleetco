# NOTES — the ported `authors-api` pattern

Spike **4 of 4** for [[Framework Evaluation]]: the `customers` golden module from
[[Code Standards and Guardrails]], built on Dave's own `Process` / `AppModule`
lifecycle classes from `davideweaver/authors-api`, ported from Express to
Fastify with Drizzle, Postgres, Zod 4 and Vitest.

**State at handoff.** `npm run ci` is green: typecheck, lint, 49 unit, 49
integration, 14 leak — 112 tests. The built image was then run against a real
Postgres and exercised by hand: create, list, get, patch, an SSE stream showing
replay plus live push over a real socket, and a `SIGTERM` with a stream open,
which produced the full ADR-022 rule 7 sequence (health flips to 503, the
readiness delay elapses, the stream receives `: server shutting down` and
closes, then HTTP, outbox and pool close in order, exit 143).

**Dependencies beyond the framework and the documents: none.** Runtime is
`fastify`, `drizzle-orm`, `pg`, `zod`. Dev is TypeScript, ESLint, Vitest,
fast-check, `@testcontainers/postgresql`, `tsx`. Every one is either the
framework, named in an ADR, or named in [[Testing Strategy]]. Three packages
`authors-api` used were dropped in favour of things now in the platform:
`dotenv-cra` → `process.loadEnvFile`, `http-terminator` → Fastify's own
`close()`, `copyfiles` → a 25-line `cpSync` script.

---

## 1. Decisions the documents did not specify

Ordered by how much they would cost to get wrong.

### 1.1 Decisions that settle an open question in the evaluation

**Repository and service are factory functions, not classes.** [[Framework
Evaluation]] lists this explicitly as **open — settle in the spike**:
"class-based data sources, instantiated inline" versus "plain functions with
explicit deps". The spike's answer is a third thing, and the reason is about
*tests* rather than taste:

```ts
export function createCustomersRepository(db: Database) { return { findById, … }; }
export type CustomersRepository = ReturnType<typeof createCustomersRepository>;
```

The type is **derived from the implementation**, so the service's test double is
a plain object literal the compiler checks against the real shape — and there is
no `interface ICustomersRepository` with exactly one implementation, which is
judging criterion 5. A class would have given the same encapsulation and invited
`vi.mock`, which is how a test ends up asserting against itself. Free functions
each taking `db` would have threaded a connection handle through the service,
which is the layer that is supposed to have no idea a database exists.

`src/modules/customers/__tests__/service.test.ts` is the evidence: no mocking
framework, no container, no `beforeEach` that builds a graph.

**`DbModule` builds the pool in its constructor, not in `init()`.** The original
opened Mongoose in `init()`. `pg.Pool` is lazy, so constructing it opens
nothing — which means a domain module can build its repository in *its*
constructor from `app.db.handle`, and every service is non-null for the whole
life of the process. Without this, `CustomersModule.service` would need a
"not initialised yet" guard that every caller pays for. `init()` keeps the part
that can genuinely fail: prove the database is reachable, then migrate.

The cost is real and worth naming: **field declaration order in `App` is now
load-bearing**, because `db` must be constructed before `customers`. See
section 3.

### 1.2 Business rules invented here, needing Dave's confirmation

[[PRD]] section 5 is still an outline, and [[Domain Model]] gives the customer
vocabulary but no rules. These three were invented so the service would have
something real to hold, and they are written in the code the way a confirmed
rule would be. **None should be treated as settled domain truth.**

1. **Status transitions.** `prospect → active`, `prospect → inactive`,
   `active ↔ inactive`, and nothing ever returns to `prospect` — on the theory
   that a fleet with service history is not a prospect again. Exhaustive
   `switch` with a `never` check, so a fourth status is a compile error at every
   site that must handle it.
2. **A fleet on credit hold cannot be activated.** Activating is what lets an
   advisor authorise work, which is the thing the hold exists to stop. Releasing
   the hold in the same request is allowed, because then somebody decided.
3. **`canAuthorize(customer, openBalance, estimate)`** and
   `availableCreditCents` — the money arithmetic, floored at zero, integer cents
   throughout. These exist mainly because [[Testing Strategy]] names "any
   sequence of authorized line items sums to no more than the authorization
   limit" as a property worth testing, and that property needs a function.

Also invented, smaller: a new fleet starts `prospect` and never on hold, and
neither is accepted from the request body — a client that could post
`status: 'active'` has skipped onboarding, and one that could post
`isOnCreditHold` has skipped the credit decision.

### 1.3 Decisions a reviewer should look at

**Authentication is a stubbed request header, and it refuses to run in
production.** `lib/http/authenticate.ts` reads a JSON `Principal` from
`x-fleetco-principal`. The real thing is an opaque session token in Postgres
(ADR-013) behind the `AuthN` port (ADR-012), and none of it is a framework
question. `assertNotProduction()` runs at route-registration time, so a deploy
carrying this stub fails to start rather than failing a pen test. Everything
downstream — `Scope`, the repository chokepoint, the leak suite — is the real
design and does not change when the stub is replaced.

**`Principal` is a discriminated union, not the document's optional
`customerId`.** [[Auth and Identity]] sketches
`{ plane: 'vendor' | 'tenant' | 'portal', customerId?: string }`. That optional
field is the bug: a portal principal constructed without a `customerId`
type-checks and is then scoped to the entire tenant. Modelled as a union on
`plane`, it **cannot be constructed**. This moves the rule from tier 4 to
tier 1 and I would carry it into the real `AuthN` port.

**The outbox primary key is a `bigint` identity, not a UUIDv7.** The one
deliberate exception to "UUIDv7 primary keys everywhere" ([[Tenancy Model]]
non-negotiable 6). [[Realtime and Events]] requires "a monotonic `id` (the
replay cursor)" and shows it on the wire as `Last-Event-ID: 48213`; a UUIDv7
sorts but is not a cursor a browser can compare, and the non-enumerability
argument does not apply to a platform log that is never addressed by URL.

**Replay has a visibility horizon, and this is the subtlest thing in the
spike.** A client cursor is a high-water mark: once it has read id 40 it never
asks for 39 again. Under `SKIP LOCKED`, worker B can commit id 40 while worker A
still holds 39 uncommitted — a reader that accepted 40 would advance past 39 and
lose it permanently, which is the one failure replay exists to prevent. So
`lib/outbox/repository.ts` exposes only rows with **no lower row still
pending**. A dead-lettered row counts as settled rather than pending, or one
permanently failing event would stall every stream in the system.
`repository.test.ts` asserts this directly by marking row 2 dispatched and
leaving a hole at row 1.

**Updates use an `updated_at` version predicate.** The service reads, decides,
and hands the repository both the change and the timestamp it decided against;
`applyUpdate` only applies it if the row still carries that timestamp. Zero rows
affected becomes a `Conflict`. The alternatives were a `SELECT … FOR UPDATE`
held across the service call — a lock's lifetime in the business layer — or
passing a callback down into the transaction, which puts business logic in the
repository.

**Exactly one outbox event per state change, chosen by precedence.** An update
that moves the status *and* places a credit hold emits one event, not two:
`status_changed` > `credit_hold_placed`/`released` > `updated`. Two rows would
let a replaying client see half a change. The precedence lives in `events.ts`,
because it is a statement about the event vocabulary.

**A no-op update writes nothing and emits nothing.** A `PATCH` whose every field
already matches returns the row unchanged. Emitting `customer.updated` with an
empty `changedFields` would put a row in the audit log saying nothing happened.

**Event payloads carry field *names*, not values.** A payload is readable by
every portal user of that fleet, so `customer.updated` says
`{ changedFields: ['primaryContactEmail'] }` and never the address.

**Keyset pagination on `(name, id)`, with an opaque base64url cursor.** Not
`OFFSET`: a shop paging while another user adds a fleet gets a skipped or
repeated row. The cursor is decoded only in the repository, because it is a
statement about that query's sort order.

**The logger redacts by key name at the sink.** The standards doc requires errors
carry "the rule violated, never raw PII". A rule that depends on every future
caller remembering is tier 4; dropping keys containing `email`, `phone`,
`password`, `token`, `secret` or `hash` is tier 2 for eleven lines. It
over-redacts rather than under-redacting, which is the right direction.

**`NotFound`, never `Forbidden`, for another tenant's row.** A scoped repository
cannot tell "absent" from "not yours", and that is deliberate: a 403 on another
tenant's id confirms the id exists.

**Error statuses.** `ValidationFailed` → 400, `Forbidden` → 403,
`NotFound` → 404, `Conflict` → 409, `BusinessRuleViolated` → 422. The 400/422
split is the one choice here: 400 means the request did not parse, 422 means it
parsed and the rules forbid it.

**Monthly partitioning of the outbox is deliberately not implemented.**
[[Realtime and Events]] § Retention specifies it; the retention period is
Q9-open, partitioning an empty table is a one-migration change later, and a
partitioned table complicates `RETURNING` for no benefit at this size.

**The environment is not Zod-validated**, even though Zod is already a
dependency and the standards doc says "Zod at every boundary". That rule is
about boundaries carrying *untrusted* input. A schema here would buy a nicer
message for a typo in a task definition at the cost of a second way to describe
the same twenty fields.

**Integration tests truncate between cases rather than wrapping each in a
transaction.** [[Testing Strategy]] offers either, and a transaction is normally
better — but the dispatcher, the `LISTEN` connection and the SSE pump all use
*different* connections, and none can see rows another has not committed. A
transaction-wrapped outbox test would pass while testing nothing.

**The background dispatcher poll is effectively disabled in the integration
environment** (`OUTBOX_POLL_INTERVAL_MS=600000`) and tests call `dispatchOnce()`
themselves. A 50ms timer firing mid-assertion was the only source of flake in
the suite.

---

## 2. Where the framework and the tools fought the documented rules

Four genuine frictions, and one non-friction worth recording.

### 2.1 Drizzle wraps driver errors, so the SQLSTATE check silently never fired

The worst of the four, because it compiled, read correctly, and was wrong:

```ts
// What I wrote first, and what any agent writes:
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}
```

Drizzle wraps every driver error in a `DrizzleQueryError` whose message is the
failed SQL and whose `cause` is the `pg` error carrying the SQLSTATE. So a
duplicate fleet code returned **500 instead of 409**, and the only reason this
is not in the delivered code is that `repository.test.ts` asserts the status
code rather than the thrown type. The fix walks the cause chain.

**This is an argument about tests, not about Drizzle**, and it generalises to all
four candidates: the error-mapping layer must be tested through the HTTP status,
because every ORM in this category wraps.

### 2.2 Zod 4 cannot emit a JSON Schema for a transform's output

Every branded value in this codebase is a transform — `z.uuid().transform(toCustomerId)`
— and `z.toJSONSchema(schema, { io: 'output' })` throws
`Transforms cannot be represented in JSON Schema`. ADR-014 wants the OpenAPI
document generated from the Zod schemas, and tier 1 wants brands minted at the
parsing boundary. Those two requirements collide.

Resolved by generating with `io: 'input'` for responses as well as requests. It
is accurate rather than a fudge — a brand is an identity function at runtime, so
a `CustomerId` on the wire *is* a uuid string — but it needed a paragraph in
`lib/openapi/document.ts` and it is the kind of thing an agent would resolve
with `unrepresentable: 'any'` and produce a document full of `{}`.

### 2.3 SSE needs `reply.hijack()`, and nothing tells you that

Fastify owns the response until told otherwise, and will try to serialise a
reply onto a socket that is already streaming. The other two things this layer
needs — a heartbeat comment so an idle proxy does not close the connection, and
a registry of open streams so `SIGTERM` can drain them — are not Fastify's
problem at all. `lib/http/sse.ts` is 67 lines of code; NestJS's `@Sse()` would
have supplied most of the framing and none of the draining.

**The draining half is the part that matters and the part a decorator does not
give you.** ADR-022 calls rule 7 "not optional" precisely because an undrained
SSE deploy drops every connected user, and `HttpModule.close()` has to close
streams *before* `fastify.close()` or Fastify waits forever on requests that by
design never complete.

### 2.4 `Process` plus `exactOptionalPropertyTypes` plus Drizzle's generics

Two small ones in the same bucket — the strict-TypeScript settings the standards
doc implies are not free:

- Spelling `Transaction` out as `NodePgTransaction<…, …>` needed an internal
  Drizzle helper type and was wrong on the first attempt under
  `exactOptionalPropertyTypes`. It is now read off the handle's own signature
  (`Parameters<Parameters<Database['transaction']>[0]>[0]`), which cannot drift.
- `fetch`'s `RequestInit` rejects `body: undefined` under the same flag, so the
  test harness spreads conditionally.

### 2.5 The non-friction: the lint layer earned its keep three times

Worth recording because it is the strongest evidence for or against the
candidate that has no framework-enforced boundaries.

The custom rules caught, unprompted:

1. **`service.ts` importing `./schema.js`** for `Partial<CustomerRow>`. A real
   layering violation: the service was handling `Date` objects and column types.
   The fix — a `CustomerPatch` type owned by the repository — also removed the
   last `new Date()` from business logic, which was the *second* rule firing on
   the same line.
2. **A `switch` falling through** from the `tenant` plane into `vendor` in
   `scopeFor`. Harmless today; silently inherited behaviour the moment a fourth
   plane is added.
3. **`@typescript-eslint/no-unnecessary-condition`** on a mutable `streaming`
   flag the SSE pump read between awaits. TypeScript's control-flow analysis
   narrowed it to `true` and the lint rule reported it — which was correct, in
   that the flag duplicated state the stream already owned. Replaced by
   `stream.isOpen()`.

Two more bugs came from *running* rather than reading: a Fastify 5 deprecation
(`ignoreTrailingSlash` must move under `routerOptions`), and the migrations not
being copied into `dist/` by `tsc`.

And one from testing: `Process.exit()` was doing bookkeeping as well as exiting,
so the test subclass that overrides `exit` lost the `Stopped` transition. Moving
the status assignment to the two callers is better design, and nothing but a
test would have found it. Alongside it, the seeded-id factory packed its
sequence number into a UUID field that truncated it, so `makeTenantId(1)` and
`makeTenantId(2)` were **the same id** — two cross-tenant tests were passing
vacuously. That is the single most valuable thing this spike found, and it is a
warning about fixtures generally rather than about any framework.

---

## 3. Concept count: what must someone understand to safely change one endpoint?

**Nine concepts, of which four are the architecture and five are this pattern.**

The architecture's five, which every candidate pays:

1. **`Scope`** — tenant plus optional customer, the chokepoint's argument. Every
   repository method takes one.
2. **The layering direction** — routes → service → repository → database, never
   backwards.
3. **Branded types** — ids, `Cents`, `Instant`; minted only in `branded.ts`.
4. **Zod contracts with derived types** — the schema is the source, `z.infer` the
   consequence.
5. **The outbox** — a state change writes one event in the same transaction, and
   `appendEvent` takes a `Transaction` so this is a compile-time fact.

This pattern's four:

6. **`Operation` as data.** A route is a value in `customerOperations`, bound to
   a handler by `register`. Adding an endpoint means adding to that array, or the
   OpenAPI document and the leak gate will not see it — and the leak gate fails
   the build.
7. **`AppModule`'s `init()` / `close()`**, and that `App.startup()` calls them in
   written-out order with `shutdown()` as the mirror image.
8. **Field declaration order in `App` is construction order.** `db` before
   `customers`, because `CustomersModule`'s constructor reads `app.db.handle`.
   This is the pattern's sharpest edge: a DI container would resolve this order,
   and here it is four lines a reviewer must read correctly. The mitigation is
   that getting it wrong is a crash on the first line of startup, not a subtle
   wrong answer.
9. **Siblings are reached as `this.app.x`.** Explicit and greppable, and also a
   cycle waiting to happen if two modules reach for each other.

**What you do *not* need to understand**, which is the comparison that matters:
there is no container, no provider token, no decorator metadata, no module
import graph, no lifecycle hook ordering beyond the two methods, and no
`@nestjs/testing`. To change `GET /v1/customers/:id`, concepts 1–6 suffice;
7, 8 and 9 only come up when adding or removing a module.

---

## 4. Tracing one request end to end

`GET /v1/customers/:customerId`, successful.

**Eight files execute, seven hops of our own code.**

| # | Hop | File |
|---|---|---|
| 1 | Fastify matches the route registered by `register` | `src/lib/http/route.ts` |
| 2 | `authenticate(request)` reads and parses the principal | `src/lib/http/authenticate.ts` → `src/lib/types/principal.ts` |
| 3 | `operation.params.parse(...)` mints the `CustomerId` | `src/modules/customers/contracts.ts` → `src/lib/types/branded.ts` |
| 4 | the handler: `scopeFor(principal)` | `src/lib/types/scope.ts` |
| 5 | `service.get(scope, id)` | `src/modules/customers/service.ts` |
| 6 | `repository.findById(scope, id)`, with `tenantScope()` in the `where` | `src/modules/customers/repository.ts` → `schema.ts` |
| 7 | `toCustomer(row)` re-brands, `reply.send` serialises | `repository.ts`, `route.ts` |

The handler itself is one line:

```ts
register(fastify, getCustomer, async ({ principal, params }) =>
  service.get(scopeFor(principal), params.customerId),
);
```

Everything in hops 1–3 happens in one `register` call that all five endpoints
share, so it is read once and never again. The failure path adds two files —
`lib/http/errorHandler.ts` and `lib/errors/DomainError.ts` — and no decisions.

**Finding every line that runs is a straight read.** No file resolves a
dependency at runtime, so there is nothing to grep for: `service` and
`repository` are the objects created on the two lines of
`modules/customers/index.ts`.

The honest caveat: the composition is spread over four files
(`app/index.ts`, `app/HttpModule.ts`, `modules/customers/index.ts`,
`lib/http/route.ts`) rather than one `wire.ts`, because each `AppModule` wires
itself. That is more places to look than a single composition root and far fewer
than a container.

---

## 5. Interfaces with exactly one implementation

**Ports with one implementation: zero.** Hand-written shape types with exactly
one producer: **two**, plus one configuration interface.

| Declaration | Implementations | Verdict |
|---|---|---|
| `CustomersRepository` | 2 (real + the test fake) | **Derived** via `ReturnType`, not hand-written. Not a port. |
| `CustomersService` | 2 (real + nothing yet; routes consume it) | Derived the same way. |
| `Clock` | 2 — `systemClock`, `fixedClock` | Earns its place; it exists so time can be frozen. |
| `SseStream` | 1 — `openStream` | **A hand-written shape with one producer.** Justified: it is the seam the route holds and the drain set stores, and the alternative is the route touching `reply.raw`. |
| `HealthDeps` | 1 — `HttpModule` | **A one-call-site shape.** The thing it buys is that `lib/` never imports `app/`; the original `authors-api` imported the application singleton into its healthcheck instead. A reviewer could reasonably call this the one speculative abstraction in the spike. |
| `Environment` (the only `interface` keyword in `src/`) | 1 | Configuration shape, not a port. |
| `Scope`, `CustomerPatch`, `Principal`, `Database`, `Transaction`, `OperationDoc` | n/a | Data types and type aliases, not implementable. |

Classes: eleven, and none is an abstraction over an alternative. Five are the
error taxonomy, four are `AppModule` subclasses, one is `Process`, one is
`Logger`, two are the outbox listener and notifier. `Process` is abstract with
one subclass (`App`), which is the pattern's whole premise rather than
speculative generality.

**The deliberate avoidance is worth stating**, because it is what an agent gets
wrong by default: the repository and service types are *derived from their
implementations*. Writing `interface ICustomersRepository` by hand would have
produced exactly the "abstraction with one call site" the standards doc bans,
and would have let the real implementation and the test fake drift apart.

---

## 6. Lines of application code versus framework scaffolding

Two counts, because the comment density here is deliberately high — every
non-obvious decision cites its source document, per the standards doc — and raw
line counts would mislead the comparison.

| Category | Total lines | Code only |
|---|---|---|
| **Application** — `src/modules/customers/` | 1,352 | **790** |
| **Scaffolding** — `src/lib/` | 2,043 | **1,164** |
| **Composition** — `src/app/` + `src/index.ts` | 406 | **218** |
| Migrations (SQL) | 86 | 86 |
| Tests | 2,021 | 1,421 |
| Test helpers — `src/lib/test/` | 463 | 312 |
| Config — eslint, vitest, tsconfig, Dockerfile, scripts | 497 | ~430 |

**Scaffolding is 1.5× the application.** [[Framework Evaluation]] predicted
"roughly 800 lines of `lib/` scaffolding that he owns and maintains forever" and
the real number is **1,164 lines of code** — 45% over the estimate. The breakdown
matters more than the total:

| Scaffolding file | Code lines | Would a framework supply it? |
|---|---|---|
| `outbox/repository.ts` | 152 | **No.** Dispatcher, `SKIP LOCKED`, the gap guard. |
| `logging/logger.ts` | 112 | Partly — Fastify and Nest both ship a logger. |
| `openapi/document.ts` | 121 | **Nest, yes** (`@nestjs/swagger`). Fastify, with a plugin. |
| `types/branded.ts` | 92 | No. Ours under every candidate. |
| `environment.ts` | 83 | **Nest, yes** (`ConfigModule`). |
| **`app/Process.ts`** | **79** | **Nest, yes** — `enableShutdownHooks`. **This is the port's whole bet.** |
| `http/sse.ts` | 67 | **Nest, partly** — `@Sse()` gives framing, not draining. |
| `outbox/listener.ts` | 57 | No. |
| `http/route.ts` | 60 | **Nest, yes** — decorators and pipes. |
| `outbox/notifier.ts` | 47 | No. |
| `db/migrator.ts` | 46 | No — plain forward-only SQL is a documented requirement. |
| `errors/DomainError.ts` + `errorHandler.ts` | 93 | **Nest, mostly** — exception filters. |
| `http/healthcheck.ts` | 36 | **Nest, yes** — Terminus. |
| **`app/AppModule.ts`** | **12** | **Nest, yes** — `@Module`. |

Roughly **480 of the 1,164 lines are things NestJS would have supplied**: config,
health, OpenAPI, error filters, routing, shutdown hooks, module lifecycle. The
other ~680 — the outbox, the brands, the migrator, the SSE draining — are ours
under every candidate, because they implement decisions the architecture
documents made *against* the defaults.

**The ported lifecycle classes are 91 lines of code, and they are the best lines
in the directory.** `Process` is 79 and already satisfies ADR-022 rule 7, which
the evaluation noted ("he has already solved this") and which the `SIGTERM` test
above confirms end to end. `AppModule` is 12 lines and buys a uniform
`init()`/`close()` plus explicit sibling access. Judged purely as the cost of
*this spike's distinguishing feature*, the bet is 91 lines against a DI
container, and that is a good trade.

**The honest caveat on the total:** this is the first module. The ~480 lines of
framework-replacement scaffolding is a fixed cost that the second, fifth and
twentieth module do not pay again, while the 790 lines of application code is
roughly what each module will cost. The scaffolding-to-application ratio
inverts quickly, and the right question is not "1,164 lines is a lot" but
"is 1,164 lines of code Dave wrote and understands cheaper to carry for ten
years than a framework's upgrade path?" This spike cannot answer that; it can
only make the number real.

---

## 7. What I would change before this became the golden module

In order:

1. **Confirm or replace the three invented business rules** (section 1.2). They
   are load-bearing in the tests.
2. **Replace the auth stub** with the `AuthN` port (ADR-012), carrying the
   discriminated-union `Principal` forward.
3. **Decide whether `HealthDeps` survives** (section 5). It is the one shape here
   with a single call site.
4. **Write the `npm run new:module` scaffold** from this directory. Tier 3 of the
   enforcement hierarchy is the one tier this spike did not build, and
   "follow `modules/customers` exactly" is weaker than generating it.
5. **Add the in-process outbox handlers** — audit log first, since [[Realtime and
   Events]] calls it a legal requirement. `OutboxModule.dispatchOnce` has the
   one place they hang.
6. **Add mutation testing** (StrykerJS) over `service.ts`'s pure rules once real
   money arithmetic lands. The property tests are strong; nothing yet proves
   they would fail if the code broke.
