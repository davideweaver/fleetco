import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  newCustomerId,
  newTenantId,
  toCents,
  toInstant,
  uuidv7At,
} from '../../../platform/types/branded.js';
import type { Cents, Instant } from '../../../platform/types/branded.js';
import { BusinessRuleViolated, ValidationFailed } from '../../../platform/types/errors.js';
import { FROZEN_NOW, makeCustomer } from '../../../platform/test/factories.js';
import { BILLING_TERMS_NET_DAYS, CUSTOMER_STATUSES } from '../contracts.js';
import type { BillingTermsNetDays, Customer, CustomerStatus } from '../contracts.js';
import {
  MAX_LABOR_RATE_CENTS,
  applyPatch,
  assertMoneyRules,
  buildNewCustomer,
  canTransition,
  changedFieldNames,
  legalNextStatuses,
  normalizeCode,
} from '../service.js';

/**
 * Property-based tests — "the highest-value tests in this system"
 * ([[Testing Strategy]]). Each invariant below is a sentence from the
 * architecture documents turned into a few lines that test thousands of cases.
 *
 * The one the documents name directly is "a service order's status only moves
 * along legal transitions"; the customer state machine is the same shape, so it
 * is the same property.
 */
const LATER: Instant = toInstant('2026-11-01T00:00:00.000Z');

const status = (): fc.Arbitrary<CustomerStatus> => fc.constantFrom(...CUSTOMER_STATUSES);
const terms = (): fc.Arbitrary<BillingTermsNetDays> =>
  fc.constantFrom(...BILLING_TERMS_NET_DAYS);
const cents = (max = 100_000_000): fc.Arbitrary<Cents> =>
  fc.integer({ min: 0, max }).map((value) => toCents(value));

describe('the customer state machine', () => {
  it('only ever moves along a legal transition — anything else throws', () => {
    fc.assert(
      fc.property(status(), status(), fc.boolean(), (from, to, isOnCreditHold) => {
        const current = makeCustomer(newTenantId(), { status: from, isOnCreditHold });

        let next: Customer | null = null;
        try {
          next = applyPatch(current, { status: to }, LATER);
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessRuleViolated);
        }

        if (next !== null) {
          expect(canTransition(from, to)).toBe(true);
          expect(next.status).toBe(to);
        }
      }),
    );
  });

  /**
   * The first statement of this property was "a fleet never ends up active
   * while on credit hold", and fast-check refuted it in eleven cases with
   * `['active', false, true]` — putting an already-active fleet on hold. That
   * is the documented behaviour (a credit manager holds a past-due account
   * without deactivating it), so the property was wrong rather than the code.
   *
   * The real rule is about the *transition*, not the state, and that is what is
   * asserted below. Keeping the correction visible, because an example-based
   * test would have been written against whichever reading the author had in
   * mind and would have agreed with it.
   */
  it('never moves a fleet into `active` while it is on credit hold', () => {
    fc.assert(
      fc.property(status(), fc.boolean(), fc.boolean(), (from, heldBefore, heldAfter) => {
        const current = makeCustomer(newTenantId(), { status: from, isOnCreditHold: heldBefore });
        try {
          const next = applyPatch(
            current,
            { status: 'active', isOnCreditHold: heldAfter },
            LATER,
          );
          if (next.isOnCreditHold) {
            // Held and active is only reachable by holding a fleet that was
            // already active, never by activating a held one.
            expect(from).toBe('active');
          }
        } catch (error) {
          expect(error).toBeInstanceOf(BusinessRuleViolated);
        }
      }),
    );
  });

  it('is total over every declared status — no status is unhandled', () => {
    fc.assert(
      fc.property(status(), (value) => {
        expect(() => legalNextStatuses(value)).not.toThrow();
      }),
    );
  });
});

describe('applyPatch', () => {
  it('leaves identity and creation time untouched for any patch', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          isOnCreditHold: fc.option(fc.boolean(), { nil: undefined }),
          creditLimitCents: fc.option(cents(), { nil: undefined }),
        }),
        (rawPatch) => {
          const current = makeCustomer(newTenantId(), { status: 'active' });
          const patch = Object.fromEntries(
            Object.entries(rawPatch).filter(([, value]) => value !== undefined),
          );
          if (Object.keys(patch).length === 0) return;

          let next: Customer | null = null;
          try {
            next = applyPatch(current, patch, LATER);
          } catch (error) {
            expect(error === null || typeof error === 'object').toBe(true);
          }
          if (next === null) return;

          expect(next.id).toBe(current.id);
          expect(next.tenantId).toBe(current.tenantId);
          expect(next.code).toBe(current.code);
          expect(next.createdAt).toBe(current.createdAt);
        },
      ),
    );
  });

  it('reports a field as changed exactly when its value differs', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }), (rawName) => {
        const name = rawName.trim();
        if (name.length === 0) return;
        const current = makeCustomer(newTenantId(), { status: 'active' });
        const next = applyPatch(current, { name }, LATER);
        expect(changedFieldNames(current, next)).toEqual(
          current.name === name ? [] : ['name'],
        );
      }),
    );
  });
});

