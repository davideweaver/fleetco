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
 * Postgres on a laptop and against a CI service container without a second code
 * path.
 */
let container: StartedPostgreSqlContainer | null = null;

export async function setup(): Promise<void> {
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
