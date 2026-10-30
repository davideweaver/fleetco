import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { BillingTermsNetDays, CustomerStatus } from './contracts.js';

/**
 * `customers.*`, not `public.*` — [[Evolution Path]] rule 1. The Postgres
 * schema boundary is a greppable reminder of where the module line is.
 *
 * Every column choice is driven by a rule rather than by taste:
 *
 *  - `id` is a UUIDv7 minted in the application, never by the database, so an
 *    id exists before the insert ([[Tenancy Model]] non-negotiable 6).
 *  - `tenant_id` is here because every domain table carries it
 *    (non-negotiable 1). There is no `customer_id` column: a customer *is*
 *    the customer scope.
 *  - money is `bigint` minor units read back as a JS number and branded
 *    `Cents`. Never `numeric`, never a float.
 *  - timestamps are `timestamptz`. Rendering in shop-local is presentation.
 */
export const customersSchema = pgSchema('customers');

export const customers = customersSchema.table(
  'customers',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),

    /** The shop's short code for the fleet, e.g. `ACME`. Unique within a tenant. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    status: text('status').$type<CustomerStatus>().notNull(),

    creditLimitCents: bigint('credit_limit_cents', { mode: 'number' }).notNull(),
    defaultLaborRateCents: bigint('default_labor_rate_cents', { mode: 'number' }).notNull(),
    billingTermsNetDays: integer('billing_terms_net_days')
      .$type<BillingTermsNetDays>()
      .notNull(),

    isOnCreditHold: boolean('is_on_credit_hold').notNull().default(false),

    primaryContactEmail: text('primary_contact_email'),
    primaryContactPhone: text('primary_contact_phone'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Tenant-scoped uniqueness. A global unique index on `code` would make one
    // tenant's codes collide with another's, which is a cross-tenant defect
    // dressed up as a constraint.
    uniqueIndex('customers_tenant_code_key').on(table.tenantId, table.code),
    index('customers_tenant_status_name_idx').on(
      table.tenantId,
      table.status,
      table.name,
      table.id,
    ),

    // Constraints are emphatically not business logic (ADR-011) and the
    // migration playbook says to use them aggressively. These restate the
    // service's rules where a bad migration or a hand-run UPDATE cannot get
    // around them.
    check('customers_status_known', sql`${table.status} in ('prospect', 'active', 'inactive')`),
    check('customers_code_upper', sql`${table.code} = upper(${table.code})`),
    check('customers_code_not_blank', sql`length(btrim(${table.code})) > 0`),
    check('customers_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('customers_credit_limit_non_negative', sql`${table.creditLimitCents} >= 0`),
    check('customers_labor_rate_positive', sql`${table.defaultLaborRateCents} > 0`),
    check(
      'customers_billing_terms_known',
      sql`${table.billingTermsNetDays} in (0, 15, 30, 45, 60)`,
    ),
  ],
);

export type CustomerRow = typeof customers.$inferSelect;
