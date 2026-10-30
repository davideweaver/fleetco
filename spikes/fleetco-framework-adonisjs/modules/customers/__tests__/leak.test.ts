import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from '../../../platform/openapi/document.js';
import { asPrincipal, startHarness, stopHarness } from '../../../platform/test/harness.js';
import {
  makeCreateCustomer,
  makeTenant,
  portalPrincipal,
  staffPrincipal,
} from '../../../platform/test/factories.js';
import type { TenantId } from '../../../platform/types/branded.js';
import { customerPageSchema } from '../contracts.js';
import type { Customer } from '../contracts.js';

/**
 * **The cross-tenant and cross-customer leak suite.**
 *
 * [[Tenancy Model]] non-negotiable 7 and [[Testing Strategy]] § Cross-Tenant
 * Leak Suite: "a distinct, required CI gate with no override… the single
 * highest-value test asset in the product."
 *
 * The shape is taken from those documents literally:
 *
 *   - two tenants, each with two customers;
 *   - for **every** endpoint: authenticate as tenant A, request tenant B's
 *     resource, assert refusal;
 *   - for **every** SSE topic: subscribe as tenant A, assert nothing from
 *     tenant B ever arrives;
 *   - then repeat for two customers *inside* one tenant — "the portal case,
 *     which is the one that matters on day one";
 *   - and **enumerate routes from the OpenAPI document**, so an endpoint added
 *     without coverage fails the build rather than slipping through.
 *
 * `COVERED` below is filled in by the tests that actually ran, and the final
 * assertion compares it against the live spec.
 *
 * Unlike the Fastify spike, every JSON assertion here goes over a real
 * `fetch()` to a real socket — there is no `app.inject()` equivalent without
 * `@japa/plugin-adonisjs`. See `platform/test/harness.ts` and NOTES.md §2.
 */
let harness: Awaited<ReturnType<typeof startHarness>>;

let tenantA: TenantId;
let tenantB: TenantId;
let a1: Customer;
let a2: Customer;
let b1: Customer;

/** Operation ids this run genuinely exercised. */
const COVERED = new Set<string>();

function covered(operationId: string): void {
  COVERED.add(operationId);
}

beforeAll(async () => {
  harness = await startHarness();
});

afterAll(async () => {
  await stopHarness(harness);
});

beforeEach(async () => {
  await harness.reset();
  tenantA = makeTenant().tenantId;
  tenantB = makeTenant().tenantId;

  a1 = await harness.wiring.customers.create(
    staffPrincipal(tenantA),
    makeCreateCustomer({ code: 'ACME', name: 'Acme Trucking' }),
  );
  a2 = await harness.wiring.customers.create(
    staffPrincipal(tenantA),
    makeCreateCustomer({ code: 'CITY', name: 'City Hauling' }),
  );
  b1 = await harness.wiring.customers.create(
    staffPrincipal(tenantB),
    makeCreateCustomer({ code: 'RGNL', name: 'Regional Hospital' }),
  );
  await harness.wiring.customers.create(
    staffPrincipal(tenantB),
    makeCreateCustomer({ code: 'OTHR', name: 'Other Fleet' }),
  );
  await harness.wiring.dispatcher.tick();
});

// ---------------------------------------------------------------------------
// Cross-tenant: A asking for B
// ---------------------------------------------------------------------------

