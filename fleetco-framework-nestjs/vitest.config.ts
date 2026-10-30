import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * The four layers from [[Testing Strategy]], as four projects so each can be
 * a separate CI gate that fails fast:
 *
 *   unit        — pure functions and invariants. Milliseconds, no Docker.
 *   integration — repositories, transactions, the outbox. Real Postgres.
 *   leak        — the cross-tenant and cross-customer suite. Required gate.
 *
 * `unplugin-swc` is here because NestJS needs `emitDecoratorMetadata` for
 * constructor injection and esbuild — Vitest's default transformer — does not
 * implement it. This is the clearest case in the spike of the framework
 * forcing a dependency the standards doc would otherwise refuse; see NOTES.md.
 */
const swcPlugin = swc.vite({
  module: { type: 'nodenext' },
  jsc: {
    target: 'es2023',
    parser: { syntax: 'typescript', decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
  },
});

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    // One container for the whole run; the integration and leak files share it
    // and must not fight over the same two tables.
    fileParallelism: false,
    projects: [
      {
        plugins: [swcPlugin],
        test: {
          name: 'unit',
          include: ['src/**/__tests__/service.test.ts', 'src/**/__tests__/invariants.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [swcPlugin],
        test: {
          name: 'integration',
          include: ['src/**/__tests__/repository.test.ts'],
          environment: 'node',
          globalSetup: ['src/platform/test/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
      {
        plugins: [swcPlugin],
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
