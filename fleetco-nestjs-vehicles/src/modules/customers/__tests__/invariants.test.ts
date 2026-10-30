import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  newCustomerId,
  toCents,
  toCustomerId,
  toInstant,
} from '../../../platform/types/branded';
import { DomainError, ValidationFailed } from '../../../platform/types/errors';
import { FIXED_NOW, makeCreateCustomer, makeCustomer, makeTenant } from '../../../platform/test/factories';
import { BILLING_TERMS_NET_DAYS, CUSTOMER_STATUSES, customerSchema } from '../contracts';
import type {
  BillingTermsNetDays,
  Customer,
  CustomerStatus,
  UpdateCustomer,
} from '../contracts';
import {
  MAX_LABOR_RATE_CENTS,
  applyPatch,
  assertMoneyRules,
  buildNewCustomer,
  canTransition,
  changedFieldNames,
  legalNextStatuses,
  normalizeCode,
} from '../service';

/**
 * Property-based layer. [[Testing Strategy]] calls these "the highest-value
 * tests in this system", because the implementation was written by an agent
 * and an invariant is a claim the spec makes rather than a claim the code
 * makes about itself.
 *
 * Each property below restates a rule from the spec independently of how the
 * implementation computes it. The money-rule property in particular re-derives
 * the predicate from the written rule rather than calling the same helper, so
 * it fails if the implementation drifts.
 */
const TENANT = makeTenant();

const statusArb = fc.constantFrom<CustomerStatus>(...CUSTOMER_STATUSES);
const termsArb = fc.constantFrom<BillingTermsNetDays>(...BILLING_TERMS_NET_DAYS);
const rateArb = fc.integer({ min: 1, max: MAX_LABOR_RATE_CENTS });

/** Credit limit and terms are not independent: net terms require a credit line. */
const moneyArb = fc
  .tuple(fc.integer({ min: 0, max: 50_000_000 }), termsArb)
  .map(([credit, terms]) => ({
    creditLimitCents: toCents(terms > 0 && credit === 0 ? 1 : credit),
    billingTermsNetDays: terms,
  }));

const customerArb: fc.Arbitrary<Customer> = fc
  .tuple(statusArb, moneyArb, rateArb, fc.boolean(), fc.string({ minLength: 1, maxLength: 40 }))
  .map(([status, money, rate, isOnCreditHold, name]) =>
    makeCustomer(TENANT, {
      status,
      isOnCreditHold,
      creditLimitCents: money.creditLimitCents,
      billingTermsNetDays: money.billingTermsNetDays,
      defaultLaborRateCents: toCents(rate),
      name,
    }),
  );

const patchArb: fc.Arbitrary<UpdateCustomer> = fc
  .tuple(
    fc.option(statusArb, { nil: undefined }),
    fc.option(fc.boolean(), { nil: undefined }),
    fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
    fc.option(rateArb, { nil: undefined }),
  )
  .map(([status, isOnCreditHold, name, rate]) => {
    const patch: Record<string, unknown> = {};
    if (status !== undefined) patch.status = status;
    if (isOnCreditHold !== undefined) patch.isOnCreditHold = isOnCreditHold;
    if (name !== undefined) patch.name = name;
    if (rate !== undefined) patch.defaultLaborRateCents = toCents(rate);
    return patch as UpdateCustomer;
  });

/**
 * Applies a patch, or reports that the business rules refused it. A
 * `DomainError` is a legitimate outcome for a generated input; anything else
 * is a crash and is rethrown, so a `TypeError` cannot masquerade as a refusal.
 */
function tryApply(current: Customer, patch: UpdateCustomer, at = FIXED_NOW): Customer | 'refused' {
  try {
    return applyPatch(current, patch, at);
  } catch (error) {
    if (error instanceof DomainError) return 'refused';
    throw error;
  }
}

describe('normalizeCode', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        expect(normalizeCode(normalizeCode(raw))).toBe(normalizeCode(raw));
      }),
    );
  });

  it('always returns a trimmed, uppercased string', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const code = normalizeCode(raw);
        expect(code).toBe(code.trim());
        expect(code).toBe(code.toUpperCase());
      }),
    );
  });
});

describe('the status machine', () => {
  it('is total — no status pair throws', () => {
    fc.assert(
      fc.property(statusArb, statusArb, (from, to) => {
        expect(typeof canTransition(from, to)).toBe('boolean');
      }),
    );
  });

  it('only ever names known statuses as successors', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        for (const next of legalNextStatuses(status)) {
          expect(CUSTOMER_STATUSES).toContain(next);
        }
      }),
    );
  });

  it('treats every no-op transition as legal, so an unrelated PATCH never fails on status', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        expect(canTransition(status, status)).toBe(true);
      }),
    );
  });

  it('can reach inactive from any status in at most two legal steps', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        const reachable = new Set<CustomerStatus>([status]);
        for (let step = 0; step < 2; step += 1) {
          for (const current of [...reachable]) {
            for (const next of legalNextStatuses(current)) reachable.add(next);
          }
        }
        expect(reachable.has('inactive')).toBe(true);
      }),
    );
  });
});

