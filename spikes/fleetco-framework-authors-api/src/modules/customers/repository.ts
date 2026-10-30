import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../lib/db/handle.js';
import {
  appendEvent,
  readScopedEvents,
  type NewOutboxEvent,
  type OutboxEvent,
} from '../../lib/outbox/repository.js';
import {
  customerIdFromDb,
  tenantIdFromDb,
  toCents,
  toInstant,
  type CustomerId,
  type Instant,
} from '../../lib/types/branded.js';
import type { Scope } from '../../lib/types/scope.js';
import type { Customer, CustomerPage, ListCustomersQuery } from './contracts.js';
import { CUSTOMER_EVENT_NAMES } from './events.js';
import { customers, type CustomerRow } from './schema.js';

/**
 * The fields an update may change, in domain terms.
 *
 * Deliberately *not* `Partial<CustomerRow>`, which is what the first version of
 * this file used. A Drizzle row type in a service signature means the service
 * imports `schema.ts`, which the lint rule forbids and which is right to
 * forbid: the service was then handling `Date` objects and column types instead
 * of `Instant` and branded values. The mapping to columns belongs here, where
 * the columns are.
 */
export type CustomerPatch = Partial<
  Pick<
    Customer,
    | 'name'
    | 'status'
    | 'creditLimitCents'
    | 'defaultLaborRateCents'
    | 'billingTermsNetDays'
    | 'isOnCreditHold'
    | 'primaryContactEmail'
    | 'primaryContactPhone'
  >
> & { readonly updatedAt: Instant };

/**
 * **The only place a customers query exists.**
 *
 * [[Tenancy Model]] non-negotiable 2: "tenant scope applied at a single
 * chokepoint in the data layer, not hand-written per query. A repository or
 * query-builder wrapper that *cannot* produce an unscoped query."
 *
 * Three things together make that true here rather than merely intended:
 *
 *  1. Every method takes a `Scope`, so a query without one does not compile.
 *  2. `tenantScope()` is the first argument of every `and(...)` below, and it
 *     adds the customer predicate as well when the caller is a portal user.
 *     Reads and writes alike — a scoped `UPDATE ... WHERE` is the only way a
 *     row gets changed.
 *  3. Lint forbids importing Drizzle or `pg` anywhere but a `repository.ts` or
 *     a `schema.ts`, so there is no second path to the table.
 *
 * A factory rather than a class, and rather than free functions each taking
 * `db`. [[Framework Evaluation]] lists `authors-api`'s inline-instantiated
 * class data sources as **open, settle in the spike**; NOTES.md section 1
 * records why this went the other way. The short version: the service's test
 * double is then a plain object literal that the compiler checks against
 * `CustomersRepository`, with no class to subclass and no mocking framework.
 */
/* eslint-disable-next-line @typescript-eslint/explicit-function-return-type --
 * The return type is deliberately inferred: `CustomersRepository` below is
 * `ReturnType<typeof this>`, which is what keeps the service's test double
 * checked against the real shape without a hand-written interface that would
 * have exactly one implementation. Annotating it here would mean maintaining
 * that interface after all. */
