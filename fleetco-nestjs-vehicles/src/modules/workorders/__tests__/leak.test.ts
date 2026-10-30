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
  makeAddLine,
  makeCreateCustomer,
  makeCreateVehicle,
  makeCreateWorkOrder,
  makePortalPrincipal,
  makeStaffPrincipal,
  makeTenant,
} from '../../../platform/test/factories';
import { newWorkOrderId } from '../../../platform/types/branded';
import type { TenantId } from '../../../platform/types/branded';
import type { Principal } from '../../../platform/types/principal';
import type { Customer } from '../../customers';
import type { WorkOrder, WorkOrderLine } from '../contracts';

/**
 * The required gate for this module's prefix.
 *
 * New here: a sub-resource. The probes cover the line endpoints as well, which
 * is the first time the leak suite has had to reach past a resource's own id
 * to a child it owns.
 */
const TENANT_A: TenantId = makeTenant();
const TENANT_B: TenantId = makeTenant();

let running: RunningApp;
let seeding: Wiring;

type Seed = {
  readonly staffA: Principal;
  readonly staffB: Principal;
  readonly fleetA1: Customer;
  readonly fleetA2: Customer;
  readonly a1: WorkOrder;
  readonly a2: WorkOrder;
  readonly b1: WorkOrder;
  readonly lineOnA2: WorkOrderLine;
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

  const activate = async (p: Principal, c: Customer): Promise<Customer> =>
    seeding.service.update(p, c.id, { status: 'active' });

  const fleetA1 = await activate(staffA, await seeding.service.create(staffA, makeCreateCustomer()));
  const fleetA2 = await activate(staffA, await seeding.service.create(staffA, makeCreateCustomer()));
  const fleetB = await activate(staffB, await seeding.service.create(staffB, makeCreateCustomer()));

  const truckA1 = await seeding.vehicles.create(staffA, makeCreateVehicle(fleetA1.id));
  const truckA2 = await seeding.vehicles.create(staffA, makeCreateVehicle(fleetA2.id));
  const truckB = await seeding.vehicles.create(staffB, makeCreateVehicle(fleetB.id));

  const a1 = await seeding.orders.create(staffA, makeCreateWorkOrder(truckA1.id, { number: 'A1' }));
  const a2 = await seeding.orders.create(staffA, makeCreateWorkOrder(truckA2.id, { number: 'A2' }));
  const b1 = await seeding.orders.create(staffB, makeCreateWorkOrder(truckB.id, { number: 'B1' }));

  await seeding.orders.addLine(staffA, a1.id, makeAddLine());
  const lineOnA2 = await seeding.orders.addLine(staffA, a2.id, makeAddLine());

  seed = { staffA, staffB, fleetA1, fleetA2, a1, a2, b1, lineOnA2 };
  await drainOutbox(running.dispatcher);
});

type Probe = (actor: Principal, foreign: WorkOrder, foreignLine: WorkOrderLine) => Promise<Response>;

const PROBES: Record<string, Probe> = {
  'GET /v1/work-orders': (actor) => request(running, 'GET', '/v1/work-orders', actor),
  'POST /v1/work-orders': (actor, foreign) =>
    request(running, 'POST', '/v1/work-orders', actor, {
      vehicleId: foreign.vehicleId,
      number: 'SMUGGLED',
      complaint: 'x',
      odometerInMiles: 1,
    }),
  'GET /v1/work-orders/{workOrderId}': (actor, foreign) =>
    request(running, 'GET', `/v1/work-orders/${foreign.id}`, actor),
  'PATCH /v1/work-orders/{workOrderId}': (actor, foreign) =>
    request(running, 'PATCH', `/v1/work-orders/${foreign.id}`, actor, { complaint: 'Hijacked' }),
  'GET /v1/work-orders/{workOrderId}/lines': (actor, foreign) =>
    request(running, 'GET', `/v1/work-orders/${foreign.id}/lines`, actor),
  'POST /v1/work-orders/{workOrderId}/lines': (actor, foreign) =>
    request(running, 'POST', `/v1/work-orders/${foreign.id}/lines`, actor, makeAddLine()),
  'DELETE /v1/work-orders/{workOrderId}/lines/{lineId}': (actor, foreign, foreignLine) =>
    request(running, 'DELETE', `/v1/work-orders/${foreign.id}/lines/${foreignLine.id}`, actor),
  'GET /v1/work-orders/{workOrderId}/events': (actor, foreign) =>
    request(running, 'GET', `/v1/work-orders/${foreign.id}/events`, actor, undefined, {
      'last-event-id': '0',
    }),
};

