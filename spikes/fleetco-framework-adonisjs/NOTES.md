# NOTES — AdonisJS spike

Spike **3 of 4** for [[Framework Evaluation]]. The `customers` golden module
from [[Code Standards and Guardrails]], on AdonisJS 6 plus Drizzle, Postgres,
Zod 4 and Vitest in place of AdonisJS's own Lucid, VineJS and Japa.

**State at handoff:** `npm run typecheck`, `npm run lint` and all three test
projects pass — **83 tests** (40 unit, 28 integration, 15 leak), run against a
real Postgres via `@testcontainers/postgresql` with Docker available in this
environment (confirmed: `docker` present, containers started and torn down
cleanly for every run — nothing here is a skip). `npm run build` produces a
real `build/` tree, and the built server was run as a real process (`node
build/bin/server.js`) against a throwaway `docker run postgres:16-alpine`,
exercised by hand: `GET /health`, `GET /v1/customers`, `POST`, `PATCH`,
`GET /openapi.json`, a 403-with-no-principal, an SSE stream that received a
live `customer.updated` frame from a concurrent `PATCH`, and a `SIGTERM`
that drained an open SSE connection (`curl` exited `0`) before the process
exited. The cross-tenant and cross-customer leak suite, including the SSE
subscription case, passes against that same real database.

**Dependencies added beyond the framework and the documents:** none.
Runtime is `@adonisjs/core`, `drizzle-orm`, `pg`, `reflect-metadata`, `zod`.
Dev is TypeScript, ESLint, Vitest, fast-check, `@testcontainers/postgresql`,
`tsx`. Every one of those is either the framework, named in an ADR, or named
in [[Testing Strategy]]. `reflect-metadata` is AdonisJS's own stock
requirement (the slim starter kit's `bin/server.ts` imports it unconditionally)
rather than something this spike chose.

---

## 1. Decisions the documents did not specify

The shared domain decisions — branded types, the error taxonomy, `Principal`
as a discriminated union, `Scope`/`scopeOf`, the Customer field list, the
three invented business rules, the outbox's gapless-cursor replay design, the
`LISTEN/NOTIFY`-as-wake-up design, keyset pagination, OpenAPI via
`z.toJSONSchema` — are kept **identical** to the Fastify and NestJS spikes, for
the same reason the Fastify spike gives: the comparison is supposed to be
about the framework, not about three different guesses at the domain. They are
not re-litigated here. What follows is AdonisJS-specific.

### 1.1 How idiomatic-Adonis vs. how golden-module-shaped

[[Code Standards and Guardrails]]'s golden-module layout (`schema.ts`,
`repository.ts`, `service.ts`, `contracts.ts`, `routes.ts`, `events.ts`,
`index.ts`, `__tests__/`) is a hard requirement, and `modules/customers/`
satisfies it file-for-file, byte-for-byte the shape of the Fastify spike's.
**Every file in that directory has zero AdonisJS imports.** `schema.ts`,
`contracts.ts`, `events.ts`, `repository.ts`, `service.ts` are
framework-independent in the literal sense — they would paste into the Fastify
spike's `modules/customers/` unchanged except for import depth.

The one file that could not stay that way is `routes.ts`. [[Code Standards and
Guardrails]] describes it as "Fastify handlers, thin." AdonisJS's own
convention is controllers — real classes, resolved by the router from a path
string (`[CustomersController, 'index']`) — and the brief explicitly asks for
"true AdonisJS idiom, not a Fastify port." So the route table was split along
the framework-independent / framework-specific seam instead of merged into one
file:

- `modules/customers/routes.ts` — still produces `Route` values (`jsonRoute`,
  `sseRoute`), still framework-independent, still thin. The only change from
  the Fastify shape is that it returns a *named* object
  (`{ list, get, create, update, events, all }`) rather than a bare array,
  because a controller method needs to reach exactly one route with its
  specific types intact, which a `Route[]` erases.
- `app/controllers/customers_controller.ts` — real AdonisJS controller, one
  method per route, each method one line: fetch the matching value from
  `routes.ts` and hand it to a shared adapter.
- `platform/http/adonis_route.ts` — the shared adapter (`runJsonRoute`,
  `runSseRoute`) that does the actual parse/authorize/serialize work. This is
  the direct analogue of the Fastify spike's `route.ts` + `registerRoutes`,
  just split so the AdonisJS-specific half is a separately measurable line
  count — see §6.

The same split applies to the error taxonomy (`platform/http/errors.ts`,
framework-independent `problemFor`/`statusFor`, vs.
`app/exceptions/handler.ts`, the three-line AdonisJS adapter that calls it)
and to authentication (`platform/http/authenticate.ts`, pure functions, vs.
`app/middleware/authenticate_middleware.ts`, the class AdonisJS's kernel
resolves).

**Everything outside `modules/customers/` is as idiomatically AdonisJS as this
spike could make it**, with one deliberate exception — see §2.4.

### 1.2 Auth stub, migrations — kept identical in spirit

