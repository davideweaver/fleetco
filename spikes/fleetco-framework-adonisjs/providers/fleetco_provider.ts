import { Logger } from '@adonisjs/core/logger';
import type { ApplicationService } from '@adonisjs/core/types';

import { buildWiring, getWiring, getWiringOverrides, setWiring } from '../platform/wiring.js';

/**
 * The composition root's lifecycle hook. This is the AdonisJS-idiomatic
 * replacement for the Fastify spike's `main.ts` SIGTERM dance — a provider's
 * `boot`/`start`/`shutdown` methods ARE the graceful-shutdown mechanism
 * ADR-022 rule 7 asks for, rather than something built by hand on top of
 * `process.on('SIGTERM', ...)`. See NOTES.md §2.
 *
 * The one piece that genuinely needed care, and is worth restating here
 * because it is easy to get backwards: SSE draining is registered through
 * `app.terminating()`, in `boot()`, NOT inside `shutdown()`. AdonisJS's own
 * HTTP-server lifecycle registers its own `app.terminating()` hook — which
 * calls `nodeHttpServer.close()` and awaits it — later than this one (during
 * `app.start()`, after every provider has booted). Hooks run in registration
 * order by default, so ours runs first: stop the dispatcher, wait out the
 * readiness delay, then close every open SSE stream — and only once that is
 * done does the HTTP server's own close() have a chance of resolving, because
 * `close()` waits for every open connection, SSE included, to end. Putting
 * the drain in `shutdown()` instead would deadlock: `shutdown()` runs in a
 * phase strictly after every `app.terminating()` hook has already finished,
 * including the one blocked waiting for the sockets `shutdown()` would have
 * closed. Verified against a live SIGTERM with an open stream in
 * `modules/customers/__tests__/sse.test.ts`.
 */
export default class FleetcoProvider {
  constructor(protected app: ApplicationService) {}

  async boot(): Promise<void> {
    const log = await this.app.container.make(Logger);
    const overrides = await getWiringOverrides(this.app.container);
    const wiring = buildWiring(log, overrides);
    setWiring(this.app.container, wiring);

    // The spike's header-asserted principal must never run in production —
    // the real thing is an opaque session token behind the AuthN port
    // (ADR-012). Checked here, once, at boot, rather than per-request.
    if (wiring.config.RUNTIME_ENV === 'production') {
      throw new Error(
        'the header-asserted principal (platform/http/authenticate.ts) is a spike stub and ' +
          'must not run in production; replace it with the Better Auth session adapter behind ' +
          'the AuthN port (ADR-012)',
      );
    }

    this.app.terminating(async () => {
      log.info({ sseOpen: wiring.sse.open }, 'shutdown requested');
      wiring.dispatcher.stop();

      // Sized against `failureThreshold * periodSeconds` in the deployment
      // manifest — the same readiness delay the Fastify spike's `main.ts`
      // applies, kept here because it is a deployment concern, not a
      // framework one.
      if (wiring.config.SHUTDOWN_READINESS_DELAY_MS > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, wiring.config.SHUTDOWN_READINESS_DELAY_MS),
        );
      }

      wiring.sse.closeAll();
    });
  }

  async start(): Promise<void> {
    const wiring = await getWiring(this.app.container);
    await wiring.listener.start();
    wiring.dispatcher.start();
  }

  async shutdown(): Promise<void> {
    // Runs after every `app.terminating()` hook — including the HTTP
    // server's own — has already completed, so every connection the pool
    // might still be serving is gone by now.
    await (await getWiring(this.app.container)).close();
  }
}