describe('cross-tenant, over HTTP', () => {
  it('listCustomers never returns another tenant’s fleets', async () => {
    covered('listCustomers');
    const response = await fetch(`${harness.baseUrl}/v1/customers`, {
      headers: asPrincipal(staffPrincipal(tenantA)),
    });
    expect(response.status).toBe(200);
    const page = customerPageSchema.parse(await response.json());
    expect(page.items.map((customer) => customer.code).sort()).toEqual(['ACME', 'CITY']);
    for (const customer of page.items) expect(customer.tenantId).toBe(tenantA);
  });

  it('getCustomer refuses another tenant’s fleet', async () => {
    covered('getCustomer');
    const response = await fetch(`${harness.baseUrl}/v1/customers/${b1.id}`, {
      headers: asPrincipal(staffPrincipal(tenantA)),
    });
    expect(response.status).toBe(404);
    // Not found rather than forbidden: a 403 confirms the row exists, which is
    // itself a cross-tenant disclosure.
    await expect(response.json()).resolves.toMatchObject({ kind: 'NotFound' });
  });

  it('updateCustomer refuses another tenant’s fleet and changes nothing', async () => {
    covered('updateCustomer');
    const response = await fetch(`${harness.baseUrl}/v1/customers/${b1.id}`, {
      method: 'PATCH',
      headers: { ...asPrincipal(staffPrincipal(tenantA)), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    expect(response.status).toBe(404);
    await response.text();

    const after = await harness.wiring.customers.get(staffPrincipal(tenantB), b1.id);
    expect(after.name).toBe('Regional Hospital');
  });

  it('createCustomer stamps the caller’s tenant, which the body cannot influence', async () => {
    covered('createCustomer');
    const response = await fetch(`${harness.baseUrl}/v1/customers`, {
      method: 'POST',
      headers: { ...asPrincipal(staffPrincipal(tenantA)), 'content-type': 'application/json' },
      // `tenantId` is not in the contract, so a caller supplying one is
      // asserting something the schema will strip. The assertion below is
      // that it is stripped rather than honoured.
      body: JSON.stringify({ ...makeCreateCustomer({ code: 'NEW1' }), tenantId: tenantB }),
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ tenantId: tenantA });
  });

  it('refuses every endpoint outright with no principal at all', async () => {
    for (const request of [
      { method: 'GET', url: '/v1/customers' },
      { method: 'GET', url: `/v1/customers/${a1.id}` },
      { method: 'POST', url: '/v1/customers' },
      { method: 'PATCH', url: `/v1/customers/${a1.id}` },
    ]) {
      const response = await fetch(`${harness.baseUrl}${request.url}`, { method: request.method });
      expect(response.status, `${request.method} ${request.url}`).toBe(403);
      await response.text();
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-customer inside one tenant: the portal case
// ---------------------------------------------------------------------------

describe('cross-customer inside one tenant — the portal case', () => {
  it('listCustomers returns only the portal user’s own fleet', async () => {
    covered('listCustomers');
    const response = await fetch(`${harness.baseUrl}/v1/customers`, {
      headers: asPrincipal(portalPrincipal(tenantA, a1.id)),
    });
    expect(response.status).toBe(200);
    const page = customerPageSchema.parse(await response.json());
    expect(page.items.map((customer) => customer.id)).toEqual([a1.id]);
  });

  it('getCustomer refuses a sibling fleet in the same tenant', async () => {
    covered('getCustomer');
    const response = await fetch(`${harness.baseUrl}/v1/customers/${a2.id}`, {
      headers: asPrincipal(portalPrincipal(tenantA, a1.id)),
    });
    expect(response.status).toBe(404);
    await response.text();
  });

  it('getCustomer still allows the portal user’s own fleet', async () => {
    covered('getCustomer');
    const response = await fetch(`${harness.baseUrl}/v1/customers/${a1.id}`, {
      headers: asPrincipal(portalPrincipal(tenantA, a1.id)),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: a1.id });
  });

  it('createCustomer is closed to the portal plane', async () => {
    covered('createCustomer');
    const response = await fetch(`${harness.baseUrl}/v1/customers`, {
      method: 'POST',
      headers: {
        ...asPrincipal(portalPrincipal(tenantA, a1.id)),
        'content-type': 'application/json',
      },
      body: JSON.stringify(makeCreateCustomer({ code: 'NEW2' })),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ kind: 'Forbidden' });
  });

  it('updateCustomer is closed to the portal plane, even for its own fleet', async () => {
    covered('updateCustomer');
    const response = await fetch(`${harness.baseUrl}/v1/customers/${a1.id}`, {
      method: 'PATCH',
      headers: {
        ...asPrincipal(portalPrincipal(tenantA, a1.id)),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Self Service' }),
    });
    expect(response.status).toBe(403);
    await response.text();
  });

  it('a portal principal cannot widen itself by claiming the tenant plane’s roles', async () => {
    covered('getCustomer');
    // The plane is what decides the scope, not the role list. A portal
    // principal carrying `roles: ['admin']` is still one customer wide.
    const response = await fetch(`${harness.baseUrl}/v1/customers/${a2.id}`, {
      headers: asPrincipal({ ...portalPrincipal(tenantA, a1.id), roles: ['admin', 'owner'] }),
    });
    expect(response.status).toBe(404);
    await response.text();
  });
});

// ---------------------------------------------------------------------------
// The SSE surface
// ---------------------------------------------------------------------------

describe('the SSE surface', () => {
  it('refuses a subscription to another tenant’s customer', async () => {
    covered('streamCustomerEvents');
    const response = await fetch(`${harness.baseUrl}/v1/customers/${b1.id}/events`, {
      headers: asPrincipal(staffPrincipal(tenantA)),
    });
    expect(response.status).toBe(404);
    await response.text();
  });

  it('refuses a portal subscription to a sibling customer', async () => {
    covered('streamCustomerEvents');
    const response = await fetch(`${harness.baseUrl}/v1/customers/${a2.id}/events`, {
      headers: asPrincipal(portalPrincipal(tenantA, a1.id)),
    });
    expect(response.status).toBe(404);
    await response.text();
  });

  it('never delivers another tenant’s or another customer’s events to a subscriber', async () => {
    covered('streamCustomerEvents');
    const aborter = new AbortController();
    const stream = await harness.wiring.customers.stream(
      portalPrincipal(tenantA, a1.id),
      a1.id,
      0,
      aborter.signal,
    );

    const received: string[] = [];
    const pump = (async (): Promise<void> => {
      for await (const event of stream) {
        received.push(`${event.name}:${event.customerId}`);
      }
    })();

    try {
      // Noise on every topic the subscriber must not see.
      await harness.wiring.customers.update(staffPrincipal(tenantA), a2.id, {
        name: 'Sibling Renamed',
      });
      await harness.wiring.customers.update(staffPrincipal(tenantB), b1.id, {
        name: 'Other Tenant Renamed',
      });
      // And one it must.
      await harness.wiring.customers.update(staffPrincipal(tenantA), a1.id, { status: 'active' });
      await harness.wiring.dispatcher.tick();

      // Long enough for a leak to arrive if one were going to.
      await new Promise((resolve) => setTimeout(resolve, 400));

      expect(received).toContain(`customer.created:${a1.id}`);
      expect(received).toContain(`customer.status_changed:${a1.id}`);
      expect(received.filter((entry) => !entry.endsWith(a1.id))).toEqual([]);
    } finally {
      aborter.abort();
      await stream.return(undefined);
      await pump;
    }
  });
});

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('leak coverage', () => {
  it('covers every operation in the generated OpenAPI document', () => {
    // [[Testing Strategy]]: "Enumerate routes from the OpenAPI document so the
    // suite cannot silently fall behind." A new endpoint lands in the spec the
    // moment it is in the route table, and this assertion fails until it is
    // also in this file.
    const document = buildOpenApiDocument(harness.wiring.customerRoutes.all, '1');
    const operations = Object.values(document.paths)
      .flatMap((methods) => Object.values(methods))
      .map((operation) =>
        typeof operation === 'object' && operation !== null && 'operationId' in operation
          ? String(operation.operationId)
          : '',
      )
      .filter((operationId) => operationId !== '');

    expect(operations.length).toBeGreaterThan(0);
    const uncovered = operations.filter((operationId) => !COVERED.has(operationId)).sort();
    expect(uncovered).toEqual([]);
  });
});
