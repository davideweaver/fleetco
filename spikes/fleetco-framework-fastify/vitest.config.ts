import { defineConfig } from 'vitest/config';

/**
 * The layers from [[Testing Strategy]], as separate projects so each is its own
 * CI gate and the gates fail fast in the documented order:
 *
 *   unit        — pure functions and invariants. Milliseconds, no Docker.
 *   integration — repositories, transactions, the outbox, SSE. Real Postgres.
 *   leak        — cross-tenant and cross-customer. Required, no override.
 *
 * `leak` is deliberately not folded into `integration`. [[Testing Strategy]]
 * calls it "a distinct, required CI gate with no override", and a gate that
 * shares a command with another suite is one `-t` flag away from being skipped.
 */
export default defineConfig({
  test: {
    // One container for the whole run; the integration and leak files share the
    // schema and must not race each other through it.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/__tests__/service.test.ts', 'src/**/__tests__/invariants.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: [
            'src/**/__tests__/repository.test.ts',
            'src/**/__tests__/sse.test.ts',
            'src/**/__tests__/tenancy.test.ts',
          ],
          environment: 'node',
          globalSetup: ['src/platform/test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
      {
        test: {
          name: 'leak',
          include: ['src/**/__tests__/leak.test.ts'],
          environment: 'node',
          globalSetup: ['src/platform/test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