describe('applyPatch', () => {
  it('never changes an identity field', () => {
    fc.assert(
      fc.property(customerArb, patchArb, (current, patch) => {
        const next = tryApply(current, patch);
        if (next === 'refused') return;
        expect(next.id).toBe(current.id);
        expect(next.tenantId).toBe(current.tenantId);
        expect(next.code).toBe(current.code);
        expect(next.createdAt).toBe(current.createdAt);
      }),
    );
  });

  it('never produces an illegal status transition', () => {
    fc.assert(
      fc.property(customerArb, patchArb, (current, patch) => {
        const next = tryApply(current, patch);
        if (next === 'refused') return;
        expect(canTransition(current.status, next.status)).toBe(true);
      }),
    );
  });

  it('never activates a customer that is left on credit hold', () => {
    fc.assert(
      fc.property(customerArb, patchArb, (current, patch) => {
        const next = tryApply(current, patch);
        if (next === 'refused') return;
        if (next.status === 'active' && current.status !== 'active') {
          expect(next.isOnCreditHold).toBe(false);
        }
      }),
    );
  });

  it('is idempotent — reapplying the same patch to its own result changes nothing', () => {
    fc.assert(
      fc.property(customerArb, patchArb, (current, patch) => {
        const once = tryApply(current, patch);
        if (once === 'refused') return;
        const twice = tryApply(once, patch);
        expect(twice).toEqual(once);
      }),
    );
  });

  it('leaves the input value untouched', () => {
    fc.assert(
      fc.property(customerArb, patchArb, (current, patch) => {
        const snapshot = structuredClone(current);
        tryApply(current, patch);
        expect(current).toEqual(snapshot);
      }),
    );
  });

  it('always produces a value that satisfies the money rules', () => {
    fc.assert(
      fc.property(customerArb, patchArb, (current, patch) => {
        const next = tryApply(current, patch);
        if (next === 'refused') return;
        expect(() => assertMoneyRules(next)).not.toThrow();
      }),
    );
  });
});

describe('the money rules', () => {
  /**
   * The predicate is restated here from the written rule, not borrowed from
   * the implementation. If `assertMoneyRules` drifts from the spec, these two
   * disagree and the property fails.
   */
  it('accepts exactly the states the rules describe', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000, max: 1_000_000 }),
        fc.integer({ min: -1_000, max: MAX_LABOR_RATE_CENTS + 1_000 }),
        termsArb,
        (credit, rate, terms) => {
          const shouldPass =
            credit >= 0 && rate > 0 && rate <= MAX_LABOR_RATE_CENTS && !(terms > 0 && credit === 0);

          const check = (): void =>
            assertMoneyRules({
              creditLimitCents: toCents(credit),
              defaultLaborRateCents: toCents(rate),
              billingTermsNetDays: terms,
            });

          if (shouldPass) expect(check).not.toThrow();
          else expect(check).toThrow();
        },
      ),
    );
  });
});

describe('the Cents brand', () => {
  it('accepts every safe integer unchanged', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        expect(toCents(value)).toBe(value);
      }),
    );
  });

  it('refuses every non-integer, so a float cannot enter the system', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Number.isInteger(n)),
        (value) => {
          expect(() => toCents(value)).toThrow(ValidationFailed);
        },
      ),
    );
  });
});

describe('identifiers', () => {
  it('mints UUIDv7s that round-trip through the brand constructor', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const id = newCustomerId();
        expect(toCustomerId(id)).toBe(id);
        // Version nibble must be 7 — time-ordered, for index locality.
        expect(id[14]).toBe('7');
      }),
      { numRuns: 200 },
    );
  });
});

describe('the wire contract', () => {
  it('round-trips every customer the service can build', () => {
    fc.assert(
      fc.property(moneyArb, rateArb, fc.string({ minLength: 1, maxLength: 40 }), (money, rate, name) => {
        const customer = buildNewCustomer(
          TENANT,
          newCustomerId(),
          toInstant('2026-10-09T14:00:00Z'),
          makeCreateCustomer({
            name: `Fleet ${name.replace(/\s+/g, ' ').trim() || 'X'}`,
            creditLimitCents: money.creditLimitCents,
            billingTermsNetDays: money.billingTermsNetDays,
            defaultLaborRateCents: toCents(rate),
          }),
        );
        expect(customerSchema.parse(customer)).toEqual(customer);
      }),
    );
  });
});

describe('changedFieldNames', () => {
  it('reports nothing for an unchanged value and never reports updatedAt', () => {
    fc.assert(
      fc.property(customerArb, patchArb, (current, patch) => {
        expect(changedFieldNames(current, current)).toEqual([]);
        const next = tryApply(current, patch, toInstant('2027-06-01T00:00:00Z'));
        if (next === 'refused') return;
        expect(changedFieldNames(current, next)).not.toContain('updatedAt');
      }),
    );
  });
});
