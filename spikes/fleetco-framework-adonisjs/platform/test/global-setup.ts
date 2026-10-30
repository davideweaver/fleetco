import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * Real Postgres, never a mock. [[Testing Strategy]] § Integration:
 * "mocking the database hides precisely the bugs that matter here — a missing
 * `tenant_id` predicate, a transaction that does not actually roll back, an
 * outbox row written outside the transaction it was supposed to be atomic
 * with."
 *
 * `TEST_DATABASE_URL`, when set, is used instead of starting a container. That
 * is one `if`, and it is what lets the suite run against a `docker compose`
 * Postgres on a laptop and against a CI service container without a second
 * code path.
 *
 * This file also sets every other environment variable AdonisJS's
 * `start/env.ts` requires. There is no in-code override seam the way
 * Fastify's `buildServer(config, overrides)` has — `start/env.ts` reads
 * `process.env` exactly once, the moment it is first imported, so the values
 * have to be real environment variables in place *before* anything imports
 * it. Global setup is the one place guaranteed to run before that happens.
 * See NOTES.md §2.
 */
let container: StartedPostgreSqlContainer | null = null;

export async function setup(): Promise<void> {
  process.env['NODE_ENV'] ??= 'test';
  process.env['APP_KEY'] ??= 'test-app-key-00000000000000000000000000000000';
  process.env['LOG_LEVEL'] ??= 'silent';
  // Short enough that an SSE test does not wait on it, long enough that it is
  // not the thing delivering events — a passing stream test must be the
  // NOTIFY path working, not the tick papering over it.
  process.env['SSE_TICK_MS'] ??= '5000';
  process.env['SSE_HEARTBEAT_MS'] ??= '60000';
  process.env['OUTBOX_POLL_MS'] ??= '50';
  process.env['SHUTDOWN_READINESS_DELAY_MS'] ??= '0';

  if (process.env['TEST_DATABASE_URL'] !== undefined) {
    process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
    return;
  }
  container = await new PostgreSqlContainer('postgres:16-alpine')
    // The SSE listener issues LISTEN on its own connection and the tests open
    // several pools; the default of 100 is ample but stated so a future
    // concurrency test does not hit it by surprise.
    .withCommand(['postgres', '-c', 'max_connections=200'])
    .start();
  process.env['DATABASE_URL'] = container.getConnectionUri();
}

export async function teardown(): Promise<void> {
  if (container !== null) await container.stop();
}