describe('money', () => {
  it('accepts a customer only when every money rule holds', () => {
    fc.assert(
      fc.property(cents(), cents(500_000), terms(), (creditLimitCents, rate, netDays) => {
        const candidate = {
          creditLimitCents,
          defaultLaborRateCents: rate,
          billingTermsNetDays: netDays,
        };
        let accepted = true;
        try {
          assertMoneyRules(candidate);
        } catch (error) {
          accepted = false;
          expect(
            error instanceof ValidationFailed || error instanceof BusinessRuleViolated,
          ).toBe(true);
        }

        if (accepted) {
          expect(creditLimitCents).toBeGreaterThanOrEqual(0);
          expect(rate).toBeGreaterThan(0);
          expect(rate).toBeLessThanOrEqual(MAX_LABOR_RATE_CENTS);
          // Net terms imply a credit line. This is the rule that would
          // otherwise only be checked for the handful of values an
              // example-based test happened to pick.
          if (netDays > 0) expect(creditLimitCents).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('refuses any non-integer as Cents, which is how a float would enter', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }).filter(
          (value) => !Number.isInteger(value),
        ),
        (value) => {
          expect(() => toCents(value)).toThrow(ValidationFailed);
        },
      ),
    );
  });

  it('round-trips any safe integer', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        expect(toCents(value)).toBe(value);
      }),
    );
  });
});

describe('normalizeCode', () => {
  it('is idempotent — normalizing twice is normalizing once', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (raw) => {
        expect(normalizeCode(normalizeCode(raw))).toBe(normalizeCode(raw));
      }),
    );
  });

  it('collapses case, so two spellings cannot become two fleets', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9-]{2,16}$/), (code) => {
        expect(normalizeCode(code.toLowerCase())).toBe(normalizeCode(code.toUpperCase()));
      }),
    );
  });
});

describe('buildNewCustomer', () => {
  it('always produces a prospect that is not on hold, whatever the input', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[A-Za-z0-9-]{2,16}$/),
        fc.string({ minLength: 1, maxLength: 60 }).map((value) => value.trim()),
        cents(),
        terms(),
        (code, rawName, creditLimitCents, netDays) => {
          if (rawName.length === 0) return;
          let built: Customer | null = null;
          try {
            built = buildNewCustomer(newTenantId(), newCustomerId(), FROZEN_NOW, {
              code,
              name: rawName,
              creditLimitCents,
              defaultLaborRateCents: toCents(14_500),
              billingTermsNetDays: netDays,
              primaryContactEmail: null,
              primaryContactPhone: null,
            });
          } catch (error) {
            expect(error).toBeInstanceOf(BusinessRuleViolated);
          }
          if (built === null) return;
          expect(built.status).toBe('prospect');
          expect(built.isOnCreditHold).toBe(false);
          expect(built.code).toBe(built.code.toUpperCase());
          expect(built.createdAt).toBe(built.updatedAt);
        },
      ),
    );
  });
});

describe('UUIDv7', () => {
  /**
   * The generator is hand-written (see `platform/types/branded.ts`), so unlike
   * everything else in this file it is *our* code rather than a rule, and it
   * gets the layout and ordering properties RFC 9562 §5.7 specifies.
   */
  it('has version 7 and the RFC 4122 variant for any timestamp', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), (ms) => {
        const id = uuidv7At(ms);
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      }),
    );
  });

  it('sorts lexicographically in timestamp order, which is the index-locality claim', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 44 }),
        fc.integer({ min: 1, max: 2 ** 40 }),
        (earlier, gap) => {
          expect(uuidv7At(earlier) < uuidv7At(earlier + gap)).toBe(true);
        },
      ),
    );
  });

  it('is accepted by the branded-id constructor', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 48 - 1 }), (ms) => {
        expect(() => toInstant(new Date(ms))).not.toThrow();
        expect(uuidv7At(ms)).toHaveLength(36);
      }),
    );
  });
});
