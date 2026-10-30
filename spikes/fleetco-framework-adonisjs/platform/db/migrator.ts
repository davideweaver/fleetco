import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Database } from './client.js';

/**
 * Forward-only plain SQL migrations, applied in filename order across every
 * module's `migrations/` directory.
 *
 * Written by hand rather than taking `drizzle-kit`, for two reasons: the golden
 * module layout in [[Code Standards and Guardrails]] specifies
 * `migrations/  plain SQL, forward-only`, and a generated-diff tool is exactly
 * the thing that produces the "rewriting ALTER that takes a long lock" the
 * migration playbook warns about. `schema.ts` is the query-builder's view of
 * the tables; this is the record of how they got there. Identical to the
 * Fastify spike's runner — this is a correctness property of migrations, not
 * of the framework.
 */
export type Migration = { readonly name: string; readonly sql: string };

const MIGRATION_DIRECTORIES = ['platform/outbox/migrations', 'modules/customers/migrations'] as const;

export async function loadMigrations(root: string): Promise<Migration[]> {
  const found: Migration[] = [];
  for (const directory of MIGRATION_DIRECTORIES) {
    const absolute = join(root, directory);
    const names = (await readdir(absolute)).filter((name) => name.endsWith('.sql'));
    for (const name of names) {
      found.push({ name, sql: await readFile(join(absolute, name), 'utf8') });
    }
  }
  // Filename order is global, not per-directory: `0001_platform_outbox.sql`
  // has to exist before `0002_customers.sql` can reference it.
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

const LEDGER = `
  create schema if not exists platform;
  create table if not exists platform.schema_migrations (
    name        text        primary key,
    applied_at  timestamptz not null default now()
  );
`;

export async function migrate(database: Database, migrations: readonly Migration[]): Promise<string[]> {
  await database.pool.query(LEDGER);
  const { rows } = await database.pool.query<{ name: string }>(
    'select name from platform.schema_migrations',
  );
  const applied = new Set(rows.map((row) => row.name));

  const ran: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    const connection = await database.pool.connect();
    try {
      await connection.query('begin');
      await connection.query(migration.sql);
      await connection.query('insert into platform.schema_migrations (name) values ($1)', [
        migration.name,
      ]);
      await connection.query('commit');
      ran.push(migration.name);
    } catch (error) {
      await connection.query('rollback');
      throw new Error(`migration ${migration.name} failed: ${String(error)}`, { cause: error });
    } finally {
      connection.release();
    }
  }
  return ran;
}
