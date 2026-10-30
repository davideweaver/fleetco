import { describe, expect, it } from 'vitest';

import type { NewOutboxEvent, OutboxEvent } from '../../../platform/outbox/index.js';
import { newCustomerId, toCents, toInstant } from '../../../platform/types/branded.js';
import type { CustomerId, Instant } from '../../../platform/types/branded.js';
import { fixedClock } from '../../../platform/types/clock.js';
import {
  BusinessRuleViolated,
  Conflict,
  NotFound,
  ValidationFailed,
} from '../../../platform/types/errors.js';
import {
  FROZEN_NOW,
  makeCreateCustomer,
  makeCustomer,
  makeTenant,
  portalPrincipal,
  staffPrincipal,
} from '../../../platform/test/factories.js';
import type { Customer, CustomerPage, ListCustomersQuery } from '../contracts.js';
import { customerTopic } from '../events.js';
import type { CustomerPatch, CustomerStore, CustomerTx } from '../repository.js';
import type { Scope } from '../../../platform/types/scope.js';
import {
  applyPatch,
  assertMoneyRules,
  buildNewCustomer,
  canTransition,
  changedFieldNames,
  createCustomerService,
  eventNameFor,
  legalNextStatuses,
  normalizeCode,
} from '../service.js';

/**
 * Pure unit tests. No database, no HTTP, no AdonisJS, no mocking library —
 * the store is an object literal of the same derived type the real one has,
 * which is the point [[Framework Evaluation]] asks the spike to measure under
 * "how much ceremony to test the service in isolation?"
 *
 * The answer, below, is `fakeStore()`: about forty lines, written once, no
 * `@japa/plugin-adonisjs`, no container, no module metadata. This file is
 * byte-for-byte the same shape as the Fastify spike's — the service layer is
 * the part of the golden module [[Framework Evaluation]] expects to read
 * nearly identically under any candidate.
 *
 * Per [[Testing Strategy]] rule 1 these assertions are written from the rules
 * as stated in the service's own doc comments and in [[Domain Model]], not from
 * reading the implementation's branches.
 */

// ---------------------------------------------------------------------------
// The fake store
// ---------------------------------------------------------------------------

type Recorded = { readonly events: NewOutboxEvent[]; readonly rows: Map<string, Customer> };

function fakeStore(seed: readonly Customer[] = []): {
  readonly store: CustomerStore;
  readonly recorded: Recorded;
  /** Set to make the next `inTransaction` reject, as a unique violation would. */
  failNextInsertWith: Error | null;
} {
  const recorded: Recorded = { events: [], rows: new Map() };
  for (const customer of seed) recorded.rows.set(customer.id, customer);

  const handle = {
    failNextInsertWith: null as Error | null,
    recorded,
    store: {} as CustomerStore,
  };

  const visible = (scope: Scope, customer: Customer | undefined): Customer | null => {
    if (customer === undefined) return null;
    if (customer.tenantId !== scope.tenantId) return null;
    if (scope.customerId !== null && customer.id !== scope.customerId) return null;
    return customer;
  };

  const tx: CustomerTx = {
    findByIdForUpdate: async (scope, id) => visible(scope, recorded.rows.get(id)),
    insert: async (scope, customer) => {
      if (handle.failNextInsertWith !== null) {
        const error = handle.failNextInsertWith;
        handle.failNextInsertWith = null;
        throw error;
      }
      recorded.rows.set(customer.id, { ...customer, tenantId: scope.tenantId });
    },
    update: async (scope, id, patch: CustomerPatch) => {
      const current = visible(scope, recorded.rows.get(id));
      if (current === null) return null;
      const next: Customer = { ...current, ...patch, billingTermsNetDays: current.billingTermsNetDays };
      recorded.rows.set(id, next);
      return next;
    },
    appendEvent: async (event) => {
      recorded.events.push(event);
    },
  };

  handle.store = {
    findById: async (scope, id) => visible(scope, recorded.rows.get(id)),
    findByCode: async (scope, code) =>
      [...recorded.rows.values()].find(
        (customer) => visible(scope, customer) !== null && customer.code === code,
      ) ?? null,
    list: async (scope, _query: ListCustomersQuery): Promise<CustomerPage> => ({
      items: [...recorded.rows.values()].filter((customer) => visible(scope, customer) !== null),
      nextCursor: null,
    }),
    currentCursor: async () => 0,
    readTopicSince: async (): Promise<OutboxEvent[]> => [],
    inTransaction: async (work) => work(tx),
  };

  return handle;
}

