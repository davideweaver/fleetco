# NOTES — NestJS spike

Spike 1 of 4 for [[Framework Evaluation]]. The `customers` golden module from
[[Code Standards and Guardrails]], on NestJS 11 with the Express adapter,
Drizzle, Postgres, Zod 4 and Vitest.

State at handoff: `npm run typecheck`, `npm run lint` and all four test
projects pass. 90 tests. The built image was run against a real Postgres and
exercised by hand end to end, including SSE replay-plus-live and a SIGTERM
drain with an open stream.

---

## 1. Decisions the documents did not specify

Grouped by how much they would cost to change later.

### 1.1 Would need a real decision before M6

**Authentication is stubbed by a request header.** `PrincipalGuard` reads a
JSON `Principal` from `x-fleetco-principal`. The real thing is an opaque
session token in Postgres (ADR-013) minted by Better Auth behind the `AuthN`
port (ADR-012), and none of that is a framework question. The guard
**throws at construction when `RUNTIME_ENV=production`**, so the spike cannot
be deployed with header-asserted identity by accident. Everything downstream —
`Scope`, the repository chokepoint, the leak suite — is the real design and
does not change when the guard is replaced.

**`@nestjs/platform-express`, not Fastify.** [[Stack Evaluation]] currently
lists Fastify, but Nest-on-Fastify is a different artifact from Nest, and the
spike is meant to show what NestJS *is*. Express is the default adapter, has
the larger corpus, and is where Nest's SSE implementation is best exercised.
If NestJS wins, swapping the adapter is a one-line change plus the
`@types/express` import in two guards.

**The outbox primary key is a `bigint` identity, not a UUIDv7.** The one
deliberate exception to "UUIDv7 primary keys everywhere". [[Realtime and
Events]] § Event Shape requires "a monotonic `id` (the replay cursor)" and
§ Replay on Reconnect shows it as `Last-Event-ID: 48213`. A UUIDv7 is sortable
but is not a cursor a client can compare, and the outbox is a platform log
rather than a customer-facing entity, so the non-enumerability argument does
not apply. Recorded in `platform/outbox/schema.ts`.

**The outbox is not partitioned by month.** [[Realtime and Events]] § Retention
calls for monthly partitions. A partitioned table cannot carry a single-column
identity primary key — the partition key must be in the PK — which turns the
replay cursor into a composite and changes the SSE contract. That is a
retention decision, not a correctness one, so it is recorded in the migration
rather than guessed at.

**Replay has a theoretical cursor gap.** Sequences are allocated before commit,
so id 50 can commit before id 49. The mitigation here is that the replay query
only returns rows with `dispatched_at IS NOT NULL`, and the dispatcher marks
and commits in id order, which closes the window in practice. The airtight
version needs either a dispatch-ordered second sequence or an advisory lock
around dispatch. Not built; flagged.

**Role authorization lives at the route layer, row authorization in the
repository.** Two authorization questions, deliberately in different layers:
"may this role do this at all" is a declarative `@Roles()` guard; "which rows
may this principal see" is the unconditional `Scope` predicate. Only the second
can cause a leak, which is why only the second is structural. Portal principals
can read but not write.

### 1.2 Domain rules invented to give the service something to hold

A CRUD module with no business logic cannot answer the spike's testability
question, so five rules were invented. They are plausible for a heavy-duty
shop but **not sourced from the PRD, and Dave should overwrite them.** Each is
commented with its reasoning at the definition site.

1. A per-tenant `code` (`ACME`), normalised to uppercase and trimmed, unique
   within the tenant. Case-folding is what stops `acme` and `ACME` becoming two
   customers a service advisor has to tell apart.
2. Status machine `prospect → active ⇄ inactive`. `active → prospect` is
   refused. Implemented as an exhaustive switch with a `never` check.
3. A customer on credit hold cannot be **activated**, but an already-active
   customer can be put on hold without being deactivated — that is what a
   credit manager does when an account goes past due.
