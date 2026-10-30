import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { Exec } from '../db/client.js';
import { toCustomerId, toInstant, toTenantId } from '../types/branded.js';
import type { CustomerId, Instant, TenantId } from '../types/branded.js';
import type { Scope } from '../types/scope.js';
import { outboxEvents } from './schema.js';

/** An event about to be appended. The database owns the cursor; the dispatcher owns the mark. */
export type NewOutboxEvent = {
  readonly tenantId: TenantId;
  readonly customerId: CustomerId | null;
  readonly topic: string;
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Instant;
};

/** A row on its way to an SSE stream or an in-process handler. */
export type OutboxEvent = {
  readonly id: number;
  readonly tenantId: TenantId;
  readonly customerId: CustomerId | null;
  readonly topic: string;
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: Instant;
};

/**
 * The scoping chokepoint for the outbox, identical in shape to the one in
 * `modules/customers/repository.ts`: tenant always, customer as well when the
 * principal is a portal user.
 */
function scoped(scope: Scope): SQL[] {
  const predicates: SQL[] = [eq(outboxEvents.tenantId, scope.tenantId)];
  if (scope.customerId !== null) {
    predicates.push(eq(outboxEvents.customerId, scope.customerId));
  }
  return predicates;
}

/**
 * The safe replay ceiling, and the subtlest thing in this module.
 *
 * A client's cursor is a high-water mark: once it has read id 40 it will never
 * ask for 39 again. With several dispatcher workers claiming batches under
 * `SKIP LOCKED`, worker B can mark 40 dispatched and commit while worker A
 * still holds 39 uncommitted. A reader that accepted 40 would advance past 39
 * and lose it permanently — the one failure mode SSE replay exists to prevent.
 *
 * So a row is only visible to a subscriber once no *lower* row is still
 * pending. That makes the stream gapless by construction instead of by
 * assuming the dispatcher commits in id order.
 */
const replayCeiling = sql`(
  select coalesce(min(e.id), 9223372036854775807)
  from platform.outbox_events e
  where e.dispatched_at is null
)`;

export async function append(exec: Exec, event: NewOutboxEvent): Promise<void> {
  await exec.insert(outboxEvents).values({
    tenantId: event.tenantId,
    customerId: event.customerId,
    topic: event.topic,
    name: event.name,
    payload: event.payload,
    occurredAt: new Date(event.occurredAt),
  });
}

/**
 * Replay and live push share this one query.
 *
 * Scoped: a subscriber only ever sees rows its principal may see, through the
 * same `Scope` the REST endpoints use — [[Realtime and Events]]
 * § Authorization: "subscription authorization and request authorization call
 * the same code."
 */
export async function readTopicSince(
  exec: Exec,
  scope: Scope,
  topic: string,
  afterId: number,
  limit: number,
): Promise<OutboxEvent[]> {
  const rows = await exec
    .select()
    .from(outboxEvents)
    .where(
      and(
        ...scoped(scope),
        eq(outboxEvents.topic, topic),
        gt(outboxEvents.id, afterId),
        isNotNull(outboxEvents.dispatchedAt),
        lt(outboxEvents.id, replayCeiling),
      ),
    )
    .orderBy(asc(outboxEvents.id))
    .limit(limit);
  return rows.map(toOutboxEvent);
}

/**
 * Where a subscriber that sent no `Last-Event-ID` starts: the newest row it is
 * allowed to see and that is safely below the replay ceiling. Anything older
 * is history the client did not ask for.
 */
export async function currentCursor(exec: Exec, scope: Scope, topic: string): Promise<number> {
  const rows = await exec
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(
      and(
        ...scoped(scope),
        eq(outboxEvents.topic, topic),
        isNotNull(outboxEvents.dispatchedAt),
        lt(outboxEvents.id, replayCeiling),
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
 * there is no `Scope` to apply. Scoping for *delivery* happens in
 * `readTopicSince`, which is the path that does have one.
 */
export async function claimPending(exec: Exec, limit: number): Promise<OutboxEvent[]> {
  const rows = await exec
    .select()
    .from(outboxEvents)
    .where(isNull(outboxEvents.dispatchedAt))
    .orderBy(asc(outboxEvents.id))
    .limit(limit)
    .for('update', { skipLocked: true });
  return rows.map(toOutboxEvent);
}

export async function markDispatched(
  exec: Exec,
  ids: readonly number[],
  at: Instant,
): Promise<void> {
  if (ids.length === 0) return;
  await exec
    .update(outboxEvents)
    .set({ dispatchedAt: new Date(at) })
    .where(inArray(outboxEvents.id, [...ids]));
}

/**
 * Records a failed fanout attempt and returns the new count. Lives here rather
 * than in `dispatcher.ts` because the lint rule will not let the dispatcher
 * import a Drizzle table — which is the rule working as intended.
 */
export async function recordFailure(exec: Exec, id: number, message: string): Promise<number> {
  const rows = await exec
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
 * How much of the stream is still undispatched. Used by the health endpoint,
 * which is also how it satisfies ADR-022 rule 7's "a real health endpoint that
 * touches the database" with a query that means something.
 */
export async function countPending(exec: Exec): Promise<number> {
  const rows = await exec
    .select({ count: sql<number>`count(*)::int` })
    .from(outboxEvents)
    .where(isNull(outboxEvents.dispatchedAt));
  return rows[0]?.count ?? 0;
}

/**
 * `NOTIFY` on the fanout channel. A query, so it belongs in a repository; the
 * dedicated `LISTEN` connection is a connection-lifecycle concern and lives in
 * `listener.ts`.
 */
export async function notifyDispatched(exec: Exec, channel: string, payload: string): Promise<void> {
  await exec.execute(sql`select pg_notify(${channel}, ${payload})`);
}

/** `jsonb` arrives as `unknown`; parse at the boundary rather than asserting. */
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
