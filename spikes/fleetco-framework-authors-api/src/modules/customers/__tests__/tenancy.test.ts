import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrate } from '../../../lib/db/migrator.js';
import { startHarness, type Harness } from '../../../lib/test/harness.js';

/**
 * The structural gates from [[Code Standards and Guardrails]] tier 2 that no
 * amount of lint can check, because they are facts about the live schema rather
 * than about the source.
 *
 * Row one of that table: "`tenant_id` on every domain table — enforced by a
 * test enumerating tables; fails if one lacks it." This is that test. It reads
 * `information_schema`, so it covers tables a future migration adds without
 * anybody remembering to extend it — which is the only version of this gate
 * that keeps working.
 */

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, 180_000);

afterAll(async () => {
  await harness.stop();
});

/**
 * Tables that legitimately have no `tenant_id`, each with the reason.
 *
 * An allowlist rather than a pattern, because adding to it has to be a visible
 * line in a diff. "This table is exempt" is a decision only Dave can make, and
 * a regex would let an agent make it silently.
 */
const EXEMPT = new Map<string, string>([
  [
    'platform.migrations',
    'The migration ledger. Not domain data: it describes the schema itself, and is identical for every tenant.',
  ],
]);

describe('tenant_id on every domain table', () => {
  it('finds no domain table without it', async () => {
    const tables = await harness.app.db.handle.execute<{ schema: string; table: string }>(sql`
      select table_schema as schema, table_name as table
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
      order by table_schema, table_name
    `);

    const columns = await harness.app.db.handle.execute<{ schema: string; table: string }>(sql`
      select table_schema as schema, table_name as table
      from information_schema.columns
      where column_name = 'tenant_id'
        and table_schema not in ('pg_catalog', 'information_schema')
    `);

    const scoped = new Set(columns.rows.map((row) => `${row.schema}.${row.table}`));

    const missing = tables.rows
      .map((row) => `${row.schema}.${row.table}`)
      .filter((name) => !EXEMPT.has(name) && !scoped.has(name));

    expect(missing).toEqual([]);
  });

  it('found some tables at all, so the query above cannot pass vacuously', async () => {
    // A gate that passes because it looked at nothing is worse than no gate.
    const tables = await harness.app.db.handle.execute<{ name: string }>(sql`
      select table_schema || '.' || table_name as name
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and table_schema not in ('pg_catalog', 'information_schema')
    `);

    const names = tables.rows.map((row) => row.name);
    expect(names).toContain('customers.customers');
    expect(names).toContain('platform.outbox');
  });

  it('every exemption is a table that exists', async () => {
    // An allowlist entry for a table that was renamed or dropped is an
    // exemption nobody is watching.
    const tables = await harness.app.db.handle.execute<{ name: string }>(sql`
      select table_schema || '.' || table_name as name
      from information_schema.tables
      where table_type = 'BASE TABLE'
    `);
    const existing = new Set(tables.rows.map((row) => row.name));

    for (const name of EXEMPT.keys()) {
      expect(existing.has(name)).toBe(true);
    }
  });
});

describe('module schemas', () => {
  it('puts each module in its own Postgres schema, not public', async () => {
    // Evolution Path rule 1. `public` holding a domain table is the signal that
    // somebody wrote a migration without reading the rule.
    const publicTables = await harness.app.db.handle.execute<{ count: number }>(sql`
      select count(*)::int as count
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);

    expect(publicTables.rows[0]?.count).toBe(0);
  });
});

describe('migrations', () => {
  it('recorded every file it applied', async () => {
    const applied = await harness.app.db.handle.execute<{ filename: string }>(
      sql`select filename from platform.migrations order by filename`,
    );

    expect(applied.rows.map((row) => row.filename)).toEqual([
      '0001_platform_outbox.sql',
      '0002_customers.sql',
    ]);
  });

  it('is idempotent, so a redeploy of the same image is a no-op', async () => {
    const ran = await migrate(harness.app.db.handle, [
      new URL('../../../lib/outbox/migrations/', import.meta.url),
      harness.app.customers.migrations,
    ]);

    expect(ran).toEqual([]);
  });

  it('enforces the tenant-scoped constraints the service relies on', async () => {
    // These are the checks from `0002_customers.sql`. A migration that dropped
    // one would leave the service's rule intact and the database's gone, which
    // is the half-enforced state ADR-011's review checklist exists to prevent.
    const constraints = await harness.app.db.handle.execute<{ name: string }>(sql`
      select conname as name
      from pg_constraint
      where conrelid = 'customers.customers'::regclass
      order by conname
    `);

    const names = constraints.rows.map((row) => row.name);
    expect(names).toContain('customers_status_known');
    expect(names).toContain('customers_code_upper');
    expect(names).toContain('customers_credit_limit_non_negative');
    expect(names).toContain('customers_labor_rate_positive');
    expect(names).toContain('customers_billing_terms_known');
  });

  it('scopes the code uniqueness index to the tenant', async () => {
    const indexes = await harness.app.db.handle.execute<{ definition: string }>(sql`
      select indexdef as definition
      from pg_indexes
      where schemaname = 'customers' and indexname = 'customers_tenant_code_key'
    `);

    // A unique index on `code` alone would make one tenant's codes collide
    // with another's — a cross-tenant defect dressed up as a constraint.
    expect(indexes.rows[0]?.definition).toMatch(/\(tenant_id, code\)/);
  });
});
