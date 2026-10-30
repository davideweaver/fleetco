import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Pool } from 'pg';

/**
 * Forward-only plain-SQL migrations, per the golden-module layout in
 * [[Code Standards and Guardrails]] (`migrations/  plain SQL, forward-only`).
 *
 * Deliberately not drizzle-kit: its generated journal is a second source of
 * truth that has to be hand-reconciled whenever a migration is written by
 * hand, and "plain SQL, forward-only" is 30 lines. The same runner is used by
 * `npm run migrate` and by the integration-test container, so the schema under
 * test is the schema that ships ([[Testing Strategy]] § Integration).
 *
 * Files are globbed from every module's `migrations/` directory and ordered by
 * their global numeric prefix, so cross-module foreign keys can be declared in
 * dependency order ([[Evolution Path]] rule 2 keeps the FKs, not the queries).
 */
const MIGRATION_DIRS = [
  join(__dirname, '..', 'outbox', 'migrations'),
  join(__dirname, '..', '..', 'modules', 'customers', 'migrations'),
];

type Migration = { readonly name: string; readonly sql: string };

export function loadMigrations(dirs: readonly string[] = MIGRATION_DIRS): Migration[] {
  const found = dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .map((file) => ({ name: file, sql: readFileSync(join(dir, file), 'utf8') })),
  );
  found.sort((a, b) => a.name.localeCompare(b.name));

  const duplicate = found.find((m, i) => i > 0 && found[i - 1]?.name === m.name);
  if (duplicate !== undefined) {
    throw new Error(`duplicate migration name across modules: ${duplicate.name}`);
  }
  return found;
}

export async function migrate(pool: Pool, dirs?: readonly string[]): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS platform');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        name        text        PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM platform.schema_migrations',
    );
    const applied = new Set(rows.map((row) => row.name));
    const pending = loadMigrations(dirs).filter((m) => !applied.has(m.name));

    for (const migration of pending) {
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO platform.schema_migrations (name) VALUES ($1)', [
          migration.name,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${migration.name} failed: ${String(error)}`);
      }
    }
    return pending.map((m) => m.name);
  } finally {
    client.release();
  }
}
