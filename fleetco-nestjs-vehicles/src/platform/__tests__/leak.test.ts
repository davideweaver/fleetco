import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { documentedOperations } from '../openapi/document';
import { resetData, startApp, wire } from '../test/harness';
import type { RunningApp, Wiring } from '../test/harness';
import { INFRA_ROUTES, registeredOperations } from '../test/leak-helpers';
import {
  makeAddLine,
  makeCreateCustomer,
  makeCreateVehicle,
  makeCreateWorkOrder,
  makeStaffPrincipal,
  makeTenant,
} from '../test/factories';
import { newCustomerId } from '../types/branded';
import type { TenantId } from '../types/branded';

/**
 * The application-wide half of the leak gate.
 *
 * This file exists because of module two. When there was only `customers`, the
 * claim "my probes cover every documented operation" and the claim "the
 * application has no undocumented route" were the same sentence, and both
 * lived in that module's suite. With a second module they come apart: a
 * per-module suite cannot assert anything about the whole surface without
 * failing whenever a sibling module grows a route.
 *
 * So the split is:
 *
 *  - here — assertions about the *application*: every registered route is
 *    documented, and every documented operation refuses an anonymous caller.
 *  - `modules/<name>/__tests__/leak.test.ts` — assertions about one module's
 *    own prefix: cross-tenant and cross-customer refusal, endpoint by endpoint.
 *
 * Getting this wrong is quiet rather than loud, which is why it is worth the
 * separate file: a per-module suite that silently stopped covering its own
 * routes would still pass.
 */
const TENANT_A: TenantId = makeTenant();

let running: RunningApp;
let seeding: Wiring;
let customerId: string;
let vehicleId: string;
let workOrderId: string;
let lineId: string;

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
  const staff = makeStaffPrincipal(TENANT_A);
  const customer = await seeding.service.create(staff, makeCreateCustomer());
  const vehicle = await seeding.vehicles.create(staff, makeCreateVehicle(customer.id));
  const order = await seeding.orders.create(staff, makeCreateWorkOrder(vehicle.id));
  const line = await seeding.orders.addLine(staff, order.id, makeAddLine());
  customerId = customer.id;
  vehicleId = vehicle.id;
  workOrderId = order.id;
  lineId = line.id;
});

describe('the documented surface is the real surface', () => {
  it('has no route registered that the OpenAPI document does not describe', () => {
    expect(registeredOperations(running).sort()).toEqual(documentedOperations());
  });

  it('describes every module, so the comparison above is not vacuous', () => {
    const operations = documentedOperations();
    expect(operations.some((operation) => operation.includes('/v1/customers'))).toBe(true);
    expect(operations.some((operation) => operation.includes('/v1/vehicles'))).toBe(true);
    expect(operations.some((operation) => operation.includes('/v1/work-orders'))).toBe(true);
  });
});

describe('an unauthenticated request', () => {
  it('is refused on every documented operation', async () => {
    // Enumerated, not listed. A new route marked `@Public()` by mistake, or a
    // controller that forgets the global guard, fails here — for any module.
    for (const operation of documentedOperations()) {
      const [method = 'GET', template = '/'] = operation.split(' ');
      const path = template
        .replace('{customerId}', customerId)
        .replace('{vehicleId}', vehicleId)
        .replace('{workOrderId}', workOrderId)
        .replace('{lineId}', lineId);
      const response = await fetch(`${running.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: '{}' }),
      });
      expect(response.status, operation).toBe(403);
    }
  });

  it('is refused when the principal claims a role it is not shaped for', async () => {
    // A `portal` role with no customerId would be unscoped. The contract
    // refuses to parse it, so it never reaches a repository.
    const response = await fetch(`${running.baseUrl}/v1/customers`, {
      headers: {
        'content-type': 'application/json',
        'x-fleetco-principal': JSON.stringify({
          userId: newCustomerId(),
          tenantId: TENANT_A,
          role: 'portal',
          customerId: null,
        }),
      },
    });
    expect(response.status).toBe(403);
  });
});

describe('the infrastructure endpoints', () => {
  it('are outside the documented contract', () => {
    const documented = new Set(documentedOperations());
    for (const route of INFRA_ROUTES) {
      expect(documented.has(`GET ${route}`), route).toBe(false);
    }
  });

  it('answer an anonymous caller, because the load balancer and scraper are anonymous', async () => {
    for (const route of INFRA_ROUTES) {
      const response = await fetch(`${running.baseUrl}${route}`);
      expect(response.status, route).toBe(200);
    }
  });

  /**
   * The scrape surface must never carry tenant data. Metric *names* are
   * fine; a tenant id, a customer name or a VIN appearing in a label would
   * make `/metrics` an unauthenticated leak of exactly the kind the rest of
   * this suite exists to prevent.
   */
  it('expose no tenant data on /metrics', async () => {
    const body = await (await fetch(`${running.baseUrl}/metrics`)).text();
    expect(body).not.toContain(TENANT_A);
    expect(body).not.toContain(customerId);
    expect(body).not.toContain(vehicleId);
    expect(body).not.toContain(workOrderId);
  });
});
