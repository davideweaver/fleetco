import { eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { ValidationFailed } from '../types/errors';
import type { Scope } from '../types/scope';
import type { Db, Tx } from './client';

/**
 * The shared half of a module repository: the authorization chokepoint, the
 * keyset cursor, and the transaction handle.
 *
 * Extracted when the second module arrived and not before, per
 * [[Code Standards and Guardrails]] § "no abstraction until there are two real
 * call sites".
 *
 * ---------------------------------------------------------------------------
 * Why this owns the PREDICATES and not the QUERIES
 * ---------------------------------------------------------------------------
 *
 * The first attempt made this generic over the table — `<TTable extends
 * PgTable>` — so that `findById`, `list`, `insert` and `update` could live
 * here once. Drizzle's types refuse it. `.from()` is declared as:
 *
 *     from<TFrom extends PgTable | Subquery | PgViewBase | SQL>(
 *       source: TableLikeHasEmptySelection<TFrom> extends true ? DrizzleTypeError<…> : TFrom
 *     )
 *
 * and `TableLikeHasEmptySelection<T>` is a conditional on `T extends
 * Subquery`. TypeScript cannot resolve a conditional over an unresolved type
 * parameter, so the parameter type stays deferred and no generic table — as a
 * class field OR as a generic method argument, both were tried — is assignable
 * to it.
 *
 * Typing the field as a concrete `PgTable` *does* compile, but then rows come
 * back as `{ [x: string]: unknown }`: the column types are gone. Restoring
 * them needs either a type assertion (lint-banned outside `branded.ts`, and
 * this is the last file in the codebase that should get an exception) or a
 * per-module Zod row schema — which would be a second source of truth for the
 * row shape, sitting next to the Drizzle table that already defines it.
 *
 * So the seam goes where the types allow it to go without lying: the rules
 * that must never vary live here, and each repository keeps its own six
 * queries, fully typed against its own table.
 *
 * ---------------------------------------------------------------------------
 * What module two proved this was worth
 * ---------------------------------------------------------------------------
 *
 * The portal predicate is NOT the primary key. In `customers` a portal
 * principal is pinned on `customers.id` — the customer *is* the row. In
 * `vehicles` it is pinned on `vehicles.customer_id`. Those two `scoped()`
 * methods looked like copies of each other and were not, and the difference is
 * invisible at a glance. Naming `scopeColumn` separately from the id, in one
 * place, is the whole point: the next module declares which column pins a
 * portal user instead of copying a method and hoping.
 */
export abstract class TenantScopedRepository {
  constructor(protected readonly db: Db) {}

  /** `tenant_id`. Applied unconditionally, on every query, by `scopedWhere`. */
  protected abstract readonly tenantColumn: PgColumn;

  /**
   * The column a `portal` principal is pinned to.
   *
   * Equal to the primary key when the entity *is* the customer, and a foreign
   * key when it merely belongs to one. Declaring it is not optional: there is
   * no default that is right for both.
   */
  protected abstract readonly scopeColumn: PgColumn;

  /**
   * Opens a transaction. The service threads the resulting `Tx` through both
   * the write and `OutboxRepository.append`, which is what makes the atomicity
   * visible at the call site instead of hidden in a decorator.
   */
  transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  /**
   * THE chokepoint ([[Tenancy Model]] non-negotiable 2). One predicate per
   * level of authorization: tenant always, and the scope column as well when
   * the principal is a portal user.
   *
   * Returns an array rather than a single `SQL` so that every call site reads
   * `and(...this.scopedWhere(scope), …)` — a missing scope shows up as a
   * missing spread rather than hiding inside a combinator.
   */
  protected scopedWhere(scope: Scope): SQL[] {
    const predicates: SQL[] = [eq(this.tenantColumn, scope.tenantId)];
    if (scope.customerId !== null) {
      predicates.push(eq(this.scopeColumn, scope.customerId));
    }
    return predicates;
  }

  /**
   * The keyset predicate for "the page after this cursor", over
   * `(sortColumn, idColumn)`.
   *
   * The row-value comparison is what makes the pagination stable: it is a
   * single `>` over the pair, so a duplicate sort value cannot drop or repeat
   * a row the way `OFFSET` can.
   */
  protected keysetAfter(sortColumn: PgColumn, idColumn: PgColumn, cursor: string): SQL {
    const after = decodeCursor(cursor);
    return sql`(${sortColumn}, ${idColumn}) > (${after.sort}, ${after.id}::uuid)`;
  }

  /**
   * Turns `limit + 1` fetched entities into a page.
   *
   * Fetching one extra row is how "is there a next page" is answered without a
   * second COUNT query; this is the half of that trick that is identical in
   * every module.
   */
  protected toPage<TEntity>(
    fetched: readonly TEntity[],
    limit: number,
    cursorOf: (entity: TEntity) => { sort: string; id: string },
  ): { items: TEntity[]; nextCursor: string | null } {
    const items = fetched.slice(0, limit);
    const last = items[items.length - 1];
    if (fetched.length <= limit || last === undefined) {
      return { items, nextCursor: null };
    }
    const position = cursorOf(last);
    return { items, nextCursor: encodeCursor(position.sort, position.id) };
  }
}

/**
 * Keyset cursor. The format lives here rather than in a module's
 * `contracts.ts` because a cursor *is* a position in an `ORDER BY` — if the
 * ordering changes the cursor changes with it, and the two belong together.
 *
 * Opaque to the client on purpose: base64url JSON, validated on the way back
 * in, so a hand-edited cursor is a 400 rather than a surprising page.
 */
const cursorSchema = z.object({ sort: z.string(), id: z.uuid() });

function encodeCursor(sort: string, id: string): string {
  return Buffer.from(JSON.stringify({ sort, id })).toString('base64url');
}

function decodeCursor(cursor: string): { sort: string; id: string } {
  const parsed = cursorSchema.safeParse(
    safeJson(Buffer.from(cursor, 'base64url').toString('utf8')),
  );
  if (!parsed.success) throw new ValidationFailed('cursor is not a cursor this endpoint issued', {});
  return parsed.data;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
