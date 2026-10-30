import type { Logger } from '@adonisjs/core/logger';

import type { Config } from '../config.js';
import type { Database, Exec } from '../db/client.js';
import { claimPending, markDispatched, notifyDispatched, recordFailure } from './repository.js';
import { OUTBOX_CHANNEL } from './listener.js';
import type { Clock } from '../types/clock.js';

/**
 * The in-process dispatcher from [[Realtime and Events]] § Dispatcher
 * Mechanics:
 *
 *   claim with FOR UPDATE SKIP LOCKED → mark dispatched → COMMIT → NOTIFY
 *
 * The commit must precede the notify, or a listener wakes to a row it cannot
 * yet see. That ordering is the only reason `notify` sits outside the
 * transaction callback below rather than inside it.
 *
 * There is no handler registry. [[Realtime and Events]] names four eventual
 * consumers — audit log, portal feed, notifications, live UI — but today only
 * the fanout exists, and "no new abstraction until there are two real call
 * sites" applies to event handlers as much as to anything else. The second
 * consumer is what buys the registry.
 *
 * `log` is typed against AdonisJS's own `Logger` (a pino wrapper, same
 * underlying library Fastify uses) purely for its method shapes — this module
 * has no other dependency on the framework.
 */
const DEAD_LETTER_AFTER_ATTEMPTS = 5;

export type OutboxDispatcher = {
  readonly start: () => void;
  readonly stop: () => void;
  /** One pass. Returns rows dispatched, so a test can drain deterministically. */
  readonly tick: () => Promise<number>;
};

export function createOutboxDispatcher(deps: {
  readonly database: Database;
  readonly transaction: <T>(work: (exec: Exec) => Promise<T>) => Promise<T>;
  readonly clock: Clock;
  readonly config: Config;
  readonly log: Logger;
}): OutboxDispatcher {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  async function tick(): Promise<number> {
    const at = deps.clock.now();

    const claimed = await deps.transaction(async (exec) => {
      const events = await claimPending(exec, deps.config.OUTBOX_BATCH_SIZE);
      await markDispatched(
        exec,
        events.map((event) => event.id),
        at,
      );
      return events;
    });

    // Strictly after commit. See the module comment.
    for (const event of claimed) {
      try {
        await notifyDispatched(
          deps.database.drizzle,
          OUTBOX_CHANNEL,
          JSON.stringify({ id: event.id, tenantId: event.tenantId, topic: event.topic }),
        );
      } catch (error) {
        await noteFailure(event.id, error);
      }
    }
    return claimed.length;
  }

  /**
   * At-least-once delivery means a failed fanout is not a lost event — the
   * client replays by cursor. The counter exists so a persistently failing row
   * alerts rather than silently stalling the stream.
   */
  async function noteFailure(id: number, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = await recordFailure(deps.database.drizzle, id, message);
    if (attempts >= DEAD_LETTER_AFTER_ATTEMPTS) {
      deps.log.error({ outboxId: id, attempts, err: message }, 'outbox event dead-lettered');
    } else {
      deps.log.warn({ outboxId: id, attempts, err: message }, 'outbox fanout failed');
    }
  }

  async function tickSafely(): Promise<void> {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (error) {
      deps.log.error({ err: String(error) }, 'outbox dispatch tick failed');
    } finally {
      running = false;
    }
  }

  return {
    start: (): void => {
      if (timer !== null) return;
      timer = setInterval(() => void tickSafely(), deps.config.OUTBOX_POLL_MS);
      timer.unref();
      deps.log.info({ pollMs: deps.config.OUTBOX_POLL_MS }, 'outbox dispatcher started');
    },
    stop: (): void => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
    tick,
  };
}
