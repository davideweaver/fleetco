import type { App } from './index.js';
import AppModule from '../lib/app/AppModule.js';
import { environment } from '../lib/environment.js';
import logging from '../lib/logging/index.js';
import { OutboxListener } from '../lib/outbox/listener.js';
import { OutboxNotifier } from '../lib/outbox/notifier.js';
import { claimPending, notifyDispatched, readDeadLettered, recordFailure } from '../lib/outbox/repository.js';

/**
 * The dispatcher, the listener, and the in-process fanout.
 *
 * [[Realtime and Events]] § The Design, in order:
 *
 *   state change + outbox row   ← one transaction, in a module's repository
 *          │
 *   dispatcher polls outbox     ← SELECT … FOR UPDATE SKIP LOCKED, here
 *          ├──► in-process handlers   ← audit log, email, SMS, webhooks
 *          └──► LISTEN/NOTIFY         ← fanout to every API instance
 *                      ▼
 *              SSE push to clients
 *
 * **One instance runs both halves in this spike**, which is the production
 * shape for phase one: ADR-021 puts `api` and `worker` in one task definition
 * at this scale. Nothing here assumes that. The dispatcher claims under
 * `SKIP LOCKED` so N of them can run, and the push path goes out through
 * Postgres and back in through the listener even when both ends are this
 * process — so the single-instance code path is the multi-instance code path,
 * and there is no configuration that is only exercised in production.
 *
 * In-process handlers are a logging stub here. The four things the outbox earns
 * its keep with on day one — audit log, portal activity feed, notifications,
 * live UI — are all consumers of this loop, and none of them is a framework
 * question.
 */
export default class OutboxModule extends AppModule<App> {
  public readonly notifier = new OutboxNotifier();

  private readonly listener = new OutboxListener(this.notifier);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  public override async init(): Promise<void> {
    this.stopped = false;
    await this.listener.start();
    this.schedule(0);
    logging.debug('Outbox dispatcher started', ['lifecycle', 'outbox']);
  }

  public override async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.listener.stop();
    this.notifier.clear();
    logging.debug('Outbox dispatcher stopped', ['lifecycle', 'outbox']);
  }

  /**
   * One pass of the loop. Public because the integration suite drives it
   * directly rather than waiting on a timer — a test that sleeps for the poll
   * interval is a test that is flaky on a loaded CI box.
   */
  public async dispatchOnce(): Promise<number> {
    const events = await claimPending(this.app.db.handle, environment.OUTBOX_BATCH_SIZE);

    for (const event of events) {
      try {
        // Where the audit-log, notification and webhook handlers will hang.
        // At-least-once delivery means each must be idempotent on `event.id`.
        logging.info(`Dispatched ${event.name}`, ['outbox', event.name], {
          outboxId: event.id,
          tenantId: event.tenantId,
        });

        // After the claim transaction committed, never inside it. ADR-023:
        // "listeners wake to a row they cannot yet see" otherwise.
        await notifyDispatched(this.app.db.handle, {
          id: event.id,
          tenantId: event.tenantId,
          name: event.name,
        });
      } catch (err) {
        // The row goes back to pending with its counter incremented. A
        // permanently failing event stops blocking replay once it passes
        // OUTBOX_MAX_ATTEMPTS, because `readScopedEvents` treats a
        // dead-lettered row as settled rather than pending.
        logging.exception('Outbox dispatch failed', err, ['outbox'], { outboxId: event.id });
        await recordFailure(this.app.db.handle, event.id, String(err));
      }
    }

    return events.length;
  }

  /** Dead-lettered rows alert rather than silently stalling the stream. */
  public async reportDeadLettered(): Promise<number[]> {
    const ids = await readDeadLettered(this.app.db.handle, 50);
    if (ids.length > 0) {
      logging.error(`Outbox has ${ids.length} dead-lettered events`, ['outbox', 'dead-letter'], {
        ids: ids.join(','),
      });
    }
    return ids;
  }

  /**
   * A `setTimeout` chain rather than `setInterval`: a pass that takes longer
   * than the interval must not have the next one start on top of it.
   */
  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) {
      return;
    }
    this.running = true;
    try {
      const dispatched = await this.dispatchOnce();
      // A full batch means there is more waiting, so go straight round again.
      this.schedule(dispatched === 0 ? environment.OUTBOX_POLL_INTERVAL_MS : 0);
    } catch (err) {
      logging.exception('Outbox poll failed', err, ['outbox'], {}, 'warning');
      this.schedule(environment.OUTBOX_POLL_INTERVAL_MS);
    } finally {
      this.running = false;
    }
  }
}
