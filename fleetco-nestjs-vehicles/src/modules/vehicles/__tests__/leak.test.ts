import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import {
  delay,
  openSse,
  operationsUnder,
  request,
} from '../../../platform/test/leak-helpers';
import { drainOutbox, resetData, startApp, wire } from '../../../platform/test/harness';
import type { RunningApp, Wiring } from '../../../platform/test/harness';
import {
  makeCreateCustomer,
  makeCreateVehicle,
  makePortalPrincipal,
  makeStaffPrincipal,
  makeTenant,
} from '../../../platform/test/factories';
import { newCustomerId, newVehicleId } from '../../../platform/types/branded';
import type { TenantId } from '../../../platform/types/branded';
import type { Principal } from '../../../platform/types/principal';
import type { Customer } from '../../customers';
import type { Vehicle } from '../contracts';

/**
 * The required gate, for this module's prefix.
 *
 * The structure mirrors `modules/customers/__tests__/leak.test.ts` exactly —
 * probe every documented operation across a tenant boundary, then across a
 * customer boundary inside one tenant, then the SSE surface. The app-wide
 * claims (no undocumented route, anonymous refusal everywhere) live in
 * `platform/__tests__/leak.test.ts`.
 *
 * What is new here, and could not exist in a one-module codebase: a create
 * whose *body* names a resource in another tenant. `POST /v1/customers` cannot
 * be aimed across a boundary at all, because the tenant comes from the
 * principal. `POST /v1/vehicles` carries a `customerId`, which makes it the
 * first write in the codebase that a caller can point somewhere it should not
 * reach.
 */
const TENANT_A: TenantId = makeTenant();
const TENANT_B: TenantId = makeTenant();

let running: RunningApp;
let seeding: Wiring;

type Seed = {
  readonly staffA: Principal;
  readonly staffB: Principal;
  /** Two fleets in tenant A, one in tenant B. */
  readonly fleetA1: Customer;
  readonly fleetA2: Customer;
  readonly fleetB: Customer;
  /** One vehicle in each fleet. */
  readonly a1: Vehicle;
  readonly a2: Vehicle;
  readonly b1: Vehicle;
};

let seed: Seed;

beforeAll(async () => {
  process.env.RUNTIME_ENV = 'integration';
  process.env.DATABASE_URL = inject('databaseUrl');
  seeding = wire(inject('databaseUrl'));
  running = await startApp();
});

afterAll(async () => {
  await running.close();
  await seeding.close();
});

beforeEach(async () => {
  await resetData(seeding.database);

  const staffA = makeStaffPrincipal(TENANT_A);
  const staffB = makeStaffPrincipal(TENANT_B);

  const fleetA1 = await seeding.service.create(staffA, makeCreateCustomer({ code: 'A1' }));
  const fleetA2 = await seeding.service.create(staffA, makeCreateCustomer({ code: 'A2' }));
  const fleetB = await seeding.service.create(staffB, makeCreateCustomer({ code: 'B1' }));

  seed = {
    staffA,
    staffB,
    fleetA1,
    fleetA2,
    fleetB,
    a1: await seeding.vehicles.create(
      staffA,
      makeCreateVehicle(fleetA1.id, { unitNumber: 'A1-TRK' }),
    ),
    a2: await seeding.vehicles.create(
      staffA,
      makeCreateVehicle(fleetA2.id, { unitNumber: 'A2-TRK' }),
    ),
    b1: await seeding.vehicles.create(
      staffB,
      makeCreateVehicle(fleetB.id, { unitNumber: 'B1-TRK' }),
    ),
  };
  await drainOutbox(running.dispatcher);
});

// ---------------------------------------------------------------------------
// 1. The suite cannot silently fall behind
// ---------------------------------------------------------------------------

/**
 * Every documented vehicles operation. `probe` performs the cross-boundary
 * request against `foreign`; the test asserts refusal.
 */
type Probe = (actor: Principal, foreign: Vehicle, foreignFleet: Customer) => Promise<Response>;

const PROBES: Record<string, Probe> = {
  'GET /v1/vehicles': (actor) => request(running, 'GET', '/v1/vehicles', actor),
  'POST /v1/vehicles': (actor, _foreign, foreignFleet) =>
    request(
      running,
      'POST',
      '/v1/vehicles',
      actor,
      makeCreateVehicle(foreignFleet.id, { unitNumber: 'SMUGGLED' }),
    ),
  'GET /v1/vehicles/{vehicleId}': (actor, foreign) =>
    request(running, 'GET', `/v1/vehicles/${foreign.id}`, actor),
  'PATCH /v1/vehicles/{vehicleId}': (actor, foreign) =>
    request(running, 'PATCH', `/v1/vehicles/${foreign.id}`, actor, { make: 'Hijacked' }),
  'GET /v1/vehicles/{vehicleId}/events': (actor, foreign) =>
    request(running, 'GET', `/v1/vehicles/${foreign.id}/events`, actor, undefined, {
      'last-event-id': '0',
    }),
};