Authentication is the same spike stub as the Fastify and NestJS spikes:
`x-fleetco-principal` header, parsed by `platform/http/authenticate.ts`
(framework-independent), assigned to `ctx.principal` by
`AuthenticateMiddleware`. The **production guard** — refusing to run this
stub when `RUNTIME_ENV=production` — moved from "middleware install time" (the
Fastify shape) to `FleetcoProvider#boot`, because AdonisJS middleware classes
are registered as lazy imports with no single synchronous "install" call site
to throw from; a provider's `boot()` is the one place in the AdonisJS
lifecycle that reliably runs once, at the right time, same spirit as the
Fastify spike's `installAuthentication`.

Migrations are the identical hand-rolled runner (`platform/db/migrator.ts`,
~75 lines, plain SQL, forward-only, its own ledger table) — not `drizzle-kit`,
and not AdonisJS's own migration system, which is wired to Lucid and would not
apply to a Drizzle schema regardless.

### 1.3 The composition root, and what replaced `wire.ts`/`main.ts`

The Fastify spike's `wire.ts` (builds the object graph) + `server.ts`
(installs middleware, registers routes) + `main.ts` (process lifecycle,
`SIGTERM` handling) become, under AdonisJS:

- `platform/wiring.ts` — `buildWiring()`, the direct analogue of `wire.ts`.
  Same shape: one function, explicit construction, no container involved in
  *building* the graph.
- `providers/fleetco_provider.ts` — `FleetcoProvider`, whose `boot`/`start`/
  `shutdown` methods replace `main.ts`'s hand-rolled signal handling. This is
  a genuine, substantive AdonisJS win — see §2.1.
- `start/kernel.ts` + `start/routes.ts` — replace `server.ts`'s middleware and
  route registration, in AdonisJS's own idiom (`server.use`, `router.get`).

### 1.4 `config/*.ts` reads `process.env` directly — forced, not chosen

[[Code Standards and Guardrails]] says `process.env` is banned outside one
file. AdonisJS's own convention already *is* that file — `start/env.ts`,
where `Env.create(...)` validates at boot, exactly matching the rule's intent.
But `config/app.ts` and `config/logger.ts` could not import `start/env.ts`'s
typed `env` and had to fall back to reading `process.env` directly, with a
narrow, matching lint exemption. This was not a style choice; see §2.2 for why
it was forced, and why it only became visible under the test runner rather
than under `tsx` or a real build.

### 1.5 No Dockerfile

The Fastify spike ships a `Dockerfile` and `.dockerignore`; this one does not.
This is a scope cut under the time budget, not a principled decision — the
AdonisJS-specific plumbing in §2 (the module-loading investigation, the
container-based wiring fix, the pool/IPC fix) consumed the time a Dockerfile
would have taken, and a production image is meaningfully less urgent than
"does the test suite tell the truth." Flagged honestly rather than silently
dropped; it is a half-day of straightforward follow-up, not a design gap.

### 1.6 Mechanical choices specific to this spike

- **`fleetco_provider.ts`'s `app.terminating()` registration order is
  load-bearing** and is the single most important implementation detail in
  this spike. See §2.1.
- **Wiring is resolved through the IoC container, not a module-level
  singleton** (`platform/wiring.ts`'s `getWiring(resolver)` takes an explicit
  `Container` or `ContainerResolver`). See §2.3 — this is not a style
  preference, it is a correctness fix for a problem that is specific to
  running AdonisJS under Vitest.
- **A `WiringOverrides` container binding** (`platform/wiring.ts`) is the
  AdonisJS-boot equivalent of the Fastify spike's
  `buildServer(config, { clock: fixedClock(FROZEN_NOW) })` parameter: there is
  no function call a test can pass an override *into*, because AdonisJS
  constructs `FleetcoProvider` itself, so the override has to be sitting on
  the container *before* `app.boot()` runs.
- **`platform/test/harness.ts` hand-replicates
  `@adonisjs/core/build/src/ignitor/http.js`'s `HttpServerProcess#start`**,
  pulling out an ephemeral port and a handle to `.terminate()` — the brief's
  instruction to bootstrap AdonisJS's HTTP server directly rather than reach
  for `@japa/plugin-adonisjs`, taken literally.
- **Vitest's `integration` and `leak` projects run with `pool: 'threads'`**,
  not the default `forks`, and load `platform/test/register-tsx.ts` as a
  `setupFile`. Both are load-bearing; see §2.2 and §2.5.

---

## 2. Where AdonisJS fought the documented rules

Lucid vs. Drizzle and VineJS vs. Zod turned out to be the easy parts — AdonisJS
does not *force* either, it just ships them as the path of least resistance,
and simply not installing them was the entire cost. **The real fight was
Japa vs. Vitest, and it went three layers deeper than "no `app.inject()`."**
Finding all three took reading `@adonisjs/application`'s and
`@poppinss/utils`'s compiled source, not their documentation, and then
verifying each fix against a real `docker` Postgres rather than trusting that
green tests meant the theory was right.

### 2.1 Where it went well: the provider lifecycle *is* ADR-022 rule 7

