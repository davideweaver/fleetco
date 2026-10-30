# NOTES — Fastify spike

Spike **2 of 4** for [[Framework Evaluation]]. The `customers` golden module
from [[Code Standards and Guardrails]], on Fastify 5 plus our own layered
structure, with Drizzle, Postgres, Zod 4 and Vitest.

**State at handoff:** `npm run typecheck`, `npm run lint` and all three test
projects pass — 83 tests. The built image was run against a real Postgres and
exercised by hand end to end, including SSE replay-plus-live over a real socket
and a `SIGTERM` drain with an open stream.

**Dependencies added beyond the framework and the documents:** none.
Runtime is `fastify`, `drizzle-orm`, `pg`, `zod`. Dev is TypeScript, ESLint,
Vitest, fast-check, `@testcontainers/postgresql`, `tsx`. Every one of those is
either the framework, named in an ADR, or named in [[Testing Strategy]].

---

## 1. Decisions the documents did not specify

Grouped by how much they would cost to change later.

### 1.1 Would need a real decision before M6

**Authentication is stubbed by a request header.** `platform/http/authenticate.ts`
reads a JSON `Principal` from `x-fleetco-principal`. The real thing is an opaque
session token in Postgres (ADR-013) minted by Better Auth behind the `AuthN`
port (ADR-012), and none of that is a framework question. The hook **throws at
install time when `RUNTIME_ENV=production`**, so the spike cannot be deployed
with header-asserted identity by accident. Everything downstream — `Scope`, the
repository chokepoint, the leak suite — is the real design and does not change
when the stub is replaced; the hook goes from the callback form to `async`.

**`Principal` is a discriminated union, not the document's optional
`customerId`.** [[Auth and Identity]] sketches
`{ plane, customerId?: string }`. That optional field is the bug: a portal
principal constructed without a `customerId` type-checks and is scoped to the
entire tenant. Modelled as a union on `plane`, a portal principal without its
customer **cannot be constructed**, which moves the rule from tier 4 to tier 1.
Recommend carrying this into the real `AuthN` port.

**The outbox primary key is a `bigint` identity, not a UUIDv7.** The one
deliberate exception to "UUIDv7 primary keys everywhere". [[Realtime and
Events]] § Event Shape requires "a monotonic `id` (the replay cursor)" and
§ Replay on Reconnect shows it on the wire as `Last-Event-ID: 48213`. A UUIDv7
sorts but is not a cursor a browser can compare, and the outbox is a platform
log rather than a customer-facing entity, so the non-enumerability argument does
not apply to it.

**Replay visibility has a ceiling, and this is the subtlest thing in the
spike.** A client cursor is a high-water mark: once it has read id 40 it never
asks for 39 again. With several dispatcher workers claiming under
`SKIP LOCKED`, worker B can commit id 40 while worker A still holds 39
uncommitted — a reader that accepted 40 would advance past 39 and lose it
permanently, which is the one failure replay exists to prevent. So
`outbox/repository.ts` only exposes rows with **no lower row still pending**
(`id < (select min(id) … where dispatched_at is null)`). That makes the stream
gapless by construction rather than by assuming the dispatcher commits in id
order. `repository.test.ts` asserts it directly by marking the second row
dispatched and leaving a hole beneath it.

Not in any document, and it should be: it is a correctness property of the
outbox, not of this framework, so **all four spikes should be checked for it**.

