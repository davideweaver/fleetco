import { createServer } from 'node:http';
import type { Server as NodeHttpServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ignitor } from '@adonisjs/core';
import type { ApplicationService } from '@adonisjs/core/types';

import { loadMigrations, migrate } from '../db/migrator.js';
import { PRINCIPAL_HEADER } from '../http/authenticate.js';
import { fixedClock } from '../types/clock.js';
import { getWiring, setWiringOverrides } from '../wiring.js';
import type { Wiring } from '../wiring.js';
import type { Principal } from '../types/principal.js';
import { FROZEN_NOW } from './factories.js';

/**
 * The integration harness, and the one piece of real friction [[Testing
 * Strategy]]'s mandate of Vitest over Japa costs: AdonisJS has no
 * `app.inject()`. `@japa/plugin-adonisjs` provides exactly that (an in-memory
 * request/response pair that never opens a socket), but it is a Japa plugin,
 * and the brief is explicit that this spike bootstraps and tears down the
 * Adonis HTTP server itself instead of reaching for it.
 *
 * So every HTTP-level assertion in `leak.test.ts` and `sse.test.ts` goes over
 * a real `fetch()` to a real socket on an OS-assigned port — slower than
 * Fastify's `app.inject()`, and the honest reason this project's leak suite
 * does not finish "in under a second" the way the Fastify spike's does. See
 * NOTES.md §2.
 *
 * What follows is `@adonisjs/core/build/src/ignitor/http.js`'s
 * `HttpServerProcess#start` with the parts a test needs control over pulled
 * out: an ephemeral port instead of `process.env.PORT`, and a handle back to
 * the `Ignitor`/`Application` so a test can call `.terminate()` directly
 * rather than killing a process.
 */
export type Harness = {
  readonly app: ApplicationService;
  readonly httpServer: NodeHttpServer;
  readonly baseUrl: string;
  readonly wiring: Wiring;
  readonly reset: () => Promise<void>;
};

const APP_ROOT = new URL('../../', import.meta.url);

export async function startHarness(): Promise<Harness> {
  const ignitor = new Ignitor(APP_ROOT, {
    importer: (filePath: string) =>
      filePath.startsWith('./') || filePath.startsWith('../')
        ? import(new URL(filePath, APP_ROOT).href)
        : import(filePath),
  });

  const app = ignitor.createApp('web');
  await app.init();

  // Must be bound before `app.boot()` runs `FleetcoProvider#boot`, which is
  // the only place that reads it. The AdonisJS-boot equivalent of the
  // Fastify spike's `buildServer(config, { clock: fixedClock(FROZEN_NOW) })`
  // parameter — see `platform/wiring.ts`'s `WiringOverrides`.
  setWiringOverrides(app.container, { clock: fixedClock(FROZEN_NOW) });

  await app.boot(); // FleetcoProvider#boot: wiring built, terminating hook registered.

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const wiring = await getWiring(app.container);
  await migrate(wiring.database, await loadMigrations(root));

  let httpServer!: NodeHttpServer;
  await app.start(async () => {
    const server = await app.container.make('server');
    await server.boot(); // Registers routes from start/routes.ts's preload.

    // `server.handle` is async; Node's `RequestListener` type expects `void`
    // back, which is exactly the shape `no-misused-promises` exists to flag —
    // same as the three spots in `bin/server.ts`. The handler's own promise
    // rejection path is internal (AdonisJS's exception handler), so there is
    // nothing here to await.
    httpServer = createServer((request, response) => void server.handle(request, response));
    server.setNodeServer(httpServer);

    // The production entrypoint's monitoring (`HttpServerProcess`) is not in
    // play here, so its own "close the socket on terminate" hook never gets
    // registered either. Replicating just that one line is what makes
    // `app.terminate()` in `stopHarness` actually close this socket, the same
    // way it would in production.
    app.terminating(
      () =>
        new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        }),
    );

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
  });

  // `FleetcoProvider#start` starts the real background dispatcher, matching
  // production. Every test in this suite drains the outbox with an explicit
  // `wiring.dispatcher.tick()` instead — most pointedly
  // `repository.test.ts`'s `SKIP LOCKED` test, which hands the dispatcher's
  // own claim query to two manually-driven "workers" and needs the pending
  // rows to itself. Stopping the automatic poller immediately is the
  // AdonisJS-harness equivalent of the Fastify spike's test harness simply
  // never calling `dispatcher.start()` in the first place.
  wiring.dispatcher.stop();

  const address = httpServer.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected the test HTTP server to bind to a port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    app,
    httpServer,
    baseUrl,
    wiring,
    /** Between tests: empty both tables, leave the schema alone. */
    reset: async (): Promise<void> => {
      await wiring.database.pool.query(
        'truncate customers.customers, platform.outbox_events restart identity',
      );
    },
  };
}

/**
 * Runs the exact shutdown sequence production uses — see
 * `providers/fleetco_provider.ts` for why `app.terminating()` registration
 * order is load-bearing here.
 */
export async function stopHarness(harness: Harness): Promise<void> {
  await harness.app.terminate();
}

/** The spike's stubbed authentication, from the caller's side. */
export function asPrincipal(principal: Principal): Record<string, string> {
  return { [PRINCIPAL_HEADER]: JSON.stringify(principal) };
}
