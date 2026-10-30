import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { drainOutbox, resetData, wire } from '../../../platform/test/harness';
import type { Wiring } from '../../../platform/test/harness';
import {
  makeAddLine,
  makeCreateCustomer,
  makeCreateVehicle,
  makeCreateWorkOrder,
  makePortalPrincipal,
  makeStaffPrincipal,
  makeTenant,
} from '../../../platform/test/factories';
import { toCents } from '../../../platform/types/branded';
import type { CustomerId, TenantId } from '../../../platform/types/branded';
import { BusinessRuleViolated, Conflict, NotFound } from '../../../platform/types/errors';
import { scopeOf } from '../../../platform/types/scope';
import type { Principal } from '../../../platform/types/principal';
import type { Customer } from '../../customers';
import type { Vehicle } from '../../vehicles';
import { workOrderTopic } from '../events';

/**
 * Integration layer. The assertions that only a module with a child table and
 * two upstream dependencies can make.
 */
const TENANT_A: TenantId = makeTenant();
const TENANT_B: TenantId = makeTenant();

let app: Wiring;
let staffA: Principal;
let staffB: Principal;
let fleetA: Customer;
let fleetA2: Customer;
let fleetB: Customer;
let truckA: Vehicle;
let truckA2: Vehicle;
let truckB: Vehicle;

beforeAll(async () => {
  process.env.RUNTIME_ENV = 'integration';
  process.env.DATABASE_URL = inject('databaseUrl');
  app = wire(inject('databaseUrl'));
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetData(app.database);
  staffA = makeStaffPrincipal(TENANT_A);
  staffB = makeStaffPrincipal(TENANT_B);

  fleetA = await activate(staffA, await app.service.create(staffA, makeCreateCustomer()));
  fleetA2 = await activate(staffA, await app.service.create(staffA, makeCreateCustomer()));
  fleetB = await activate(staffB, await app.service.create(staffB, makeCreateCustomer()));

  truckA = await app.vehicles.create(staffA, makeCreateVehicle(fleetA.id));
  truckA2 = await app.vehicles.create(staffA, makeCreateVehicle(fleetA2.id));
  truckB = await app.vehicles.create(staffB, makeCreateVehicle(fleetB.id));
});

async function activate(principal: Principal, customer: Customer): Promise<Customer> {
  return app.service.update(principal, customer.id, { status: 'active' });
}

