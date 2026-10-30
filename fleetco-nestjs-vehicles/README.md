# fleetco-framework-nestjs

Spike 1 of 4 for the [[Framework Evaluation]] decision: the `customers` golden
module from [[Code Standards and Guardrails]], built on **NestJS 11**.

Same prompt, same architecture documents, no hand-correction, timeboxed. Read
**[NOTES.md](./NOTES.md)** for the findings — that is the deliverable.

## What it contains

```
src/
  main.ts                        process lifecycle, SSE draining on SIGTERM
  app.module.ts                  composition root
  config.ts                      the only file that reads process.env
  modules/customers/
    schema.ts                    Drizzle table in the `customers` schema
    migrations/                  plain SQL, forward-only
    contracts.ts                 Zod schemas; every type derived from them
    repository.ts                the only place a query is written
    service.ts                   pure domain rules, then orchestration
    routes.ts                    5 thin handlers, including the SSE endpoint
    events.ts                    outbox event definitions and the topic
    index.ts                     the module's public import surface
    __tests__/                   service / invariants / repository / leak
  platform/
    types/                       branded types, errors, principal, scope, clock
    db/                          Drizzle client, plain-SQL migrator
    outbox/                      outbox table, dispatcher, LISTEN/NOTIFY
    http/                        guards, Zod pipe, error filter, health
    openapi/                     the document, generated from the Zod contracts
    test/                        one factory module, harness, container setup
```

## Running it

```bash
npm install --ignore-scripts

docker run -d --name fleetco-pg \
  -e POSTGRES_USER=fleetco -e POSTGRES_PASSWORD=fleetco -e POSTGRES_DB=fleetco \
  -p 5432:5432 postgres:16-alpine

cp .env.example .env && set -a && . ./.env && set +a

npm run migrate        # plain SQL, forward-only
npm run seed           # the same factories the tests use
npm run build && npm start
```

```bash
# Spike-only: identity is asserted by a header. See NOTES.md decision 1.
P='{"userId":"...","tenantId":"<uuid>","role":"staff"}'

curl -H "x-fleetco-principal: $P" localhost:3000/v1/customers
curl -N -H "x-fleetco-principal: $P" -H 'Last-Event-ID: 0' \
     localhost:3000/v1/customers/<id>/events
```

## Gates

```bash
npm run typecheck          # two tsconfigs — see NOTES.md friction 3
npm run lint               # the tier-2 architecture rules
npm run test:unit          # pure + property, no Docker
npm run test:integration   # real Postgres via testcontainers
npm run test:leak          # cross-tenant + cross-customer, required gate
npm run openapi            # regenerate the document
```

`npm run test:all` runs every project. 90 tests across 4 files at the time
of writing; the integration and leak projects share one Postgres container.
