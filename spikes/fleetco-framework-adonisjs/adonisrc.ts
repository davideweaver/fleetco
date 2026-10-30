import { defineConfig } from '@adonisjs/core/app';

/**
 * The application manifest. Trimmed from the slim starter kit:
 *
 *  - `hash_provider` and `repl_provider` are gone — nothing in this spike
 *    hashes a password or needs a REPL, and "boring is a requirement" means
 *    deleting a default rather than keeping it because it was there.
 *  - `tests.suites` is gone. [[Testing Strategy]] mandates Vitest, not Japa,
 *    so there is no Japa test runner to configure here — see
 *    `platform/test/harness.ts` and NOTES.md §2 for what replaces it.
 *  - `fleetco_provider` is added: the composition root and lifecycle hook
 *    that replaces `wire.ts` plus the hand-rolled SIGTERM dance in the
 *    Fastify spike's `main.ts`. See `providers/fleetco_provider.ts`.
 *  - `experimental.shutdownInReverseOrder`, on by default in the starter
 *    kit, is left OFF. It reverses the order "terminating" hooks run in, and
 *    `@adonisjs/core`'s own HTTP-server hook (registered during `app.start()`,
 *    after every provider's `boot()`) calls `nodeHttpServer.close()` and
 *    *awaits it* — a promise that only resolves once every open connection,
 *    SSE included, has ended. With reverse order on, that hook runs BEFORE
 *    `FleetcoProvider`'s SSE-draining `shutdown()`, so the close() call waits
 *    forever for sockets that nothing has told to close yet: a deadlock on
 *    every deploy with an open stream. Registration order (the default) runs
 *    our hook first, drains SSE, and only then lets the server's own close()
 *    resolve quickly. Found by reading `@adonisjs/core/build/src/ignitor/http.js`
 *    rather than by hitting it in an integration test — see NOTES.md §2.
 */
export default defineConfig({
  commands: [() => import('@adonisjs/core/commands')],

  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('./providers/fleetco_provider.js'),
  ],

  preloads: [() => import('./start/routes.js'), () => import('./start/kernel.js')],
});