export function createCustomersRepository(db: Database) {
  return {
    async findById(scope: Scope, id: CustomerId): Promise<Customer | null> {
      const [row] = await db
        .select()
        .from(customers)
        .where(and(tenantScope(scope), eq(customers.id, id)))
        .limit(1);

      return row ? toCustomer(row) : null;
    },

    /**
     * Keyset pagination on `(name, id)`. Not `OFFSET`: a shop paging through
     * customers while another user adds one gets a skipped or a repeated row,
     * and the index on `(tenant_id, status, name, id)` makes the keyset
     * comparison a range scan.
     */
    async list(scope: Scope, query: ListCustomersQuery): Promise<CustomerPage> {
      const after = query.cursor === undefined ? null : decodeCursor(query.cursor);

      const rows = await db
        .select()
        .from(customers)
        .where(
          and(
            tenantScope(scope),
            query.status === undefined ? undefined : eq(customers.status, query.status),
            query.search === undefined
              ? undefined
              : or(
                  ilike(customers.code, `%${query.search}%`),
                  ilike(customers.name, `%${query.search}%`),
                ),
            after === null
              ? undefined
              : sql`(${customers.name}, ${customers.id}) > (${after.name}, ${after.id}::uuid)`,
          ),
        )
        .orderBy(asc(customers.name), asc(customers.id))
        // One more than asked for, to learn whether another page exists without
        // a second COUNT over the same predicate.
        .limit(query.limit + 1);

      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      const nextCursor = rows.length > query.limit && last ? encodeCursor(last.name, last.id) : null;

      return { items: page.map(toCustomer), nextCursor };
    },

    /**
     * Insert the row and its outbox event in one transaction. ADR-009: "state
     * change + outbox row, ONE transaction. Atomicity is the whole point." The
     * `appendEvent` signature accepts a `Transaction` and nothing else, so that
     * is enforced by the type rather than by this comment.
     */
    async insert(scope: Scope, customer: Customer, event: NewOutboxEvent): Promise<Customer> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(customers)
          .values({
            id: customer.id,
            // From the scope, never from the request body. A tenant id that
            // arrives in a payload is a cross-tenant write waiting to happen.
            tenantId: scope.tenantId,
            code: customer.code,
            name: customer.name,
            status: customer.status,
            creditLimitCents: customer.creditLimitCents,
            defaultLaborRateCents: customer.defaultLaborRateCents,
            billingTermsNetDays: customer.billingTermsNetDays,
            isOnCreditHold: customer.isOnCreditHold,
            primaryContactEmail: customer.primaryContactEmail,
            primaryContactPhone: customer.primaryContactPhone,
            createdAt: new Date(customer.createdAt),
            updatedAt: new Date(customer.updatedAt),
          })
          .returning();

        if (!row) {
          throw new Error('customer insert returned no row');
        }

        await appendEvent(tx, event);
        return toCustomer(row);
      });
    },

    /**
     * Apply an already-decided change.
     *
     * The service computed `values` and chose `event` from the row it read, so
     * this method guards that read with `updated_at = expectedUpdatedAt`. Zero
     * rows affected means somebody else changed the customer in between, and
     * the caller turns that into a `Conflict` rather than silently applying a
     * decision made against stale state.
     *
     * The alternative shapes were a `SELECT ... FOR UPDATE` held across the
     * service call, which puts a lock's lifetime in the business layer, or a
     * callback passed down into the transaction, which puts business logic in
     * the repository. A version predicate costs one column we already had.
     */
    async applyUpdate(
      scope: Scope,
      id: CustomerId,
      expectedUpdatedAt: Instant,
      patch: CustomerPatch,
      event: NewOutboxEvent,
    ): Promise<Customer | null> {
      const { updatedAt, ...fields } = patch;

      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(customers)
          // The one place a domain `Instant` becomes a `timestamptz` value. The
          // remaining field names are identical on both sides by design, so
          // there is no mapping table to fall out of step.
          .set({ ...fields, updatedAt: new Date(updatedAt) })
          .where(
            and(
              tenantScope(scope),
              eq(customers.id, id),
              eq(customers.updatedAt, new Date(expectedUpdatedAt)),
            ),
          )
          .returning();

        if (!row) {
          return null;
        }

        await appendEvent(tx, event);
        return toCustomer(row);
      });
    },

    /**
     * The module's slice of the outbox, for the SSE endpoint.
     *
     * Here rather than called straight from the route for two reasons: this
     * file is the module's only database-facing surface, and the event-name
     * filter belongs to the module that owns the vocabulary. Replay and live
     * push both call it, which is what makes "subscription authorization and
     * request authorization call the same code" literally true.
     */
    async listEvents(scope: Scope, afterId: number, limit: number): Promise<OutboxEvent[]> {
      return readScopedEvents(db, scope, { names: CUSTOMER_EVENT_NAMES, afterId, limit });
    },
  };
}

export type CustomersRepository = ReturnType<typeof createCustomersRepository>;

/**
 * The scope predicate. Both halves are unconditional: the tenant always, and
 * the customer whenever the principal is a portal user. A tenant-wide scope
 * omits the second clause because `customerId` is null, which is the only
 * difference between shop staff and a portal login at this layer.
 */
function tenantScope(scope: Scope): SQL | undefined {
  return scope.customerId === null
    ? eq(customers.tenantId, scope.tenantId)
    : and(eq(customers.tenantId, scope.tenantId), eq(customers.id, scope.customerId));
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: customerIdFromDb(row.id),
    tenantId: tenantIdFromDb(row.tenantId),
    code: row.code,
    name: row.name,
    status: row.status,
    creditLimitCents: toCents(row.creditLimitCents),
    defaultLaborRateCents: toCents(row.defaultLaborRateCents),
    billingTermsNetDays: row.billingTermsNetDays,
    isOnCreditHold: row.isOnCreditHold,
    primaryContactEmail: row.primaryContactEmail,
    primaryContactPhone: row.primaryContactPhone,
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  };
}

/**
 * The cursor is opaque to the client and decoded only here, because it is a
 * statement about this query's sort order and nothing else. A client that
 * learns to construct one has learned an implementation detail it will be
 * broken by.
 *
 * A space separates the two parts and `lastIndexOf` finds it, because a
 * customer name may contain spaces and a UUID may not.
 */
function encodeCursor(name: string, id: string): string {
  return Buffer.from(`${name} ${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { name: string; id: string } | null {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.lastIndexOf(' ');
  if (separator === -1) {
    return null;
  }
  return { name: decoded.slice(0, separator), id: decoded.slice(separator + 1) };
}