function serviceWith(seed: readonly Customer[] = [], nextId: CustomerId = newCustomerId()) {
  const fake = fakeStore(seed);
  const service = createCustomerService({
    store: fake.store,
    clock: fixedClock(FROZEN_NOW),
    newCustomerId: () => nextId,
    // An SSE stream is never opened in this file; `stream`'s own behaviour is
    // integration-shaped and lives in `sse.test.ts`.
    watch: async function* () {
      yield;
    },
    streamTickMs: 1_000,
  });
  return { service, fake };
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

describe('normalizeCode', () => {
  it('uppercases and trims, so `acme` and `ACME` are one fleet', () => {
    expect(normalizeCode('  acme ')).toBe('ACME');
  });
});

describe('legalNextStatuses', () => {
  it('allows prospect to become active or inactive', () => {
    expect(legalNextStatuses('prospect')).toEqual(['active', 'inactive']);
  });

  it('does not allow an active fleet to go back to prospect', () => {
    expect(canTransition('active', 'prospect')).toBe(false);
  });

  it('allows reactivation of an inactive fleet', () => {
    expect(canTransition('inactive', 'active')).toBe(true);
  });

  it('treats a no-op as legal, so a PATCH that resends the current status is accepted', () => {
    expect(canTransition('active', 'active')).toBe(true);
  });
});

describe('assertMoneyRules', () => {
  it('refuses a labor rate of zero', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(100),
        defaultLaborRateCents: toCents(0),
        billingTermsNetDays: 0,
      }),
    ).toThrow(ValidationFailed);
  });

  it('refuses a labor rate above the sanity ceiling, which is the dollars-for-cents bug', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(100),
        defaultLaborRateCents: toCents(450_000),
        billingTermsNetDays: 0,
      }),
    ).toThrow(/are these cents/);
  });

  it('refuses net terms on a fleet with no credit line', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(0),
        defaultLaborRateCents: toCents(14_500),
        billingTermsNetDays: 30,
      }),
    ).toThrow(BusinessRuleViolated);
  });

  it('accepts net 0 on a fleet with no credit line — that is a prepay customer', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(0),
        defaultLaborRateCents: toCents(14_500),
        billingTermsNetDays: 0,
      }),
    ).not.toThrow();
  });
});

describe('buildNewCustomer', () => {
  const { tenantId } = makeTenant();

  it('starts every fleet as a prospect, never as active', () => {
    const customer = buildNewCustomer(tenantId, newCustomerId(), FROZEN_NOW, makeCreateCustomer());
    expect(customer.status).toBe('prospect');
    expect(customer.isOnCreditHold).toBe(false);
  });

  it('takes its timestamps from the injected clock, not from the wall clock', () => {
    const customer = buildNewCustomer(tenantId, newCustomerId(), FROZEN_NOW, makeCreateCustomer());
    expect(customer.createdAt).toBe(FROZEN_NOW);
    expect(customer.updatedAt).toBe(FROZEN_NOW);
  });
});

describe('applyPatch', () => {
  const { tenantId } = makeTenant();
  const later: Instant = toInstant('2026-10-10T09:00:00.000Z');

  it('refuses an illegal transition', () => {
    const active = makeCustomer(tenantId, { status: 'active' });
    expect(() => applyPatch(active, { status: 'prospect' }, later)).toThrow(BusinessRuleViolated);
  });

  it('refuses to activate a fleet that is on credit hold', () => {
    const held = makeCustomer(tenantId, { status: 'prospect', isOnCreditHold: true });
    expect(() => applyPatch(held, { status: 'active' }, later)).toThrow(/credit hold/);
  });

  it('allows an already-active fleet to be put on credit hold without deactivating it', () => {
    const active = makeCustomer(tenantId, { status: 'active' });
    const next = applyPatch(active, { isOnCreditHold: true }, later);
    expect(next.status).toBe('active');
    expect(next.isOnCreditHold).toBe(true);
  });

  it('allows clearing the hold and activating in one request', () => {
    const held = makeCustomer(tenantId, { status: 'prospect', isOnCreditHold: true });
    const next = applyPatch(held, { status: 'active', isOnCreditHold: false }, later);
    expect(next.status).toBe('active');
  });

  it('never moves id, tenant or createdAt', () => {
    const current = makeCustomer(tenantId);
    const next = applyPatch(current, { name: 'Renamed' }, later);
    expect(next.id).toBe(current.id);
    expect(next.tenantId).toBe(current.tenantId);
    expect(next.createdAt).toBe(current.createdAt);
    expect(next.updatedAt).toBe(later);
  });
});

