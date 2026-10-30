import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * The transactional outbox — the single mechanism behind the audit log, the
 * portal activity feed, notifications and live UI updates
 * ([[Realtime and Events]]).
 *
 * `id` is a monotonic bigint, NOT a UUIDv7, and it is the one deliberate
 * exception to "UUIDv7 primary keys everywhere". [[Realtime and Events]]
 * § Event Shape asks for "a monotonic `id` (the replay cursor)" and
 * § Replay on Reconnect shows it on the wire as `Last-Event-ID: 48213`. A
 * UUIDv7 sorts but is not a cursor a browser can compare, and the outbox is a
 * platform log rather than a customer-facing entity, so the non-enumerability
 * argument for UUIDs does not apply to it.
 */
export const platformSchema = pgSchema('platform');

export const outboxEvents = platformSchema.table(
  'outbox_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),

    /**
     * Non-negotiable per [[Realtime and Events]] § Event Shape: it is what
     * lets the dispatcher and the SSE filter scope without re-reading the
     * source row.
     */
    tenantId: uuid('tenant_id').notNull(),

    /** Non-null when the event is visible to a portal principal. */
    customerId: uuid('customer_id'),

    /** e.g. `customer:{tenantId}:{customerId}`, per § Authorization. */
    topic: text('topic').notNull(),

    /** e.g. `customer.created`. */
    name: text('name').notNull(),

    payload: jsonb('payload').notNull(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),

    failedAttempts: integer('failed_attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [
    index('outbox_events_pending_idx')
      .on(table.id)
      .where(sql`${table.dispatchedAt} is null`),
    index('outbox_events_replay_idx').on(table.tenantId, table.topic, table.id),
  ],
);

export type OutboxEventRow = typeof outboxEvents.$inferSelect;
