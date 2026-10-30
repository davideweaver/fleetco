import { Client } from 'pg';

import { environment } from '../environment.js';
import logging from '../logging/index.js';
import { OUTBOX_CHANNEL, outboxNotificationSchema, type OutboxNotifier } from './notifier.js';

/**
 * The `LISTEN` half of the fanout (ADR-023, [[Realtime and Events]]
 * § Multi-Instance Fanout): "each `api` task holds **one dedicated connection**
 * issuing `LISTEN` on a channel."
 *
 * Dedicated is the operative word, and it is the one thing about this file that
 * is easy to get wrong:
 *
 *  - A pooled connection cannot hold a `LISTEN`, because the pool hands it to
 *    the next query and the subscription goes with it.
 *  - **A transaction-mode pooler breaks `LISTEN/NOTIFY` entirely.** That
 *    constraint is recorded in ADR-023 and is why Neon was dropped; if RDS
 *    Proxy is ever introduced, this connection must bypass it.
 *
 * Losing a notification costs nothing — durability lives in the outbox table,
 * and a reconnecting client replays from its cursor — so reconnection here is
 * best-effort with a fixed backoff rather than anything cleverer.
 */

const RECONNECT_DELAY_MS = 1_000;

export class OutboxListener {
  private client: Client | null = null;
  private stopped = false;

  constructor(private readonly notifier: OutboxNotifier) {}

  public async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    const client = this.client;
    this.client = null;
    if (client) {
      await client.end();
    }
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: environment.DATABASE_URL });

    client.on('notification', (message) => {
      if (message.payload === undefined) {
        return;
      }
      try {
        // Parsed, not trusted. The payload travels through the database as text
        // and arrives here as `string | undefined`; a malformed one is a bug
        // somewhere else and must not take the listener down.
        const notification = outboxNotificationSchema.parse(JSON.parse(message.payload));
        this.notifier.publish(notification);
      } catch (err) {
        logging.exception('Unparseable outbox notification', err, ['sse', 'outbox']);
      }
    });

    client.on('error', (err) => {
      logging.exception('Outbox listener connection failed', err, ['sse', 'outbox'], {}, 'warning');
      this.client = null;
      this.scheduleReconnect();
    });

    await client.connect();
    await client.query(`listen ${OUTBOX_CHANNEL}`);

    this.client = client;
    logging.debug(`Listening on ${OUTBOX_CHANNEL}`, ['lifecycle', 'outbox']);
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }
    const timer = setTimeout(() => {
      void this.connect().catch((err: unknown) => {
        logging.exception('Outbox listener reconnect failed', err, ['outbox'], {}, 'warning');
        this.scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
    // A pending reconnect must not hold the process open during shutdown.
    timer.unref();
  }
}