4. Net terms above zero require a non-zero credit limit. Prepay customers are
   net 0. This is the cross-field rule that justifies a service layer at all:
   it cannot live in a Zod schema per field or a `CHECK` on one column.
5. A labor-rate ceiling of `$1,000/hour`. This exists specifically to catch a
   dollars-for-cents mix-up — `45` where `4500` was meant passes every other
   check. The `Cents` brand stops a float entering the system; this stops the
   other half of the same bug.

Also chosen, not specified: `status` is excluded from the PATCH body shape and
handled as a transition, so a caller cannot jump `prospect → inactive` in a
field assignment. Exactly one outbox event per operation, named
`customer.status_changed` when the status moved and `customer.updated`
otherwise, because that is what a portal activity feed renders.

### 1.3 Mechanical choices

- **Zod 4's native `z.toJSONSchema`, not `@asteasolutions/zod-to-openapi`.**
  Zero new dependencies. The trick is `io: 'input'`: every branded schema is
  `z.uuid().transform(toCustomerId)`, and `toJSONSchema` refuses a transform's
  *output* but reads straight through its *input*, which is the wire shape the
  document should describe. Brands are a TypeScript concern and correctly
  invisible in the spec.
- **`@nestjs/swagger` not used.** It reads decorators off DTO classes, which
  would make the classes a second source of truth alongside the Zod schemas and
  hand handlers unbranded objects. ADR-014 makes Zod the single source.
- **`@nestjs/config` not used.** A parsed module constant in `config.ts` is
  fewer concepts than a provider token for a value that is immutable for the
  life of the process, and it fails at boot.
- **`@nestjs/testing` not used.** Integration tests call `new` four times
  (`platform/test/harness.ts`); the leak suite boots the real app with
  `NestFactory` and drives it with `fetch`. No supertest either.
- **Plain-SQL migrator, not drizzle-kit.** "Plain SQL, forward-only" is ~55
  lines and avoids maintaining drizzle-kit's journal as a second source of
  truth next to hand-written SQL. The same runner is used by `npm run migrate`
  and by the test container, so the schema under test is the schema that ships.
- **Keyset pagination over `(name, id)`**, cursor as a base64url JSON blob. The
  cursor format lives in `repository.ts` rather than `contracts.ts` because a
  cursor *is* a position in that file's `ORDER BY`.
- **Money as `bigint` read back as a JS number** and branded `Cents`. Not
  `numeric`, which Drizzle returns as a string.
- **Brands are hand-written per the standards doc** (`string & { __brand }`),
  not Zod's `.brand()`. The two are not mutually assignable, so one had to win,
  and the doc is the spec. The repetition in `branded.ts` is deliberate: a
  generic `brand<T>()` helper would be shorter, would be "clever TypeScript",
  and would let any caller mint any brand from any string.
- **`Scope` is obtainable only from a `Principal`** via `scopeOf`, and
  `scoped()` returns an *array* of predicates so every call site reads
  `and(...this.scoped(scope), …)` — a missing scope shows up as a missing
  spread rather than hiding inside a combinator.
- **`uuidv7` is the one dependency added for the spec** (UUIDv7 primary keys).
  Node's `crypto.randomUUID()` is v4. Hand-rolling it is ~15 lines, but
  same-millisecond monotonicity is the subtle part and getting it wrong
  silently costs the index locality that was the reason to pick v7.
- **The dispatcher has no handler registry.** [[Realtime and Events]] lists
  four eventual consumers; today only the fanout exists, and "no new
  abstraction until there are two real call sites" applies to event handlers
  too. The second consumer is where the registry gets written.
- **Truncate between tests**, rather than a rolled-back transaction per test,
  because the outbox tests need a real COMMIT — that the state change and the
  event commit together is the whole point.
- **`/health` is outside the OpenAPI document.** It is infrastructure read by
  the load balancer and carries no tenant data. The leak suite therefore
  enumerates exactly the tenant-scoped surface, and separately cross-checks the
  document against Nest's router so an *undocumented* route fails the build.

### 1.4 Three defects the gates caught, which is the real evidence

