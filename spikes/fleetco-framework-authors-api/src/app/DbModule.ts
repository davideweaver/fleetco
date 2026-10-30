import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { App } from './index.js';
import AppModule from '../lib/app/AppModule.js';
import type { Database } from '../lib/db/handle.js';
import { migrate } from '../lib/db/migrator.js';
import { environment } from '../lib/environment.js';
import logging from '../lib/logging/index.js';

/**
 * The connection pool and the schema.
 *
 * `authors-api`'s `DbModule` opened the Mongoose connection in `init()`. This
 * one builds the pool in the **constructor** and only *verifies* it in
 * `init()`, which is a deliberate change and worth the paragraph:
 *
 *  - `pg.Pool` is lazy — constructing it opens nothing. So the handle exists
 *    the moment the module does.
 *  - That means a domain module can build its repository in its own
 *    constructor, from `app.db.handle`, instead of in `init()` behind a
 *    "not initialised yet" guard. Every service is therefore non-null for the
 *    whole life of the process, and the ordering problem reduces to *field
 *    declaration order* in `App` — visible in one file, enforced by JavaScript.
 *
 * What `init()` does is the part that can actually fail: prove the database is
 * reachable, then run the migrations. Failing here fails startup, which is what
 * should happen.
 */
export default class DbModule extends AppModule<App> {
  public readonly pool: Pool;
  public readonly handle: Database;

  constructor(app: App) {
    super(app);
    this.pool = new Pool({
      connectionString: environment.DATABASE_URL,
      max: environment.DATABASE_POOL_MAX,
    });
    this.handle = drizzle(this.pool);
  }

  public override async init(): Promise<void> {
    // Fail fast and loudly. A process that starts without a database and
    // discovers it on the first request has turned a deploy failure into an
    // outage.
    await this.handle.execute(sql`select 1`);
    logging.debug('Database connected', ['lifecycle', 'db']);

    /**
     * Each module owns its own migrations and says where they are; this list is
     * the only place that set is enumerated. [[Testing Strategy]] requires the
     * integration suite to build the schema "from the real migrations, run from
     * scratch", so this same call is what the test harness uses — a migration
     * that does not apply cleanly fails the suite rather than the deploy.
     */
    const applied = await migrate(this.handle, [
      new URL('../lib/outbox/migrations/', import.meta.url),
      this.app.customers.migrations,
    ]);

    logging.info(`Migrations up to date (${applied.length} applied)`, ['lifecycle', 'migration']);
  }

  public override async close(): Promise<void> {
    await this.pool.end();
    logging.debug('Database pool closed', ['lifecycle', 'db']);
  }

  /** For the health endpoint. ADR-022 rule 7 wants a check that touches the database. */
  public async ping(): Promise<void> {
    await this.handle.execute(sql`select 1`);
  }
}
