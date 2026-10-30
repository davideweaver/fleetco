import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { DB } from '../../platform/db/db.module';
import { TenantScopedRepository } from '../../platform/db/tenant-scoped-repository';
import type { Db, Tx } from '../../platform/db/client';
import { toCustomerId, toInstant, toTenantId, toVehicleId } from '../../platform/types/branded';
import type { CustomerId, Instant, VehicleId } from '../../platform/types/branded';
import type { Scope } from '../../platform/types/scope';
import type {
  ListVehiclesQuery,
  Vehicle,
  VehicleClass,
  VehiclePage,
  VehicleStatus,
} from './contracts';
import { vehicles } from './schema';
import type { VehicleRow } from './schema';

/**
 * The ONLY place a `vehicles.*` query is written. Enforced at tier 2 by the
 * `no-restricted-syntax` lint rule that bans Drizzle query builders outside
 * `**\/repository.ts`.
 *
 * Note what is absent: any join to `customers.customers`. A vehicle carries a
 * `customer_id` and the database enforces the reference, but this file never
 * reads the parent row — [[Evolution Path]] rule 2. When the service needs to
 * know something about the owning fleet it asks `CustomersService`.
 */

/**
 * What an update writes: every mutable column, not a sparse patch.
 *
 * The service computes the whole next value from the current one (`applyPatch`,
 * pure) and hands it here. `customerId` is not in this type — a vehicle does
 * not change hands by field assignment.
 */
export type VehiclePatch = {
  readonly unitNumber: string;
  readonly make: string;
  readonly model: string;
  readonly modelYear: number;
  readonly vehicleClass: VehicleClass;
  readonly status: VehicleStatus;
  readonly odometerMiles: number;
  readonly lastServicedAt: Instant | null;
  readonly updatedAt: Instant;
};

@Injectable()
export class VehiclesRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Db) {
    super(db);
  }

  /**
   * The line module one could not have written. A portal principal is pinned
   * to a *customer*, and a vehicle is not a customer — so the scope narrows on
   * the foreign key, not on the primary key. Copying the customers repository
   * here would have shown portal users an empty fleet.
   */
  protected readonly tenantColumn = vehicles.tenantId;
  protected readonly scopeColumn = vehicles.customerId;

  async findById(scope: Scope, id: VehicleId): Promise<Vehicle | null> {
    const rows = await this.db
      .select()
      .from(vehicles)
      .where(and(...this.scopedWhere(scope), eq(vehicles.id, id)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toVehicle(row);
  }

  /** Used for the per-fleet unit-number uniqueness rule. Scoped like everything else. */
  async findByUnitNumber(
    scope: Scope,
    customerId: CustomerId,
    unitNumber: string,
  ): Promise<Vehicle | null> {
    const rows = await this.db
      .select()
      .from(vehicles)
      .where(
        and(
          ...this.scopedWhere(scope),
          eq(vehicles.customerId, customerId),
          eq(vehicles.unitNumber, unitNumber),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toVehicle(row);
  }

  /** Used for the per-tenant VIN uniqueness rule. */
  async findByVin(scope: Scope, vin: string): Promise<Vehicle | null> {
    const rows = await this.db
      .select()
      .from(vehicles)
      .where(and(...this.scopedWhere(scope), eq(vehicles.vin, vin)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toVehicle(row);
  }

  /**
   * Keyset pagination over `(unit_number, id)`. One extra row is fetched to
   * decide whether a next page exists, rather than issuing a second COUNT.
   */
  async list(scope: Scope, query: ListVehiclesQuery): Promise<VehiclePage> {
    const predicates: SQL[] = [...this.scopedWhere(scope)];

    if (query.customerId !== undefined) {
      predicates.push(eq(vehicles.customerId, query.customerId));
    }
    if (query.status !== undefined) {
      predicates.push(eq(vehicles.status, query.status));
    }
    if (query.vehicleClass !== undefined) {
      predicates.push(eq(vehicles.vehicleClass, query.vehicleClass));
    }
    if (query.search !== undefined) {
      const pattern = `%${query.search}%`;
      const match = or(ilike(vehicles.unitNumber, pattern), ilike(vehicles.vin, pattern));
      if (match !== undefined) predicates.push(match);
    }
    if (query.cursor !== undefined) {
      predicates.push(this.keysetAfter(vehicles.unitNumber, vehicles.id, query.cursor));
    }

    const rows = await this.db
      .select()
      .from(vehicles)
      .where(and(...predicates))
      .orderBy(asc(vehicles.unitNumber), asc(vehicles.id))
      .limit(query.limit + 1);

    return this.toPage(rows.map(toVehicle), query.limit, (vehicle) => ({
      sort: vehicle.unitNumber,
      id: vehicle.id,
    }));
  }

  /**
   * Takes a `Tx`, not the pool, because a create always writes an outbox row in
   * the same transaction. The signature is what prevents a caller skipping it.
   *
   * The row carries `tenantId` from the `Vehicle` the service built, which the
   * service took from the `Scope`. There is no path by which a caller supplies
   * a tenant id of its own.
   */
  async insert(tx: Tx, vehicle: Vehicle): Promise<void> {
    await tx.insert(vehicles).values({
      id: vehicle.id,
      tenantId: vehicle.tenantId,
      customerId: vehicle.customerId,
      unitNumber: vehicle.unitNumber,
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      modelYear: vehicle.modelYear,
      vehicleClass: vehicle.vehicleClass,
      status: vehicle.status,
      odometerMiles: vehicle.odometerMiles,
      lastServicedAt: vehicle.lastServicedAt === null ? null : new Date(vehicle.lastServicedAt),
      createdAt: new Date(vehicle.createdAt),
      updatedAt: new Date(vehicle.updatedAt),
    });
  }

  /**
   * Returns `null` when the scope does not reach the row, which is the same
   * answer as "does not exist". A portal user probing another fleet's vehicle
   * id learns nothing from the response.
   */
  async update(tx: Tx, scope: Scope, id: VehicleId, patch: VehiclePatch): Promise<Vehicle | null> {
    const rows = await tx
      .update(vehicles)
      .set({
        ...patch,
        lastServicedAt: patch.lastServicedAt === null ? null : new Date(patch.lastServicedAt),
        updatedAt: new Date(patch.updatedAt),
      })
      .where(and(...this.scopedWhere(scope), eq(vehicles.id, id)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toVehicle(row);
  }

  /**
   * Reads a row inside an open transaction, so the status and odometer the
   * transition was validated against are the values being written over.
   */
  async findByIdForUpdate(tx: Tx, scope: Scope, id: VehicleId): Promise<Vehicle | null> {
    const rows = await tx
      .select()
      .from(vehicles)
      .where(and(...this.scopedWhere(scope), eq(vehicles.id, id)))
      .limit(1)
      .for('update');
    const row = rows[0];
    return row === undefined ? null : toVehicle(row);
  }

}

function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: toVehicleId(row.id),
    tenantId: toTenantId(row.tenantId),
    customerId: toCustomerId(row.customerId),
    unitNumber: row.unitNumber,
    vin: row.vin,
    make: row.make,
    model: row.model,
    modelYear: row.modelYear,
    vehicleClass: row.vehicleClass,
    status: row.status,
    odometerMiles: row.odometerMiles,
    lastServicedAt: row.lastServicedAt === null ? null : toInstant(row.lastServicedAt),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  };
}
