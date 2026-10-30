import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from '../../../lib/openapi/document.js';
import {
  makeCreateCustomer,
  makePortalPrincipal,
  makeScope,
  makeStaffPrincipal,
  makeTenantId,
} from '../../../lib/test/factories.js';
import {
  openEventStream,
  request,
  startHarness,
  type EventStream,
  type Harness,
} from '../../../lib/test/harness.js';
import type { Principal } from '../../../lib/types/principal.js';
import type { Customer } from '../contracts.js';
import { customerOperations } from '../routes.js';

/**
 * **The cross-tenant leak suite. A required CI gate with no override.**
 *
 * [[Tenancy Model]] day-one non-negotiable 7 and [[Testing Strategy]]
 * § Cross-Tenant Leak Suite, which calls this "the most important asset" and
 * "the single highest-value test asset in the product". The shape is the
 * document's, exactly:
 *
 *  1. Seed two tenants, each with two customers.
 *  2. For **every** endpoint: authenticate as tenant A, request tenant B's
 *     resources, assert refusal.
 *  3. For **every** SSE topic: subscribe as tenant A, assert nothing from
 *     tenant B ever arrives.
 *  4. Then repeat for two customers *inside* one tenant — the portal case,
 *     which is the one that matters on day one.
 *  5. "A new endpoint without leak coverage **fails the build**. Enumerate
 *     routes from the OpenAPI document so the suite cannot silently fall
 *     behind."
 *
 * Point 5 is `COVERAGE` below, and it is the part that makes this suite durable
 * rather than a snapshot of what somebody remembered in October 2026. The keys
 * are operation ids; the completeness test compares them against the generated
 * document. Add a route, and this file fails until somebody writes the attack
 * for it.
 */

const TENANT_A = makeTenantId(1);
const TENANT_B = makeTenantId(2);

let harness: Harness;
const opened: EventStream[] = [];

/** Two tenants, two customers each — the document's seed, verbatim. */
type Seed = {
  a1: Customer;
  a2: Customer;
  b1: Customer;
  b2: Customer;
  staffA: Principal;
  staffB: Principal;
  portalA1: Principal;
};

let seed: Seed;

beforeAll(async () => {
  harness = await startHarness();
}, 180_000);

afterAll(async () => {
  await harness.stop();
});

beforeEach(async () => {
  await harness.truncate();

  const service = harness.app.customers.service;
  const a1 = await service.create(makeScope(TENANT_A), makeCreateCustomer({ code: 'A-ONE' }));
  const a2 = await service.create(makeScope(TENANT_A), makeCreateCustomer({ code: 'A-TWO' }));
  const b1 = await service.create(makeScope(TENANT_B), makeCreateCustomer({ code: 'B-ONE' }));
  const b2 = await service.create(makeScope(TENANT_B), makeCreateCustomer({ code: 'B-TWO' }));

  seed = {
    a1,
    a2,
    b1,
    b2,
    staffA: makeStaffPrincipal(TENANT_A),
    staffB: makeStaffPrincipal(TENANT_B),
    portalA1: makePortalPrincipal(TENANT_A, a1.id),
  };

  // Dispatch, so every seeded event is visible to a replaying subscriber. A
  // leak test against an empty stream proves nothing.
  await harness.app.outbox.dispatchOnce();
});

afterEach(() => {
  for (const stream of opened) {
    stream.close();
  }
  opened.length = 0;
});

async function stream(customerId: string, principal: Principal): Promise<EventStream> {
  const opened_ = await openEventStream(
    harness,
    `/v1/customers/${customerId}/events`,
    principal,
  );
  opened.push(opened_);
  return opened_;
}

/** Refused means 403 or 404. Never 200, and never another tenant's bytes. */
function expectRefused(status: number): void {
  expect([403, 404]).toContain(status);
}

// ---------------------------------------------------------------------------
// Cross-tenant, one attack per endpoint
// ---------------------------------------------------------------------------

type Attack = () => Promise<void>;

