import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The transactional outbox (ADR-009, [[Realtime and Events]]). One table, in
 * the `platform` schema rather than a module's, because it is the integration
 * seam *between* modules — Evolution Path rule 1 partitions domain tables by
 * module and this is not one.
 *
 * The column set is the document's, verbatim: "a monotonic `id` (the replay
 * cursor), `tenant_id`, an optional `customer_id` for portal visibility, the
 * event name, a JSON payload, `occurred_at`, and `dispatched_at`", plus the
 * `failed_attempts` counter and dead-letter state from § Dispatcher Mechanics.
 *
 * `id` is a `bigint` identity and **not** a UUIDv7 — the one deliberate
 * exception to "UUIDv7 primary keys everywhere" ([[Tenancy Model]]
 * non-negotiable 6). § Replay on Reconnect puts this value on the wire as
 * `Last-Event-ID: 48213`; a UUIDv7 sorts but is not a cursor a browser can
 * compare, and the non-enumerability argument does not apply to a platform log
 * that is never addressed by URL.
 */
export const platformSchema = pgSchema('platform');

export const outbox = platformSchema.table(
  'outbox',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),

    /** Non-negotiable: it is what lets the dispatcher and the SSE filter scope without re-reading the source row. */
    tenantId: uuid('tenant_id').notNull(),
    /** Set when the event is visible to a portal user; null for shop-only events. */
    customerId: uuid('customer_id'),

    name: text('name').notNull(),
    // `$type` rather than a cast at every read site: the payload is a JSON
    // object by construction, and typing the column is the one place to say so.
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),

    failedAttempts: integer('failed_attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [
    // The dispatcher's claim query. Partial, so it stays small however large
    // the table grows — the whole point of keeping history in this table.
    index('outbox_pending_idx')
      .on(table.id)
      .where(sql`${table.dispatchedAt} is null`),

    // The SSE replay query: scope first, then cursor.
    index('outbox_scope_cursor_idx').on(table.tenantId, table.customerId, table.id),
  ],
);

export type OutboxRow = typeof outbox.$inferSelect;
