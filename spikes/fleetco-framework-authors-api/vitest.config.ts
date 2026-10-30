import { defineConfig } from 'vitest/config';

/**
 * The layers from [[Testing Strategy]], as separate projects so each is its own
 * CI gate and the gates fail in the documented order:
 *
 *   unit        — pure functions, invariants, and the lifecycle classes.
 *                 Milliseconds, no Docker.
 *   integration — repositories, transactions, the outbox, SSE, and the
 *                 `tenant_id`-on-every-table check. Real Postgres.
 *   leak        — cross-tenant and cross-customer. Required, no override.
 *
 * `leak` is deliberately not folded into `integration`. [[Testing Strategy]]
 * calls it "a distinct, **required** CI gate with no override", and a gate that
 * shares a command with another suite is one `-t` flag away from being skipped.
 *
 * `RUNTIME_ENV` is set per project because `lib/environment.ts` reads it once at
 * import and selects a `.env.<name>` file from it — `test` has no database,
 * `integration` has a fast outbox poll and binds port 0.
 */
export default defineConfig({
  test: {
    // One container for the whole run, and the integration and leak files share
    // the schema, so they must not race each other through it.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'src/**/__tests__/service.test.ts',
            'src/**/__tests__/invariants.test.ts',
            'src/**/__tests__/lifecycle.test.ts',
          ],
          environment: 'node',
          env: { RUNTIME_ENV: 'test' },
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
          env: { RUNTIME_ENV: 'integration' },
          globalSetup: ['src/lib/test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
      {
        test: {
          name: 'leak',
          include: ['src/**/__tests__/leak.test.ts'],
          environment: 'node',
          env: { RUNTIME_ENV: 'integration' },
          globalSetup: ['src/lib/test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
