import { z } from 'zod';

/**
 * ADR-022 rule 2: all configuration from environment variables, no exceptions.
 * This is the only file permitted to read `process.env`, enforced by the
 * `no-restricted-properties` rule in `eslint.config.mjs`.
 *
 * Shape borrowed from `authors-api`'s single typed `Environment` interface,
 * which [[Framework Evaluation]] records as an established habit worth
 * keeping, with Zod doing the parsing so the types are derived rather than
 * declared.
 */
const configSchema = z.object({
  RUNTIME_ENV: z.enum(['development', 'test', 'integration', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /**
   * [[Realtime and Events]] § Multi-Instance Fanout: the SSE listener needs a
   * direct session-mode connection. A transaction-mode pooler silently breaks
   * `LISTEN/NOTIFY`, so there is deliberately no separate "pooled" URL here to
   * reach for by mistake.
   */
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  OUTBOX_POLL_MS: z.coerce.number().int().min(10).max(60_000).default(200),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(100),

  /** Catch-up sweep interval for an open SSE stream when no NOTIFY arrives. */
  SSE_TICK_MS: z.coerce.number().int().min(50).max(60_000).default(1_000),
  /** Comment frame interval, so an idle stream is not closed by a proxy. */
  SSE_HEARTBEAT_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),

  /**
   * ADR-022 rule 7 / `authors-api`'s readiness delay: keep serving for this
   * long after SIGTERM so the load balancer notices the failing readiness
   * check before connections are refused. Commented against
   * `failureThreshold * periodSeconds` in the deployment manifest.
   */
  SHUTDOWN_READINESS_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(0),
});

export type Config = z.infer<typeof configSchema>;

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached !== null) return cached;
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail at boot with the field names, not at the first request with a
    // confusing `undefined`.
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Tests build several configs in one process. */
export function resetConfigCache(): void {
  cached = null;
}