This is the genuine win, and it is worth stating plainly before the rest of
this section, which is mostly friction. The Fastify spike's `main.ts` hand-
rolls `process.on('SIGTERM', ...)`, a readiness delay, dispatcher shutdown, SSE
draining, and pool closing — about forty lines of lifecycle code that exist
only because Fastify has no opinion about process lifecycle.
`providers/fleetco_provider.ts`'s `boot`/`start`/`shutdown` methods are that
same forty lines, as three methods on a class AdonisJS itself calls at the
right moments. No `process.on`, no hand-timed ordering of "stop accepting work
before closing the pool" — `register → boot → start → ready` and
`terminating → shutdown` are already the right shape for ADR-022 rule 7.

The one thing that needed real care, and is the single most important
sentence in this spike's code: **SSE draining is registered via
`app.terminating()`, inside `boot()`, not inside `shutdown()`.** AdonisJS's
own HTTP-server lifecycle (`HttpServerProcess`, not something this spike
touches) registers *its own* `app.terminating()` hook later — during
`app.start()`, after every provider has booted — and that hook calls
`nodeHttpServer.close()` and *awaits it*, which only resolves once every open
connection, SSE included, has ended. `app.terminate()` runs every
`app.terminating()` hook in **registration order** by default (there is an
`experimental.shutdownInReverseOrder` flag that reverses it — see §2.6).
Register the SSE drain *after* the HTTP server's own hook and you get a
deadlock on every deploy with an open stream: the server's `close()` call
blocks forever waiting for sockets nothing has told to close yet, and the
drain code that would close them never gets to run because the hooks run one
at a time, awaited, in order. Registering ours first — in `boot()`, which runs
before the HTTP-server lifecycle even starts — avoids this entirely. This was
verified three ways: reading `@adonisjs/core/build/src/ignitor/http.js`
directly, a Vitest integration test
(`modules/customers/__tests__/sse.test.ts`'s "drains open streams on shutdown"
— which terminates the *shared* harness as its last act rather than booting a
second AdonisJS application, for the reason in §2.3), and a real `SIGTERM`
against the built, running server with a live `curl -N` stream attached
(`curl` exited `0`, the process exited, both confirmed by hand).

### 2.2 AdonisJS's own bootstrap does not run from TypeScript source without a build or `@adonisjs/assembler` — and that is not optional scaffolding, it breaks Vitest

This is the finding that cost the most time, and it is the one the brief
underestimated when it said "you will need to bootstrap and tear down the
Adonis HTTP server yourself rather than using Adonis's Japa plugins." That
undersells it: the problem is not Japa, it is that **AdonisJS's own internal
file loading assumes a compiled `build/` tree or `@adonisjs/assembler`'s
dev-mode loader hook, and Vitest provides neither by default**, in three
separate places:

1. **Package self-reference imports (`#foo/bar`).** The idiomatic AdonisJS
   convention — `package.json`'s `imports` field, `import x from '#platform/y'`
   — was adopted throughout this codebase at first, matching every other
   AdonisJS app's layout. It does not work under either `tsx` or Vitest
   without a literal compiled `.js` file on disk: the `imports` map target
   (`./platform/*.js`) appends `.js` to whatever `*` captures, so a specifier
   written `#platform/wiring.js` doubles the extension
   (`platform/wiring.js.js`), and a specifier written without the extension
   resolves to a literal `platform/wiring.js` that only exists after
   `npm run build`. Confirmed by running `tsx -e "import env from
   '#start/env'"` directly and watching it fail with `Cannot find module
   '.../start/env.js'`. **The fix was to abandon `#subpath` imports entirely**
   and use relative `../platform/x.js`-style specifiers everywhere, identical
   to the Fastify spike's convention. `package.json`'s `imports` field was
   removed — it is dead configuration once nothing references it, and keeping
   it would have been exactly the kind of invented abstraction with no real
   call site [[Code Standards and Guardrails]] bans.
