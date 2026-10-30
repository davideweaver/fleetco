import { existsSync, readFileSync } from 'node:fs';

import type { ConsoleLogFormat } from './logging/logger.js';

/**
 * ADR-022 rule 2: "all configuration from environment variables, twelve-factor,
 * no exceptions." This is the only file in the codebase permitted to read
 * `process.env` — a lint rule enforces that, which is what makes the sentence
 * true rather than aspirational.
 *
 * The shape is `authors-api`'s `lib/environment.ts`: one typed `Environment`
 * interface, every variable parsed and defaulted once, `RUNTIME_ENV` selecting
 * a `.env.<name>` file. Two changes:
 *
 *  1. `dotenv-cra` is replaced by `process.loadEnvFile`, built into Node since
 *     20.6. One fewer dependency, and the allowlist's default answer is no.
 *  2. The values are frozen. The original exported a mutable object; a frozen
 *     one means "configuration is read at startup" is enforced rather than
 *     merely intended.
 *
 * Deliberately **not** Zod-validated, even though Zod is already a dependency
 * and [[Code Standards and Guardrails]] says "Zod at every boundary". The rule
 * is about boundaries that carry *untrusted* input; a schema here would buy a
 * nicer message for a typo in a task definition at the cost of a second way to
 * describe the same twenty fields. `requireString` covers the case that
 * actually matters — a missing secret must stop the process rather than
 * default to empty.
 */

export type RuntimeEnv = 'development' | 'test' | 'integration' | 'production';

export interface Environment {
  NODE_ENV: string;
  RUNTIME_ENV: RuntimeEnv;
  PACKAGE_NAME: string;
  PACKAGE_VERSION: string;

  PORT: number;
  HOST: string;
  KEEP_ALIVE_TIMEOUT_MS: number;
  HEADERS_TIMEOUT_MS: number;
  PROCESS_READINESS_DELAY_MS: number;

  DATABASE_URL: string;
  DATABASE_POOL_MAX: number;

  LOG_LEVEL: string;
  LOG_CONSOLE_FORMAT: ConsoleLogFormat;

  OUTBOX_POLL_INTERVAL_MS: number;
  OUTBOX_BATCH_SIZE: number;
  OUTBOX_MAX_ATTEMPTS: number;

  SSE_HEARTBEAT_MS: number;
  SSE_RETRY_MS: number;
}

const RUNTIME_ENVS: readonly RuntimeEnv[] = ['development', 'test', 'integration', 'production'];
const LOG_FORMATS: readonly ConsoleLogFormat[] = ['object', 'pretty', 'json'];

function toRuntimeEnv(value: string | undefined): RuntimeEnv {
  const found = RUNTIME_ENVS.find((candidate) => candidate === value);
  if (!found) {
    throw new Error(
      `RUNTIME_ENV must be one of ${RUNTIME_ENVS.join(', ')} (received "${value ?? ''}")`,
    );
  }
  return found;
}

function toLogFormat(value: string | undefined): ConsoleLogFormat {
  // Found by lookup rather than asserted, because `as` is lint-banned outside
  // the brand constructors and a typo in LOG_CONSOLE_FORMAT should not produce
  // a value the logger's switch does not handle.
  return LOG_FORMATS.find((candidate) => candidate === value) ?? 'json';
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// NODE_ENV enables runtime optimisations; RUNTIME_ENV selects which .env file
// to load. Two variables because they answer different questions — a staging
// deploy is NODE_ENV=production, RUNTIME_ENV=staging.
process.env.NODE_ENV ??= 'development';
process.env.RUNTIME_ENV ??= 'development';

const runtimeEnv = toRuntimeEnv(process.env.RUNTIME_ENV);
const envFile = `.env.${runtimeEnv}`;
if (existsSync(envFile)) {
  // Does not overwrite variables already set, so a real environment's injected
  // configuration always wins over a checked-in file.
  process.loadEnvFile(envFile);
}

const packageJsonPath = 'package.json';
if (!existsSync(packageJsonPath)) {
  throw new Error(`Unable to find ${packageJsonPath} in the working directory`);
}
const pkg: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const pkgName = typeof pkg === 'object' && pkg !== null && 'name' in pkg ? String(pkg.name) : '';
const pkgVersion =
  typeof pkg === 'object' && pkg !== null && 'version' in pkg ? String(pkg.version) : '';

export const environment: Readonly<Environment> = Object.freeze({
  NODE_ENV: process.env.NODE_ENV,
  RUNTIME_ENV: runtimeEnv,
  PACKAGE_NAME: pkgName,
  PACKAGE_VERSION: pkgVersion,

  PORT: num(process.env.PORT, 8000),
  HOST: process.env.HOST ?? '0.0.0.0',
  // Both above any load balancer's idle timeout, so the server never closes a
  // connection the balancer still believes is usable. Carried over verbatim
  // from authors-api, where the reasoning is the same.
  KEEP_ALIVE_TIMEOUT_MS: num(process.env.KEEP_ALIVE_TIMEOUT_MS, 61_000),
  HEADERS_TIMEOUT_MS: num(process.env.HEADERS_TIMEOUT_MS, 70_000),
  // Must be >= the deployment's readiness window (failureThreshold *
  // periodSeconds), or the load balancer keeps routing to a draining task.
  PROCESS_READINESS_DELAY_MS: num(process.env.PROCESS_READINESS_DELAY_MS, 0),

  DATABASE_URL: process.env.DATABASE_URL ?? '',
  DATABASE_POOL_MAX: num(process.env.DATABASE_POOL_MAX, 10),

  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  LOG_CONSOLE_FORMAT: toLogFormat(process.env.LOG_CONSOLE_FORMAT),

  // 200ms is "ample" per [[Realtime and Events]] § Dispatcher Mechanics.
  OUTBOX_POLL_INTERVAL_MS: num(process.env.OUTBOX_POLL_INTERVAL_MS, 200),
  OUTBOX_BATCH_SIZE: num(process.env.OUTBOX_BATCH_SIZE, 100),
  OUTBOX_MAX_ATTEMPTS: num(process.env.OUTBOX_MAX_ATTEMPTS, 5),

  SSE_HEARTBEAT_MS: num(process.env.SSE_HEARTBEAT_MS, 15_000),
  SSE_RETRY_MS: num(process.env.SSE_RETRY_MS, 2_000),
});

/** For the handful of values that must not silently default to empty. */
export function requireString(key: keyof Environment): string {
  const value = environment[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} is required but was not set`);
  }
  return value;
}