describe('migrations', () => {
  it('created both cross-schema foreign keys', async () => {
    const { rows } = await app.database.pool.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
       WHERE conname IN ('work_orders_customer_fk','work_orders_vehicle_fk','work_order_lines_order_fk')`,
    );
    expect(rows).toHaveLength(3);
  });
});

describe('opening a work order', () => {
  it('bills the fleet that owns the vehicle, not one the caller supplies', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    expect(order.customerId).toBe(fleetA.id);
    expect(order.status).toBe('draft');
    expect(order.totalCents).toBe(0);
  });

  it('writes the row and its event in one transaction', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await drainOutbox(app.dispatcher);
    const events = await app.outbox.readTopicSince(
      scopeOf(staffA),
      workOrderTopic(TENANT_A, order.id),
      0,
      10,
    );
    expect(events.map((e) => e.name)).toEqual(['work_order.created']);
    expect(events[0]?.customerId).toBe(fleetA.id);
  });

  it('refuses another tenant’s vehicle, and does not admit it exists', async () => {
    await expect(app.orders.create(staffA, makeCreateWorkOrder(truckB.id))).rejects.toThrow(
      NotFound,
    );
  });

  it('refuses a retired vehicle', async () => {
    await app.vehicles.update(staffA, truckA.id, { status: 'retired' });
    await expect(app.orders.create(staffA, makeCreateWorkOrder(truckA.id))).rejects.toThrow(
      BusinessRuleViolated,
    );
  });

  it('refuses a duplicate order number in the tenant', async () => {
    await app.orders.create(staffA, makeCreateWorkOrder(truckA.id, { number: 'RO-1' }));
    await expect(
      app.orders.create(staffA, makeCreateWorkOrder(truckA2.id, { number: 'ro-1' })),
    ).rejects.toThrow(Conflict);
  });
});

describe('lines and the running total', () => {
  it('re-totals the order when a line is added', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await app.orders.addLine(staffA, order.id, makeAddLine());           // 1.5h @ $145 = $217.50
    await app.orders.addLine(
      staffA,
      order.id,
      makeAddLine({ kind: 'part', description: 'Air dryer cartridge', quantity: 100, unitPriceCents: toCents(8_000) }),
    );
    const detail = await app.orders.getDetail(staffA, order.id);
    expect(detail.lines).toHaveLength(2);
    expect(detail.totalCents).toBe(21_750 + 8_000);
  });

  it('re-totals when a line is removed', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    const line = await app.orders.addLine(staffA, order.id, makeAddLine());
    await app.orders.removeLine(staffA, order.id, line.id);
    const detail = await app.orders.getDetail(staffA, order.id);
    expect(detail.lines).toHaveLength(0);
    expect(detail.totalCents).toBe(0);
  });

  it('refuses a line once work has started', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await app.orders.addLine(staffA, order.id, makeAddLine());
    await app.orders.update(staffA, order.id, { status: 'authorized' });
    await app.orders.update(staffA, order.id, { status: 'in_progress' });

    await expect(app.orders.addLine(staffA, order.id, makeAddLine())).rejects.toThrow(
      BusinessRuleViolated,
    );
  });

  it('refuses to remove a line that is not on this order', async () => {
    const a = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    const b = await app.orders.create(staffA, makeCreateWorkOrder(truckA2.id));
    const lineOnB = await app.orders.addLine(staffA, b.id, makeAddLine());
    await expect(app.orders.removeLine(staffA, a.id, lineOnB.id)).rejects.toThrow(NotFound);
  });

  it('cascades lines when the parent order is deleted', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await app.orders.addLine(staffA, order.id, makeAddLine());
    await app.database.pool.query('DELETE FROM workorders.work_orders WHERE id = $1', [order.id]);
    const { rows } = await app.database.pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM workorders.work_order_lines WHERE work_order_id = $1',
      [order.id],
    );
    expect(rows[0]?.count).toBe('0');
  });
});

describe('authorization, which crosses two module lines', () => {
  it('authorizes an order with lines against an active fleet', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await app.orders.addLine(staffA, order.id, makeAddLine());
    const authorized = await app.orders.update(staffA, order.id, { status: 'authorized' });
    expect(authorized.status).toBe('authorized');
    expect(authorized.authorizedAt).not.toBeNull();
  });

  it('refuses to authorize an empty order', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await expect(app.orders.update(staffA, order.id, { status: 'authorized' })).rejects.toThrow(
      BusinessRuleViolated,
    );
  });

  it('refuses to authorize for a fleet on credit hold', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await app.orders.addLine(staffA, order.id, makeAddLine());
    await app.service.update(staffA, fleetA.id, { isOnCreditHold: true });

    await expect(app.orders.update(staffA, order.id, { status: 'authorized' })).rejects.toThrow(
      BusinessRuleViolated,
    );
  });

  it('stamps closedAt on completion', async () => {
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await app.orders.addLine(staffA, order.id, makeAddLine());
    await app.orders.update(staffA, order.id, { status: 'authorized' });
    await app.orders.update(staffA, order.id, { status: 'in_progress' });
    const done = await app.orders.update(staffA, order.id, { status: 'completed' });
    expect(done.closedAt).not.toBeNull();
  });
});

describe('scoping', () => {
  it('lists only the tenant’s own orders', async () => {
    await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await app.orders.create(staffB, makeCreateWorkOrder(truckB.id));
    const page = await app.orders.list(staffA, { limit: 25 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.tenantId).toBe(TENANT_A);
  });

  it('pins a portal principal to its own fleet’s orders AND lines', async () => {
    const mine = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await app.orders.addLine(staffA, mine.id, makeAddLine());
    const theirs = await app.orders.create(staffA, makeCreateWorkOrder(truckA2.id));
    await app.orders.addLine(staffA, theirs.id, makeAddLine());

    const portal = makePortalPrincipal(TENANT_A, fleetA.id as CustomerId);

    const page = await app.orders.list(portal, { limit: 25 });
    expect(page.items.map((o) => o.id)).toEqual([mine.id]);

    // The child table is scoped on its own denormalised customer_id.
    const lines = await app.linesRepo.listForOrder(scopeOf(portal), theirs.id);
    expect(lines).toHaveLength(0);

    await expect(app.orders.getDetail(portal, theirs.id)).rejects.toThrow(NotFound);
  });
});

describe('the SSE stream', () => {
  it('reports line changes on the order’s topic', async () => {
    await app.notifier.start();
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await drainOutbox(app.dispatcher);

    const stream = await app.orders.streamFor(staffA, order.id, 0);
    const received: string[] = [];
    const subscription = stream.subscribe((event) => received.push(event.name));

    const line = await app.orders.addLine(staffA, order.id, makeAddLine());
    await app.orders.removeLine(staffA, order.id, line.id);
    await drainOutbox(app.dispatcher);
    await delay(400);
    subscription.unsubscribe();

    expect(received).toEqual([
      'work_order.created',
      'work_order.line_added',
      'work_order.line_removed',
    ]);
  });
});

describe('stream ordering under a burst', () => {
  /**
   * Regression for a real defect: the services originally used `mergeMap` to
   * fetch each notified row, which runs the reads concurrently and emits in
   * completion order. Under a burst that reverses pairs.
   *
   * It matters because `Last-Event-ID` is a high-water mark. A client that
   * receives 7 then 6 records 7, and on reconnect asks for everything after
   * 7 — so 6 is lost permanently, silently, by the very mechanism meant to
   * guarantee no gaps.
   *
   * A burst is used rather than two events because the race needs
   * concurrency to show itself; with `mergeMap` this fails reliably, with
   * `concatMap` it passes.
   */
  it('delivers a burst in strictly ascending id order', async () => {
    await app.notifier.start();
    const order = await app.orders.create(staffA, makeCreateWorkOrder(truckA.id));
    await drainOutbox(app.dispatcher);

    const stream = await app.orders.streamFor(staffA, order.id, 0);
    const ids: number[] = [];
    const subscription = stream.subscribe((event) => ids.push(event.id));

    // Ten line changes back to back, so several events land in one dispatch
    // batch and are notified in immediate succession.
    for (let i = 0; i < 10; i += 1) {
      await app.orders.addLine(staffA, order.id, makeAddLine({ description: `Line ${i}` }));
    }
    await drainOutbox(app.dispatcher);
    await delay(600);
    subscription.unsubscribe();

    expect(ids.length).toBeGreaterThanOrEqual(10);
    const ascending = [...ids].sort((a, b) => a - b);
    expect(ids, 'frames must arrive in ascending id order').toEqual(ascending);
    expect(new Set(ids).size, 'no duplicates').toBe(ids.length);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
