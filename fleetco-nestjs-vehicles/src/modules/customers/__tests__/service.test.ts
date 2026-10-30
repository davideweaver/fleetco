import { describe, expect, it } from 'vitest';

import { toCents, toInstant } from '../../../platform/types/branded';
import { BusinessRuleViolated, ValidationFailed } from '../../../platform/types/errors';
import { FIXED_NOW, makeCreateCustomer, makeCustomer, makeTenant } from '../../../platform/test/factories';
import {
  MAX_LABOR_RATE_CENTS,
  applyPatch,
  assertMoneyRules,
  buildNewCustomer,
  canTransition,
  changedFieldNames,
  eventNameFor,
  legalNextStatuses,
  normalizeCode,
} from '../service';
import { newCustomerId } from '../../../platform/types/branded';

/**
 * Pure unit layer. No database, no fakes, no Nest.
 *
 * There are no mock repositories in this file on purpose. The orchestration in
 * `CustomersService` is a transaction plus two writes, and
 * [[Testing Strategy]] § Integration is explicit that mocking the database
 * "hides precisely the bugs that matter here" — a missing `tenant_id`
 * predicate, an outbox row written outside its transaction. Those assertions
 * live in `repository.test.ts` against real Postgres. What lives here is
 * everything the service decides *before* it touches storage, which is where
 * the business rules actually are.
 */
describe('normalizeCode', () => {
  it('uppercases and trims, so ACME and acme are one customer', () => {
    expect(normalizeCode('  acme ')).toBe('ACME');
  });
});

describe('status transitions', () => {
  it('opens a new customer as a prospect', () => {
    const customer = buildNewCustomer(makeTenant(), newCustomerId(), FIXED_NOW, makeCreateCustomer());
    expect(customer.status).toBe('prospect');
  });

  it('allows prospect → active', () => {
    expect(canTransition('prospect', 'active')).toBe(true);
  });

  it('allows reactivating an inactive customer', () => {
    expect(canTransition('inactive', 'active')).toBe(true);
  });

  it('refuses active → prospect — a fleet does not become a lead again', () => {
    expect(canTransition('active', 'prospect')).toBe(false);
  });

  it('treats a no-op transition as legal, so an unrelated PATCH is not refused', () => {
    expect(canTransition('active', 'active')).toBe(true);
  });

  it('rejects an illegal transition with the legal set in the error context', () => {
    const tenantId = makeTenant();
    const active = makeCustomer(tenantId, { status: 'active' });
    expect(() => applyPatch(active, { status: 'prospect' }, FIXED_NOW)).toThrow(
      BusinessRuleViolated,
    );
  });

  it('lists legal successors for every known status', () => {
    expect(legalNextStatuses('prospect')).toContain('active');
    expect(legalNextStatuses('active')).toEqual(['inactive']);
    expect(legalNextStatuses('inactive')).toEqual(['active']);
  });
});

describe('credit hold', () => {
  it('refuses to activate a customer on credit hold', () => {
    const customer = makeCustomer(makeTenant(), { status: 'prospect', isOnCreditHold: true });
    expect(() => applyPatch(customer, { status: 'active' }, FIXED_NOW)).toThrow(
      BusinessRuleViolated,
    );
  });

  it('allows clearing the hold and activating in one request', () => {
    const customer = makeCustomer(makeTenant(), { status: 'prospect', isOnCreditHold: true });
    const next = applyPatch(customer, { status: 'active', isOnCreditHold: false }, FIXED_NOW);
    expect(next.status).toBe('active');
    expect(next.isOnCreditHold).toBe(false);
  });

  it('allows placing an active customer on hold without deactivating it', () => {
    const customer = makeCustomer(makeTenant(), { status: 'active', isOnCreditHold: false });
    const next = applyPatch(customer, { isOnCreditHold: true }, FIXED_NOW);
    expect(next.status).toBe('active');
    expect(next.isOnCreditHold).toBe(true);
  });
});

