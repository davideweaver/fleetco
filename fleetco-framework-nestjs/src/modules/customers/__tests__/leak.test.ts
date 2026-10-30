import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { documentedOperations } from '../../../platform/openapi/document';
import {
  drainOutbox,
  headersFor,
  resetData,
  startApp,
  wire,
} from '../../../platform/test/harness';
import type { RunningApp, Wiring } from '../../../platform/test/harness';
import {
  makeCreateCustomer,
  makePortalPrincipal,
  makeStaffPrincipal,
  makeTenant,
} from '../../../platform/test/factories';
import { newCustomerId } from '../../../platform/types/branded';
import type { TenantId } from '../../../platform/types/branded';
import type { Principal } from '../../../platform/types/principal';
import type { Customer } from '../contracts';

/**
 * The cross-tenant and cross-customer leak suite — "the single highest-value
 * test asset in the product", and a required deploy gate with no override
 * ([[Tenancy Model]] non-negotiable 7, [[Testing Strategy]] § Cross-Tenant
 * Leak Suite).
 *
 * The structure follows the spec exactly:
 *
 *  1. Two tenants, each with two customers.
 *  2. For **every** endpoint: authenticate as tenant A, request tenant B's
 *     resources, assert refusal.
 *  3. For **every** SSE topic: subscribe as tenant A, assert nothing from
 *     tenant B ever arrives.
 *  4. Then the same two steps for two customers *inside* one tenant — the
 *     portal case, which is the one that matters on day one.
 *
 * The endpoint list is not hand-maintained. It is enumerated from the
 * generated OpenAPI document and cross-checked against Nest's own router, so
 * adding a route without leak coverage fails this suite rather than shipping.
 */
const TENANT_A: TenantId = makeTenant();
const TENANT_B: TenantId = makeTenant();

let running: RunningApp;
let seeding: Wiring;

type Seed = {
  readonly staffA: Principal;
  readonly staffB: Principal;
  readonly a1: Customer;
  readonly a2: Customer;
  readonly b1: Customer;
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
  seed = {
    staffA,
    staffB,
    a1: await seeding.service.create(staffA, makeCreateCustomer({ code: 'A1', name: 'Acme' })),
    a2: await seeding.service.create(staffA, makeCreateCustomer({ code: 'A2', name: 'Bravo' })),
    b1: await seeding.service.create(staffB, makeCreateCustomer({ code: 'B1', name: 'City' })),
  };
  await drainOutbox(running.dispatcher);
});

// ---------------------------------------------------------------------------
// 1. The suite cannot silently fall behind
// ---------------------------------------------------------------------------

/**
 * Every tenant-scoped operation, keyed exactly as the OpenAPI document names
 * it. `probe` performs the cross-boundary request; the test asserts refusal.
 */
type Probe = (actor: Principal, foreign: Customer) => Promise<Response>;

const PROBES: Record<string, Probe> = {
  'GET /v1/customers': (actor) => request('GET', '/v1/customers', actor),
  'POST /v1/customers': (actor) =>
    request('POST', '/v1/customers', actor, makeCreateCustomer({ code: 'NEW' })),
  'GET /v1/customers/{customerId}': (actor, foreign) =>
    request('GET', `/v1/customers/${foreign.id}`, actor),
  'PATCH /v1/customers/{customerId}': (actor, foreign) =>
    request('PATCH', `/v1/customers/${foreign.id}`, actor, { name: 'Hijacked' }),
  'GET /v1/customers/{customerId}/events': (actor, foreign) =>
    request('GET', `/v1/customers/${foreign.id}/events`, actor, undefined, {
      'last-event-id': '0',
    }),
};

describe('the suite covers the whole surface', () => {
  it('has a probe for every operation in the generated OpenAPI document', () => {
    expect(Object.keys(PROBES).sort()).toEqual(documentedOperations());
  });

  it('has no route registered that the OpenAPI document does not describe', () => {
    expect(registeredOperations(running).sort()).toEqual(documentedOperations());
  });
});

// ---------------------------------------------------------------------------
// 2. Cross-tenant: authenticate as A, ask for B
// ---------------------------------------------------------------------------