describe('eventNameFor and changedFieldNames', () => {
  const { tenantId } = makeTenant();

  it('reports a status move as status_changed', () => {
    const before = makeCustomer(tenantId, { status: 'prospect' });
    const after = { ...before, status: 'active' as const };
    expect(eventNameFor(before, after)).toBe('customer.status_changed');
    expect(changedFieldNames(before, after)).toEqual(['status']);
  });

  it('reports anything else as updated', () => {
    const before = makeCustomer(tenantId);
    const after = { ...before, name: 'Acme Fleet Services' };
    expect(eventNameFor(before, after)).toBe('customer.updated');
    expect(changedFieldNames(before, after)).toEqual(['name']);
  });

  it('never reports updatedAt as a change', () => {
    const before = makeCustomer(tenantId);
    const after = { ...before, updatedAt: toInstant('2026-12-01T00:00:00.000Z') };
    expect(changedFieldNames(before, after)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

describe('create', () => {
  const { tenantId } = makeTenant();

  it('writes the customer and its outbox event through the same transaction', async () => {
    const { service, fake } = serviceWith();
    const created = await service.create(staffPrincipal(tenantId), makeCreateCustomer());

    expect(fake.recorded.rows.get(created.id)).toBeDefined();
    expect(fake.recorded.events).toHaveLength(1);
    const [event] = fake.recorded.events;
    expect(event?.name).toBe('customer.created');
    expect(event?.topic).toBe(customerTopic(tenantId, created.id));
    expect(event?.customerId).toBe(created.id);
  });

  it('refuses a duplicate code within the tenant', async () => {
    const existing = makeCustomer(tenantId, { code: 'ACME' });
    const { service } = serviceWith([existing]);
    await expect(
      service.create(staffPrincipal(tenantId), makeCreateCustomer({ code: 'acme' })),
    ).rejects.toThrow(Conflict);
  });

  it('translates the unique index violation that the pre-check races against', async () => {
    const { service, fake } = serviceWith();
    fake.failNextInsertWith = Object.assign(new Error('duplicate key'), { code: '23505' });
    await expect(service.create(staffPrincipal(tenantId), makeCreateCustomer())).rejects.toThrow(
      Conflict,
    );
  });

  it('writes no event when the state change fails', async () => {
    const { service, fake } = serviceWith();
    fake.failNextInsertWith = new Error('connection lost');
    await expect(service.create(staffPrincipal(tenantId), makeCreateCustomer())).rejects.toThrow();
    expect(fake.recorded.events).toHaveLength(0);
  });
});

describe('get and update', () => {
  const { tenantId } = makeTenant();

  it('reports a customer in another tenant as not found, not forbidden', async () => {
    const other = makeTenant();
    const theirs = makeCustomer(other.tenantId);
    const { service } = serviceWith([theirs]);
    await expect(service.get(staffPrincipal(tenantId), theirs.id)).rejects.toThrow(NotFound);
  });

  it('reports a sibling customer as not found to a portal principal', async () => {
    const mine = makeCustomer(tenantId, { code: 'ACME' });
    const sibling = makeCustomer(tenantId, { code: 'CITY' });
    const { service } = serviceWith([mine, sibling]);
    await expect(service.get(portalPrincipal(tenantId, mine.id), sibling.id)).rejects.toThrow(
      NotFound,
    );
  });

  it('emits one event naming the fields that moved', async () => {
    const current = makeCustomer(tenantId, { status: 'prospect' });
    const { service, fake } = serviceWith([current]);
    await service.update(staffPrincipal(tenantId), current.id, { status: 'active' });

    expect(fake.recorded.events).toHaveLength(1);
    const [event] = fake.recorded.events;
    expect(event?.name).toBe('customer.status_changed');
    expect(event?.payload).toMatchObject({ changed: ['status'], status: 'active' });
  });
});
