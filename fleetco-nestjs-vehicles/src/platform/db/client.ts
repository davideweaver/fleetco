import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

/**
 * Drizzle over node-postgres. Two pools, deliberately:
 *
 *  - `pool` serves application queries and may sit behind a transaction-mode
 *    pooler later.
 *  - the `LISTEN` connection in `platform/outbox/notifier.ts` takes a single
 *    dedicated client, because transaction-mode poolers break `LISTEN/NOTIFY`
 *    ([[Realtime and Events]] § Multi-Instance Fanout).
 */
export type Db = NodePgDatabase;

/**
 * The transaction handle Drizzle hands to a `transaction()` callback. Spelled
 * via `Parameters` rather than importing `PgTransaction` and its four generic
 * arguments, which is the shorter of two unpleasant options.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** What a repository method accepts: the pool, or an open transaction. */
export type Queryable = Db | Tx;

export type Database = {
  readonly db: Db;
  readonly pool: Pool;
  readonly close: () => Promise<void>;
};

/**
 * The health endpoint's database touch (ADR-022 rule 7). It lives here rather
 * than in the controller so that no code outside `db/` and `repository.ts`
 * imports the query builder.
 */
export async function pingDatabase(database: Database): Promise<void> {
  await database.pool.query('SELECT 1');
}

export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString, max: 10 });
  return {
    db: drizzle(pool),
    pool,
    close: () => pool.end(),
  };
}
