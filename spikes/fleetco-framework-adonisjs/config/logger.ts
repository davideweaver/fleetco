import { defineConfig, targets } from '@adonisjs/core/logger';

const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

function levelOrDefault(value: string | undefined): (typeof LEVELS)[number] {
  return LEVELS.find((level) => level === value) ?? 'info';
}

/**
 * ADR-022 rule 4: logs to stdout as JSON, never to a file, never through a
 * platform SDK. Unconditional — no `pretty()` target for development, which
 * is the one difference from the slim starter kit's default and the thing
 * that drops `pino-pretty` from the dependency tree entirely. AdonisJS's
 * logger is pino under the hood, same as Fastify's, so this is free either
 * way: see NOTES.md §2.
 *
 * `process.env` directly, not `start/env.ts`'s `env` — see `config/app.ts`'s
 * header comment for why a config file importing our own TypeScript source
 * breaks under Vitest specifically.
 */
const loggerConfig = defineConfig({
  default: 'app',
  loggers: {
    app: {
      enabled: true,
      name: 'fleetco-adonisjs',
      level: levelOrDefault(process.env['LOG_LEVEL']),
      transport: { targets: targets().push(targets.file({ destination: 1 })).toArray() },
    },
  },
});

export default loggerConfig;

declare module '@adonisjs/core/types' {
  // AdonisJS's own declaration-merging idiom for typing `logger.use('name')`
  // call sites: `interface` is required here, not `type`, because only an
  // `interface` merges with the ambient one this augments.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface LoggersList extends InferLoggers<typeof loggerConfig> {}
}