2. **`@adonisjs/config`'s file loader.** `ConfigLoader.load()` (inside
   `@poppinss/utils`'s `fsImportAll`) enumerates `config/*.ts` by walking the
   directory and `import()`-ing each file by its *real, existing* path — that
   part works. The problem is one level down: `config/app.ts` and
   `config/logger.ts` each tried to import `start/env.ts` by a correct,
   nodenext-style relative specifier, and *that* import, executing from inside
   a module loaded by `@poppinss/utils` (a `node_modules` package, outside
   Vite's own SSR transform graph), hit bare Node ESM resolution with no
   TypeScript extension fallback at all — the same `Cannot find module
   '.../start/env.js'` failure, one hop removed. The fix is in §1.4: `config/
   app.ts` and `config/logger.ts` read `process.env` directly instead, with a
   lint exemption matching `start/env.ts`'s.
3. **The RC file (`adonisrc.ts`) loader.** `@adonisjs/application`'s
   `RcFileManager#process` does `const rcTSFile = new URL("adonisrc.js",
   appRoot); const rcExports = await import(rcTSFile.href)`, catches the
   resulting `Cannot find module` error, and **silently falls back to an empty
   RC file** rather than throwing. Under `tsx`, that bare `import()` succeeds
   anyway, because `tsx` installs a process-wide Node loader hook that
   rewrites `.js` to a sibling `.ts` for *every* dynamic import in the
   process, including ones issued from inside `node_modules` — which is
   exactly why every manual `tsx -e '...'` reproduction of the full boot
   sequence worked throughout this investigation. Vitest's own module runner
   (`vite-node`) does not install that hook globally; it only transforms
   modules it discovers by walking its own graph starting from a test file,
   and a bare `import()` issued from inside `@adonisjs/application` never
   enters that graph. The practical symptom: `app.rcFile.providers` came back
   `[]` under Vitest, `FleetcoProvider` was never constructed, and
   `getWiring()` threw "accessed before boot ran" — not because boot failed,
   but because the provider that would have called `setWiring` was never
   instantiated, with no error anywhere to say so.

   **The fix:** `platform/test/register-tsx.ts`, loaded as a Vitest
   `setupFile` for the `integration` and `leak` projects, calls `register()`
   from `tsx/esm/api` — `tsx`'s own documented programmatic API for installing
   its loader hook inside an already-running process. `tsx` is already on the
   dependency allowlist for exactly this class of problem; this is a
   different entry point into the same package, not a new dependency.

### 2.3 The IoC container earned its one use — not because DI is good, because object identity is

[[Framework Evaluation]] records Dave's dislike of DI containers as "specific
to containers, not to structure," and this spike holds that line: nothing in
`modules/customers/` or `platform/outbox/` is resolved from the container,
there is no `@inject()` anywhere, and `CustomerService`/`CustomerStore` are
still plain function calls a unit test builds with fakes, exactly like the
Fastify spike. But one value — the `Wiring` object itself — **had to** go
through the container, and the reason is a direct consequence of §2.2's `tsx`
fix rather than a design preference.

The first implementation held `wiring` in a bare module-level `let current`
in `platform/wiring.ts`, exactly mirroring the Fastify spike's instinct for
"a plain value, not a container entry." It failed under Vitest in a way that
took a canary test to prove: a file reached through AdonisJS's own internal
module loading (how `FleetcoProvider` gets instantiated, now routed through
`tsx`'s loader per §2.2) and the *same file* reached through a plain `import`
in a test file are **two separate module instances**, each with its own copy
of any top-level `let` — confirmed by stamping a marker property onto the
module from the test file, observing it survive a full `app.boot()` call, and
observing `getWiring()` still throw "accessed before boot ran" because
`setWiring()` had run against the *other* copy. This is not limited to this
codebase's own modules: `@adonisjs/core/services/app`'s module-level `app`
singleton suffered the identical duplication, which ruled out the obvious
second attempt (`import app from '@adonisjs/core/services/app'; app.container
...`) too.

**What is never duplicated:** the live `Application` object `Ignitor`
constructs once and passes by reference everywhere — `this.app` in a
provider's constructor, the `app` local variable `platform/test/harness.ts`
gets back from `ignitor.createApp()`, and `ctx.containerResolver` on every
request (created by AdonisJS's own request pipeline from that same app's
container, no module singleton anywhere in that particular chain). Binding
`wiring` onto `app.container` and resolving it via `resolver.make('wiring')`
— where the caller supplies `this.app.container`, the harness's `app.container`,
or `ctx.containerResolver`, whichever it already holds by direct reference —
sidesteps the module-duplication problem entirely, because it never depends
on *which* copy of any module loaded the calling code. `platform/wiring.ts`'s
`WiringResolver`/`WiringBinder` types exist solely to describe "anything
structurally shaped like a resolver," so the same `getWiring()` function works
against either concrete type.

Nothing else in this codebase needed this. It is one binding, in one file, and
the honest accounting in §5 lists it as a genuinely new "shape" this spike
needed that the Fastify spike did not.

### 2.4 `pool: 'threads'`, not the default `pool: 'forks'`

A second, independent Vitest incompatibility, found immediately after fixing
§2.2: with the default `forks` pool, `app.notify({...})` — AdonisJS's own
"the HTTP server is listening" signal, which calls `process.send(...)` when a
parent process channel exists — collides with Vitest's *own* `process.send`-
based protocol for worker-to-main-process communication (both running over
the same child-process IPC channel), producing `Unexpected call to
process.send()` and a corrupted, unrelated deserialization error. `pool:
'threads'` runs workers as worker threads instead of child processes, which
have no `process.send` of their own to collide with, and the problem
disappears. Set only for the `integration` and `leak` projects in
`vitest.config.ts`, where a real AdonisJS application actually boots; the
`unit` project never touches any of this.

### 2.5 AdonisJS's own generated entrypoint does not pass this repo's lint config

`bin/server.ts` is the slim starter kit's generated file, essentially
unmodified. As generated, it fails `strictTypeChecked`:
`app.listen('SIGTERM', () => app.terminate())` hands a `Promise`-returning
callback to an API typed to expect `void`
(`@typescript-eslint/no-misused-promises`), and the stock `.catch((error) =>
prettyPrintError(error))` calls a function that itself returns
`Promise<void>` and never awaits or voids it
(`@typescript-eslint/no-floating-promises`). Neither is a bug — both are
correct fire-and-forget calls — but it means the very first file a `create-
adonisjs` user writes needs three `void` operators added before an
agent-oriented lint config this strict will pass it. Fixed with three `void`s
and a comment; worth recording because [[Framework Evaluation]]'s NestJS
section predicts "agents will reproduce [a framework's] heavier idioms" as a
risk, and the mirror-image risk — a framework's own scaffolding not holding up
to the standard the rest of the codebase is held to — is just as real and
easier to miss, because it looks like "the framework's code, surely it's
fine."

### 2.6 `experimental.shutdownInReverseOrder` — on by default in the starter kit, and a deadlock risk

Named in §2.1 but worth its own line: the slim starter kit's generated
`adonisrc.ts` turns this flag on "to avoid breaking changes in the next
major." Turning it off was a deliberate choice made *before* hitting a real
problem, by reading `@adonisjs/application`'s `terminate()` source and working
out that reversing hook order would run the HTTP server's own blocking
`close()` before this spike's SSE-draining hook rather than after it. This is
the rare case where reading the framework's shutdown internals paid for itself
in advance rather than after a hung test; it is included here because a
future upgrade turning that flag's default to `true` is exactly the kind of
change a changelog entry would undersell.

### 2.7 Lucid vs. Drizzle, VineJS vs. Zod — the anticlimax

For completeness, since the brief asks for them by name: there was no fight.
AdonisJS does not install Lucid or VineJS unless a provider for them is
registered in `adonisrc.ts`, and this spike never registers one. The entire
cost of "Drizzle, not Lucid" is that `platform/db/client.ts` hand-builds a
`pg.Pool` and a Drizzle handle exactly the way the Fastify spike does — there
is no AdonisJS-specific database-provider convention this spike is turning
down, because AdonisJS's Lucid provider and Drizzle do not compete for the
same seam at all. Likewise "Zod, not VineJS": `request.body()`/`request.qs()`
return `Record<string, any>` with no validation attached by default, so
`platform/http/route.ts`'s `parse()` function is exactly as necessary as it
would be with any validator, VineJS included. Neither rejection cost a line of
code; the interesting friction was all in §2.1 through §2.6.

---

## 3. Concept count — what must someone understand to change one endpoint?

**Nineteen concepts: nine move to the framework side (up from Fastify's two),
and the "ours" side did not shrink to compensate — it grew by one**, for the
reason in §2.3. This is the honest, slightly uncomfortable finding this
section exists to surface rather than paper over.

Framework (9):

1. **AdonisJS routing** — `router.get/post/patch`, route params, path-to-
   controller-method tuples.
2. **Controllers as classes**, resolved by the router from a path string
   (`[CustomersController, 'index']`) rather than an inline handler.
3. **Middleware classes**, registered via `server.use`/`router.use` with lazy
   imports.
4. **The `ExceptionHandler` extension point** — `handle`/`report`, and that
   `override` is required by `noImplicitOverride`.
5. **Service providers and their lifecycle** —
   `register → boot → start → ready`, `terminating → shutdown`, and which
   phase runs relative to the HTTP server's own hooks (§2.1).
6. **The IoC container** — `bindValue`/`singleton`/`make`, the
   `ContainerBindings` declaration-merging convention, and that
   `ctx.containerResolver` is a per-request resolver derived from the same
   container.
7. **`HttpContext`** — `ctx.request`, `ctx.response`, `ctx.params`,
   `ctx.logger`, `ctx.containerResolver`.
8. **`adonisrc.ts`** — the providers/preloads/commands manifest, and that it
   is read by a file-walking loader with its own extension-resolution
   assumptions (§2.2).
9. **`config/*.ts`** — the declaration-merging idiom for typed config access
   (`LoggersList`, etc.), and the constraint from §1.4/§2.2 on what a config
   file may import.

Ours (10):

10. **Branded types** — `CustomerId`, `Cents`, `Instant`, minted only in
    `branded.ts`. Identical to Fastify.
11. **`Principal`** — the discriminated union, and which plane may call what.
    Identical to Fastify.
12. **`Scope` and `scopeOf`** — the chokepoint value. Identical to Fastify.
13. **The layering direction** — routes → service → repository → database.
    Identical to Fastify.
14. **The route table's shape** — that `modules/customers/routes.ts` returns
    a named object of `Route` values rather than an array, and that a
    controller method's whole job is picking the right one.
15. **Zod contracts with derived types** — `z.infer`, never a parallel
    declaration. Identical to Fastify.
16. **`CustomerStore`/`CustomerTx`** — reads take a `Scope`; writes are only
    reachable inside `inTransaction`. Identical to Fastify.
17. **The outbox** — one event per state change, in the same transaction.
    Identical to Fastify.
18. **The error taxonomy** — throw a `DomainError`; HTTP status mapping
    happens once, in `app/exceptions/handler.ts` via the framework-independent
    `problemFor`.
19. **The wiring resolver** — that `getWiring()` takes a container-or-resolver
    argument rather than being a bare import, and *why* (§2.3) — a concept
    the Fastify spike's equivalent `wire.ts` closures never needed at all.

**How to read the totals honestly.** [[Framework Evaluation]] predicted some
concepts would "legitimately move to the framework side" under a batteries-
included candidate, and that happened — routing, middleware and the provider
lifecycle really are no longer bespoke. But the prediction implicitly assumed
the move would be a net reduction, and it was not: Fastify's total was
2 + 9 = 11; AdonisJS's is 9 + 10 = 19. The nine framework concepts are each
individually well-trodden — they are in AdonisJS's own documentation and
training corpus, not invented for this spike, which is a real, different kind
of cost than Fastify's "ours" concepts (which exist only in prose and in this
one module, per the Fastify NOTES's own §3). But "well-documented" is not
"absent," and a maintainer debugging one endpoint at 6am still has to hold all
nineteen, not eleven.

---

## 4. Tracing one request end to end

`PATCH /v1/customers/:customerId` with `{"status":"active"}`, happy path —
the same request the Fastify spike traces, for comparability.

**16 files execute. 11 of them are reading hops a maintainer must follow,**
one more than Fastify's 8, and the extra hops are exactly the controller/
container split described in §1.1 and §2.3.

| # | Hop | File | What happens |
|---|---|---|---|
| — | socket | — | AdonisJS's `Server` matches the route via its `Router` |
| 1 | kernel | `start/kernel.ts` | registers the auth middleware and bodyparser |
| 2 | middleware | `app/middleware/authenticate_middleware.ts` | header → `ctx.principal`, or `null` |
| 3 | route table | `start/routes.ts` | maps the path to `[CustomersController, 'update']` |
| 4 | controller | `app/controllers/customers_controller.ts` | one line: resolve wiring, delegate |
| 5 | wiring resolution | `platform/wiring.ts` | `getWiring(ctx.containerResolver)` |
| 6 | adapter | `platform/http/adonis_route.ts` | `requirePrincipal`, `assertPlane`, three `parse` calls |
| 7 | auth helpers | `platform/http/authenticate.ts` | pure functions, no I/O |
| 8 | route entry | `modules/customers/routes.ts` | the `update` route's `handle`: `service.update(principal, params.customerId, body)` |
| 9 | service | `modules/customers/service.ts` | `scopeOf`, open transaction |
| 10 | repository | `modules/customers/repository.ts` | `findByIdForUpdate` — `scoped(scope)` + `FOR UPDATE` |
| — | pure rule | `modules/customers/service.ts` | `applyPatch` — transition legality, credit hold, money rules (same file as hop 9) |
| 11 | repository + outbox | `modules/customers/repository.ts`, `platform/outbox/repository.ts` | `update` (scoped) then `appendEvent`, same transaction |
| — | response | `platform/http/adonis_route.ts` | `route.response.parse(result)` → `ctx.response.status(200).send(...)` (same file as hop 6) |

Also executing, but not places a reader navigates to on a first pass:
`modules/customers/contracts.ts` (the schemas), `modules/customers/events.ts`
(`customerEvent`), `modules/customers/schema.ts`/`platform/outbox/schema.ts`
(table definitions), `platform/types/scope.ts`, `platform/types/branded.ts`
(brand minting in the row mapper), `platform/db/client.ts` (the transaction),
`providers/fleetco_provider.ts` (wiring built once, at boot — a maintainer
only opens this to learn *where* `wiring` came from, which hop 5 does not
answer by itself).

**Where this is worse than Fastify's trace, concretely:** Fastify's handler
was `service.update(principal, params.customerId, body)` directly, inline in
`routes.ts`'s one exported function. Here that same call is still one line,
but reaching it costs two extra hops that do not exist in Fastify at all —
the controller (hop 4, needed because AdonisJS routes to a class method, not
a function) and the wiring resolution (hop 5, needed because of §2.3). Neither
hop *does* anything a reviewer has to scrutinize — they are both exactly one
line — but they are two more files a maintainer's eyes cross before reaching
business logic, and `platform/wiring.ts` in particular is not obvious from the
controller alone; a maintainer has to already know `getWiring` exists and
takes a resolver.

---

## 5. Interfaces with exactly one implementation

**Zero in the sense [[Framework Evaluation]] is worried about.** There is no
`interface IFooService` with a token anywhere in this codebase. The
`interface` keyword appears exactly **three** times, and all three are
AdonisJS's own declaration-merging convention for augmenting an *ambient*
type the framework already defines, not a bespoke abstraction:

- `app/middleware/authenticate_middleware.ts` — `interface HttpContext`,
  adding `principal: Principal | null`.
- `platform/wiring.ts` — `interface ContainerBindings`, adding
  `wiring: Wiring` and `wiringOverrides: WiringOverrides`.
- `config/logger.ts` — `interface LoggersList`, AdonisJS's own documented
  pattern for typing `logger.use('name')` call sites.

The honest fuller count, in the same spirit as the Fastify spike's accounting:

- **29 hand-written `type X = { … }` object-shape declarations.** Of these,
  **four are named return types with exactly one producer** —
  `OutboxListener`, `OutboxDispatcher`, `SseStream`, `SseRegistry` — and they
  are, by coincidence of shape rather than copying, **the same four concepts**
  the Fastify spike's own accounting names for the same reason: each sits in
  the same file as its one producer, carries no token, and could be
  `ReturnType<typeof createX>` instead; the name is kept because it reads
  better at the import site.
- **One has two implementations and earns its existence**: `Clock`
  (`systemClock`, `fixedClock`), identical to the Fastify spike, for the same
  reason (time has to be frozen in a test).
- **One is a dependency bundle**: `CustomerServiceDeps`, identical in spirit
  to the Fastify spike's.
- **16 types are derived rather than declared** — 10 from Zod schemas
  (`z.infer`), 2 from Drizzle tables (`$inferSelect`), 4 via
  `ReturnType<typeof …>` (`CustomerStore`, `CustomerTx`, `CustomerService`,
  `CustomerRoutes`) — functionally the same split the Fastify spike reports
  (10 Zod / 3 Drizzle / 3 factories), differing only in which mechanical
  pattern supplies the last few.
- **Two types exist only because of this spike's AdonisJS-specific fix and
  have no Fastify counterpart at all**: `WiringResolver` and `WiringBinder`
  (`platform/wiring.ts`), the structural shapes that let `getWiring`/
  `setWiring` accept either `Container` or `ContainerResolver`. These are the
  closest thing in this codebase to "an interface with multiple
  implementations" in the classic sense — and they exist for the narrow,
  documented reason in §2.3, not because anyone anticipated needing
  substitutability.
- **One type exists only because AdonisJS routes to named controller
  methods rather than an array AdonisJS itself walks**: `CustomerRoutes =
  ReturnType<typeof customerRoutes>` (`modules/customers/routes.ts`). Fastify's
  equivalent function returns a flat `Route[]`; this one returns a named
  object specifically so `app/controllers/customers_controller.ts` can reach
  `routes.list` instead of indexing into an array by position.

---

## 6. Lines of application code vs. framework scaffolding

Non-blank, non-comment lines, counted the same way the Fastify NOTES
describes ("because the comment density here is deliberately high and a
reviewer should see both"). Raw line counts in parentheses.

| | Files | Code | (Raw) |
|---|---|---|---|
| **The module** — schema, contracts, events, repository, service, routes, index | 7 | **822** | (1,275) |
| The module's migration SQL | 1 | 31 | (41) |
| **Application subtotal** | **8** | **853** | **(1,316)** |
| | | | |
| Outbox + realtime — dispatcher, listener, repository, schema, index, SQL | 6 | 384 | (580) |
| HTTP — route table, SSE, error mapping, auth (framework-independent half) | 6 | 367 | (583) |
| HTTP — controller, exception handler, auth middleware (AdonisJS-specific half) | 3 | 72 | (136) |
| Branded types, errors, `Scope`, `Clock`, `Principal` | 5 | 173 | (323) |
| OpenAPI generation | 1 | 90 | (116) |
| Database — pool, `Exec`, migrator | 2 | 74 | (119) |
| Config, wiring, provider, `start/*`, `bin/server.ts`, `adonisrc.ts` | 11 | 320 | (647) |
| **Scaffolding subtotal** | **34** | **1,480** | **(2,504)** |
| | | | |
| Tests — five suites plus factories, harness, global-setup, register-tsx | 9 | 1,429 | (1,968) |
| Tooling — ESLint, Vitest, scripts (no Dockerfile — see §1.5) | 5 | 268 | (405) |
| | | | |
| **Total** | **56** | **4,030** | **(6,193)** |

### How to read this against the Fastify spike

**The module itself is almost a line-for-line match: Fastify's module
subtotal is 833 code / 1,260 raw across 7 files; this spike's is 822 code /
1,275 raw across the same 7 files.** Within noise. This is the number
[[Framework Evaluation]] says
matters most for the twentieth module, and it confirms the golden module's
core — schema, contracts, service, repository — really is framework-
independent in practice, not just in theory: the business logic for
`customers` would read almost identically whichever of the four candidates
won.

**Everything else moved, and not in the direction "batteries included" would
predict.** Fastify's scaffolding subtotal (outbox + HTTP + branded types +
OpenAPI + database + config/wire/server/main) is **1,282 lines across 23
files**. This spike's equivalent is **1,480 lines across 34 files** — *more*
of both, despite AdonisJS absorbing routing, middleware and the provider
lifecycle as framework responsibilities. Where the extra lines actually went:

- **Outbox (384 vs. 383), branded types (173 vs. 173), OpenAPI (90 vs. 90),
  database (74 vs. 77) are all within a few lines of Fastify's**, exactly as
  expected — none of this is framework-dependent; [[Realtime and Events]] and
  the branded-types rules cost the same regardless of what serves HTTP.
- **HTTP is split 367 + 72 = 439 lines across 9 files, vs. Fastify's 394
  across 5.** The SSE plumbing itself (`platform/http/sse.ts`, 79 lines) is
  *shorter* than Fastify's 136 — AdonisJS's `ctx.response.response` being the
  same escape hatch as Fastify's `reply.raw`, with no `hijack()` call needed
  (§1.1's header comment explains why `headersSent` already suffices). But the
  controller/middleware/exception-handler split (§1.1) adds three more files
  for work that lived in one `route.ts` under Fastify.
- **Config, wiring, provider and the AdonisJS entrypoints are 320 lines across
  11 files, vs. Fastify's 165 across 4** — nearly double the lines, nearly
  triple the files. This is the single largest driver of the scaffolding
  overrun, and it is almost entirely the cost of §2: the provider class, the
  container-based wiring resolver and its two new types, `config/*.ts` split
  into three files instead of one, `start/*.ts` split into three files instead
  of being inlined in `server.ts`. Some of this buys something real (the
  provider lifecycle, per §2.1); the wiring-resolver indirection buys nothing
  except working around Vitest.

**Tests are 1,429 lines, close to Fastify's 1,492** — this spike did not need
materially more test code to reach the same 83-ish test count, which is the
right outcome: [[Testing Strategy]]'s layers are framework-independent by
design, and the harness-rebuilding cost in `platform/test/harness.ts` (142
raw lines, the one file that genuinely is AdonisJS-specific scaffolding) is
modest next to the suites it supports.

**Tooling is 268 lines across 5 files, lighter than Fastify's 218 across 8** —
but this is an artifact of §1.5 (no Dockerfile here) rather than a real
AdonisJS advantage; add one back and the two would be close.

---

## 7. What this spike actually argues

Not a recommendation — [[Framework Evaluation]] is explicit that the decision
comes from reading all four, and this document is one input. Three
observations unlikely to be visible from reading the code alone:

1. **The provider lifecycle is the one place "batteries included" paid off
   exactly as advertised.** ADR-022 rule 7, hand-rolled in the Fastify spike's
   `main.ts`, is close to free here — three methods on a class, called at the
   right time by the framework. If AdonisJS wins, this is the strongest
   concrete reason, and it is a genuinely different kind of win than "fewer
   lines": it is "the ordering mistake that causes a production deadlock is
   harder to make," because the framework's own extension point enforces a
   two-phase shutdown whether or not the person writing the provider thinks
   about it. (They still have to get hook *registration order* right — §2.1 —
   but that is a narrower and more discoverable mistake than inventing the
   whole sequence from scratch.)

2. **The concept-count prediction in [[Framework Evaluation]] was half right.**
   Routing, middleware and process lifecycle did move to the framework side,
   exactly as predicted for a batteries-included candidate. What was not
   predicted: the total did not shrink, because AdonisJS's interaction with
   the mandated test runner (Vitest, not Japa) manufactured a new "ours"
   concept — the container-based wiring resolver — that would not exist under
   Japa (which presumably handles this transparently) and does not exist
   under Fastify (which never duplicates a module in the first place). A
   framework evaluation that only read AdonisJS's own documentation would
   have missed this completely; it only shows up by actually trying to run
   the mandated stack end to end.

3. **The dependency allowlist held, but it was close.** Nothing was added.
   But solving §2.2 required reaching for `tsx`'s *programmatic* API rather
   than its CLI, which is a legitimate use of an existing dependency and not
   a new one — but it is also exactly the kind of thing an agent under time
   pressure might instead "solve" by quietly adding `@adonisjs/assembler`
   (which brings `ts-node-maintained`, `@swc/core`, `hot-hook`, and would have
   been a one-line `npm install` versus a multi-hour investigation). The
   allowlist did its job here specifically *because* it made the easy wrong
   answer unavailable and forced the actual mechanism to be understood. If
   AdonisJS is adopted, whoever builds module two should expect to hit at
   least one of §2.2's three symptoms again and should start from this
   document rather than rediscovering it.

**A three-sentence summary, since the task asks for one explicitly:** AdonisJS
delivers on "batteries for boring CRUD" exactly where it matters most — the
provider lifecycle turns ADR-022's graceful-shutdown requirement from
hand-rolled signal-handling into three framework-called methods, and the SSE
plumbing itself is shorter than Fastify's — but the win is narrower than
advertised once the mandated toolchain (Drizzle instead of Lucid, Zod instead
of VineJS, and especially Vitest instead of Japa) is taken seriously, because
AdonisJS's own bootstrap machinery turns out to depend on assumptions
(a compiled build, or `@adonisjs/assembler`'s loader) that Vitest quietly
violates in three distinct places, each of which cost real investigation
rather than a config flag. The concept count went up rather than down (19 vs.
Fastify's 11), driven less by AdonisJS's idioms themselves than by the one
container binding needed to survive Vitest's module-duplication behavior —
a cost that is specific to this spike's forced tooling substitution and might
not recur if a real project used AdonisJS with its own intended stack
end to end. Read together with the Fastify and NestJS spikes, the fairest
framing is: AdonisJS is the candidate whose batteries genuinely fit this
project's shape, and whose price is paid once, up front, in tooling friction
rather than ongoing in every module — which one wins depends on whether that
price is worth paying for a decade-long solo-maintained service, and this
document's job was to make that price visible rather than to set it.
