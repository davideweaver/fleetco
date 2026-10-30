import { z } from 'zod';

import { tenantIdSchema, type TenantId } from '../types/branded.js';

/**
 * The in-process half of the fanout in [[Realtime and Events]] § Multi-Instance
 * Fanout.
 *
 * The chain is: the dispatcher commits a batch, issues `NOTIFY` (ADR-023 — "the
 * dispatcher must commit before notifying, or listeners wake to a row they
 * cannot yet see"), every API task's dedicated `LISTEN` connection receives it,
 * and each task publishes it here. Open SSE streams in that task then wake up
 * and re-read their own cursor.
 *
 * **What crosses this boundary is a wake-up, not data.** The payload carries
 * the event id, tenant and name, and the stream re-reads the body from the
 * outbox through the scoped repository. That is what makes a missed
 * notification cost nothing — durability lives in the table, never in the
 * transport — and it is also why no authorization decision is made here. A
 * notifier that delivered payloads would be a second authorization path, which
 * is the thing [[Tenancy Model]] rejects RLS for.
 *
 * Subscribers are keyed by tenant so one tenant's event volume does not wake
 * every other tenant's streams. That is a performance property; the
 * correctness property is the scoped re-read.
 */

/**
 * The Postgres channel name. Shared by `listener.ts`, which listens on it, and
 * `repository.ts`, which notifies on it.
 */
export const OUTBOX_CHANNEL = 'fleetco_outbox';

export const outboxNotificationSchema = z.object({
  id: z.number().int().positive(),
  tenantId: tenantIdSchema,
  name: z.string().min(1),
});

export type OutboxNotification = z.infer<typeof outboxNotificationSchema>;

export type NotificationListener = (notification: OutboxNotification) => void;

export class OutboxNotifier {
  private readonly listeners = new Map<TenantId, Set<NotificationListener>>();

  /** Returns the unsubscribe function. A stream calls it when the client goes. */
  public subscribe(tenantId: TenantId, listener: NotificationListener): () => void {
    const existing = this.listeners.get(tenantId) ?? new Set<NotificationListener>();
    existing.add(listener);
    this.listeners.set(tenantId, existing);

    return () => {
      const current = this.listeners.get(tenantId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(tenantId);
      }
    };
  }

  public publish(notification: OutboxNotification): void {
    const subscribers = this.listeners.get(notification.tenantId);
    if (!subscribers) {
      return;
    }
    // A copy, because a listener may unsubscribe itself while being notified —
    // which is exactly what a stream whose client just disconnected does.
    for (const listener of [...subscribers]) {
      listener(notification);
    }
  }

  public clear(): void {
    this.listeners.clear();
  }

  /** For the integration test that asserts a stream actually unsubscribed. */
  public get subscriberCount(): number {
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }
}