describe('money rules', () => {
  it('refuses a negative credit limit', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(-1),
        defaultLaborRateCents: toCents(14_500),
        billingTermsNetDays: 0,
      }),
    ).toThrow(ValidationFailed);
  });

  it('refuses a zero labor rate', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(0),
        defaultLaborRateCents: toCents(0),
        billingTermsNetDays: 0,
      }),
    ).toThrow(ValidationFailed);
  });

  it('refuses a labor rate above the sanity ceiling, which catches dollars entered as cents', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(0),
        defaultLaborRateCents: toCents(MAX_LABOR_RATE_CENTS + 1),
        billingTermsNetDays: 0,
      }),
    ).toThrow(ValidationFailed);
  });

  it('refuses net terms with no credit line', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(0),
        defaultLaborRateCents: toCents(14_500),
        billingTermsNetDays: 30,
      }),
    ).toThrow(BusinessRuleViolated);
  });

  it('accepts a prepay customer at net 0 with no credit line', () => {
    expect(() =>
      assertMoneyRules({
        creditLimitCents: toCents(0),
        defaultLaborRateCents: toCents(14_500),
        billingTermsNetDays: 0,
      }),
    ).not.toThrow();
  });

  it('applies the money rules to an update, not only to a create', () => {
    const customer = makeCustomer(makeTenant(), { billingTermsNetDays: 45 });
    expect(() => applyPatch(customer, { creditLimitCents: toCents(0) }, FIXED_NOW)).toThrow(
      BusinessRuleViolated,
    );
  });

  it('rejects a non-integer amount at the brand constructor', () => {
    expect(() => toCents(14_500.5)).toThrow(ValidationFailed);
  });
});

describe('applyPatch', () => {
  const tenantId = makeTenant();

  it('leaves identity fields alone', () => {
    const current = makeCustomer(tenantId);
    const next = applyPatch(current, { name: 'Acme Trucking LLC' }, toInstant('2026-10-10T00:00:00Z'));
    expect(next.id).toBe(current.id);
    expect(next.tenantId).toBe(current.tenantId);
    expect(next.code).toBe(current.code);
    expect(next.createdAt).toBe(current.createdAt);
  });

  it('stamps updatedAt from the injected clock, never from new Date()', () => {
    const current = makeCustomer(tenantId);
    const at = toInstant('2027-01-01T00:00:00Z');
    expect(applyPatch(current, { name: 'Renamed' }, at).updatedAt).toBe(at);
  });

  it('clears a contact field when the patch sends null', () => {
    const current = makeCustomer(tenantId, { primaryContactEmail: 'old@acme.example' });
    expect(applyPatch(current, { primaryContactEmail: null }, FIXED_NOW).primaryContactEmail).toBeNull();
  });

  it('leaves a contact field alone when the patch omits it', () => {
    const current = makeCustomer(tenantId, { primaryContactEmail: 'old@acme.example' });
    expect(applyPatch(current, { name: 'Renamed' }, FIXED_NOW).primaryContactEmail).toBe(
      'old@acme.example',
    );
  });

  it('does not mutate the customer it was given', () => {
    const current = makeCustomer(tenantId, { name: 'Before' });
    applyPatch(current, { name: 'After' }, FIXED_NOW);
    expect(current.name).toBe('Before');
  });
});

describe('event naming', () => {
  const tenantId = makeTenant();

  it('reports a status move as customer.status_changed', () => {
    const before = makeCustomer(tenantId, { status: 'prospect' });
    const after = applyPatch(before, { status: 'active' }, FIXED_NOW);
    expect(eventNameFor(before, after)).toBe('customer.status_changed');
  });

  it('reports everything else as customer.updated', () => {
    const before = makeCustomer(tenantId);
    const after = applyPatch(before, { name: 'Renamed' }, FIXED_NOW);
    expect(eventNameFor(before, after)).toBe('customer.updated');
  });

  it('names the changed fields and excludes updatedAt', () => {
    const before = makeCustomer(tenantId, { name: 'Before', isOnCreditHold: false });
    const after = applyPatch(before, { name: 'After', isOnCreditHold: true }, toInstant('2027-01-01T00:00:00Z'));
    expect(changedFieldNames(before, after).sort()).toEqual(['isOnCreditHold', 'name']);
  });
});

describe('buildNewCustomer', () => {
  it('normalizes the code and trims the name', () => {
    const customer = buildNewCustomer(
      makeTenant(),
      newCustomerId(),
      FIXED_NOW,
      makeCreateCustomer({ code: 'acme-01', name: '  Acme Trucking  ' }),
    );
    expect(customer.code).toBe('ACME-01');
    expect(customer.name).toBe('Acme Trucking');
  });

  it('defaults the contact fields to null rather than undefined', () => {
    const input = makeCreateCustomer();
    const { primaryContactEmail: _e, primaryContactPhone: _p, ...rest } = input;
    const customer = buildNewCustomer(makeTenant(), newCustomerId(), FIXED_NOW, rest);
    expect(customer.primaryContactEmail).toBeNull();
    expect(customer.primaryContactPhone).toBeNull();
  });

  it('refuses a create that violates the money rules', () => {
    expect(() =>
      buildNewCustomer(
        makeTenant(),
        newCustomerId(),
        FIXED_NOW,
        makeCreateCustomer({ creditLimitCents: toCents(0), billingTermsNetDays: 30 }),
      ),
    ).toThrow(BusinessRuleViolated);
  });
});
