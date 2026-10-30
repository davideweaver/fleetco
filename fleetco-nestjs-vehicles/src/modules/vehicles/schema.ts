import { sql } from 'drizzle-orm';
import type { VehicleClass, VehicleStatus } from './contracts';
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
 * `vehicles.*`, not `public.*` — [[Evolution Path]] rule 1. The schema boundary
 * is a greppable reminder of where the module line is.
 *
 * The interesting column is `customer_id`. [[Evolution Path]] rule 2 keeps the
 * *foreign key* across schemas and bans the *query* — "Keep foreign keys across
 * schemas at the database level. Restrict query access in application code."
 * So the FK is declared in the migration (Drizzle cannot express a reference to
 * a table it is forbidden from importing here) and the repository never joins.
 */
export const vehiclesSchema = pgSchema('vehicles');

export const vehicles = vehiclesSchema.table(
  'vehicles',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),

    /** The owning fleet. FK to `customers.customers(id)`, declared in the migration. */
    customerId: uuid('customer_id').notNull(),

    unitNumber: text('unit_number').notNull(),
    vin: text('vin').notNull(),
    make: text('make').notNull(),
    model: text('model').notNull(),
    modelYear: integer('model_year').notNull(),
    vehicleClass: text('vehicle_class').$type<VehicleClass>().notNull(),
    status: text('status').$type<VehicleStatus>().notNull(),

    /**
     * `bigint` rather than `integer` for the same reason money is: the ceiling
     * is a business rule, not a storage limit, and an overflow here would be
     * silent. Read back as a JS number.
     */
    odometerMiles: bigint('odometer_miles', { mode: 'number' }).notNull(),

    lastServicedAt: timestamp('last_serviced_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    /**
     * Unit numbers are unique *within a fleet*, not within a tenant. Two
     * customers both numbering a truck `101` is normal, and a tenant-wide
     * unique index would reject the second one.
     */
    uniqueIndex('vehicles_customer_unit_key').on(table.tenantId, table.customerId, table.unitNumber),

    /**
     * VIN is unique per tenant. Globally unique in the real world, but scoping
     * it to the tenant is the safe choice: a cross-tenant unique index would
     * let one shop's data cause an insert failure in another's, which is an
     * information leak through an error message.
     */
    uniqueIndex('vehicles_tenant_vin_key').on(table.tenantId, table.vin),

    index('vehicles_tenant_customer_unit_idx').on(
      table.tenantId,
      table.customerId,
      table.unitNumber,
      table.id,
    ),
    index('vehicles_tenant_unit_idx').on(table.tenantId, table.unitNumber, table.id),

    // Constraints are emphatically not business logic (ADR-011) and are used
    // aggressively. These restate the service's rules where a bad migration or
    // a hand-run UPDATE cannot get around them.
    check('vehicles_status_known', sql`${table.status} IN ('out_of_service', 'active', 'retired')`),
    check(
      'vehicles_class_known',
      sql`${table.vehicleClass} IN ('light_duty', 'medium_duty', 'heavy_duty', 'trailer')`,
    ),
    check('vehicles_vin_shape', sql`${table.vin} ~ '^[A-HJ-NPR-Z0-9]{17}$'`),
    check('vehicles_unit_not_blank', sql`length(btrim(${table.unitNumber})) > 0`),
    check('vehicles_model_year_sane', sql`${table.modelYear} BETWEEN 1900 AND 2100`),
    check('vehicles_odometer_non_negative', sql`${table.odometerMiles} >= 0`),
  ],
);

export type VehicleRow = typeof vehicles.$inferSelect;
export type NewVehicleRow = typeof vehicles.$inferInsert;
