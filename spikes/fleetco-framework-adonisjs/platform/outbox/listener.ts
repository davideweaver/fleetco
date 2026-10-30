import { Client } from 'pg';
import { z } from 'zod';
import type { Logger } from '@adonisjs/core/logger';

/**
 * Cross-instance fanout over Postgres `LISTEN/NOTIFY`, per ADR-023. No Redis:
 * durability never lived in the transport, it lives in the outbox table, and a
 * reconnecting client replays from its cursor.
 *
 * Two constraints from [[Realtime and Events]] § Multi-Instance Fanout are
 * load-bearing here:
 *
 *   1. The listener needs a direct connection, not a transaction-mode pooler,
 *      which is why this opens its own `pg.Client` rather than borrowing from
 *      the Drizzle pool.
 *   2. `NOTIFY` fires on commit, so the dispatcher must commit before it
 *      notifies — enforced in `dispatcher.ts`, not here.
 *
 * A notification is a **wake-up, not a payload**. It carries the cursor, the
 * tenant and the topic; the body is read back from the outbox through the
 * subscriber's own `Scope`. That is what [[Realtime and Events]] means by
 * "the 8000-byte cap is irrelevant because clients replay the body from the
 * outbox by cursor", and it is why a dropped notification costs nothing.
 */
export const OUTBOX_CHANNEL = 'outbox_events';

export const notificationSchema = z.object({
  id: z.number().int().positive(),
  tenantId: z.uuid(),
  topic: z.string().min(1),
});

export type OutboxNotification = z.infer<typeof notificationSchema>;

export type OutboxListener = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  /**
   * Yields once immediately, then once per matching notification, then at
   * least once every `tickMs` regardless. The immediate first yield is what
   * makes the caller's drain loop the single code path for both replay and
   * live push; the tick is the belt-and-braces catch-up for a notification
   * that was never delivered.
   */
  readonly watch: (topic: string, signal: AbortSignal, tickMs: number) => AsyncGenerator<void>;
};

export function createOutboxListener(connectionString: string, log: Logger): OutboxListener {
  const subscribers = new Set<(note: OutboxNotification) => void>();
  let client: Client | null = null;
  let stopped = false;

  async function start(): Promise<void> {
    if (client !== null || stopped) return;

    const listener = new Client({ connectionString });
    listener.on('notification', (message) => {
      const parsed = notificationSchema.safeParse(
        message.payload === undefined ? null : safeJson(message.payload),
      );
      if (!parsed.success) {
        log.warn({ channel: OUTBOX_CHANNEL }, 'discarded malformed notification');
        return;
      }
      for (const subscriber of subscribers) subscriber(parsed.data);
    });
    listener.on('error', (error: Error) => {
      log.error({ err: error.message }, 'outbox listener connection failed');
      client = null;
      if (!stopped) void restart();
    });

    await listener.connect();
    await listener.query(`listen ${OUTBOX_CHANNEL}`);
    client = listener;
    log.info({ channel: OUTBOX_CHANNEL }, 'outbox listener connected');
  }

  async function restart(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (stopped) return;
    try {
      await start();
    } catch (error) {
      log.error({ err: String(error) }, 'outbox listener restart failed');
    }
  }

  async function stop(): Promise<void> {
    stopped = true;
    subscribers.clear();
    const listener = client;
    client = null;
    if (listener !== null) await listener.end();
  }

  async function* watch(
    topic: string,
    signal: AbortSignal,
    tickMs: number,
  ): AsyncGenerator<void> {
    let wake: (() => void) | null = null;
    const fire = (): void => {
      wake?.();
    };
    const onNotification = (note: OutboxNotification): void => {
      if (note.topic === topic) fire();
    };

    // Read through a call rather than touching `signal.aborted` directly: the
    // flag is set by another task across an `await`, which the type-aware lint
    // rules cannot see, so a direct read gets narrowed to a constant.
    const isClosed = (): boolean => signal.aborted;

    subscribers.add(onNotification);
    signal.addEventListener('abort', fire);
    try {
      if (isClosed()) return;
      yield;
      for (;;) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wake = null;
            resolve();
          }, tickMs);
          wake = (): void => {
            clearTimeout(timer);
            wake = null;
            resolve();
          };
        });
        if (isClosed()) break;
        yield;
      }
    } finally {
      subscribers.delete(onNotification);
      signal.removeEventListener('abort', fire);
    }
  }

  return { start, stop, watch };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
