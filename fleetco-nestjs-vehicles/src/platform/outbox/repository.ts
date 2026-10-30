import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { DB } from '../db/db.module';
import { TenantScopedRepository } from '../db/tenant-scoped-repository';
import type { Db, Tx } from '../db/client';
import { toCustomerId, toInstant, toTenantId } from '../types/branded';
import type { CustomerId, Instant, TenantId } from '../types/branded';
import type { Scope } from '../types/scope';
import { outboxEvents } from './schema';

/**
 * An event about to be appended. No `id` and no `dispatchedAt` — the database
 * owns the cursor and the dispatcher owns the dispatch mark.
 */
export type NewOutboxEvent = {
  readonly tenantId: TenantId;
  readonly customerId: CustomerId | null;
  readonly topic: string;
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Instant;
};

/** The shape handed to the SSE stream and to in-process handlers. */
export type OutboxEvent = {
  readonly id: number;
  readonly tenantId: TenantId;
  readonly customerId: CustomerId | null;
  readonly topic: string;
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Instant;
};

@Injectable()
export class OutboxRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Db) {
    super(db);
  }

  /**
   * The outbox carries the portal scope key directly: an event row is visible
   * to a portal principal when its `customer_id` matches. Third call site for
   * `scopedWhere`, and the one that made the seam worth keeping — the
   * dispatcher paths below deliberately sit outside it.
   */
  protected readonly tenantColumn = outboxEvents.tenantId;
  protected readonly scopeColumn = outboxEvents.customerId;

  /**
   * Appends an event. Takes a `Tx`, not the pool, so this cannot be called
   * outside a transaction — which is the whole point of the outbox
   * ([[Realtime and Events]]: "ONE transaction. Atomicity is the whole
   * point."). The type signature is the enforcement; there is no second path.
   */
  async append(tx: Tx, event: NewOutboxEvent): Promise<void> {
    await tx.insert(outboxEvents).values({
      tenantId: event.tenantId,
      customerId: event.customerId,
      topic: event.topic,
      name: event.name,
      payload: event.payload,
      occurredAt: new Date(event.occurredAt),
    });
  }

  /**
   * Replay path. Scoped — a subscriber only ever sees rows its principal is
   * permitted to see, through the same `Scope` the REST endpoints use.
   *
   * Only dispatched rows are returned. The dispatcher commits before it
   * notifies, so an undispatched row may be a row another connection cannot
   * yet see, and returning it would advance a client's cursor past a gap.
   */
  async readTopicSince(
    scope: Scope,
    topic: string,
    afterId: number,
    limit: number,
  ): Promise<OutboxEvent[]> {
    const rows = await this.db
      .select()
      .from(outboxEvents)
      .where(
        and(
          ...this.scopedWhere(scope),
          eq(outboxEvents.topic, topic),
          gt(outboxEvents.id, afterId),
          isNotNull(outboxEvents.dispatchedAt),
        ),
      )
      .orderBy(asc(outboxEvents.id))
      .limit(limit);
    return rows.map(toOutboxEvent);
  }

  /**
   * Re-reads one row through the scope immediately before it is pushed, so a
   * mid-session permission change takes effect at once rather than being
   * trusted from subscription time ([[Realtime and Events]] § Authorization).
   */
  async readScopedById(scope: Scope, id: number): Promise<OutboxEvent | null> {
    const rows = await this.db
      .select()
      .from(outboxEvents)
      .where(and(...this.scopedWhere(scope), eq(outboxEvents.id, id)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toOutboxEvent(row);
  }

  /** The newest dispatched cursor a subscriber may see; the live-stream start point. */
  async currentCursor(scope: Scope, topic: string): Promise<number> {
    const rows = await this.db
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          ...this.scopedWhere(scope),
          eq(outboxEvents.topic, topic),
          isNotNull(outboxEvents.dispatchedAt),
        ),
      )
      .orderBy(desc(outboxEvents.id))
      .limit(1);
    return rows[0]?.id ?? 0;
  }

  /**
   * Dispatcher path: claim a batch with `FOR UPDATE SKIP LOCKED` so several
   * instances can poll concurrently without double-dispatching
   * ([[Realtime and Events]] § Dispatcher Mechanics).
   *
   * Deliberately unscoped, and the only unscoped read in the codebase. The
   * dispatcher serves no principal — it dispatches every tenant's events — so
   * there is no `Scope` to apply. Scoping for *delivery* happens at the SSE
   * filter above, which is the path that does have a principal.
   */
  async claimPending(tx: Tx, limit: number): Promise<OutboxEvent[]> {
    const rows = await tx
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.dispatchedAt))
      .orderBy(asc(outboxEvents.id))
      .limit(limit)
      .for('update', { skipLocked: true });
    return rows.map(toOutboxEvent);
  }

  async markDispatched(tx: Tx, ids: readonly number[], at: Instant): Promise<void> {
    if (ids.length === 0) return;
    await tx
      .update(outboxEvents)
      .set({ dispatchedAt: new Date(at) })
      .where(inArray(outboxEvents.id, [...ids]));
  }

  /**
   * Records a failed fanout attempt and returns the new count.
   *
   * This lives here rather than in the dispatcher because the dispatcher is
   * not a repository and the lint rule will not let it import a Drizzle table
   * — which is the rule working as intended: the dispatcher had no business
   * writing its own UPDATE.
   */
  async recordFailure(id: number, message: string): Promise<number> {
    const rows = await this.db
      .update(outboxEvents)
      .set({
        failedAttempts: sql`${outboxEvents.failedAttempts} + 1`,
        lastError: message.slice(0, 500),
      })
      .where(eq(outboxEvents.id, id))
      .returning({ failedAttempts: outboxEvents.failedAttempts });
    return rows[0]?.failedAttempts ?? 0;
  }

  /**
   * Everything the backlog alarms need, in one query.
   *
   * Three separate counts would mean three round trips on every scrape, and a
   * scrape happens every 15 seconds forever. `oldestPendingAgeSeconds` is the
   * one that actually matters: a backlog of 50 is meaningless without knowing
   * whether the oldest row is two seconds or two hours old. A count alone
   * cannot tell a busy dispatcher from a stalled one.
   */
  async stats(deadLetterAfterAttempts: number): Promise<{
    pending: number;
    oldestPendingAgeSeconds: number;
    deadLettered: number;
  }> {
    const rows = await this.db
      .select({
        pending: sql<number>`count(*) filter (where ${outboxEvents.dispatchedAt} is null)::int`,
        oldestPendingAgeSeconds: sql<number>`coalesce(extract(epoch from (now() - min(${outboxEvents.occurredAt}) filter (where ${outboxEvents.dispatchedAt} is null))), 0)::int`,
        deadLettered: sql<number>`count(*) filter (where ${outboxEvents.dispatchedAt} is null and ${outboxEvents.failedAttempts} >= ${deadLetterAfterAttempts})::int`,
      })
      .from(outboxEvents);
    const row = rows[0];
    return {
      pending: row?.pending ?? 0,
      oldestPendingAgeSeconds: row?.oldestPendingAgeSeconds ?? 0,
      deadLettered: row?.deadLettered ?? 0,
    };
  }

  /** How much of the stream is still undispatched. Used by the health endpoint. */
  async countPending(): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(outboxEvents)
      .where(isNull(outboxEvents.dispatchedAt));
    return rows[0]?.count ?? 0;
  }

}

/** `jsonb` arrives as `unknown`; parse rather than assert at the boundary. */
const payloadSchema = z.record(z.string(), z.unknown());

function toOutboxEvent(row: typeof outboxEvents.$inferSelect): OutboxEvent {
  return {
    id: row.id,
    tenantId: toTenantId(row.tenantId),
    customerId: row.customerId === null ? null : toCustomerId(row.customerId),
    topic: row.topic,
    name: row.name,
    payload: payloadSchema.parse(row.payload),
    occurredAt: toInstant(row.occurredAt),
  };
}
