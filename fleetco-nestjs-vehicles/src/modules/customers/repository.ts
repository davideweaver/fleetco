import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { DB } from '../../platform/db/db.module';
import { TenantScopedRepository } from '../../platform/db/tenant-scoped-repository';
import type { Db, Tx } from '../../platform/db/client';
import { toCents, toCustomerId, toInstant, toTenantId } from '../../platform/types/branded';
import type { CustomerId, Instant } from '../../platform/types/branded';
import type { Scope } from '../../platform/types/scope';
import type {
  BillingTermsNetDays,
  Customer,
  CustomerPage,
  CustomerStatus,
  ListCustomersQuery,
} from './contracts';
import { customers } from './schema';
import type { CustomerRow } from './schema';

/**
 * The ONLY place a `customers.*` query is written. Enforced at tier 2 by the
 * `no-restricted-syntax` lint rule that bans Drizzle query builders outside
 * `**\/repository.ts`.
 *
 * Every public method takes a `Scope` or a `Tx`, and every query runs through
 * `this.scopedWhere(scope)`. That is [[Tenancy Model]] non-negotiable 2: "a
 * repository or query-builder wrapper that *cannot* produce an unscoped
 * query." There is no method here that omits it, and `Scope` can only be
 * obtained from an authenticated `Principal` via `scopeOf`.
 */

/**
 * What an update writes: every mutable column, not a sparse patch.
 *
 * The service computes the whole next value from the current one
 * (`applyPatch`, pure) and hands it here. That makes the write idempotent,
 * removes the "absent vs. null" ambiguity that sparse patches carry, and keeps
 * the only place that decides what a field becomes in the layer that holds the
 * business rules.
 */
export type CustomerPatch = {
  readonly name: string;
  readonly status: CustomerStatus;
  readonly creditLimitCents: number;
  readonly defaultLaborRateCents: number;
  readonly billingTermsNetDays: BillingTermsNetDays;
  readonly isOnCreditHold: boolean;
  readonly primaryContactEmail: string | null;
  readonly primaryContactPhone: string | null;
  readonly updatedAt: Instant;
};

@Injectable()
export class CustomersRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Db) {
    super(db);
  }

  /**
   * A portal principal is pinned to the customer row itself — for this table
   * the customer *is* the scope. Compare `vehicles`, where the same concept
   * is a foreign key.
   */
  protected readonly tenantColumn = customers.tenantId;
  protected readonly scopeColumn = customers.id;

  async findById(scope: Scope, id: CustomerId): Promise<Customer | null> {
    const rows = await this.db
      .select()
      .from(customers)
      .where(and(...this.scopedWhere(scope), eq(customers.id, id)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toCustomer(row);
  }

  /** Used for the per-tenant code uniqueness rule. Scoped like everything else. */
  async findByCode(scope: Scope, code: string): Promise<Customer | null> {
    const rows = await this.db
      .select()
      .from(customers)
      .where(and(...this.scopedWhere(scope), eq(customers.code, code)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toCustomer(row);
  }

  /**
   * Keyset pagination over `(name, id)`. One extra row is fetched to decide
   * whether a next page exists, rather than issuing a second COUNT query.
   */
  async list(scope: Scope, query: ListCustomersQuery): Promise<CustomerPage> {
    const predicates: SQL[] = [...this.scopedWhere(scope)];

    if (query.status !== undefined) {
      predicates.push(eq(customers.status, query.status));
    }
    if (query.search !== undefined) {
      const pattern = `%${query.search}%`;
      const match = or(ilike(customers.code, pattern), ilike(customers.name, pattern));
      if (match !== undefined) predicates.push(match);
    }
    if (query.cursor !== undefined) {
      predicates.push(this.keysetAfter(customers.name, customers.id, query.cursor));
    }

    const rows = await this.db
      .select()
      .from(customers)
      .where(and(...predicates))
      .orderBy(asc(customers.name), asc(customers.id))
      .limit(query.limit + 1);

    return this.toPage(rows.map(toCustomer), query.limit, (customer) => ({
      sort: customer.name,
      id: customer.id,
    }));
  }

  /**
   * Takes a `Tx`, not the pool, because a create always writes an outbox row
   * in the same transaction. The signature is what prevents a caller from
   * skipping that.
   *
   * The row carries `tenantId` from the `Customer` the service built, which
   * the service in turn took from the `Scope`. There is no path by which a
   * caller supplies a tenant id of its own.
   */
  async insert(tx: Tx, customer: Customer): Promise<void> {
    await tx.insert(customers).values({
      id: customer.id,
      tenantId: customer.tenantId,
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

  /**
   * Returns `null` when the scope does not reach the row, which is the same
   * answer as "does not exist". A portal user probing another customer's id
   * learns nothing from the response.
   */
  async update(tx: Tx, scope: Scope, id: CustomerId, patch: CustomerPatch): Promise<Customer | null> {
    const rows = await tx
      .update(customers)
      .set({
        ...patch,
        updatedAt: new Date(patch.updatedAt),
      })
      .where(and(...this.scopedWhere(scope), eq(customers.id, id)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toCustomer(row);
  }

  /**
   * Reads a row inside an open transaction. Used by the service to re-read
   * the row it is about to change under the transaction's snapshot, so the
   * status transition it validated is the status it writes against.
   */
  async findByIdForUpdate(tx: Tx, scope: Scope, id: CustomerId): Promise<Customer | null> {
    const rows = await tx
      .select()
      .from(customers)
      .where(and(...this.scopedWhere(scope), eq(customers.id, id)))
      .limit(1)
      .for('update');
    const row = rows[0];
    return row === undefined ? null : toCustomer(row);
  }

}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: toCustomerId(row.id),
    tenantId: toTenantId(row.tenantId),
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
