import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';

import { environment } from '../environment.js';
import { OUTBOX_CHANNEL, type OutboxNotification } from './notifier.js';
import {
  customerIdFromDb,
  tenantIdFromDb,
  toInstant,
  type CustomerId,
  type Instant,
  type TenantId,
} from '../types/branded.js';
import type { Scope } from '../types/scope.js';
import { outbox } from './schema.js';
import type { Database, Transaction } from '../db/handle.js';

/**
 * The outbox's queries. Like every other `repository.ts`, this is the only file
 * that touches its table, and every read takes a `Scope`.
 */

export type OutboxEvent = {
  readonly id: number;
  readonly name: string;
  readonly customerId: CustomerId | null;
  readonly occurredAt: Instant;
  readonly payload: Record<string, unknown>;
};

export type NewOutboxEvent = {
  readonly tenantId: TenantId;
  readonly customerId: CustomerId | null;
  readonly name: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Instant;
};

/**
 * Append an event. Takes a `Transaction`, never a `Database`, so the signature
 * itself enforces the rule the whole design rests on: the event row and the
 * state change commit together or not at all. There is no overload that writes
 * outside a transaction.
 */
export async function appendEvent(tx: Transaction, event: NewOutboxEvent): Promise<number> {
  const [row] = await tx
    .insert(outbox)
    .values({
      tenantId: event.tenantId,
      customerId: event.customerId,
      name: event.name,
      payload: event.payload,
      occurredAt: new Date(event.occurredAt),
    })
    .returning({ id: outbox.id });

  if (!row) {
    throw new Error('outbox insert returned no row');
  }
  return row.id;
}

export type ClaimedEvent = NewOutboxEvent & { readonly id: number };

/**
 * Claim and mark a batch, per [[Realtime and Events]] § Dispatcher Mechanics:
 * `SELECT … FOR UPDATE SKIP LOCKED` so several instances can poll concurrently
 * without double-dispatching.
 *
 * Claim and mark happen in one transaction, so a crash between them cannot
 * leave a row marked-but-undelivered. Delivery is therefore at-least-once and
 * handlers must be idempotent on `id` — which the document requires anyway.
 */
export async function claimPending(db: Database, batchSize: number): Promise<ClaimedEvent[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outbox)
      .where(
        and(
          isNull(outbox.dispatchedAt),
          lt(outbox.failedAttempts, environment.OUTBOX_MAX_ATTEMPTS),
        ),
      )
      .orderBy(asc(outbox.id))
      .limit(batchSize)
      .for('update', { skipLocked: true });

    if (rows.length === 0) {
      return [];
    }

    await tx
      .update(outbox)
      .set({ dispatchedAt: sql`now()` })
      .where(
        inArray(
          outbox.id,
          rows.map((row) => row.id),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      tenantId: tenantIdFromDb(row.tenantId),
      customerId: row.customerId === null ? null : customerIdFromDb(row.customerId),
      name: row.name,
      payload: row.payload,
      occurredAt: toInstant(row.occurredAt),
    }));
  });
}

/**
 * Wake every API instance's listener. ADR-023 records the constraint this obeys:
 * "`NOTIFY` fires on transaction commit, so the dispatcher must commit before
 * notifying, or listeners wake to a row they cannot yet see." `claimPending`
 * has returned by the time this is called, so its transaction is committed.
 *
 * The payload is a wake-up, not data — id, tenant and name only. The 8000-byte
 * cap is irrelevant because clients replay the body from the outbox by cursor.
 */
export async function notifyDispatched(
  db: Database,
  notification: OutboxNotification,
): Promise<void> {
  await db.execute(sql`select pg_notify(${OUTBOX_CHANNEL}, ${JSON.stringify(notification)})`);
}

export async function recordFailure(db: Database, id: number, message: string): Promise<void> {
  await db
    .update(outbox)
    .set({
      dispatchedAt: null,
      failedAttempts: sql`${outbox.failedAttempts} + 1`,
      // Truncated: an error message is not a place to accumulate a payload, and
      // a 10MB stack in a row nobody reads is how a table stops being queryable.
      lastError: message.slice(0, 1_000),
    })
    .where(eq(outbox.id, id))
    .returning({ id: outbox.id });
}

/** Rows that exhausted their retries. Alerted on rather than silently stalling the stream. */
export async function readDeadLettered(db: Database, limit: number): Promise<number[]> {
  const rows = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      and(isNull(outbox.dispatchedAt), sql`${outbox.failedAttempts} >= ${environment.OUTBOX_MAX_ATTEMPTS}`),
    )
    .orderBy(asc(outbox.id))
    .limit(limit);
  return rows.map((row) => row.id);
}

/**
 * The SSE read path — replay *and* live push both come through here, which is
 * what makes "subscription authorization and request authorization call the
 * same code" true rather than aspirational.
 *
 * Three predicates, all unconditional:
 *
 *  1. `tenant_id = scope.tenantId`.
 *  2. `customer_id = scope.customerId` when the scope is a portal one. A
 *     tenant-wide scope still requires a non-null `customer_id`, because this
 *     is the customer-scoped stream; shop-only events belong to a dispatch
 *     topic that phase one does not expose.
 *  3. **The gap guard.** A client cursor is a high-water mark: once it has read
 *     id 40 it never asks for 39 again. Under `SKIP LOCKED`, worker B can
 *     commit id 40 while worker A still holds 39 uncommitted — so a reader that
 *     accepted 40 would advance past 39 and lose it permanently, which is the
 *     one failure replay exists to prevent. Rows are therefore visible only
 *     once nothing below them is still pending.
 *
 * A dead-lettered row is treated as settled rather than pending, or one
 * permanently failing event would stall every stream in the system.
 */
export async function readScopedEvents(
  db: Database,
  scope: Scope,
  options: { readonly names: readonly string[]; readonly afterId: number; readonly limit: number },
): Promise<OutboxEvent[]> {
  const horizon = sql`(
    select coalesce(min(${outbox.id}), 9223372036854775807)
    from ${outbox}
    where ${outbox.dispatchedAt} is null
      and ${outbox.failedAttempts} < ${environment.OUTBOX_MAX_ATTEMPTS}
  )`;

  const customerPredicate =
    scope.customerId === null
      ? sql`${outbox.customerId} is not null`
      : eq(outbox.customerId, scope.customerId);

  const rows = await db
    .select({
      id: outbox.id,
      name: outbox.name,
      customerId: outbox.customerId,
      occurredAt: outbox.occurredAt,
      payload: outbox.payload,
    })
    .from(outbox)
    .where(
      and(
        eq(outbox.tenantId, scope.tenantId),
        customerPredicate,
        inArray(outbox.name, [...options.names]),
        gt(outbox.id, options.afterId),
        lt(outbox.id, horizon),
      ),
    )
    .orderBy(asc(outbox.id))
    .limit(options.limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    customerId: row.customerId === null ? null : customerIdFromDb(row.customerId),
    occurredAt: toInstant(row.occurredAt),
    payload: row.payload,
  }));
}
