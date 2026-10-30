/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| ADR-022 rule 2: all configuration from environment variables, no
| exceptions, and `process.env` is read in exactly one file. Under Fastify
| that file is a hand-written `config.ts` using Zod. Under AdonisJS the
| framework already owns this file — `start/env.ts` is where
| `@adonisjs/core` validates `process.env` at boot, before a single route
| is registered, and it is the only file the `no-restricted-properties`
| lint rule has to exempt.
|
| What Adonis's own `Env.schema` validator does *not* give you, compared to
| Zod: defaults, numeric ranges, and `.transform()`. Every variable below is
| required and is either a bare number or a bare enum member; the defaults
| and the handful of range checks [[Code Standards and Guardrails]] would
| want live in `platform/config.ts`, applied to the already-parsed values.
| See NOTES.md §2 — this is a genuine, if small, loss of expressiveness.
|
*/

import { Env } from '@adonisjs/core/env';

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum.optional(['development', 'test', 'integration', 'production'] as const),
  PORT: Env.schema.number.optional(),
  LOG_LEVEL: Env.schema.enum.optional([
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ] as const),
  APP_KEY: Env.schema.string(),

  DATABASE_URL: Env.schema.string(),
  DATABASE_POOL_MAX: Env.schema.number.optional(),

  OUTBOX_POLL_MS: Env.schema.number.optional(),
  OUTBOX_BATCH_SIZE: Env.schema.number.optional(),

  SSE_TICK_MS: Env.schema.number.optional(),
  SSE_HEARTBEAT_MS: Env.schema.number.optional(),

  SHUTDOWN_READINESS_DELAY_MS: Env.schema.number.optional(),
});