const COVERAGE: Record<string, { crossTenant: Attack; crossCustomer: Attack }> = {
  listCustomers: {
    crossTenant: async () => {
      const response = await request(harness, 'GET', '/v1/customers', seed.staffA);
      expect(response.status).toBe(200);

      const codes = (response.body as { items: Customer[] }).items.map((item) => item.code);
      // Tenant A sees both of its own and neither of B's.
      expect(codes.sort()).toEqual(['A-ONE', 'A-TWO']);
    },
    crossCustomer: async () => {
      const response = await request(harness, 'GET', '/v1/customers', seed.portalA1);
      expect(response.status).toBe(200);

      const codes = (response.body as { items: Customer[] }).items.map((item) => item.code);
      // The portal case: one fleet only, not its tenant-mate.
      expect(codes).toEqual(['A-ONE']);
    },
  },

  getCustomer: {
    crossTenant: async () => {
      const response = await request(harness, 'GET', `/v1/customers/${seed.b1.id}`, seed.staffA);
      expectRefused(response.status);
      expect(JSON.stringify(response.body)).not.toContain('B-ONE');
    },
    crossCustomer: async () => {
      const response = await request(harness, 'GET', `/v1/customers/${seed.a2.id}`, seed.portalA1);
      expectRefused(response.status);
      expect(JSON.stringify(response.body)).not.toContain('A-TWO');
    },
  },

  createCustomer: {
    crossTenant: async () => {
      // There is no id to attack, so the leak to prove absent is a *write*
      // landing in the wrong tenant: the body cannot carry a tenant id, and
      // the row takes its tenant from the scope.
      const response = await request(harness, 'POST', '/v1/customers', seed.staffA, {
        ...makeCreateCustomer({ code: 'SMUGGLED' }),
        tenantId: TENANT_B,
      });

      expect(response.status).toBe(201);
      expect((response.body as Customer).tenantId).toBe(TENANT_A);

      const asB = await request(harness, 'GET', '/v1/customers', seed.staffB);
      const codes = (asB.body as { items: Customer[] }).items.map((item) => item.code);
      expect(codes).not.toContain('SMUGGLED');
    },
    crossCustomer: async () => {
      // A portal principal has no business creating a fleet at all.
      const response = await request(
        harness,
        'POST',
        '/v1/customers',
        seed.portalA1,
        makeCreateCustomer({ code: 'PORTAL' }),
      );
      expect(response.status).toBe(422);
    },
  },

  updateCustomer: {
    crossTenant: async () => {
      const response = await request(
        harness,
        'PATCH',
        `/v1/customers/${seed.b1.id}`,
        seed.staffA,
        { name: 'Taken over by A' },
      );
      expectRefused(response.status);

      // And B's row is genuinely untouched, not merely the response refused.
      const asB = await request(harness, 'GET', `/v1/customers/${seed.b1.id}`, seed.staffB);
      expect((asB.body as Customer).name).toBe('Acme Trucking');
    },
    crossCustomer: async () => {
      const response = await request(
        harness,
        'PATCH',
        `/v1/customers/${seed.a2.id}`,
        seed.portalA1,
        { name: 'Edited by a neighbour' },
      );
      expectRefused(response.status);

      const asStaff = await request(harness, 'GET', `/v1/customers/${seed.a2.id}`, seed.staffA);
      expect((asStaff.body as Customer).name).toBe('Acme Trucking');
    },
  },

  streamCustomerEvents: {
    crossTenant: async () => {
      // Refused outright for another tenant's fleet …
      const refused = await request(
        harness,
        'GET',
        `/v1/customers/${seed.b1.id}/events`,
        seed.staffA,
      );
      expectRefused(refused.status);

      // … and an *authorized* stream never receives B's events either, which is
      // the half a status-code assertion cannot reach.
      const live = await stream(seed.a1.id, seed.staffA);
      await live.take(1);

      await harness.app.customers.service.update(makeScope(TENANT_B), seed.b1.id, {
        status: 'active',
      });
      await harness.app.outbox.dispatchOnce();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(live.frames()).toHaveLength(1);
      expect(JSON.stringify(live.frames())).not.toContain(seed.b1.id);
    },
    crossCustomer: async () => {
      const refused = await request(
        harness,
        'GET',
        `/v1/customers/${seed.a2.id}/events`,
        seed.portalA1,
      );
      expectRefused(refused.status);

      const live = await stream(seed.a1.id, seed.portalA1);
      await live.take(1);

      await harness.app.customers.service.update(makeScope(TENANT_A), seed.a2.id, {
        status: 'active',
      });
      await harness.app.outbox.dispatchOnce();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(live.frames()).toHaveLength(1);
      expect(JSON.stringify(live.frames())).not.toContain(seed.a2.id);
    },
  },
};

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('leak coverage is complete', () => {
  it('has an attack for every operation in the OpenAPI document', () => {
    const document = buildOpenApiDocument(customerOperations);
    const paths = document.paths as Record<string, Record<string, { operationId: string }>>;

    const documented = Object.values(paths)
      .flatMap((methods) => Object.values(methods))
      .map((operation) => operation.operationId)
      .sort();

    // This is the line that makes a new endpoint fail the build until somebody
    // writes its attack. Enumerated from the document rather than from the
    // operations array, so a route that is registered but undocumented also
    // shows up here.
    expect(Object.keys(COVERAGE).sort()).toEqual(documented);
  });

  it('enumerated the real routes, so the comparison above is not empty', () => {
    expect(Object.keys(COVERAGE).length).toBeGreaterThanOrEqual(5);
  });
});

describe('cross-tenant: tenant A cannot reach tenant B', () => {
  for (const [operationId, attack] of Object.entries(COVERAGE)) {
    it(operationId, async () => {
      await attack.crossTenant();
    });
  }
});

describe('cross-customer: one fleet cannot reach another inside the same tenant', () => {
  for (const [operationId, attack] of Object.entries(COVERAGE)) {
    it(operationId, async () => {
      await attack.crossCustomer();
    });
  }
});

// ---------------------------------------------------------------------------
// The data layer, independently of the routes
// ---------------------------------------------------------------------------

describe('the repository chokepoint', () => {
  it('cannot be asked for an unscoped read', async () => {
    const service = harness.app.customers.service;

    // Every method takes a Scope, so there is no call that omits the tenant.
    // The nearest thing to an unscoped read is a scope for a tenant that owns
    // nothing, which returns nothing rather than everything.
    const empty = await service.list(makeScope(makeTenantId(99)), { limit: 100 });
    expect(empty.items).toEqual([]);
  });

  it('scopes the outbox read as well as the table read', async () => {
    const service = harness.app.customers.service;

    // The outbox holds all four tenants' events in one table, which is exactly
    // why `tenant_id` on every event row is called non-negotiable.
    const events = await service.readEvents(makeScope(TENANT_A), seed.a1.id, 0);
    expect(events).toHaveLength(1);
    expect(events[0]?.customerId).toBe(seed.a1.id);
  });
});
