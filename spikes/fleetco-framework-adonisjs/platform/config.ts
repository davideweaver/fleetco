import env from '../start/env.js';

/**
 * The typed configuration object every other module depends on, built from
 * the values `start/env.ts` already validated at boot.
 *
 * This is the layer that restores what Adonis's own `Env.schema` cannot
 * express — defaults and numeric ranges — without reading `process.env` a
 * second time anywhere. `env.get(...)` below reads the *parsed* value Adonis
 * already produced, not the environment.
 */
export type RuntimeEnv = 'development' | 'test' | 'integration' | 'production';

export type Config = {
  readonly RUNTIME_ENV: RuntimeEnv;
  readonly PORT: number;
  readonly LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

  readonly DATABASE_URL: string;
  readonly DATABASE_POOL_MAX: number;

  readonly OUTBOX_POLL_MS: number;
  readonly OUTBOX_BATCH_SIZE: number;

  readonly SSE_TICK_MS: number;
  readonly SSE_HEARTBEAT_MS: number;

  readonly SHUTDOWN_READINESS_DELAY_MS: number;
};

function ranged(value: number | undefined, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`invalid configuration — ${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached !== null) return cached;

  cached = {
    RUNTIME_ENV: env.get('NODE_ENV') ?? 'development',
    PORT: ranged(env.get('PORT'), 3000, 1, 65535, 'PORT'),
    LOG_LEVEL: env.get('LOG_LEVEL') ?? 'info',

    // [[Realtime and Events]] § Multi-Instance Fanout: the SSE listener needs
    // a direct, session-mode connection. No separate "pooled" URL to reach
    // for by mistake, same as the Fastify spike.
    DATABASE_URL: env.get('DATABASE_URL'),
    DATABASE_POOL_MAX: ranged(env.get('DATABASE_POOL_MAX'), 10, 1, 100, 'DATABASE_POOL_MAX'),

    OUTBOX_POLL_MS: ranged(env.get('OUTBOX_POLL_MS'), 200, 10, 60_000, 'OUTBOX_POLL_MS'),
    OUTBOX_BATCH_SIZE: ranged(env.get('OUTBOX_BATCH_SIZE'), 100, 1, 1_000, 'OUTBOX_BATCH_SIZE'),

    SSE_TICK_MS: ranged(env.get('SSE_TICK_MS'), 1_000, 50, 60_000, 'SSE_TICK_MS'),
    SSE_HEARTBEAT_MS: ranged(env.get('SSE_HEARTBEAT_MS'), 15_000, 1_000, 300_000, 'SSE_HEARTBEAT_MS'),

    SHUTDOWN_READINESS_DELAY_MS: ranged(
      env.get('SHUTDOWN_READINESS_DELAY_MS'),
      0,
      0,
      60_000,
      'SHUTDOWN_READINESS_DELAY_MS',
    ),
  };
  return cached;
}

/** Tests build several configs in one process. */
export function resetConfigCache(): void {
  cached = null;
}

/** Overrides a handful of fields for a test run, without touching `process.env`. */
export function withConfig(overrides: Partial<Config>): Config {
  return { ...loadConfig(), ...overrides };
}
