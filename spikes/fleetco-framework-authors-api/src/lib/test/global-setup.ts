import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/**
 * One real Postgres for the whole integration run.
 *
 * [[Testing Strategy]] § Integration: "mocking the database hides precisely the
 * bugs that matter here: a missing `tenant_id` predicate, a transaction that
 * does not actually roll back, an outbox row written outside the transaction it
 * was supposed to be atomic with."
 *
 * `DATABASE_URL` is set here rather than passed through Vitest's `provide`
 * channel because `lib/environment.ts` reads the environment once, at import,
 * and freezes it — so the value has to exist before a worker imports anything.
 * Vitest forks its workers after this hook, which is what makes that work.
 *
 * An existing `DATABASE_URL` wins, so the suite runs against a local
 * `docker compose` Postgres or a CI service container without Docker-in-Docker.
 */

let container: StartedPostgreSqlContainer | null = null;

export async function setup(): Promise<void> {
  if (process.env.DATABASE_URL) {
    return;
  }

  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('fleetco')
    .withUsername('fleetco')
    .withPassword('fleetco')
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
  }
}
