import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { drainOutbox, resetData, wire } from '../../../platform/test/harness';
import type { Wiring } from '../../../platform/test/harness';
import {
  makeCreateCustomer,
  makeCreateVehicle,
  makePortalPrincipal,
  makeStaffPrincipal,
  makeTenant,
} from '../../../platform/test/factories';
import { newCustomerId, newVehicleId } from '../../../platform/types/branded';
import type { CustomerId, TenantId } from '../../../platform/types/branded';
import { BusinessRuleViolated, Conflict, NotFound } from '../../../platform/types/errors';
import { scopeOf } from '../../../platform/types/scope';
import type { Principal } from '../../../platform/types/principal';
import type { Customer } from '../../customers';
import { vehicleTopic } from '../events';

/**
 * Integration layer, against real Postgres in a container.
 *
 * This file carries the assertions that only module two can make: that the
 * cross-module reference is enforced in the database and not merely in the
 * service, and that the module-to-module call path is the thing providing
 * tenant isolation for the foreign key.
 *
 * Setup is still `wire()` — now five `new` expressions instead of four. No
 * `@nestjs/testing`, no module metadata, no container.
 */
const TENANT_A: TenantId = makeTenant();
const TENANT_B: TenantId = makeTenant();

let app: Wiring;
let staffA: Principal;
let staffB: Principal;
let fleetA: Customer;
let fleetA2: Customer;
let fleetB: Customer;

beforeAll(async () => {
  process.env.RUNTIME_ENV = 'integration';
  process.env.DATABASE_URL = inject('databaseUrl');
  app = wire(inject('databaseUrl'));
});

afterAll(async () => {
  await app.close();
});

/** Two fleets in tenant A, one in tenant B, all three activated. */
beforeEach(async () => {
  await resetData(app.database);
  staffA = makeStaffPrincipal(TENANT_A);
  staffB = makeStaffPrincipal(TENANT_B);
  fleetA = await activate(staffA, await app.service.create(staffA, makeCreateCustomer()));
  fleetA2 = await activate(staffA, await app.service.create(staffA, makeCreateCustomer()));
  fleetB = await activate(staffB, await app.service.create(staffB, makeCreateCustomer()));
});

async function activate(principal: Principal, customer: Customer): Promise<Customer> {
  return app.service.update(principal, customer.id, { status: 'active' });
}

