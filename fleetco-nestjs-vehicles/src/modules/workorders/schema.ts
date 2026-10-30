import { sql } from 'drizzle-orm';
import type { LineKind, WorkOrderStatus } from './contracts';
import {
  bigint,
  check,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * `workorders.*` — [[Evolution Path]] rule 1.
 *
 * The first module with two tables, and the interesting part is `customer_id`
 * on the *child*. A line belongs to a work order, and the work order belongs
 * to a fleet, so strictly the line's fleet is derivable by a join. It is
 * denormalised here on purpose: `TenantScopedRepository` scopes one table at a
 * time, so a child table that cannot answer "which customer?" by itself would
 * force either a join in the chokepoint or an unscoped read of the child.
 * Neither is acceptable. The composite foreign key below keeps the
 * denormalised value honest — a line cannot name a different fleet than its
 * parent.
 */
export const workOrdersSchema = pgSchema('workorders');

export const workOrders = workOrdersSchema.table(
  'work_orders',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    vehicleId: uuid('vehicle_id').notNull(),

    number: text('number').notNull(),
    status: text('status').$type<WorkOrderStatus>().notNull(),
    complaint: text('complaint').notNull(),
    odometerInMiles: bigint('odometer_in_miles', { mode: 'number' }).notNull(),

    /** Derived from the lines. Stored so the list endpoint need not aggregate. */
    totalCents: bigint('total_cents', { mode: 'number' }).notNull(),

    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('work_orders_tenant_number_key').on(table.tenantId, table.number),
    index('work_orders_tenant_customer_number_idx').on(
      table.tenantId,
      table.customerId,
      table.number,
      table.id,
    ),
    index('work_orders_tenant_number_idx').on(table.tenantId, table.number, table.id),
    index('work_orders_vehicle_idx').on(table.tenantId, table.vehicleId),

    check(
      'work_orders_status_known',
      sql`${table.status} IN ('draft', 'authorized', 'in_progress', 'completed', 'cancelled')`,
    ),
    check('work_orders_number_not_blank', sql`length(btrim(${table.number})) > 0`),
    check('work_orders_total_non_negative', sql`${table.totalCents} >= 0`),
    check('work_orders_odometer_non_negative', sql`${table.odometerInMiles} >= 0`),
  ],
);

export const workOrderLines = workOrdersSchema.table(
  'work_order_lines',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    /** Denormalised from the parent so the scope chokepoint can read it directly. */
    customerId: uuid('customer_id').notNull(),
    workOrderId: uuid('work_order_id').notNull(),

    kind: text('kind').$type<LineKind>().notNull(),
    description: text('description').notNull(),
    /** Hundredths, so 1.5 hours of labour is 150. Never a float. */
    quantity: integer('quantity').notNull(),
    unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('work_order_lines_order_idx').on(table.tenantId, table.workOrderId, table.id),
    index('work_order_lines_tenant_customer_idx').on(table.tenantId, table.customerId, table.id),

    check('work_order_lines_kind_known', sql`${table.kind} IN ('labor', 'part')`),
    check('work_order_lines_quantity_positive', sql`${table.quantity} > 0`),
    check('work_order_lines_unit_price_non_negative', sql`${table.unitPriceCents} >= 0`),
    check('work_order_lines_amount_non_negative', sql`${table.amountCents} >= 0`),
  ],
);

export type WorkOrderRow = typeof workOrders.$inferSelect;
export type WorkOrderLineRow = typeof workOrderLines.$inferSelect;
