import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDatabase } from '../db/client';
import { migrate } from '../db/migrator';

/**
 * One real Postgres for the whole run. [[Testing Strategy]] § Integration:
 * "Mocking the database hides precisely the bugs that matter here."
 *
 * The schema is built by the real migrations from empty, which doubles as a
 * migration test ([[Environments]] tier 2) — if a migration does not apply to
 * a fresh database, every integration test fails at setup rather than a
 * deploy failing later.
 */
let container: StartedPostgreSqlContainer | null = null;

export async function setup(project: ProvidesDatabaseUrl): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('fleetco')
    .withUsername('fleetco')
    .withPassword('fleetco')
    .start();

  const databaseUrl = container.getConnectionUri();
  const database = createDatabase(databaseUrl);
  try {
    const applied = await migrate(database.pool);
    if (applied.length === 0) throw new Error('no migrations were applied to a fresh database');
  } finally {
    await database.close();
  }

  project.provide('databaseUrl', databaseUrl);
}

export async function teardown(): Promise<void> {
  await container?.stop();
  container = null;
}

/**
 * Structurally typed rather than importing `TestProject` from `vitest/node`:
 * Vitest is ESM-only and this file is compiled as CommonJS alongside the Nest
 * sources. One line here is cheaper than a third tsconfig.
 */
type ProvidesDatabaseUrl = { provide: (key: 'databaseUrl', value: string) => void };