describe('migrations', () => {
  it('created the vehicles schema with its cross-schema foreign key', async () => {
    const { rows } = await app.database.pool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE conname = 'vehicles_customer_fk'`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe('creating a vehicle', () => {
  it('writes the row and its outbox event in one transaction', async () => {
    const vehicle = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));

    const read = await app.vehiclesRepo.findById(scopeOf(staffA), vehicle.id);
    expect(read?.unitNumber).toBe(vehicle.unitNumber);

    const dispatched = await drainOutbox(app.dispatcher);
    expect(dispatched).toBeGreaterThan(0);

    const events = await app.outbox.readTopicSince(
      scopeOf(staffA),
      vehicleTopic(TENANT_A, vehicle.id),
      0,
      10,
    );
    expect(events.map((event) => event.name)).toEqual(['vehicle.created']);
    // The vehicle id rides in the payload, because the outbox has no generic
    // subject column — see the note in events.ts.
    expect(events[0]?.payload['vehicleId']).toBe(vehicle.id);
    // The outbox row is scoped to the *owning customer*, so a portal principal
    // pinned to that fleet can see it.
    expect(events[0]?.customerId).toBe(fleetA.id);
  });

  it('starts the vehicle out of service', async () => {
    const vehicle = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    expect(vehicle.status).toBe('out_of_service');
  });

  it('normalizes the unit number and VIN on the way in', async () => {
    const vehicle = await app.vehicles.create(
      staffA,
      makeCreateVehicle(fleetA.id, { unitNumber: 'trk-lower', vin: '1fujgldr9csbf9999' }),
    );
    expect(vehicle.unitNumber).toBe('TRK-LOWER');
    expect(vehicle.vin).toBe('1FUJGLDR9CSBF9999');
  });
});

describe('the cross-module reference', () => {
  it('refuses a fleet that does not exist', async () => {
    await expect(
      app.vehicles.create(staffA, makeCreateVehicle(newCustomerId())),
    ).rejects.toThrow(NotFound);
  });

  /**
   * The headline assertion of module two. Tenant A asks for a vehicle on
   * tenant B's fleet, using a real id that really exists.
   *
   * It fails as `NotFound`, not `Forbidden`, and the reason is the design: the
   * check is `CustomersService.get`, which applies the customers module's own
   * scope. Tenant A cannot see that fleet, so from here it does not exist —
   * and tenant A learns nothing about whether it does.
   */
  it('refuses another tenant’s fleet, and does not admit it exists', async () => {
    await expect(
      app.vehicles.create(staffA, makeCreateVehicle(fleetB.id)),
    ).rejects.toThrow(NotFound);

    const { rows } = await app.database.pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM vehicles.vehicles',
    );
    expect(rows[0]?.count).toBe('0');
  });

  /**
   * And the belt to that braces: even with the service bypassed entirely, the
   * database refuses a cross-tenant parent. This is what the composite
   * `(tenant_id, customer_id)` foreign key buys — without it, only the service
   * above would be standing in the way.
   */
  it('is refused by the database even when the service is bypassed', async () => {
    const attempt = app.vehiclesRepo.transaction((tx) =>
      app.vehiclesRepo.insert(tx, {
          id: newVehicleId(),
          tenantId: TENANT_A,
          customerId: fleetB.id,
          unitNumber: 'SMUGGLED',
          vin: '1FUJGLDR9CSBF7777',
          make: 'Mack',
          model: 'Anthem',
          modelYear: 2023,
          vehicleClass: 'heavy_duty',
          status: 'out_of_service',
          odometerMiles: 1,
          lastServicedAt: null,
        createdAt: fleetA.createdAt,
        updatedAt: fleetA.updatedAt,
      }),
    );

    // Drizzle wraps the driver error, so the SQLSTATE is on the cause rather
    // than in the message. `23503` is `foreign_key_violation`, which is the
    // composite `(tenant_id, customer_id)` key doing its job.
    await expect(attempt).rejects.toSatisfy(
      (error: unknown) => sqlStateOf(error) === '23503',
      'a foreign_key_violation (23503)',
    );
  });
});

describe('uniqueness', () => {
  it('scopes unit numbers to the fleet, so two customers may both run a TRK-101', async () => {
    await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id, { unitNumber: 'TRK-101' }));
    const second = await app.vehicles.create(
      staffA,
      makeCreateVehicle(fleetA2.id, { unitNumber: 'TRK-101' }),
    );
    expect(second.unitNumber).toBe('TRK-101');
  });

  it('refuses a duplicate unit number inside one fleet, case-insensitively', async () => {
    await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id, { unitNumber: 'TRK-101' }));
    await expect(
      app.vehicles.create(staffA, makeCreateVehicle(fleetA.id, { unitNumber: 'trk-101' })),
    ).rejects.toThrow(Conflict);
  });

  it('refuses a duplicate VIN within the tenant, across fleets', async () => {
    const vin = '1FUJGLDR9CSBF1234';
    await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id, { vin }));
    await expect(
      app.vehicles.create(staffA, makeCreateVehicle(fleetA2.id, { vin })),
    ).rejects.toThrow(Conflict);
  });

  it('allows the same VIN in a different tenant, because the index is tenant-scoped', async () => {
    const vin = '1FUJGLDR9CSBF4321';
    await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id, { vin }));
    const other = await app.vehicles.create(staffB, makeCreateVehicle(fleetB.id, { vin }));
    expect(other.vin).toBe(vin);
  });
});

describe('activation, which crosses the module line', () => {
  it('activates a vehicle whose fleet is active', async () => {
    const vehicle = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    const active = await app.vehicles.update(staffA, vehicle.id, { status: 'active' });
    expect(active.status).toBe('active');
  });

  it('refuses to activate a vehicle whose fleet is inactive', async () => {
    const vehicle = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    await app.service.update(staffA, fleetA.id, { status: 'inactive' });

    await expect(
      app.vehicles.update(staffA, vehicle.id, { status: 'active' }),
    ).rejects.toThrow(BusinessRuleViolated);
  });

  it('leaves an already-active vehicle alone when its fleet goes inactive', async () => {
    const vehicle = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    await app.vehicles.update(staffA, vehicle.id, { status: 'active' });
    await app.service.update(staffA, fleetA.id, { status: 'inactive' });

    const parked = await app.vehicles.update(staffA, vehicle.id, { odometerMiles: 500_000 });
    expect(parked.status).toBe('active');
  });

  it('refuses an odometer rollback against the locked row', async () => {
    const vehicle = await app.vehicles.create(
      staffA,
      makeCreateVehicle(fleetA.id, { odometerMiles: 400_000 }),
    );
    await expect(
      app.vehicles.update(staffA, vehicle.id, { odometerMiles: 40_000 }),
    ).rejects.toThrow(BusinessRuleViolated);
  });

  it('emits status_changed rather than updated when the status moves', async () => {
    const vehicle = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    await app.vehicles.update(staffA, vehicle.id, { status: 'active' });
    await drainOutbox(app.dispatcher);

    const events = await app.outbox.readTopicSince(
      scopeOf(staffA),
      vehicleTopic(TENANT_A, vehicle.id),
      0,
      10,
    );
    expect(events.map((event) => event.name)).toEqual([
      'vehicle.created',
      'vehicle.status_changed',
    ]);
  });
});

describe('scoping', () => {
  it('lists only the tenant’s own vehicles', async () => {
    await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    await app.vehicles.create(staffB, makeCreateVehicle(fleetB.id));

    const page = await app.vehicles.list(staffA, { limit: 25 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.tenantId).toBe(TENANT_A);
  });

  /**
   * The scoping column differs from the customers module: a portal principal
   * narrows vehicles by `customer_id`, not by the primary key. This is the
   * assertion that proves the chokepoint is parameterized rather than copied.
   */
  it('pins a portal principal to its own fleet’s vehicles', async () => {
    const mine = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    const theirs = await app.vehicles.create(staffA, makeCreateVehicle(fleetA2.id));

    const portal = makePortalPrincipal(TENANT_A, fleetA.id as CustomerId);

    const page = await app.vehicles.list(portal, { limit: 25 });
    expect(page.items.map((item) => item.id)).toEqual([mine.id]);

    await expect(app.vehicles.get(portal, theirs.id)).rejects.toThrow(NotFound);
  });
});

describe('pagination', () => {
  it('walks a keyset cursor over (unit_number, id) without repeating a row', async () => {
    for (let index = 0; index < 5; index += 1) {
      await app.vehicles.create(
        staffA,
        makeCreateVehicle(fleetA.id, { unitNumber: `TRK-${String(index).padStart(3, '0')}` }),
      );
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await app.vehicles.list(staffA, { limit: 2, cursor });
      seen.push(...page.items.map((item) => item.unitNumber));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    expect(seen).toEqual(['TRK-000', 'TRK-001', 'TRK-002', 'TRK-003', 'TRK-004']);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('the SSE stream', () => {
  it('replays from a cursor and then resumes live', async () => {
    await app.notifier.start();
    const vehicle = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    await app.vehicles.update(staffA, vehicle.id, { status: 'active' });
    await drainOutbox(app.dispatcher);

    // Replay everything from the beginning of this vehicle's stream.
    const stream = await app.vehicles.streamFor(staffA, vehicle.id, 0);
    const received: string[] = [];
    const ids: string[] = [];
    const subscription = stream.subscribe((event) => {
      received.push(event.name);
      ids.push(event.vehicleId);
    });

    // A live change after the subscription opened.
    await app.vehicles.update(staffA, vehicle.id, { odometerMiles: 500_000 });
    await drainOutbox(app.dispatcher);
    await delay(400);
    subscription.unsubscribe();

    expect(received).toEqual([
      'vehicle.created',
      'vehicle.status_changed',
      'vehicle.updated',
    ]);
    // Every frame's subject id came back out of the payload intact.
    expect(new Set(ids)).toEqual(new Set([vehicle.id]));
  });

  it('never delivers another vehicle’s events to a subscriber', async () => {
    await app.notifier.start();
    const mine = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    const other = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
    await drainOutbox(app.dispatcher);

    const stream = await app.vehicles.streamFor(staffA, mine.id, 0);
    const received: string[] = [];
    const subscription = stream.subscribe((event) => received.push(event.vehicleId));

    await app.vehicles.update(staffA, other.id, { odometerMiles: 999_000 });
    await drainOutbox(app.dispatcher);
    await delay(400);
    subscription.unsubscribe();

    expect(new Set(received)).toEqual(new Set([mine.id]));
  });
});

/** Digs the SQLSTATE out of whatever Drizzle wrapped the driver error in. */
function sqlStateOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === 'object' && 'code' in current && typeof current.code === 'string') {
      return current.code;
    }
    current = typeof current === 'object' && 'cause' in current ? current.cause : null;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