**`LISTEN/NOTIFY` is a wake-up, not a delivery.** A notification carries only
`{ id, tenantId, topic }`; the body is re-read from the outbox through the
subscriber's own `Scope`. One consequence is that replay and live push are the
*same* code path — a wake re-runs the same scoped cursor read — which collapses
the usual "catch up, then switch to live, and hope nothing landed in between"
race into a loop with no seam. [[Realtime and Events]] implies this ("clients
replay the body from the outbox by cursor"); the spike commits to it.

### 1.2 Domain choices, cheap to change

Kept **deliberately identical to the NestJS spike** so the comparison is about
the framework and not about two different guesses at the domain:

| Field | Choice | Why |
|---|---|---|
| `code` | the shop's short code for a fleet, uppercased, unique **per tenant** | [[Domain Model]] names a Customer as "the fleet whose equipment is serviced"; a shop needs a handle for it |
| `status` | `prospect → active → inactive`, with reactivation | the smallest state machine that exercises the exhaustive-switch rule honestly |
| `defaultLaborRateCents` | per customer | [[Domain Model]] § Validation Needed asks "per customer? per unit type? flat?" — per customer is the common fleet-rate agreement and can be overridden later per unit |
| `billingTermsNetDays` | `0 \| 15 \| 30 \| 45 \| 60` | not free-form: it drives invoice due dates |
| `isOnCreditHold` | separate from `status` | a credit manager holds a past-due account without deactivating it; conflating them would make "on hold" a status transition |
| `creditLimitCents` | present, `>= 0` | gives `Cents` two real call sites rather than one |

Three invented business rules, all flagged as needing Dave's confirmation
([[Code Standards and Guardrails]] § The Review Layer — "is the business rule
correct, not merely consistently implemented?"):

1. **Net terms require a non-zero credit limit.** Prepay customers are net 0.
2. **A fleet on credit hold cannot be *activated*** — the rule guards the
   transition, not the state.
3. **A labor rate ceiling of $1,000/hour.** Exists purely to catch the
   dollars-for-cents mix-up: `45` entered where `4500` was meant passes every
   other check, `450000` does not. The `Cents` brand stops a float entering the
   system; this stops the other half of the same bug.

### 1.3 Mechanical choices

**UUIDv7 is hand-written, about eight lines over `node:crypto`.** The
dependency allowlist's default answer is no, and RFC 9562 §5.7 is a fully
specified bit layout. Monotonicity *within* a millisecond is not attempted —
ids are not cursors here, so millisecond-granular ordering is all the
index-locality argument needs. `invariants.test.ts` property-tests the layout
and the lexicographic ordering. *(The NestJS spike took the `uuidv7` package;
that is a one-dependency difference between the two, not a framework
difference.)*

**Migrations are plain SQL with a ~75-line runner, not `drizzle-kit`.** The
golden-module layout specifies `migrations/ plain SQL, forward-only`, and a
generated-diff tool is exactly what produces the "rewriting `ALTER` that takes a
long lock" the migration playbook warns about. `schema.ts` is the query
builder's view of the tables; the SQL files are the record of how they got
there. Both are checked against each other every integration run, because the
harness migrates from scratch and the repository then queries through Drizzle.

**OpenAPI 3.1, generated by Zod 4's own `z.toJSONSchema`.** 3.1's schema dialect
*is* JSON Schema 2020-12, which Zod emits natively — so ADR-014 costs zero
dependencies. 3.0 would have needed a conversion library.

**Responses are validated against their own Zod contract on the way out.** It is
one `parse` call in the shared route handler and it means a drift between a
handler and the generated document is a failing request rather than a wrong
document. This is most of what [[Testing Strategy]]'s "contract" layer asks
for, obtained at runtime instead of as a separate suite.

**Keyset pagination with a base64url JSON cursor**, ordered `(name, id)` to
match the index. JSON rather than a delimiter because a fleet called
`ACME | WEST` would split a delimited cursor in the wrong place — a paging bug
that only shows up in one tenant's data. There is a test for exactly that name.

**Pagination, search and the `/health` and `/openapi.json` endpoints** are
unasked-for. Pagination and search are what make `list` a real query worth
scoping; health is ADR-022 rule 7 and it counts undispatched outbox rows, so it
touches the database *and* reports something worth alerting on.

**Deferred on purpose, and each is one line of why:** outbox month partitioning
and audit-log rollover (§ Retention needs the Q9 retention period and is
additive); an in-process handler registry (only one consumer exists, so "no
abstraction until two real call sites" applies); role checks beyond the plane
gate (no role is specified anywhere yet); `LocalDay` has a constructor and no
call site — it is in `branded.ts` because the standards doc lists it, and it
should be deleted if the first real use does not arrive.

---

## 2. Where the framework fought the documented rules

Fastify itself fought almost nothing. **The fights were with the toolchain and
with the structure we chose, which is the honest finding for this candidate:
there is no framework to argue with, so every argument is with yourself.**

### 2.1 There is no SSE support, so there is 136 lines of it

`platform/http/sse.ts`. NestJS has `@Sse()`. Fastify has `reply.hijack()` and a
raw `node:http` response. What had to be written by hand: the header set
(`no-transform` matters as much as `no-cache` — a proxy that gzips an SSE stream
buffers it, and a buffered SSE stream is a broken one), `x-accel-buffering`, the
`retry:` preamble, heartbeat comments, frame serialization, and a registry of
open connections so `SIGTERM` can drain them.

None of it is hard and all of it is now ours forever. It is also the one place
where owning the plumbing paid: **authorization has to happen before the socket
is hijacked**, or a refusal arrives as a `200` with an error frame inside it
instead of a `403`. That is why the service's `stream` is an `async` function
returning a generator rather than being a generator itself — the route awaits
it, lets the normal error handler have its chance, and only then takes the
socket. A decorator-driven `@Sse()` that returns an observable makes that
ordering someone else's decision.

### 2.2 Routes had to become data, or three documented rules had no teeth

`platform/http/route.ts`, 241 lines, is the structure the spike invented. It
exists because three separate requirements all need routes to be enumerable:

- the add-endpoint playbook's "parse, authorize, call **one** service method,
  serialize" needs one place to live, or every handler re-implements it;
- ADR-014 needs the OpenAPI document generated from the same source as the code;
- [[Testing Strategy]] needs the leak suite to **enumerate routes from the
  OpenAPI document** so "a new endpoint without leak coverage fails the build".

NestJS gets all three from decorators and reflection. This is what they cost
when you hold them yourself. The payoff is that `routes.ts` handlers are each a
single expression — there is physically nowhere for logic to go, and a handler
that wanted to branch would have to be rewritten into a shape no other route
has, which is itself the review signal.

**The gate is real and was verified by breaking it:** removing one
`covered('createCustomer')` call from `leak.test.ts` fails the build with
`expected [ 'createCustomer' ] to deeply equal []`.

### 2.3 The lint config is where this candidate pays its bill — and it bit twice

[[Framework Evaluation]] predicts that under NestJS "module boundaries become
framework-enforced rather than lint-enforced". Here they are two
`no-restricted-imports` zones in a 276-line ESLint config. Two things went wrong
while writing it, and both are worth recording because they are the exact
failure mode the tier-2 table exists to prevent:

1. **A later flat-config block *replaces* an earlier block's value for the same
   rule name on an overlapping file** rather than merging with it. Splitting the
   Drizzle ban and the `pg` ban into two blocks silently disabled the first one.
   The config now hoists the shared entries into `FS_WRITE_PATHS` and
   `CROSS_MODULE_PATTERNS` and spreads them into every block that sets the rule.
   A tier-2 guardrail that is silently off is worse than no guardrail, and
   nothing tells you.
2. **A doc comment containing `` `*/repository.ts` `` terminated the comment
   early** and broke the config file. ESLint reported it as
   `SyntaxError: missing ) after argument list` with no line number.

The ESLint config is itself unguarded. **There is no test that the architecture
rules still fire.** That is a real gap in this candidate and it applies to the
ported-`authors-api` candidate equally. The fix is a handful of fixture files
that must fail lint — worth building before M6 whichever framework wins.

### 2.4 `explicit-function-return-type` fights the derive-the-type pattern

Three factories (`createCustomerStore`, `transactionalStore`,
`createCustomerService`) have no return annotation **on purpose**: their types
are derived from them (`CustomerStore = ReturnType<typeof createCustomerStore>`),
which is what keeps the service's dependency type honest without hand-writing an
interface. Annotating them would be circular. Each carries a narrow
`eslint-disable-next-line` with that reason.

This is a genuine, if small, conflict between "no abstraction with one call
site" and "annotate your return types". Three disables, all local, all
explained.

### 2.5 Type-aware lint rules cannot see an `AbortSignal`

`no-unnecessary-condition` narrowed `signal.aborted` to a constant across an
`await` in the SSE watch loop, because nothing *visible* mutates it. Reading it
through a one-line function (`isClosed()`) says the same thing truthfully. Minor
and framework-independent, but it is the kind of friction `strictTypeChecked`
produces in async code, and it will recur.

### 2.6 Things Fastify made easier than the documents assumed

- **ADR-022 rule 4** (logs to stdout as JSON) is free: Fastify's bundled pino
  does exactly that with no configuration.
- **ADR-022 rule 7** (graceful shutdown) needed ~40 lines in `main.ts`, not a
  `Process` base class. `authors-api` used `http-terminator`; Fastify's
  `app.close()` plus a `Set` of abort controllers is the same behaviour with
  nothing to install. Verified: a live `curl -N` stream exited `0` on
  `SIGTERM` rather than erroring.
- **`app.inject()`** made the leak suite's JSON half need no socket at all,
  which is why it runs in under a second.

### 2.7 One finding that is not about the framework at all

The first statement of the credit-hold property test — "a fleet never ends up
active while on credit hold" — was **refuted by fast-check in eleven cases**
with `['active', false, true]`: putting an *already-active* fleet on hold. That
is the documented behaviour, so the property was wrong rather than the code. The
correction and its reason are kept in the test file.

This is [[Testing Strategy]] rule 1 paying off within an hour. An example-based
test would have been written against whichever reading the author had in mind
and would have agreed with it.

---

## 3. Concept count — what must someone understand to change one endpoint?

**Eleven concepts, and nine of them are ours rather than the framework's.**

Framework (2):

1. **Fastify route registration and hooks** — `app.route({ method, url, handler })`
   and `addHook('onRequest')`. That is the whole of it for a JSON endpoint.
2. **`reply.hijack()`** — only if the endpoint streams.

Ours (9):

3. **Branded types** — `CustomerId`, `Cents`, `Instant`, minted only in
   `branded.ts`.
4. **`Principal`** — the discriminated union, and which plane may call what.
5. **`Scope`** and `scopeOf` — the chokepoint value; the one idea that must not
   be misunderstood.
6. **The layering direction** — routes → service → repository → database, and
   that nothing calls backwards.
7. **The route table** — that a route is a record with `meta` and `handle`, and
   that parsing, the plane check and serialization already happened.
8. **Zod contracts with derived types** — `z.infer`, never a parallel
   declaration.
9. **`CustomerStore` / `CustomerTx`** — that reads take a `Scope` and writes are
   only reachable inside `inTransaction`.
10. **The outbox** — one event per state change, in the same transaction.
11. **The error taxonomy** — throw a `DomainError`; HTTP status mapping happens
    once, elsewhere.

What is **not** on the list, and would be under NestJS: modules and their
`imports`/`exports`/`providers`, injection tokens, provider scopes, guards vs.
interceptors vs. pipes vs. filters and their execution order, `forwardRef`,
`@nestjs/testing`'s module builder. Those are the things [[Framework
Evaluation]] means by "how much framework must be understood at 6am".

The honest counter-argument: concepts 5, 6, 7 and 9 exist **only in prose and in
this module**. There is no framework refusing to compile a service that reaches
past them. The lint config is the substitute, and §2.3 found that it can be
silently disabled.

---

## 4. Tracing one request end to end

`PATCH /v1/customers/:customerId` with `{"status":"active"}`, happy path.

**14 files execute. 8 of them are reading hops a maintainer must follow.**

| # | Hop | File | What happens |
|---|---|---|---|
| — | socket | — | Fastify matches `PATCH /v1/customers/:customerId` |
| 1 | `onRequest` | `platform/http/authenticate.ts` | header → `Principal`, or `null` |
| 2 | `Route.handle` | `platform/http/route.ts` | `requirePrincipal`, `assertPlane`, three `parse` calls |
| 3 | route entry | `modules/customers/routes.ts` | one expression: `service.update(principal, params.customerId, body)` |
| 4 | service | `modules/customers/service.ts` | `scopeOf`, open transaction |
| 5 | store binder | `modules/customers/repository.ts` | `inTransaction` → `transactionalStore(tx)` |
| 6 | repository | `modules/customers/repository.ts` | `findByIdForUpdate` — `scoped(scope)` + `FOR UPDATE` |
| 7 | pure rule | `modules/customers/service.ts` | `applyPatch` — transition legality, credit hold, money rules |
| 8 | repository + outbox | `modules/customers/repository.ts`, `platform/outbox/repository.ts` | `update` (scoped) then `appendEvent`, same transaction |
| — | response | `platform/http/route.ts` | `customerSchema.parse(result)` → `200` |

Also executing, but not places a reader navigates to: `contracts.ts` (the
schemas), `events.ts` (`customerEvent`), `schema.ts` and
`outbox/schema.ts` (table definitions), `types/scope.ts`, `types/branded.ts`
(brand minting in the row mapper), `db/client.ts` (the transaction),
`server.ts` (wiring, once at boot).

**What the trace feels like:** every hop is a literal import you can click
through. There is no provider token to resolve, no decorator whose behaviour
lives in a framework package, and no bootstrap-time wiring to reconstruct. The
dependency graph is `wire.ts` — 86 lines, read top to bottom.

**Where it is worse than it looks:** hops 2 and 5 are *indirect*. The route
table's shared handler and the store binder are both "somebody else already did
the obvious thing", and a reader who has not seen them before has to go read
them once. That is the cost of the enumerable route table, paid once per
maintainer rather than once per endpoint.

---

## 5. Interfaces with exactly one implementation

**Zero in the sense [[Framework Evaluation]] is worried about** — there is no
`interface IFooService` with a token, anywhere. The `interface` keyword appears
once in the whole codebase, to augment `FastifyRequest`.

The honest fuller count: 21 hand-written `type X = { … }` declarations, of which

- **15 are plain data records** — `Scope`, `SseFrame`, `RouteMeta`, `Route`,
  `Problem`, `CustomerPatch`, `Migration`, `Database`, `Wiring`, `Server`,
  `NewOutboxEvent`, `OutboxEvent`, `OpenApiDocument`, `JsonContext`,
  `StreamContext`. No behaviour, no substitutability question.
- **1 has two implementations and earns its existence**: `Clock`
  (`systemClock`, `fixedClock`), which the standards doc requires so time can
  be frozen in tests.
- **1 is a dependency bundle**: `CustomerServiceDeps` — the argument record
  `wire.ts` builds and a unit test builds with fakes.
- **4 are named return types with exactly one producer**: `OutboxListener`,
  `OutboxDispatcher`, `SseStream`, `SseRegistry`.

Those last four are the honest answer to the question, so: each one could be
`ReturnType<typeof createX>` instead, and I kept the name because it reads
better at the import site and because `OutboxListener['watch']` is referenced by
the service's dependency type. They are **not indirection** — each sits in the
same file as its single producer, there is no token, and no reader has to work
out which implementation is bound. But they are four names a stricter reading of
"no abstraction with only one call site" would delete.

The three types that *would* have been single-implementation interfaces in a
container-based design — `CustomerStore`, `CustomerTx`, `CustomerService` — are
**derived** (`ReturnType<typeof …>`) rather than declared, so they cannot drift
from their implementation, and each has a second implementation in
`service.test.ts`'s fake. Sixteen types in total are derived rather than
declared: ten from Zod schemas, three from Drizzle tables, three from factories.

---

## 6. Lines of application code vs. framework scaffolding

Non-blank, non-comment lines. Raw line counts in parentheses, because the
comment density here is deliberately high and a reviewer should see both.

| | Files | Code | (Raw) |
|---|---|---|---|
| **The module** — schema, contracts, events, repository, service, routes, index | 7 | **833** | (1,260) |
| The module's migration SQL | 1 | 27 | (41) |
| **Application subtotal** | **8** | **860** | **(1,301)** |
| | | | |
| Outbox + realtime — dispatcher, listener, repository, schema, SQL | 6 | 383 | (584) |
| HTTP — route table, SSE, error mapping, auth, health | 5 | 394 | (584) |
| Branded types, errors, `Scope`, `Clock`, `Principal` | 5 | 173 | (320) |
| OpenAPI generation | 1 | 90 | (116) |
| Database — pool, `Exec`, migrator | 2 | 77 | (123) |
| Config, `wire.ts`, `server.ts`, `main.ts` | 4 | 165 | (270) |
| **Scaffolding subtotal** | **23** | **1,282** | **(1,997)** |
| | | | |
| Tests — five suites plus factories and harness | 8 | 1,492 | (1,909) |
| Tooling — ESLint, Vitest, tsconfig, Dockerfile, scripts | 8 | 218 | (461) |
| | | | |
| **Total** | **47** | **3,852** | **(5,668)** |

### How to read this

**[[Framework Evaluation]] estimated "roughly 800 lines of `lib/` scaffolding"
for this candidate. The real figure is 1,282 lines of code across 23 files —
about 60% over the estimate**, and that is with the dependency allowlist holding
at zero additions.

But the number needs splitting, because not all of it is a framework tax:

- **~450 lines are framework tax proper** — things NestJS ships: the SSE
  plumbing (394 in `http/`, of which SSE is 136 and the route table 241 minus
  what Nest's decorators would also need) and the OpenAPI generator (90).
- **~383 lines are the outbox and realtime layer**, which [[Realtime and
  Events]] specifies and which every candidate has to write. Nest would save
  nothing here beyond `@Sse()`.
- **~173 lines are the branded types and the error taxonomy**, which the
  standards doc requires and which no framework provides.
- **~165 lines are config, composition and the process lifecycle**, which
  replaces `ConfigModule`, the DI container and `enableShutdownHooks`. That is a
  genuinely good trade on line count alone.

So the comparable-with-NestJS figure is **roughly 450–650 lines of avoidable
scaffolding**, not 1,282. The rest is work the documents demand regardless.

**Tests are 1.7× the application code** (1,492 vs 860). That ratio is the
intended one: [[Testing Strategy]] makes tests the mechanism that makes agent
output safe to accept, so they are load-bearing rather than overhead. The leak
suite alone is 322 raw lines and is the single highest-value asset in the
directory.

**The module itself — 833 lines of code across 7 files — is what a later module
copies.** It is the number that actually matters for the twentieth module, and
it is almost entirely framework-independent: the schema, contracts, service and
repository would read nearly identically under any of the four candidates. The
differences live in `routes.ts` (132 raw lines) and in whether `platform/http/`
has to exist.

---

## 7. What this spike actually argues

Not a recommendation — [[Framework Evaluation]] is explicit that the decision
comes from reading all four. But three observations that will not be visible in
any single spike:

1. **Fastify's cost is front-loaded and one-time; its benefit is per-file and
   permanent.** 1,282 lines of scaffolding is paid once. Every one of the ~60
   entities in [[Domain Model]] then gets a module where the dependency is in
   the import line.

2. **The enforcement question is the real one, and this spike does not settle
   it.** Tier 1 came out strong — branded types, the `Principal` union, `Scope`
   on every repository function, writes only reachable inside `inTransaction`.
   Tier 2 came out *brittle*: §2.3 found two different ways the ESLint config
   can be wrong without telling you. If Fastify wins, **tests for the lint
   rules are not optional**.

3. **The genuinely non-trivial requirement went better than expected, and for a
   reason worth keeping whichever framework wins.** Treating `NOTIFY` as a
   wake-up rather than a delivery, and reusing one scoped cursor read for both
   replay and live push, removes the race rather than mitigating it. Check the
   other three spikes for that property and for the replay-ceiling gap in §1.1 —
   a candidate that gets the ergonomics right and the cursor wrong is the worse
   outcome.
