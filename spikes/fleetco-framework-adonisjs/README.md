# fleetco-framework-adonisjs

Framework spike 3 of 4 for Fleetco's [[Framework Evaluation]] — the
`customers` golden module from [[Code Standards and Guardrails]], built on
AdonisJS 6 with Drizzle, Postgres, Zod 4 and Vitest in place of AdonisJS's own
Lucid, VineJS and Japa.

See **[NOTES.md](./NOTES.md)** for the full writeup: decisions the
architecture documents did not specify, where AdonisJS fought the documented
rules (Lucid vs. Drizzle, VineJS vs. Zod, and especially Japa vs. Vitest),
concept count, an end-to-end request trace, the interfaces-with-one-
implementation count, and lines of application code vs. framework
scaffolding.

## Running it

```sh
cp .env.example .env   # fill in DATABASE_URL and a generated APP_KEY
npm install
npm run migrate
npm run dev             # tsx watch bin/server.ts
```

```sh
npm run typecheck
npm run lint
npm run test:unit         # pure functions + property tests, no database
npm run test:integration  # real Postgres via testcontainers (or TEST_DATABASE_URL)
npm run test:leak         # cross-tenant and cross-customer leak suite
npm run ci                 # all of the above, in CI order
```

```sh
npm run build              # tsc -p tsconfig.build.json -> build/
npm run openapi            # regenerate openapi.json from the route table
npm run seed                # seed one tenant with two customers, for local dev
```
