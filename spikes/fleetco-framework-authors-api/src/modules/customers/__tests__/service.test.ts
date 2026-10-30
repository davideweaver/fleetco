import { describe, expect, it } from 'vitest';

import {
  BusinessRuleViolated,
  Conflict,
  NotFound,
} from '../../../lib/errors/DomainError.js';
import type { NewOutboxEvent, OutboxEvent } from '../../../lib/outbox/repository.js';
import { fixedClock } from '../../../lib/types/clock.js';
import { toCents, type CustomerId, type Instant } from '../../../lib/types/branded.js';
import {
  FIXED_NOW,
  makeCreateCustomer,
  makeCustomer,
  makeCustomerId,
  makeScope,
  makeTenantId,
} from '../../../lib/test/factories.js';
import type { Customer, CustomerPage, ListCustomersQuery } from '../contracts.js';
import type { CustomerPatch, CustomersRepository } from '../repository.js';
import {
  availableCreditCents,
  canAuthorize,
  createCustomersService,
  isLegalStatusTransition,
  normalizeCode,
} from '../service.js';

/**
 * Pure unit tests: the service, with no database anywhere.
 *
 * **The whole test double is the object literal below.** No mocking framework,
 * no container, no `@nestjs/testing` module, no `beforeEach` that builds a
 * graph. `CustomersRepository` is derived from the real factory's return type,
 * so this fake fails to compile the moment the repository's shape changes —
 * which is the property a hand-written `interface ICustomersRepository` would
 * have given up, along with being an interface with one implementation.
 *
 * [[Testing Strategy]] rule 1 asks for tests derived from the specification
 * rather than from the implementation. The business rules here are the ones
 * recorded in NOTES.md section 1.2, written out as assertions before being
 * compared against the code.
 */

const TENANT = makeTenantId(1);
const CUSTOMER_ID = makeCustomerId(1);

type Recorded = { event: NewOutboxEvent; values: CustomerPatch };

function fakeRepository(seed: Customer[] = []): CustomersRepository & {
  recorded: Recorded[];
  failWith: (err: Error) => void;
  conflictNext: () => void;
} {
  const rows = new Map<string, Customer>(seed.map((customer) => [customer.id, customer]));
  const recorded: Recorded[] = [];
  let failure: Error | null = null;
  let conflict = false;

  return {
    recorded,
    failWith: (err: Error) => {
      failure = err;
    },
    // What the real `applyUpdate` returns when its `updated_at` predicate
    // matches nothing: somebody else changed the row in between.
    conflictNext: () => {
      conflict = true;
    },

    findById: async (scope, id): Promise<Customer | null> => {
      const found = rows.get(id);
      // The fake applies the same scope the real repository's SQL does, because
      // a fake that ignores scope would let a scoping bug pass this suite.
      if (!found || found.tenantId !== scope.tenantId) {
        return null;
      }
      if (scope.customerId !== null && scope.customerId !== id) {
        return null;
      }
      return found;
    },

    list: async (scope, query: ListCustomersQuery): Promise<CustomerPage> => {
      const items = [...rows.values()]
        .filter((customer) => customer.tenantId === scope.tenantId)
        .filter((customer) => scope.customerId === null || customer.id === scope.customerId)
        .filter((customer) => query.status === undefined || customer.status === query.status);
      return { items, nextCursor: null };
    },

    insert: async (_scope, customer, event): Promise<Customer> => {
      if (failure) {
        throw failure;
      }
      rows.set(customer.id, customer);
      recorded.push({ event, values: { updatedAt: customer.updatedAt } });
      return customer;
    },

    applyUpdate: async (
      _scope,
      id: CustomerId,
      expectedUpdatedAt: Instant,
      values: CustomerPatch,
      event: NewOutboxEvent,
    ): Promise<Customer | null> => {
      if (failure) {
        throw failure;
      }
      if (conflict) {
        conflict = false;
        return null;
      }
      const existing = rows.get(id);
      if (!existing || existing.updatedAt !== expectedUpdatedAt) {
        return null;
      }
      recorded.push({ event, values });
      const updated: Customer = {
        ...existing,
        ...(values.name === undefined ? {} : { name: values.name }),
        ...(values.status === undefined ? {} : { status: values.status }),
        ...(values.isOnCreditHold === undefined
          ? {}
          : { isOnCreditHold: values.isOnCreditHold }),
        ...(values.creditLimitCents === undefined
          ? {}
          : { creditLimitCents: values.creditLimitCents }),
        updatedAt: FIXED_NOW,
      };
      rows.set(id, updated);
      return updated;
    },

    listEvents: async (): Promise<OutboxEvent[]> => [],
  };
}