describe('cross-tenant refusal, every endpoint', () => {
  for (const [operation, probe] of Object.entries(PROBES)) {
    it(`${operation} refuses tenant B's resource to tenant A`, async () => {
      const response = await probe(seed.staffA, seed.b1);

      if (operation === 'GET /v1/customers') {
        // A collection cannot 404; the leak would be a foreign row in the body.
        const page = (await response.json()) as { items: { id: string }[] };
        expect(response.status).toBe(200);
        expect(page.items.map((item) => item.id).sort()).toEqual([seed.a1.id, seed.a2.id].sort());
        return;
      }
      if (operation === 'POST /v1/customers') {
        // A create cannot reach another tenant: the tenant comes from the
        // principal, never from the body. Assert the row landed in A only.
        expect(response.status).toBe(201);
        const created = (await response.json()) as { id: string; tenantId: string };
        expect(created.tenantId).toBe(TENANT_A);
        const fromB = await request('GET', `/v1/customers/${created.id}`, seed.staffB);
        expect(fromB.status).toBe(404);
        return;
      }
      expect(response.status).toBe(404);
      await expectNoLeakedBody(response, seed.b1);
    });
  }

  it('refuses a foreign id exactly as it refuses a nonexistent one', async () => {
    // Anti-enumeration: a caller must not be able to tell "exists, but not
    // yours" from "does not exist". The only permitted difference between the
    // two bodies is the id the caller itself supplied.
    const absent = newCustomerId();
    const [foreign, nonexistent] = await Promise.all([
      request('GET', `/v1/customers/${seed.b1.id}`, seed.staffA),
      request('GET', `/v1/customers/${absent}`, seed.staffA),
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
    it(`${operation} refuses a sibling customer to a portal principal`, async () => {
      const portal = makePortalPrincipal(TENANT_A, seed.a1.id);
      const response = await probe(portal, seed.a2);

      if (operation === 'GET /v1/customers') {
        const page = (await response.json()) as { items: { id: string }[] };
        expect(response.status).toBe(200);
        expect(page.items.map((item) => item.id)).toEqual([seed.a1.id]);
        return;
      }
      if (operation === 'POST /v1/customers' || operation === 'PATCH /v1/customers/{customerId}') {
        // A portal principal has no write role at all.
        expect(response.status).toBe(403);
        return;
      }
      expect(response.status).toBe(404);
      await expectNoLeakedBody(response, seed.a2);
    });
  }

  it('lets a portal principal read its own customer, so the refusals above mean something', async () => {
    const portal = makePortalPrincipal(TENANT_A, seed.a1.id);
    const response = await request('GET', `/v1/customers/${seed.a1.id}`, portal);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { id: string }).id).toBe(seed.a1.id);
  });
});

// ---------------------------------------------------------------------------
// 4. The SSE surface
// ---------------------------------------------------------------------------

describe('the SSE topic refuses the other tenant', () => {
  it('never delivers another tenant’s events to a subscriber', async () => {
    const stream = await openSse(`/v1/customers/${seed.a1.id}/events`, seed.staffA);
    try {
      // Churn on both tenants while the subscription is open.
      await seeding.service.update(seed.staffB, seed.b1.id, { name: 'City Hauling Inc' });
      await seeding.service.update(seed.staffA, seed.a1.id, { name: 'Acme Trucking' });
      await drainOutbox(running.dispatcher);
      await delay(600);

      const body = stream.text();
      expect(body).toContain(seed.a1.id);
      expect(body).not.toContain(seed.b1.id);
      expect(body).not.toContain(TENANT_B);
      expect(body).not.toContain('City Hauling Inc');
    } finally {
      stream.close();
    }
  });

  it('refuses to open a stream on another tenant’s customer', async () => {
    const response = await request('GET', `/v1/customers/${seed.b1.id}/events`, seed.staffA);
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).not.toContain('text/event-stream');
  });
});

describe('the SSE topic refuses a sibling customer', () => {
  it('never delivers a sibling customer’s events to a portal subscriber', async () => {
    const portal = makePortalPrincipal(TENANT_A, seed.a1.id);
    const stream = await openSse(`/v1/customers/${seed.a1.id}/events`, portal);
    try {
      await seeding.service.update(seed.staffA, seed.a2.id, { name: 'Bravo Logistics' });
      await seeding.service.update(seed.staffA, seed.a1.id, { name: 'Acme Trucking' });
      await drainOutbox(running.dispatcher);
      await delay(600);

      const body = stream.text();
      expect(body).toContain(seed.a1.id);
      expect(body).not.toContain(seed.a2.id);
      expect(body).not.toContain('Bravo Logistics');
    } finally {
      stream.close();
    }
  });

  it('refuses to open a stream on a sibling customer', async () => {
    const portal = makePortalPrincipal(TENANT_A, seed.a1.id);
    const response = await request('GET', `/v1/customers/${seed.a2.id}/events`, portal);
    expect(response.status).toBe(404);
  });

  it('replays only the subscriber’s own history from a cursor of zero', async () => {
    const portal = makePortalPrincipal(TENANT_A, seed.a1.id);
    const stream = await openSse(`/v1/customers/${seed.a1.id}/events`, portal, '0');
    try {
      await delay(400);
      const body = stream.text();
      expect(body).toContain('customer.created');
      expect(body).toContain(seed.a1.id);
      expect(body).not.toContain(seed.a2.id);
      expect(body).not.toContain(seed.b1.id);
    } finally {
      stream.close();
    }
  });
});