Worth recording because judgment criterion 1 is "did the agent follow our rules
unprompted" — these are cases where the rules caught the agent rather than the
agent following them.

1. **A business rule written too broadly.** The first version of the credit-hold
   rule refused `status === 'active' && isOnCreditHold`, which also blocked
   putting an *already active* customer on hold. The spec-derived unit test
   failed; the implementation was wrong, and per [[Testing Strategy]] rule 1 the
   spec decided.
2. **`Last-Event-ID: 0` silently dropped.** `parseCursor` required `> 0`, so a
   client asking to replay the whole retained stream got a tail-from-now
   instead — an off-by-one that loses a technician's last twenty minutes. Caught
   by the leak suite's replay assertion, not by the integration test, which
   called the service directly and bypassed the header parse.
3. **The dispatcher wrote its own `UPDATE`.** `recordFailure` built a Drizzle
   query outside a repository. The tier-2 lint rule banning `drizzle-orm`
   imports outside `**/repository.ts` refused it. The fix moved the query to
   `OutboxRepository.recordFailure`, after which the dispatcher has no database
   handle at all. The rule was right and the code was wrong.

---

## 2. Where the framework fought the documented rules

### 2.1 Vitest + Nest decorators forces two dependencies the allowlist would refuse

The sharpest finding. [[Testing Strategy]] picks Vitest. NestJS resolves
constructor dependencies from `emitDecoratorMetadata`, and esbuild — Vitest's
transformer — does not implement it. The documented workaround is
`unplugin-swc` + `@swc/core`.

