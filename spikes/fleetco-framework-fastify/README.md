# fleetco-framework-fastify

Framework spike **2 of 4** for [[Framework Evaluation]]: the `customers` golden
module from [[Code Standards and Guardrails]], built on **Fastify plus our own
layered structure**.

Read `NOTES.md` first — it is the spike's actual output. This file is just how
to run it.

## What is here

```
src/
  config.ts                     the only file that reads process.env (ADR-022 rule 2)
  wire.ts                       the composition root — the whole dependency graph
  server.ts                     Fastify instance: hooks, error mapping, routes
  main.ts                       process lifecycle, SIGTERM, SSE drain (ADR-022 rule 7)

  platform/
    types/                      branded ids and money, Clock, Principal, Scope, errors
    db/                         pool, Exec, transactor, plain-SQL migrator
    http/                       route table, Zod parsing, SSE plumbing, error mapping
    openapi/                    OpenAPI 3.1 generated from the route table
    outbox/                     the transactional outbox, dispatcher, LISTEN/NOTIFY
    test/                       factories, harness, testcontainers setup

  modules/customers/            the golden module, in the layout the standards doc specifies
    schema.ts  migrations/  repository.ts  service.ts  contracts.ts  routes.ts  events.ts  index.ts
    __tests__/                  service · invariants · repository · sse · leak
```

## Running it

Requires Node 22+ and Docker.

```sh
npm install

# Local Postgres
docker run -d --name fleetco-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=fleetco -p 5432:5432 postgres:16-alpine

cp .env.example .env            # or export the variables directly
npm run migrate
npm run seed
npm run dev
```

```sh
curl localhost:3000/health
curl localhost:3000/openapi.json
```

Every endpoint needs a principal. Authentication is the spike's one stub — an
`x-fleetco-principal` header, which refuses to install when
`RUNTIME_ENV=production`:

```sh
PRINCIPAL='{"plane":"tenant","userId":"<uuid>","tenantId":"<uuid>","roles":[],"authMethod":"password"}'

curl localhost:3000/v1/customers -H "x-fleetco-principal: $PRINCIPAL"

curl -N "localhost:3000/v1/customers/<id>/events?lastEventId=0" \
  -H "x-fleetco-principal: $PRINCIPAL"
```

## Checks

The CI gates from [[Testing Strategy]], in order, failing fast:

```sh
npm run typecheck          # 1
npm run lint               # 2  includes the custom architecture rules
npm run test:unit          # 3  pure + property-based, no Docker
npm run test:integration   # 4  real Postgres via testcontainers
npm run test:leak          # 5  cross-tenant + cross-customer — required, no override
npm run ci                 # all of the above
```

`npm run openapi` regenerates `openapi.json`, which is committed.

## State at handoff

`npm run ci` passes: 83 tests across the four layers. The built image was run
against a real Postgres and exercised by hand end to end — create, get, patch,
an illegal transition refused with 422, SSE replay plus live push, and a
`SIGTERM` drain with an open stream that closed cleanly rather than erroring.
