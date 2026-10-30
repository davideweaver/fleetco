import { defineConfig } from 'vitest/config';

/**
 * The layers from [[Testing Strategy]], as separate projects so each is its own
 * CI gate and the gates fail fast in the documented order:
 *
 *   unit        — pure functions and invariants. Milliseconds, no Docker, no AdonisJS.
 *   integration — repositories, transactions, the outbox, SSE. Real Postgres,
 *                 a real booted AdonisJS application.
 *   leak        — cross-tenant and cross-customer. Required, no override.
 *
 * `leak` is deliberately not folded into `integration`. [[Testing Strategy]]
 * calls it "a distinct, required CI gate with no override", and a gate that
 * shares a command with another suite is one `-t` flag away from being
 * skipped.
 */
export default defineConfig({
  test: {
    // One container for the whole run; the integration and leak files share the
    // schema and must not race each other through it. Only one AdonisJS
    // application may safely be booted per process (see NOTES.md §2 on
    // `@adonisjs/core/services/*` being process-wide singletons), which is a
    // second, independent reason these files cannot run concurrently.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['**/__tests__/service.test.ts', '**/__tests__/invariants.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['**/__tests__/repository.test.ts', '**/__tests__/sse.test.ts'],
          environment: 'node',
          globalSetup: ['platform/test/global-setup.ts'],
          // See platform/test/register-tsx.ts: AdonisJS's own bootstrap code
          // needs tsx's loader hook active in the worker process, not just
          // Vite's SSR transform, or `FleetcoProvider` never gets constructed.
          setupFiles: ['platform/test/register-tsx.ts'],
          // The default `forks` pool runs each worker as a child process
          // talking to the main Vitest process over `process.send`/IPC.
          // AdonisJS's own `app.notify(...)` (fired once the HTTP server is
          // listening) calls `process.send` too, straight into that same
          // channel, and Vitest's own protocol does not expect it —
          // `Unexpected call to process.send()`. `threads` runs workers as
          // worker threads instead, which have no `process.send` of their
          // own to collide with.
          pool: 'threads',
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
      {
        test: {
          name: 'leak',
          include: ['**/__tests__/leak.test.ts'],
          environment: 'node',
          globalSetup: ['platform/test/global-setup.ts'],
          setupFiles: ['platform/test/register-tsx.ts'],
          pool: 'threads',
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
