# fleetco-framework-authors-api

Framework spike **4 of 4** for Fleetco: the `customers` golden module on a port
of `davideweaver/authors-api`'s `Process` / `AppModule` lifecycle classes, over
Fastify 5, Drizzle and Postgres.

**Read [NOTES.md](./NOTES.md) first** — it is the deliverable. This file only
says how to run it.

## Layout

```
src/
  index.ts                      app.start().catch(...) — four lines
  app/
    index.ts                    App extends Process. Modules as fields, explicit ordering
    DbModule.ts                 the pool, and the migrations
    HttpModule.ts               Fastify, the healthcheck, the SSE drain set
    OutboxModule.ts             dispatcher + LISTEN + in-process fanout
  lib/                          the scaffolding we own
    app/Process.ts              ported: signals, readiness delay, graceful exit
    app/AppModule.ts            ported: init() / close(), explicit sibling access
    types/                      branded.ts, clock.ts, principal.ts, scope.ts
    errors/DomainError.ts       the five-class taxonomy
    http/                       route.ts, authenticate.ts, errorHandler.ts, sse.ts, healthcheck.ts
    outbox/                     schema, repository, listener, notifier, migrations
    db/                         handle types, migrator
    openapi/document.ts         generated from the Zod schemas
    test/                       factories, harness, testcontainers setup
  modules/customers/            the golden module, exactly the shape the standards doc specifies
    schema.ts repository.ts service.ts contracts.ts routes.ts events.ts index.ts
    migrations/0002_customers.sql
    __tests__/                  service, invariants, repository, sse, tenancy, leak
```

## Running it

```bash
npm install

# a Postgres to talk to
docker run -d --name fleetco-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fleetco -p 5432:5432 postgres:16-alpine

npm run migrate        # forward-only SQL, in filename order
npm run seed           # two tenants, two fleets each — the same factories the tests use
npm run dev            # or: npm run build && npm start
```

`.env.development` supplies the rest. Configuration is read once, at startup, in
`src/lib/environment.ts` — the only file permitted to touch `process.env`.

## Exercising it by hand

Authentication is a stub that refuses to run in production (see NOTES § 1.3):
pass a JSON `Principal` in a header.

```bash
P='{"userId":"0192f0c0-0000-7000-8000-030000000001",
    "tenantId":"0192f0c0-0000-7000-8000-010000000001",
    "plane":"tenant","roles":["service_advisor"],"authMethod":"password"}'
P=$(echo "$P" | tr -d '\n ')

curl -s localhost:8000/health

curl -s -X POST localhost:8000/v1/customers \
  -H "x-fleetco-principal: $P" -H 'content-type: application/json' \
  -d '{"code":"acme","name":"Acme Trucking","defaultLaborRateCents":12500,"creditLimitCents":500000}'

curl -s localhost:8000/v1/customers -H "x-fleetco-principal: $P"

# the SSE endpoint: replays from the cursor, then streams live
curl -sN "localhost:8000/v1/customers/<id>/events" -H "x-fleetco-principal: $P"
```

With that stream open, a `PATCH` in another terminal arrives on it within a poll
interval, and `kill -TERM` on the process drains it with a
`: server shutting down` comment rather than dropping the socket.

## The test gates

Separate projects, in the order [[Testing Strategy]] fails them:

```bash
npm run typecheck
npm run lint              # the architecture rules, tier 2
npm run test:unit         # 49 — pure, property-based, lifecycle. No Docker
npm run test:integration  # 49 — real Postgres via testcontainers
npm run test:leak         # 14 — cross-tenant and cross-customer. Required, no override
npm run ci                # all of the above
```

`test:leak` is a distinct command on purpose: a required gate that shares a
command with another suite is one flag away from being skipped. It enumerates
endpoints from the generated OpenAPI document, so **a new route without leak
coverage fails the build**.

Integration and leak need Docker. Set `DATABASE_URL` to skip testcontainers and
use an existing Postgres.

## Regenerating the contract

```bash
npm run openapi    # writes openapi.json from the Zod schemas
```

`openapi.json` is checked in, so a contract change shows up in a diff.