describe('the suite covers this module’s surface', () => {
  it('has a probe for every documented vehicles operation', () => {
    expect(Object.keys(PROBES).sort()).toEqual(operationsUnder('/v1/vehicles'));
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-tenant: authenticate as A, ask for B
// ---------------------------------------------------------------------------

describe('cross-tenant refusal, every endpoint', () => {
  for (const [operation, probe] of Object.entries(PROBES)) {
    it(`${operation} refuses tenant B's vehicle to tenant A`, async () => {
      const response = await probe(seed.staffA, seed.b1, seed.fleetB);

      if (operation === 'GET /v1/vehicles') {
        // A collection cannot 404; the leak would be a foreign row in the body.
        const page = (await response.json()) as { items: { id: string }[] };
        expect(response.status).toBe(200);
        expect(page.items.map((item) => item.id).sort()).toEqual([seed.a1.id, seed.a2.id].sort());
        return;
      }

      // Everything else, including the create, is a flat 404. The create is
      // the interesting one: it was aimed at tenant B's fleet by id, and the
      // refusal comes from `CustomersService.get` applying the *customers*
      // module's scope — not from anything in this module.
      expect(response.status, operation).toBe(404);

      if (operation === 'POST /v1/vehicles') {
        // The create names the fleet in its *body*, so the refusal echoing
        // that id back is the same "the caller supplied it" exemption the URL
        // id gets. What matters is that the two refusals are
        // indistinguishable, which is asserted separately below.
        await expectNoLeakedBody(response, seed.b1, { suppliedFleet: true });
        return;
      }
      await expectNoLeakedBody(response, seed.b1);
    });
  }

  it('wrote nothing when the create was aimed across the tenant boundary', async () => {
    await request(
      running,
      'POST',
      '/v1/vehicles',
      seed.staffA,
      makeCreateVehicle(seed.fleetB.id, { unitNumber: 'SMUGGLED' }),
    );
    const { rows } = await seeding.database.pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM vehicles.vehicles WHERE unit_number = 'SMUGGLED'`,
    );
    expect(rows[0]?.count).toBe('0');
  });

  /**
   * The create's own anti-enumeration check. `POST /v1/vehicles` is the first
   * write in the codebase a caller can aim across a tenant boundary, so it
   * must not reveal whether the fleet it names exists.
   */
  it('refuses a foreign fleet on create exactly as it refuses a nonexistent one', async () => {
    const absentFleet = newCustomerId();
    const [foreign, nonexistent] = await Promise.all([
      request(running, 'POST', '/v1/vehicles', seed.staffA, makeCreateVehicle(seed.fleetB.id, { unitNumber: 'P1' })),
      request(running, 'POST', '/v1/vehicles', seed.staffA, makeCreateVehicle(absentFleet, { unitNumber: 'P2' })),
    ]);

    expect(foreign.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    const normalize = async (response: Response, id: string): Promise<string> =>
      (await response.text()).replaceAll(id, '<id>');
    expect(await normalize(foreign, seed.fleetB.id)).toBe(await normalize(nonexistent, absentFleet));
  });

  it('refuses a foreign id exactly as it refuses a nonexistent one', async () => {
    // Anti-enumeration: a caller must not be able to tell "exists, but not
    // yours" from "does not exist".
    const absent = newVehicleId();
    const [foreign, nonexistent] = await Promise.all([
      request(running, 'GET', `/v1/vehicles/${seed.b1.id}`, seed.staffA),
      request(running, 'GET', `/v1/vehicles/${absent}`, seed.staffA),
    ]);

    expect(foreign.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    const normalize = async (response: Response, id: string): Promise<string> =>
      (await response.text()).replaceAll(id, '<id>');
    expect(await normalize(foreign, seed.b1.id)).toBe(await normalize(nonexistent, absent));
  });
});

// ---------------------------------------------------------------------------
// 3. Cross-customer inside one tenant — the portal case
// ---------------------------------------------------------------------------

describe('cross-customer refusal inside one tenant, every endpoint', () => {
  for (const [operation, probe] of Object.entries(PROBES)) {
    it(`${operation} refuses a sibling fleet's vehicle to a portal principal`, async () => {
      const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
      const response = await probe(portal, seed.a2, seed.fleetA2);

      if (operation === 'GET /v1/vehicles') {
        const page = (await response.json()) as { items: { id: string }[] };
        expect(response.status).toBe(200);
        expect(page.items.map((item) => item.id)).toEqual([seed.a1.id]);
        return;
      }
      if (operation === 'POST /v1/vehicles' || operation === 'PATCH /v1/vehicles/{vehicleId}') {
        // A portal principal has no write role at all.
        expect(response.status, operation).toBe(403);
        return;
      }
      expect(response.status, operation).toBe(404);
      await expectNoLeakedBody(response, seed.a2);
    });
  }

  /**
   * The assertion that distinguishes this module from `customers`. A portal
   * principal is pinned to a *customer*, and a vehicle is not a customer — so
   * the scope narrows on `vehicles.customer_id` rather than on the primary
   * key. If that mapping were copied from the customers repository unchanged,
   * a portal user would see no vehicles at all, and this test would catch it.
   */
  it('lets a portal principal read its own fleet’s vehicle, so the refusals mean something', async () => {
    const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
    const response = await request(running, 'GET', `/v1/vehicles/${seed.a1.id}`, portal);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBe(seed.a1.id);
  });

  it('lists every vehicle in its own fleet, not just one', async () => {
    const second = await seeding.vehicles.create(
      seed.staffA,
      makeCreateVehicle(seed.fleetA1.id, { unitNumber: 'A1-TRK-2' }),
    );
    const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
    const response = await request(running, 'GET', '/v1/vehicles', portal);
    const page = (await response.json()) as { items: { id: string }[] };
    expect(page.items.map((item) => item.id).sort()).toEqual([seed.a1.id, second.id].sort());
  });
});

// ---------------------------------------------------------------------------
// 4. The SSE surface
// ---------------------------------------------------------------------------

describe('the SSE topic refuses the other tenant', () => {
  it('never delivers another tenant’s events to a subscriber', async () => {
    await seeding.notifier.start();
    const stream = await openSse(running, `/v1/vehicles/${seed.a1.id}/events`, seed.staffA);
    try {
      await seeding.vehicles.update(seed.staffB, seed.b1.id, { make: 'Kenworth' });
      await seeding.vehicles.update(seed.staffA, seed.a1.id, { odometerMiles: 500_000 });
      await drainOutbox(running.dispatcher);
      await delay(600);

      const body = stream.text();
      expect(body).toContain(seed.a1.id);
      expect(body).not.toContain(seed.b1.id);
      expect(body).not.toContain(TENANT_B);
      expect(body).not.toContain(seed.fleetB.id);
    } finally {
      stream.close();
    }
  });

  it('refuses to open a stream on another tenant’s vehicle', async () => {
    const response = await request(
      running,
      'GET',
      `/v1/vehicles/${seed.b1.id}/events`,
      seed.staffA,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).not.toContain('text/event-stream');
  });
});

describe('the SSE topic refuses a sibling fleet', () => {
  it('never delivers a sibling fleet’s events to a portal subscriber', async () => {
    await seeding.notifier.start();
    const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
    const stream = await openSse(running, `/v1/vehicles/${seed.a1.id}/events`, portal);
    try {
      await seeding.vehicles.update(seed.staffA, seed.a2.id, { make: 'Western Star' });
      await seeding.vehicles.update(seed.staffA, seed.a1.id, { odometerMiles: 600_000 });
      await drainOutbox(running.dispatcher);
      await delay(600);

      const body = stream.text();
      expect(body).toContain(seed.a1.id);
      expect(body).not.toContain(seed.a2.id);
      expect(body).not.toContain(seed.fleetA2.id);
    } finally {
      stream.close();
    }
  });

  it('refuses to open a stream on a sibling fleet’s vehicle', async () => {
    const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
    const response = await request(running, 'GET', `/v1/vehicles/${seed.a2.id}/events`, portal);
    expect(response.status).toBe(404);
  });

  it('replays only the subscriber’s own history from a cursor of zero', async () => {
    await seeding.notifier.start();
    const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
    const stream = await openSse(running, `/v1/vehicles/${seed.a1.id}/events`, portal, '0');
    try {
      await delay(400);
      const body = stream.text();
      expect(body).toContain('vehicle.created');
      expect(body).toContain(seed.a1.id);
      expect(body).not.toContain(seed.a2.id);
      expect(body).not.toContain(seed.b1.id);
    } finally {
      stream.close();
    }
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * A refusal must not describe what it refused.
 *
 * The requested id is deliberately not asserted against: the caller supplied
 * it in the URL, and [[Code Standards and Guardrails]] § Errors specifies that
 * error context carries the entity id. What must never appear is an attribute
 * the caller did not already have — the VIN, the unit number, the owning fleet
 * or tenant.
 */
async function expectNoLeakedBody(
  response: Response,
  foreign: Vehicle,
  options: { suppliedFleet?: boolean } = {},
): Promise<void> {
  const text = await response.text();
  expect(text).not.toContain(foreign.vin);
  expect(text).not.toContain(foreign.unitNumber);
  expect(text).not.toContain(foreign.tenantId);
  if (options.suppliedFleet !== true) {
    expect(text).not.toContain(foreign.customerId);
  }
}