function subject(seed: Customer[] = []) {
  const repository = fakeRepository(seed);
  const service = createCustomersService({ repository, clock: fixedClock(FIXED_NOW) });
  return { repository, service };
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

describe('normalizeCode', () => {
  it('upper-cases and trims, so one fleet cannot exist twice under two spellings', () => {
    expect(normalizeCode('  acme-1 ')).toBe('ACME-1');
  });
});

describe('isLegalStatusTransition', () => {
  it('permits prospect to active and prospect to inactive', () => {
    expect(isLegalStatusTransition('prospect', 'active')).toBe(true);
    expect(isLegalStatusTransition('prospect', 'inactive')).toBe(true);
  });

  it('permits deactivating and reactivating', () => {
    expect(isLegalStatusTransition('active', 'inactive')).toBe(true);
    expect(isLegalStatusTransition('inactive', 'active')).toBe(true);
  });

  it('refuses a return to prospect, because service history now exists', () => {
    expect(isLegalStatusTransition('active', 'prospect')).toBe(false);
    expect(isLegalStatusTransition('inactive', 'prospect')).toBe(false);
  });

  it('treats a no-op as legal', () => {
    expect(isLegalStatusTransition('active', 'active')).toBe(true);
  });
});

describe('availableCreditCents', () => {
  it('is the limit less the open balance', () => {
    const customer = makeCustomer({ creditLimitCents: toCents(500_000) });
    expect(availableCreditCents(customer, toCents(120_000))).toBe(380_000);
  });

  it('floors at zero rather than going negative', () => {
    const customer = makeCustomer({ creditLimitCents: toCents(100) });
    expect(availableCreditCents(customer, toCents(900))).toBe(0);
  });
});

describe('canAuthorize', () => {
  it('permits an estimate within the available credit', () => {
    const customer = makeCustomer({ creditLimitCents: toCents(100_000) });
    expect(canAuthorize(customer, toCents(40_000), toCents(60_000))).toBe(true);
  });

  it('refuses an estimate one cent over', () => {
    const customer = makeCustomer({ creditLimitCents: toCents(100_000) });
    expect(canAuthorize(customer, toCents(40_000), toCents(60_001))).toBe(false);
  });

  it('refuses everything while the fleet is on credit hold, however much room it has', () => {
    const customer = makeCustomer({
      creditLimitCents: toCents(10_000_000),
      isOnCreditHold: true,
    });
    expect(canAuthorize(customer, toCents(0), toCents(1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('create', () => {
  it('starts a new fleet as a prospect, not on hold, with a minted id', async () => {
    const { service } = subject();

    const created = await service.create(makeScope(TENANT), makeCreateCustomer());

    expect(created.status).toBe('prospect');
    expect(created.isOnCreditHold).toBe(false);
    expect(created.tenantId).toBe(TENANT);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toBe(FIXED_NOW);
  });

  it('normalises the code', async () => {
    const { service } = subject();
    const created = await service.create(makeScope(TENANT), makeCreateCustomer({ code: 'acme' }));
    expect(created.code).toBe('ACME');
  });

  it('writes exactly one customer.created event', async () => {
    const { service, repository } = subject();
    await service.create(makeScope(TENANT), makeCreateCustomer());

    expect(repository.recorded).toHaveLength(1);
    expect(repository.recorded[0]?.event.name).toBe('customer.created');
    // The event carries the customer id, which is what makes it visible to that
    // fleet's portal users and to nobody else.
    expect(repository.recorded[0]?.event.customerId).not.toBeNull();
    expect(repository.recorded[0]?.event.tenantId).toBe(TENANT);
  });

  it('refuses a portal principal, whose scope is one fleet it did not create', async () => {
    const { service } = subject();
    await expect(
      service.create(makeScope(TENANT, CUSTOMER_ID), makeCreateCustomer()),
    ).rejects.toBeInstanceOf(BusinessRuleViolated);
  });

  it('turns a unique violation on the code into a Conflict', async () => {
    const { service, repository } = subject();
    repository.failWith(Object.assign(new Error('duplicate key'), { code: '23505' }));

    await expect(service.create(makeScope(TENANT), makeCreateCustomer())).rejects.toBeInstanceOf(
      Conflict,
    );
  });

  it('does not swallow an error that is not a unique violation', async () => {
    const { service, repository } = subject();
    repository.failWith(new Error('connection terminated'));

    await expect(service.create(makeScope(TENANT), makeCreateCustomer())).rejects.toThrow(
      'connection terminated',
    );
  });
});

// ---------------------------------------------------------------------------
// get and update
// ---------------------------------------------------------------------------

describe('get', () => {
  it('returns the fleet in scope', async () => {
    const customer = makeCustomer({ tenantId: TENANT, id: CUSTOMER_ID });
    const { service } = subject([customer]);

    await expect(service.get(makeScope(TENANT), CUSTOMER_ID)).resolves.toMatchObject({
      id: CUSTOMER_ID,
    });
  });

  it('reports NotFound, not Forbidden, for another tenant’s fleet', async () => {
    const customer = makeCustomer({ tenantId: makeTenantId(2), id: CUSTOMER_ID });
    const { service } = subject([customer]);

    // A 403 would confirm the id exists, which is itself a leak.
    await expect(service.get(makeScope(TENANT), CUSTOMER_ID)).rejects.toBeInstanceOf(NotFound);
  });

  it('reports NotFound for a different fleet inside the same tenant', async () => {
    const other = makeCustomer({ tenantId: TENANT, id: makeCustomerId(9) });
    const { service } = subject([other]);

    // The portal case: a principal scoped to customer 1 asking for customer 9.
    await expect(
      service.get(makeScope(TENANT, CUSTOMER_ID), makeCustomerId(9)),
    ).rejects.toBeInstanceOf(NotFound);
  });
});

describe('update', () => {
  const seeded = (overrides: Partial<Customer> = {}) =>
    subject([makeCustomer({ tenantId: TENANT, id: CUSTOMER_ID, ...overrides })]);

  it('applies a name change and emits customer.updated naming the changed field', async () => {
    const { service, repository } = seeded();

    const updated = await service.update(makeScope(TENANT), CUSTOMER_ID, {
      name: 'Acme Trucking LLC',
    });

    expect(updated.name).toBe('Acme Trucking LLC');
    expect(repository.recorded[0]?.event.name).toBe('customer.updated');
    expect(repository.recorded[0]?.event.payload).toEqual({ changedFields: ['name'] });
  });

  it('emits customer.status_changed in preference to customer.updated', async () => {
    const { service, repository } = seeded();

    await service.update(makeScope(TENANT), CUSTOMER_ID, { status: 'active', name: 'Renamed' });

    expect(repository.recorded).toHaveLength(1);
    expect(repository.recorded[0]?.event.name).toBe('customer.status_changed');
    expect(repository.recorded[0]?.event.payload).toEqual({ from: 'prospect', to: 'active' });
  });

  it('emits credit_hold_placed and credit_hold_released', async () => {
    const placed = seeded();
    await placed.service.update(makeScope(TENANT), CUSTOMER_ID, { isOnCreditHold: true });
    expect(placed.repository.recorded[0]?.event.name).toBe('customer.credit_hold_placed');

    const released = seeded({ isOnCreditHold: true });
    await released.service.update(makeScope(TENANT), CUSTOMER_ID, { isOnCreditHold: false });
    expect(released.repository.recorded[0]?.event.name).toBe('customer.credit_hold_released');
  });

  it('refuses an illegal status transition', async () => {
    const { service } = seeded({ status: 'active' });

    await expect(
      service.update(makeScope(TENANT), CUSTOMER_ID, { status: 'prospect' }),
    ).rejects.toBeInstanceOf(BusinessRuleViolated);
  });

  it('refuses to activate a fleet that is on credit hold', async () => {
    const { service } = seeded({ isOnCreditHold: true });

    await expect(
      service.update(makeScope(TENANT), CUSTOMER_ID, { status: 'active' }),
    ).rejects.toBeInstanceOf(BusinessRuleViolated);
  });

  it('allows activating in the same request that releases the hold', async () => {
    const { service } = seeded({ isOnCreditHold: true });

    const updated = await service.update(makeScope(TENANT), CUSTOMER_ID, {
      status: 'active',
      isOnCreditHold: false,
    });

    expect(updated.status).toBe('active');
  });

  it('writes nothing and emits nothing when every field already matches', async () => {
    const { service, repository } = seeded({ name: 'Acme Trucking' });

    const updated = await service.update(makeScope(TENANT), CUSTOMER_ID, {
      name: 'Acme Trucking',
    });

    expect(updated.name).toBe('Acme Trucking');
    expect(repository.recorded).toHaveLength(0);
  });

  it('reports a Conflict when the fleet changed while the update was being prepared', async () => {
    const { service, repository } = seeded();
    // The scoped UPDATE carries `updated_at = <the row we read>`; zero rows
    // affected means a concurrent edit, not a missing row.
    repository.conflictNext();

    await expect(
      service.update(makeScope(TENANT), CUSTOMER_ID, { name: 'Second writer' }),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it('refuses to update another tenant’s fleet', async () => {
    const { service } = subject([
      makeCustomer({ tenantId: makeTenantId(2), id: CUSTOMER_ID }),
    ]);

    await expect(
      service.update(makeScope(TENANT), CUSTOMER_ID, { name: 'Taken over' }),
    ).rejects.toBeInstanceOf(NotFound);
  });
});
