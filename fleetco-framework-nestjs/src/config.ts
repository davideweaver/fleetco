import { z } from 'zod';

/**
 * The only file in the application permitted to read `process.env`
 * (ADR-022 rule 2, enforced by the `no-restricted-properties` lint rule).
 *
 * Deliberately not `@nestjs/config`: that would add a dependency and a
 * provider token to reach a value that is immutable for the lifetime of the
 * process. A parsed module constant is fewer concepts and fails at boot.
 */
const configSchema = z.object({
  RUNTIME_ENV: z.enum(['development', 'test', 'integration', 'production']),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  /** Milliseconds between outbox polls. [[Realtime and Events]] suggests ~200ms. */
  OUTBOX_POLL_MS: z.coerce.number().int().min(10).max(60_000).default(200),
  /** Rows claimed per dispatcher tick. */
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  /** SSE keep-alive comment interval, to hold idle proxies open. */
  SSE_HEARTBEAT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  /** Readiness delay before shutdown begins draining — see ADR-022 rule 7. */
  SHUTDOWN_READINESS_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(0),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid configuration: ${detail}`);
  }
  return result.data;
}