describe('the suite covers this module’s surface', () => {
  it('has a probe for every documented work-orders operation', () => {
    expect(Object.keys(PROBES).sort()).toEqual(operationsUnder('/v1/work-orders'));
  });
});

describe('cross-tenant refusal, every endpoint', () => {
  for (const [operation, probe] of Object.entries(PROBES)) {
    it(`${operation} refuses tenant B's order to tenant A`, async () => {
      const response = await probe(seed.staffA, seed.b1, seed.lineOnA2);

      if (operation === 'GET /v1/work-orders') {
        const page = (await response.json()) as { items: { id: string }[] };
        expect(response.status).toBe(200);
        expect(page.items.map((i) => i.id).sort()).toEqual([seed.a1.id, seed.a2.id].sort());
        return;
      }
      expect(response.status, operation).toBe(404);
      await expectNoLeakedBody(response, seed.b1);
    });
  }
});

describe('cross-customer refusal inside one tenant — the portal case', () => {
  for (const [operation, probe] of Object.entries(PROBES)) {
    it(`${operation} refuses a sibling fleet's order to a portal principal`, async () => {
      const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
      const response = await probe(portal, seed.a2, seed.lineOnA2);

      if (operation === 'GET /v1/work-orders') {
        const page = (await response.json()) as { items: { id: string }[] };
        expect(response.status).toBe(200);
        expect(page.items.map((i) => i.id)).toEqual([seed.a1.id]);
        return;
      }
      if (operation.startsWith('POST') || operation.startsWith('PATCH') || operation.startsWith('DELETE')) {
        expect(response.status, operation).toBe(403);
        return;
      }
      expect(response.status, operation).toBe(404);
      await expectNoLeakedBody(response, seed.a2);
    });
  }

  it('lets a portal principal read its own order and its lines', async () => {
    const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
    const detail = await request(running, 'GET', `/v1/work-orders/${seed.a1.id}`, portal);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { id: string; lines: unknown[] };
    expect(body.id).toBe(seed.a1.id);
    expect(body.lines).toHaveLength(1);

    const lines = await request(running, 'GET', `/v1/work-orders/${seed.a1.id}/lines`, portal);
    expect(lines.status).toBe(200);
    expect((await lines.json()) as unknown[]).toHaveLength(1);
  });

  it('refuses a foreign id exactly as it refuses a nonexistent one', async () => {
    const absent = newWorkOrderId();
    const [foreign, nonexistent] = await Promise.all([
      request(running, 'GET', `/v1/work-orders/${seed.b1.id}`, seed.staffA),
      request(running, 'GET', `/v1/work-orders/${absent}`, seed.staffA),
    ]);
    expect(foreign.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    const normalize = async (r: Response, id: string): Promise<string> =>
      (await r.text()).replaceAll(id, '<id>');
    expect(await normalize(foreign, seed.b1.id)).toBe(await normalize(nonexistent, absent));
  });
});

describe('the SSE topic', () => {
  it('never delivers a sibling fleet’s order events to a portal subscriber', async () => {
    await seeding.notifier.start();
    const portal = makePortalPrincipal(TENANT_A, seed.fleetA1.id);
    const stream = await openSse(running, `/v1/work-orders/${seed.a1.id}/events`, portal, '0');
    try {
      await seeding.orders.update(seed.staffA, seed.a2.id, { complaint: 'Sibling churn' });
      await seeding.orders.update(seed.staffA, seed.a1.id, { complaint: 'Mine' });
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

  it('refuses to open a stream on another tenant’s order', async () => {
    const response = await request(
      running,
      'GET',
      `/v1/work-orders/${seed.b1.id}/events`,
      seed.staffA,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).not.toContain('text/event-stream');
  });
});

async function expectNoLeakedBody(response: Response, foreign: WorkOrder): Promise<void> {
  const text = await response.text();
  expect(text).not.toContain(foreign.number);
  expect(text).not.toContain(foreign.complaint);
  expect(text).not.toContain(foreign.tenantId);
  expect(text).not.toContain(foreign.customerId);
}
