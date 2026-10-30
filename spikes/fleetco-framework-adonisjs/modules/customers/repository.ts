import { and, asc, eq, gt, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { Database, Exec } from '../../platform/db/client.js';
import * as outbox from '../../platform/outbox/repository.js';
import type { NewOutboxEvent, OutboxEvent } from '../../platform/outbox/repository.js';
import { toCents, toCustomerId, toInstant, toTenantId } from '../../platform/types/branded.js';
import type { Cents, CustomerId, Instant } from '../../platform/types/branded.js';
import { ValidationFailed } from '../../platform/types/errors.js';
import type { Scope } from '../../platform/types/scope.js';
import type { Customer, CustomerPage, CustomerStatus, ListCustomersQuery } from './contracts.js';
import { BILLING_TERMS_NET_DAYS, CUSTOMER_STATUSES } from './contracts.js';
import { customers } from './schema.js';

/**
 * The only place a `customers` query happens, and the only place tenant scope
 * is applied ([[Tenancy Model]] § Authorization Chokepoint).
 *
 * The shape is a factory returning plain closures rather than a class with
 * injected dependencies — deliberately not an AdonisJS container binding.
 * "Dave dislikes DI" from [[Framework Evaluation]] is specifically about
 * containers; this keeps the repository a plain function a unit test can
 * call with fakes, with no `@inject()` and no provider to register. The
 * `fleetco_provider.ts` composition root calls this once; `service.test.ts`
 * never calls it at all and hands the service a fake of the same derived
 * type.
 */

// ---------------------------------------------------------------------------
// The scoping chokepoint
// ---------------------------------------------------------------------------

/**
 * Every query in this file starts from this predicate list. `tenantId` is
 * unconditional; `customerId` narrows to one row when the principal is a
 * portal user.
 *
 * A function returning predicates rather than a comment telling the next
 * author to remember, because the former survives a long context window and
 * the latter does not.
 */
function scoped(scope: Scope): SQL[] {
  const predicates: SQL[] = [eq(customers.tenantId, scope.tenantId)];
  if (scope.customerId !== null) {
    predicates.push(eq(customers.id, scope.customerId));
  }
  return predicates;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/**
 * The database boundary is a parsing boundary: `text` and `bigint` come back as
 * `string` and `number`, and the brands are minted here on the way in.
 * `status` and `billing_terms_net_days` are re-checked against the contract's
 * sets rather than trusted from Drizzle's `$type<>()`, which is a compile-time
 * hint and not a runtime guarantee.
 */
function toCustomer(row: typeof customers.$inferSelect): Customer {
  const status = CUSTOMER_STATUSES.find((known) => known === row.status);
  if (status === undefined) {
    throw new ValidationFailed('customer row has an unknown status', { status: row.status });
  }
  const terms = BILLING_TERMS_NET_DAYS.find((known) => known === row.billingTermsNetDays);
  if (terms === undefined) {
    throw new ValidationFailed('customer row has unknown billing terms', {
      billingTermsNetDays: row.billingTermsNetDays,
    });
  }
  return {
    id: toCustomerId(row.id),
    tenantId: toTenantId(row.tenantId),
    code: row.code,
    name: row.name,
    status,
    creditLimitCents: toCents(row.creditLimitCents),
    defaultLaborRateCents: toCents(row.defaultLaborRateCents),
    billingTermsNetDays: terms,
    isOnCreditHold: row.isOnCreditHold,
    primaryContactEmail: row.primaryContactEmail,
    primaryContactPhone: row.primaryContactPhone,
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  };
}

/** The columns an update may touch. `id`, `tenantId` and `createdAt` are not among them. */
export type CustomerPatch = {
  readonly name: string;
  readonly status: CustomerStatus;
  readonly creditLimitCents: Cents;
  readonly defaultLaborRateCents: Cents;
  readonly billingTermsNetDays: number;
  readonly isOnCreditHold: boolean;
  readonly primaryContactEmail: string | null;
  readonly primaryContactPhone: string | null;
  readonly updatedAt: Instant;
};

// ---------------------------------------------------------------------------
// Keyset pagination
// ---------------------------------------------------------------------------
//
// Keyset rather than OFFSET, ordered by `(name, id)` to match
// `customers_tenant_status_name_idx`. The cursor is opaque to the client so the
// ordering can change without breaking a stored page link.
//
// JSON rather than a delimiter: a fleet called "ACME | WEST" would split a
// delimited cursor in the wrong place, and that is a paging bug that only shows
// up in one tenant's data.

const cursorSchema = z.object({ name: z.string(), id: z.uuid() });

function encodeCursor(customer: Customer): string {
  return Buffer.from(
    JSON.stringify({ name: customer.name, id: customer.id }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(cursor: string): { name: string; id: CustomerId } {
  const decoded = cursorSchema.safeParse(safeJson(Buffer.from(cursor, 'base64url').toString('utf8')));
  if (!decoded.success) {
    throw new ValidationFailed('malformed page cursor', {});
  }
  return { name: decoded.data.name, id: toCustomerId(decoded.data.id) };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reads and writes
// ---------------------------------------------------------------------------

async function findById(exec: Exec, scope: Scope, id: CustomerId): Promise<Customer | null> {
  const rows = await exec
    .select()
    .from(customers)
    .where(and(...scoped(scope), eq(customers.id, id)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toCustomer(row);
}

async function findByCode(exec: Exec, scope: Scope, code: string): Promise<Customer | null> {
  const rows = await exec
    .select()
    .from(customers)
    .where(and(...scoped(scope), eq(customers.code, code)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toCustomer(row);
}

/**
 * `SELECT … FOR UPDATE`, so the status a transition was validated against is
 * the status being written over. Only reachable inside a transaction, which is
 * what the `CustomerTx` shape enforces.
 */
async function findByIdForUpdate(
  exec: Exec,
  scope: Scope,
  id: CustomerId,
): Promise<Customer | null> {
  const rows = await exec
    .select()
    .from(customers)
    .where(and(...scoped(scope), eq(customers.id, id)))
    .limit(1)
    .for('update');
  const row = rows[0];
  return row === undefined ? null : toCustomer(row);
}

async function list(exec: Exec, scope: Scope, query: ListCustomersQuery): Promise<CustomerPage> {
  const predicates: SQL[] = scoped(scope);
  if (query.status !== undefined) {
    predicates.push(eq(customers.status, query.status));
  }
  if (query.search !== undefined) {
    const pattern = `%${query.search}%`;
    const match = or(ilike(customers.code, pattern), ilike(customers.name, pattern));
    if (match !== undefined) predicates.push(match);
  }
  if (query.cursor !== undefined) {
    const after = decodeCursor(query.cursor);
    // Row-value comparison is the point of keyset paging: one predicate, one
    // index scan, and no OFFSET drift when a row is inserted mid-page.
    predicates.push(
      gt(sql`(${customers.name}, ${customers.id})`, sql`(${after.name}, ${after.id}::uuid)`),
    );
  }

  // One row beyond the page, so the next cursor is decided without a second
  // count query.
  const rows = await exec
    .select()
    .from(customers)
    .where(and(...predicates))
    .orderBy(asc(customers.name), asc(customers.id))
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit).map(toCustomer);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last) : null,
  };
}

/**
 * `tenant_id` is written from the `Scope`, never from the value handed in, so a
 * service that built a customer with the wrong tenant cannot persist it.
 */
async function insert(exec: Exec, scope: Scope, customer: Customer): Promise<void> {
  await exec.insert(customers).values({
    id: customer.id,
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
  });
}

async function update(
  exec: Exec,
  scope: Scope,
  id: CustomerId,
  patch: CustomerPatch,
): Promise<Customer | null> {
  const terms = BILLING_TERMS_NET_DAYS.find((known) => known === patch.billingTermsNetDays);
  if (terms === undefined) {
    throw new ValidationFailed('unknown billing terms', {
      billingTermsNetDays: patch.billingTermsNetDays,
    });
  }
  const rows = await exec
    .update(customers)
    .set({
      name: patch.name,
      status: patch.status,
      creditLimitCents: patch.creditLimitCents,
      defaultLaborRateCents: patch.defaultLaborRateCents,
      billingTermsNetDays: terms,
      isOnCreditHold: patch.isOnCreditHold,
      primaryContactEmail: patch.primaryContactEmail,
      primaryContactPhone: patch.primaryContactPhone,
      updatedAt: new Date(patch.updatedAt),
    })
    .where(and(...scoped(scope), eq(customers.id, id)))
    .returning();
  const row = rows[0];
  return row === undefined ? null : toCustomer(row);
}

/** Enumerates the module's tables for the `tenant_id`-on-every-table CI gate. */
export const CUSTOMER_TABLES = ['customers.customers'] as const;

// ---------------------------------------------------------------------------
// The store the service depends on
// ---------------------------------------------------------------------------

/**
 * Binds the functions above to a database handle and hides `Exec` from the
 * service, which is what lets `service.test.ts` run with no database and no
 * mocking library: the fake is an object literal of the same derived type.
 *
 * `inTransaction` hands back a second, smaller store. The write path and the
 * outbox append are reachable only through it, so "state change and outbox row
 * in ONE transaction" is a property of the types rather than of a reviewer
 * noticing ([[Realtime and Events]]: "Atomicity is the whole point").
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the return type IS this function's inferred shape; `CustomerTx` below derives from it, so annotating it would be circular.
function transactionalStore(exec: Exec) {
  return {
    findByIdForUpdate: (scope: Scope, id: CustomerId): Promise<Customer | null> =>
      findByIdForUpdate(exec, scope, id),
    insert: (scope: Scope, customer: Customer): Promise<void> => insert(exec, scope, customer),
    update: (scope: Scope, id: CustomerId, patch: CustomerPatch): Promise<Customer | null> =>
      update(exec, scope, id, patch),
    appendEvent: (event: NewOutboxEvent): Promise<void> => outbox.append(exec, event),
  } as const;
}

export type CustomerTx = ReturnType<typeof transactionalStore>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- as above: `CustomerStore` is `ReturnType<typeof createCustomerStore>`.
export function createCustomerStore(database: Database) {
  const exec = database.drizzle;
  return {
    findById: (scope: Scope, id: CustomerId): Promise<Customer | null> => findById(exec, scope, id),
    findByCode: (scope: Scope, code: string): Promise<Customer | null> =>
      findByCode(exec, scope, code),
    list: (scope: Scope, query: ListCustomersQuery): Promise<CustomerPage> =>
      list(exec, scope, query),

    /** The SSE replay reads, scoped identically to the REST reads. */
    currentCursor: (scope: Scope, topic: string): Promise<number> =>
      outbox.currentCursor(exec, scope, topic),
    readTopicSince: (
      scope: Scope,
      topic: string,
      afterId: number,
      limit: number,
    ): Promise<OutboxEvent[]> => outbox.readTopicSince(exec, scope, topic, afterId, limit),

    inTransaction: <T>(work: (tx: CustomerTx) => Promise<T>): Promise<T> =>
      database.drizzle.transaction((tx) => work(transactionalStore(tx))),
  } as const;
}

export type CustomerStore = ReturnType<typeof createCustomerStore>;
