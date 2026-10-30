import { environment } from '../environment.js';

/**
 * Ported from `authors-api`'s `lib/logging/logger.ts`, essentially intact. It
 * already matches what [[Infrastructure Checklist]] P0 asks for — structured
 * logs with a tag array and a context object — and ADR-022 rule 4 ("logs to
 * stdout as JSON, never to a file, never through a platform logging SDK").
 *
 * Three changes from the original:
 *
 *  1. `process.stdout.write` rather than `console.log`, so the `no-console`
 *     lint rule needs no exception anywhere in the codebase.
 *  2. `context` is typed `object | undefined` rather than implicitly `any`.
 *  3. `redact()`. The original had nothing like it; the standards doc requires
 *     that errors carry "structured context — tenantId, entity id, the rule
 *     violated — never raw PII", and a rule that depends on every future caller
 *     remembering is tier 4. Dropping known-sensitive keys at the sink is tier 2
 *     for free.
 */

export enum LogLevel {
  debug = 1,
  info = 2,
  warning = 3,
  error = 4,
  critical = 5,
}

export type ConsoleLogFormat = 'object' | 'pretty' | 'json';

export type LogEvent = {
  level: LogLevel;
  msg: string;
  tags: readonly string[];
  context?: object | undefined;
};

/**
 * Keys that must never reach a log line. Matched case-insensitively on a
 * substring, which over-redacts rather than under-redacting — the right
 * direction for this failure mode.
 */
const SENSITIVE_KEY_FRAGMENTS = ['email', 'phone', 'password', 'token', 'secret', 'hash'];

function redact(context: object): object {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    const lower = key.toLowerCase();
    out[key] = SENSITIVE_KEY_FRAGMENTS.some((f) => lower.includes(f)) ? '[redacted]' : value;
  }
  return out;
}

export class Logger {
  public debug(msg: string, tags: readonly string[] = [], context?: object): void {
    this.log({ level: LogLevel.debug, msg, tags, context });
  }

  public info(msg: string, tags: readonly string[] = [], context?: object): void {
    this.log({ level: LogLevel.info, msg, tags, context });
  }

  public warning(msg: string, tags: readonly string[] = [], context?: object): void {
    this.log({ level: LogLevel.warning, msg, tags, context });
  }

  public error(msg: string, tags: readonly string[] = [], context?: object): void {
    this.log({ level: LogLevel.error, msg, tags, context });
  }

  public critical(msg: string, tags: readonly string[] = [], context?: object): void {
    this.log({ level: LogLevel.critical, msg, tags, context });
  }

  public exception(
    msg: string,
    err: unknown,
    tags: readonly string[] = [],
    context?: object,
    level: 'critical' | 'error' | 'warning' = 'error',
  ): void {
    this.log({
      level: LogLevel[level],
      msg: `${msg}, err=${extractErrorMessage(err)}`,
      tags,
      context: { ...(context ?? {}), err: errorToObject(err) },
    });
  }

  public log(event: LogEvent): void {
    try {
      if (event.level >= this.configuredLevel()) {
        this.write(event);
      }
    } catch {
      // Must not include anything from the event: logging a failure to log the
      // event is how you get an infinite loop. Carried over from the original.
      process.stdout.write('{"level":4,"msg":"failed to log event","tags":["logging"]}\n');
    }
  }

  private write(event: LogEvent): void {
    const context = event.context && redact(event.context);
    const { LOG_CONSOLE_FORMAT } = environment;

    if (LOG_CONSOLE_FORMAT === 'pretty') {
      const tags = event.tags.length > 0 ? ` [${event.tags.join(',')}]` : '';
      const head = `${new Date().toISOString()} [${LogLevel[event.level]}]${tags} ${event.msg}`;
      const body =
        context && Object.keys(context).length > 0
          ? `\n                         ${JSON.stringify(context)}`
          : '';
      process.stdout.write(`${head}${body}\n`);
      return;
    }

    process.stdout.write(
      `${JSON.stringify({
        level: LogLevel[event.level],
        msg: event.msg,
        tags: event.tags,
        context,
        at: new Date().toISOString(),
      })}\n`,
    );
  }

  private configuredLevel(): LogLevel {
    switch (environment.LOG_LEVEL) {
      case 'error':
        return LogLevel.error;
      case 'warning':
        return LogLevel.warning;
      case 'info':
        return LogLevel.info;
      default:
        return LogLevel.debug;
    }
  }
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return typeof err === 'string' ? err : JSON.stringify(err);
}

function errorToObject(err: unknown): object {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: extractErrorMessage(err) };
}

export default new Logger();