describe('an unauthenticated request', () => {
  it('is refused on every documented operation', async () => {
    // Enumerated, not listed. A new route marked `@Public()` by mistake, or a
    // controller that forgets the global guard, fails here.
    for (const operation of documentedOperations()) {
      const [method = 'GET', template = '/'] = operation.split(' ');
      const path = template.replace('{customerId}', seed.a1.id);
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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function request(
  method: string,
  path: string,
  principal: Principal,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${running.baseUrl}${path}`, {
    method,
    headers: { ...headersFor(principal), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/**
 * A refusal must not describe what it refused.
 *
 * The requested id is deliberately *not* asserted against: the caller supplied
 * it in the URL, and [[Code Standards and Guardrails]] § Errors specifies that
 * error context carries the entity id. What must never appear is any attribute
 * the caller did not already have — the name, the code, the owning tenant.
 * Indistinguishability from a nonexistent id is asserted separately below.
 */
async function expectNoLeakedBody(response: Response, foreign: Customer): Promise<void> {
  const text = await response.text();
  expect(text).not.toContain(foreign.name);
  expect(text).not.toContain(foreign.code);
  expect(text).not.toContain(foreign.tenantId);
}

type OpenStream = { text: () => string; close: () => void };

/** Opens an SSE connection and accumulates raw frames until closed. */
async function openSse(
  path: string,
  principal: Principal,
  lastEventId?: string,
): Promise<OpenStream> {
  const controller = new AbortController();
  const response = await fetch(`${running.baseUrl}${path}`, {
    headers: {
      ...headersFor(principal),
      ...(lastEventId === undefined ? {} : { 'last-event-id': lastEventId }),
    },
    signal: controller.signal,
  });
  if (response.body === null) throw new Error(`no stream body for ${path}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const chunks: string[] = [];
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  void (async (): Promise<void> => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        chunks.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Aborted by `close()`.
    }
  })();

  return {
    text: () => chunks.join(''),
    close: () => controller.abort(),
  };
}

/**
 * Nest's registered routes, as `METHOD /path` with OpenAPI path templates, so
 * they can be compared with the generated document. `/health` is excluded: it
 * is infrastructure read by the load balancer, carries no tenant data, and is
 * deliberately not part of the public contract.
 */
function registeredOperations(app: RunningApp): string[] {
  const instance: unknown = app.app.getHttpAdapter().getInstance();
  const stack = routerStack(instance);
  const operations: string[] = [];

  for (const layer of stack) {
    const route = layer.route;
    if (route === undefined) continue;
    const path = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    if (path.startsWith('/health')) continue;
    for (const [method, enabled] of Object.entries(route.methods)) {
      if (enabled) operations.push(`${method.toUpperCase()} ${path}`);
    }
  }
  if (operations.length === 0) throw new Error('could not read the router — the suite would pass vacuously');
  return operations;
}

type RouterLayer = { route?: { path: string; methods: Record<string, boolean> } };

/** Express 5 exposes `router`; Express 4 exposed `_router`. Support both. */
function routerStack(instance: unknown): RouterLayer[] {
  if (instance === null || (typeof instance !== 'object' && typeof instance !== 'function')) {
    return [];
  }
  const candidates = ['router', '_router'] as const;
  for (const key of candidates) {
    if (!(key in instance)) continue;
    const router: unknown = Reflect.get(instance, key);
    // An Express router is a *function* with a `stack` property, not a plain
    // object — which is the kind of detail that makes router introspection a
    // poor foundation and is called out in NOTES.md.
    if (router === null || (typeof router !== 'object' && typeof router !== 'function')) continue;
    if (!('stack' in router)) continue;
    const stack: unknown = Reflect.get(router, 'stack');
    if (Array.isArray(stack)) return stack as RouterLayer[];
  }
  return [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
