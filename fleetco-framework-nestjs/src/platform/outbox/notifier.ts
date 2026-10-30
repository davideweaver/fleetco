import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Client } from 'pg';
import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';
import { z } from 'zod';

import { loadConfig } from '../../config';
import { DATABASE } from '../db/db.module';
import type { Database } from '../db/client';

/**
 * Cross-instance fanout over Postgres `LISTEN/NOTIFY`, per ADR-023. No Redis:
 * durability never lived in the transport, it lives in the outbox table, and a
 * reconnecting client replays from its cursor.
 *
 * Two constraints from [[Realtime and Events]] § Multi-Instance Fanout are
 * load-bearing here:
 *
 *  1. The listener needs a direct connection, not a transaction-mode pooler,
 *     which is why this takes its own `pg.Client` instead of borrowing from
 *     the Drizzle pool.
 *  2. `NOTIFY` fires on commit, so the dispatcher must commit before it
 *     notifies — enforced in `dispatcher.ts`, not here.
 *
 * The payload carries only the cursor, tenant and topic. Bodies are replayed
 * from the outbox by the SSE handler, which re-authorizes each row.
 */
export const OUTBOX_CHANNEL = 'outbox_events';

export const notificationSchema = z.object({
  id: z.number().int().positive(),
  tenantId: z.uuid(),
  topic: z.string().min(1),
});

export type OutboxNotification = z.infer<typeof notificationSchema>;

@Injectable()
export class OutboxNotifier implements OnApplicationShutdown {
  private readonly logger = new Logger(OutboxNotifier.name);
  private readonly subject = new Subject<OutboxNotification>();
  private listener: Client | null = null;
  private stopped = false;

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /** Every notification seen by this process, for any tenant. Filtered downstream. */
  notifications(): Observable<OutboxNotification> {
    return this.subject.asObservable();
  }

  /**
   * Opens the dedicated listener connection. Called explicitly from
   * `main.ts` rather than from `onApplicationBootstrap`, so a test can run the
   * dispatcher and the SSE stream without a background socket it did not ask
   * for.
   */
  async start(): Promise<void> {
    if (this.listener !== null || this.stopped) return;

    const client = new Client({ connectionString: loadConfig().DATABASE_URL });
    client.on('notification', (message) => {
      const parsed = notificationSchema.safeParse(
        message.payload === undefined ? null : safeJson(message.payload),
      );
      if (!parsed.success) {
        this.logger.warn(`discarded malformed ${OUTBOX_CHANNEL} notification`);
        return;
      }
      this.subject.next(parsed.data);
    });
    client.on('error', (error: Error) => {
      this.logger.error(`listener connection failed: ${error.message}`);
      this.listener = null;
      if (!this.stopped) void this.restart();
    });

    await client.connect();
    await client.query(`LISTEN ${OUTBOX_CHANNEL}`);
    this.listener = client;
    this.logger.log(`listening on ${OUTBOX_CHANNEL}`);
  }

  /**
   * Publishes a notification. Uses the application pool rather than the
   * listener connection, because the caller is the dispatcher and it has just
   * committed on a pooled connection.
   */
  async publish(notification: OutboxNotification): Promise<void> {
    await this.database.pool.query('SELECT pg_notify($1, $2)', [
      OUTBOX_CHANNEL,
      JSON.stringify(notification),
    ]);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    this.subject.complete();
    const client = this.listener;
    this.listener = null;
    if (client !== null) await client.end();
  }

  private async restart(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    try {
      await this.start();
    } catch (error) {
      this.logger.error(`listener restart failed: ${String(error)}`);
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
