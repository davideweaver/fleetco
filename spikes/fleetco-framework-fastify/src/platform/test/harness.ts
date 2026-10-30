import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resetConfigCache, loadConfig } from '../../config.js';
import { loadMigrations, migrate } from '../db/migrator.js';
import { PRINCIPAL_HEADER } from '../http/authenticate.js';
import { buildServer } from '../../server.js';
import type { Server } from '../../server.js';
import { fixedClock } from '../types/clock.js';
import type { Principal } from '../types/principal.js';
import { FROZEN_NOW } from './factories.js';

/**
 * The integration harness. One running server, the real wiring, the real
 * migrations, against the container Postgres from `global-setup.ts`.
 *
 * The schema comes from the real migration files run from scratch, which
 * [[Testing Strategy]] notes "doubles as a migration test".
 */
export async function startHarness(): Promise<Server & { readonly reset: () => Promise<void> }> {
  resetConfigCache();
  const config = {
    ...loadConfig(),
    // The suite asserts behaviour, not log output ([[Testing Strategy]]
    // § What Does Not Get Tested), and a few hundred request lines per run
    // buries the one assertion that failed.
    LOG_LEVEL: 'silent' as const,
    // Short enough that an SSE test does not wait on it, long enough that it is
    // not the thing delivering events — a passing stream test must be the
    // NOTIFY path working, not the tick papering over it.
    SSE_TICK_MS: 5_000,
    SSE_HEARTBEAT_MS: 60_000,
    OUTBOX_POLL_MS: 50,
  };

  const server = buildServer(config, { clock: fixedClock(FROZEN_NOW) });
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  await migrate(server.wiring.database, await loadMigrations(root));
  await server.wiring.listener.start();
  await server.app.ready();

  return {
    ...server,
    /** Between tests: empty both tables, leave the schema alone. */
    reset: async (): Promise<void> => {
      await server.wiring.database.pool.query(
        'truncate customers.customers, platform.outbox_events restart identity',
      );
    },
  };
}

export async function stopHarness(server: Server): Promise<void> {
  server.wiring.sse.closeAll();
  server.wiring.dispatcher.stop();
  await server.app.close();
  await server.wiring.close();
}

/** The spike's stubbed authentication, from the caller's side. */
export function asPrincipal(principal: Principal): Record<string, string> {
  return { [PRINCIPAL_HEADER]: JSON.stringify(principal) };
}
