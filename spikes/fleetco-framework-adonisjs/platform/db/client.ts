import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Config } from '../config.js';

/**
 * The database handle. One pool for application queries; the SSE listener
 * opens its own direct `Client` separately, because `LISTEN` holds a
 * connection for the life of the process and must not come out of a pool.
 */
export type Database = {
  readonly pool: Pool;
  readonly drizzle: NodePgDatabase;
};

/**
 * `Exec` is "something a query can run on" — the pool-backed handle or an open
 * transaction. Every repository function takes one, which is how the service
 * layer composes a state change and its outbox row into one transaction
 * without the service itself owning a database handle.
 */
export type Exec = NodePgDatabase | Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

export function openDatabase(config: Config): Database {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    // The shop floor is not a high-concurrency workload; a short timeout
    // surfaces a dead database as an error rather than a hang.
    connectionTimeoutMillis: 5_000,
  });
  return { pool, drizzle: drizzle(pool) };
}

export async function closeDatabase(database: Database): Promise<void> {
  await database.pool.end();
}

/**
 * Opens a transaction. Lives in the db module rather than in the provider
 * because the provider composes modules and does not touch the database.
 */
export function transactor(database: Database) {
  return <T>(work: (exec: Exec) => Promise<T>): Promise<T> =>
    database.drizzle.transaction((tx) => work(tx));
}