So the test runner the architecture chose cannot run the framework the
architecture is considering without two build-chain dependencies that exist
purely to bridge them. Under "the dependency set is locked, default answer is
no", this is a standing exception on a sensitive path. It is unavoidable while
both choices stand; Jest (Nest's default) would remove it and contradict
[[Testing Strategy]] instead.

**Cost: 2 dev dependencies, ~15 lines of `vitest.config.ts`.**

### 2.2 `@types/express` leaks the adapter into the application

`ExecutionContext.switchToHttp().getRequest()` and the exception filter's
`getResponse()` need `Request`/`Response` types, so a third dependency arrives
and three platform files import from `express` directly. Choosing the Fastify
adapter later means editing those files. A framework that advertises adapter
independence does not quite deliver it at the type level.

**Cost: 1 dev dependency, 3 files coupled to the adapter.**

### 2.3 Two tsconfigs, because Vitest is ESM-only and Nest's emit is CommonJS

Decorator metadata emit wants `module: node16` and CommonJS output. Vitest ships
ESM-only types, so `import { describe } from 'vitest'` and the
`ProvidedContext` module augmentation cannot be typechecked under that config.
`tsconfig.test.json` overrides `module`/`moduleResolution` for the same source
tree, and `npm run typecheck` runs `tsc` twice.

The module-augmentation file also needs a bare `import 'vitest'` to be a module
rather than an ambient declaration that shadows the real package — a 20-minute
detour that an agent will hit again.

**Cost: 1 extra tsconfig, 1 odd import, a two-step typecheck.**

### 2.4 `strict-type-checked` lint versus Nest idioms

Three rules in `typescript-eslint`'s strict preset object to things NestJS
requires, and each needed a scoped override:

- `no-extraneous-class` flags every `*.module.ts` — a Nest module *is* an empty
  decorated class.
- `getHttpServer()` is typed `any`, so the SSE-draining code in `main.ts`
  cannot assign it without either a type assertion (lint-banned) or an
  `instanceof` narrowing through `unknown`. The `instanceof` version is used,
  and is arguably better: it fails loudly if an adapter stops returning a Node
  server.
- Comparing a `number` status against an `HttpStatus` enum member is a
  mixed-enum comparison, so the error filter uses a plain `500` constant.

**Cost: 3 narrowly scoped overrides, 1 defensive runtime check.**

### 2.5 Nest's DI needs tokens for anything that is not a class — and private
fields make class providers un-fakeable

Three `Symbol` tokens (`DATABASE`, `DB`, `CLOCK`) for the non-class providers.
Each is a name resolved at bootstrap rather than at compile time; a typo is a
runtime failure, not a type error. Three is cheap, but it scales with every
non-class dependency.

The second half is more interesting. `CustomersService`'s constructor takes
`CustomersRepository`, a class with a `private readonly db`. Private fields make
a class nominal, so a plain fake object is **not** structurally assignable. The
three available escapes are all bad: declare `interface ICustomersRepository`
(the over-abstraction the spike is counting), subclass the real repository with
a stubbed `Db`, or cast in tests.

This spike took the fourth option and it is the right one: the business rules
were pulled out as pure exported functions, `service.test.ts` tests those with
no fakes at all, and the orchestration is asserted against real Postgres —
which [[Testing Strategy]] § Integration asks for anyway ("mocking the database
hides precisely the bugs that matter here"). **Nest's class-based providers push
toward mock-heavy testing, and the documented testing strategy pushes back
harder.** Worth watching in a module where the orchestration is less thin than
this one.

### 2.6 `@Sse()` turned out to be better than expected

The concern going in was that Nest commits `text/event-stream` headers before
subscribing, which would make an authorization failure arrive as an error frame
inside an already-`200` stream instead of a `403`/`404`.

Nest 11 handles this correctly: `RouterResponseController.sse()` awaits the
handler's promise before piping, so an **`async` `@Sse()` handler** that throws
during authorization produces a real JSON error body through the exception
filter. Verified against the running app — tenant B opening tenant A's stream
gets `404 application/json`, not an event stream. `MessageEvent` also supports
`comment`, so heartbeats are real SSE comment frames rather than fake events.

`@Sse()` is a genuine battery. The SSE handler is ~30 lines in `routes.ts`,
and all of the hard part — authorize, replay from cursor, resume live,
re-authorize each frame — is framework-independent service code.

### 2.7 What Nest did *not* fight

- `@Module({ exports })` is the strongest thing any candidate brings. `index.ts`
  is the documented import surface, and the framework makes `CustomersRepository`
  genuinely unreachable from a sibling module rather than lint-discouraged.
  [[Evolution Path]] rule 2 at tier 1.
- `enableVersioning({ type: URI })` gives `/v1` for one line.
- `APP_FILTER` maps the five-member error taxonomy to HTTP in exactly one place.
- `OnApplicationShutdown` hooks and `enableShutdownHooks` cover most of
  ADR-022 rule 7. Not all — see below.
- No `@nestjs/config`, `@nestjs/swagger` or `@nestjs/testing` were needed, which
  is three fewer dependencies than the obvious Nest-shaped answer.

### 2.8 SSE draining is still hand-built

`enableShutdownHooks` calls `server.close()`, which stops accepting and then
*waits* for open connections. An SSE connection never finishes, so that alone
hangs until the platform's kill timeout and drops every connected user anyway.
ADR-022 rule 7 calls draining non-optional, so `main.ts` implements the
sequence by hand: readiness delay → `app.close()` → drain window →
`server.closeAllConnections()`. ~35 lines, no dependency. Verified: SIGTERM with
an open stream exits in 6s with the stream closed.

This is the capability `authors-api`'s `Process` class already has, which is a
point for spike 4.

---

## 3. Concept count — what must someone understand to safely change one endpoint?

Counted as "things you must know are there, or you will break something
silently."

### Load-bearing, unavoidable — 7

| Concept | Why you cannot skip it |
|---|---|
| **Branded types** | `toCents`, `toCustomerId`. Minted only in `branded.ts`; casting is lint-banned |
| **`Principal` → `scopeOf` → `Scope`** | The only path to a repository call. Forget it and nothing compiles |
| **The repository is the only query site** | Lint-enforced. A query elsewhere fails the build |
| **Zod contracts are the single source** | Types are derived; the OpenAPI document and the leak suite's route list both come from them |
| **Layering** `routes → service → repository` | Nothing calls backwards |
| **One outbox event per state change, in the transaction** | `OutboxRepository.append` takes a `Tx`, so this is enforced by the signature |
| **The leak suite is a required gate** | A new endpoint without coverage fails the build |

### NestJS-specific, on top of the seven — 6

`@Module({ imports, providers, exports })` and what `exports` means ·
constructor injection and when a `@Inject(TOKEN)` is needed · guards and their
ordering (global `PrincipalGuard` before controller `RolesGuard`) · pipes as the
validation seam (`@Body(new ZodPipe(schema))`) · `APP_FILTER` as the single
error-mapping site · `@Sse()` returning an `Observable<MessageEvent>`, and why
the handler is `async`.

### Project-specific, and the part that is genuinely ours — 4

The `customers` Postgres schema, not `public` · the outbox cursor is a `bigint`
and `Last-Event-ID` is that cursor · `Clock` is injected and `new Date()` is
lint-banned in `service.ts` · the domain vocabulary constants live in
`contracts.ts`, not `schema.ts`, because the lint rule forbids importing a
module's `schema.ts` outside its repository.

**Total: 17.** Seven would be true under any framework. Six are the NestJS tax,
and all six are *well documented and in the training corpus*, which is a
materially different kind of cost from six bespoke conventions. Four are ours.

An honest reading: adding a sixth route to `routes.ts` needs 3 of the 17 (the
pipe idiom, `@Roles`, `@CurrentPrincipal`). Adding a *new module* needs all 17.

---

## 4. One request, end to end

`GET /v1/customers/:customerId` — the simplest endpoint in the module.

### The hops

| # | Where | What happens |
|---|---|---|
| 1 | `platform/http/principal.guard.ts` | Global guard; refuses if not `@Public()` |
| 2 | `platform/types/principal.ts` | `principalSchema.safeParse` of the header |
| 3 | `platform/types/branded.ts` | `toUserId`, `toTenantId`, `toCustomerId` mint the brands |
| 4 | `platform/http/roles.guard.ts` | Reads `@Roles()` metadata; checks the role |
| 5 | `platform/http/zod.pipe.ts` | `transform()` on the path params |
| 6 | `modules/customers/contracts.ts` | `customerIdParamSchema` parses and brands |
| 7 | `modules/customers/routes.ts` | `CustomersController.get` — one service call |
| 8 | `modules/customers/service.ts` | `CustomersService.get` |
| 9 | `platform/types/scope.ts` | `scopeOf(principal)` |
| 10 | `modules/customers/repository.ts` | `findById` → `scoped()` builds the predicates |
| 11 | `modules/customers/schema.ts` | The Drizzle table |
| 12 | `platform/db/client.ts` | Drizzle over the `pg` pool |
| 13 | `modules/customers/repository.ts` | `toCustomer(row)` maps and re-brands |
| 14 | `modules/customers/routes.ts` | `customerSchema.parse` serialises |
| — | `platform/http/domain-error.filter.ts` | Only on the failure path |

**14 hops across 10 files on the happy path**, plus 1 file on the error path.
Four of those files (`principal.guard`, `roles.guard`, `zod.pipe`,
`domain-error.filter`) are per-request framework glue written once and never
read again; the other six are the module.

### Traceability, honestly assessed

**What is easy.** Hops 7→14 are plain imports and method calls. Reading
`routes.ts` → `service.ts` → `repository.ts` top to bottom is the entire
business path, and every dependency is visible in a constructor argument and an
import line. This is where the "DI makes code untraceable" worry turns out to be
overstated: Nest's container is a *bootstrap* concern, and at read time
`private readonly customers: CustomersRepository` is as greppable as any
parameter.

**What is not.** Hops 1→6 are invisible from `routes.ts`. `PrincipalGuard` is
registered via `APP_GUARD` in `app.module.ts`, so nothing in the controller
mentions it; you have to know Nest's guard/pipe/interceptor pipeline exists and
go look. Discovering "what authenticates this endpoint" means reading the
composition root, not the route. That is the real indirection cost, and it is
the framework's execution model rather than its container.

**The counter-argument, which matters here.** That same invisibility is why
`/health` needed an explicit `@Public()` and why forgetting authentication on a
new controller is impossible. Default-deny-by-invisible-global is a better
security posture than visible-per-route, and the leak suite's
"every documented operation refuses an unauthenticated request" test closes the
hole the indirection opens.

### SSE, the harder trace

`GET /v1/customers/:customerId/events` adds: `service.streamFor` → `this.get`
(same authorization as REST) → `outbox.currentCursor` or `readTopicSince`
(replay) → `notifier.notifications()` filtered by topic → `readScopedById` per
event (re-authorize before each push) → back in `routes.ts`, mapped to
`MessageEvent` and merged with a heartbeat. Plus the out-of-band
`dispatcher.tick()` → `claimPending` → `markDispatched` → COMMIT → `pg_notify`.

**6 more files, and the data path is no longer a call stack** — it crosses a
transaction boundary and a Postgres `NOTIFY`. This is the module's genuinely
non-trivial part, and almost none of it is framework-specific: `@Sse()`
contributes about 10 of those lines. Expect the other three spikes to produce
nearly the same code here.

---

## 5. Interfaces with exactly one implementation

**Zero.**

```
$ grep -rn --include='*.ts' -E '^[[:space:]]*(export )?interface ' src/
src/platform/test/vitest.d.ts:9:  interface ProvidedContext {   ← Vitest module augmentation
```

- **Application interfaces declared: 0.** No `IFooService`, no injection-token
  port, no repository interface.
- **`implements` clauses: 7**, every one of them a NestJS framework interface
  (`CanActivate` ×2, `PipeTransform`, `ExceptionFilter`, `OnApplicationShutdown`
  ×3). Implementing a framework contract is not speculative abstraction.
- **Abstract classes: 1.** `DomainError`, with five concrete subclasses — the
  error taxonomy the standards doc specifies. Not a one-implementation
  abstraction.
- **Type aliases that could have been ports: 4.** `Clock` has two
  implementations (`systemClock`, `fixedClock`) and is the only real port.
  `Scope`, `Principal` and `Database` are data shapes, not ports.
- **Seams that were considered and refused: 2.** An `ICustomersRepository` for
  mockability (resolved by extracting pure functions instead — see 2.5), and an
  event-handler registry for the dispatcher (one call site, so not yet).

This is the result the "against" column of the NestJS analysis predicted would
go the other way: *"agents will reproduce NestJS's heavier idioms —
`interface IFooService` with token injection, abstraction per service."* It did
not happen here. Two caveats on how much weight that carries: the explicit "no
abstraction until two call sites" rule was in context the whole time, and a
single module is the easiest possible case. The pull toward
`interface + token` appears exactly when a second module needs to fake the
first, and this spike never had a second module.

**Three `Symbol` tokens** exist for the non-class providers (`DATABASE`, `DB`,
`CLOCK`). They are the container's real cost: a token is resolved at bootstrap,
so a wrong one is a runtime failure rather than a type error.

---

## 6. Lines of code

Non-blank, non-comment lines. Comments are counted separately because this
codebase comments the *why* heavily by design, and counting them as
"application code" would flatter every spike equally.

| Category | Files | Code | Comments | Total |
|---|---:|---:|---:|---:|
| **Application** | | | | |
| `customers` module (7 files) | 7 | 757 | 289 | 1152 |
| Platform: outbox + realtime | 4 | 321 | 129 | 501 |
| Platform: OpenAPI generation | 1 | 150 | 27 | 190 |
| Platform: branded types, errors, principal, scope, clock | 5 | 142 | 88 | 272 |
| Platform: db client + migrator | 2 | 76 | 34 | 124 |
| Migrations (plain SQL) | 2 | 54 | 15 | 79 |
| `config.ts` | 1 | 22 | 12 | 37 |
| `customers.module.ts` | 1 | 12 | 6 | 20 |
| **Application subtotal** | **23** | **1,534** | **600** | **2,375** |
| **Framework scaffolding** | | | | |
| HTTP glue: 2 guards, Zod pipe, error filter, health | 5 | 188 | 82 | 299 |
| Bootstrap + Nest module files (`main`, `app.module`, `db.module`, `outbox.module`) | 4 | 113 | 42 | 178 |
| **Scaffolding subtotal** | **9** | **301** | **124** | **477** |
| **Tests** | | | | |
| Pure unit + property-based | 2 | 481 | 35 | 575 |
| Integration (real Postgres) | 1 | 338 | 26 | 423 |
| Cross-tenant / cross-customer leak | 1 | 315 | 72 | 432 |
| Factories, harness, container setup | 4 | 170 | 47 | 246 |
| **Test subtotal** | **8** | **1,304** | **180** | **1,676** |
| **Build, tooling, plain-command scripts** | 11 | 427 | 100 | 565 |
| **Total** | **51** | **3,566** | **1,004** | **5,093** |

### How to read this against the other three spikes

**Framework scaffolding is 301 lines — 16% of non-test code (301 / 1,835).**
That is the headline number for the "batteries vs. hand-built" criterion, and
it is low because Nest supplied the three things that would otherwise be
hand-built here: `@Sse()`, `enableVersioning`, and `APP_FILTER`.

Note what is *not* in that 301 and should be subtracted before comparing:

- `main.ts` is 52 lines, of which ~25 are the SSE-draining sequence. That is
  hand-built **despite** the framework and will appear in all four spikes;
  spike 4 starts with it already written.
- `principal.guard.ts` (63 lines) is spike-only authentication scaffolding that
  Better Auth replaces.
- `zod.pipe.ts` (10 lines) exists only because the framework's native validation
  story is class-validator. A Fastify spike would spend comparable lines on a
  Zod `preHandler`.
- `health.controller.ts` (19 lines) is ADR-022 rule 7 and is required under
  every candidate.
- `domain-error.filter.ts` (69 lines) is the error taxonomy mapped to HTTP,
  which the standards doc requires regardless; only the ~8 lines of
  `ExceptionFilter` plumbing are Nest's.

**The genuine "framework tax" is 83 lines**: `app.module.ts` (17),
`db.module.ts` (35, including the three DI tokens), `outbox.module.ts` (9), the
`@Module` block in `customers.module.ts` (12), and `zod.pipe.ts` (10). Call it
~50 if you accept that a hand-rolled structure still needs something like
`db.module.ts` to construct and close the pool.

That is small, and it is the single clearest quantitative result in this spike:
[[Framework Evaluation]] estimates the "Fastify + our own structure" candidate
at roughly **800 lines of `lib/` scaffolding** that Dave owns forever. Nest
charges ~83 lines and maintains the rest itself. The counterweight is that the
800 lines are *readable at 6am* and Nest's internals are not — which is a
judgment call the line counts cannot settle.

**Tests are 1,304 lines against 1,534 lines of application code — a 0.85:1
ratio**, and the leak suite alone is 315 lines. That is the shape
[[Testing Strategy]] asks for, and it is almost entirely framework-independent:
only the leak suite's router introspection (~25 lines) is Nest-specific.

**The `customers` module itself is 757 lines across 7 files.** For comparing
spikes, this is the number that matters most, because it is what every
subsequent module will be instructed to copy.

### One wart worth naming

The leak suite reads Nest's Express router through `app.getHttpAdapter()
.getInstance().router.stack` to assert no route escapes the OpenAPI document.
It cost three attempts to get right — an Express app and an Express router are
both *functions*, not objects, so the obvious `typeof x === 'object'` guards
silently returned an empty list and the test would have passed vacuously. It is
guarded against that now (empty list throws), but it is private framework
structure and it will break on an Express or Nest major. Nest offers no public
route-enumeration API. Under a hand-rolled Fastify structure this would be
`fastify.printRoutes()` or the route table we own — a small but real point
against Nest on the "enforceability of our rules" criterion.
