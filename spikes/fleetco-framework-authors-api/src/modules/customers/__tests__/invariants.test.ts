import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ValidationFailed } from '../../../lib/errors/DomainError.js';
import { toCents, uuidv7At, type Cents } from '../../../lib/types/branded.js';
import { CUSTOMER_STATUSES, type CustomerStatus } from '../contracts.js';
import {
  availableCreditCents,
  canAuthorize,
  isLegalStatusTransition,
  normalizeCode,
} from '../service.js';

/**
 * Property-based tests — "the highest-value tests in this system"
 * ([[Testing Strategy]]), because invariants are cheap to state, catch what
 * example-based tests miss, and are exactly what you want when an agent wrote
 * the implementation.
 *
 * Each property below is one line of that document's list made executable. The
 * authorization-limit one is lifted verbatim: "any sequence of authorized line
 * items sums to no more than the authorization limit."
 */

/** Money as fast-check sees it: integer minor units, never a float. */
const cents = (max = 50_000_000): fc.Arbitrary<Cents> =>
  fc.integer({ min: 0, max }).map((value) => toCents(value));

const status = (): fc.Arbitrary<CustomerStatus> => fc.constantFrom(...CUSTOMER_STATUSES);

describe('money', () => {
  it('available credit is never negative and never exceeds the limit', () => {
    fc.assert(
      fc.property(cents(), cents(), (creditLimitCents, openBalanceCents) => {
        const available = availableCreditCents(
          { creditLimitCents, isOnCreditHold: false },
          openBalanceCents,
        );
        expect(available).toBeGreaterThanOrEqual(0);
        expect(available).toBeLessThanOrEqual(creditLimitCents);
      }),
    );
  });

  it('available credit is monotonically non-increasing in the open balance', () => {
    fc.assert(
      fc.property(cents(), cents(), cents(), (creditLimitCents, a, b) => {
        const customer = { creditLimitCents, isOnCreditHold: false };
        const [lower, higher] = a <= b ? [a, b] : [b, a];
        expect(availableCreditCents(customer, higher)).toBeLessThanOrEqual(
          availableCreditCents(customer, lower),
        );
      }),
    );
  });

  it('available credit is always an integer number of cents', () => {
    fc.assert(
      fc.property(cents(), cents(), (creditLimitCents, openBalanceCents) => {
        const available = availableCreditCents(
          { creditLimitCents, isOnCreditHold: false },
          openBalanceCents,
        );
        expect(Number.isInteger(available)).toBe(true);
      }),
    );
  });

  it('refuses to mint Cents from anything but a safe integer', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: 0.01, max: 1_000, noInteger: true, noNaN: true }),
          fc.constant(Number.MAX_SAFE_INTEGER + 2),
        ),
        (value) => {
          expect(() => toCents(value)).toThrow(ValidationFailed);
        },
      ),
    );
  });
});

describe('authorization', () => {
  it('a fleet on credit hold can never authorize anything', () => {
    fc.assert(
      fc.property(cents(), cents(), cents(), (creditLimitCents, openBalance, estimate) => {
        expect(canAuthorize({ creditLimitCents, isOnCreditHold: true }, openBalance, estimate)).toBe(
          false,
        );
      }),
    );
  });

  it('any sequence of authorized line items sums to no more than the limit', () => {
    fc.assert(
      fc.property(cents(1_000_000), fc.array(cents(200_000), { maxLength: 40 }), (limit, line) => {
        const customer = { creditLimitCents: limit, isOnCreditHold: false };

        // The shop's loop: check each estimate against what is left, and only
        // count the ones that were allowed.
        let authorized = toCents(0);
        for (const estimate of line) {
          if (canAuthorize(customer, authorized, estimate)) {
            authorized = toCents(authorized + estimate);
          }
        }

        expect(authorized).toBeLessThanOrEqual(limit);
      }),
    );
  });

  it('authorization is monotonic in the estimate: if a bigger one passes, a smaller one does too', () => {
    fc.assert(
      fc.property(cents(), cents(), cents(), cents(), (limit, balance, a, b) => {
        const customer = { creditLimitCents: limit, isOnCreditHold: false };
        const [smaller, bigger] = a <= b ? [a, b] : [b, a];
        if (canAuthorize(customer, balance, bigger)) {
          expect(canAuthorize(customer, balance, smaller)).toBe(true);
        }
      }),
    );
  });
});

describe('status', () => {
  it('a status always transitions to itself', () => {
    fc.assert(
      fc.property(status(), (only) => {
        expect(isLegalStatusTransition(only, only)).toBe(true);
      }),
    );
  });

  it('nothing ever transitions back to prospect', () => {
    fc.assert(
      fc.property(status(), (from) => {
        expect(isLegalStatusTransition(from, 'prospect')).toBe(from === 'prospect');
      }),
    );
  });

  it('every legal transition is reachable from prospect, so no status is orphaned', () => {
    // A status nothing can reach is a status no customer can ever be in, which
    // is a schema bug rather than a code bug — but it is cheap to assert here.
    for (const target of CUSTOMER_STATUSES) {
      const reachable =
        target === 'prospect' ||
        CUSTOMER_STATUSES.some((from) => from !== target && isLegalStatusTransition(from, target));
      expect(reachable).toBe(true);
    }
  });
});

describe('codes', () => {
  it('normalising is idempotent and always upper case', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 16 }), (raw) => {
        const once = normalizeCode(raw);
        expect(normalizeCode(once)).toBe(once);
        expect(once).toBe(once.toUpperCase());
        expect(once).toBe(once.trim());
      }),
    );
  });

  it('two spellings of the same code normalise to one value', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9-]{2,16}$/), (code) => {
        expect(normalizeCode(code.toLowerCase())).toBe(normalizeCode(code.toUpperCase()));
      }),
    );
  });
});

describe('identifiers', () => {
  const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('is a well-formed UUIDv7 for any millisecond in range', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), (ms) => {
        expect(uuidv7At(ms)).toMatch(UUID7);
      }),
    );
  });

  it('sorts lexicographically in time order, which is the whole reason for v7', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2 ** 44 }),
        fc.integer({ min: 1, max: 2 ** 44 }),
        (a, b) => {
          fc.pre(a !== b);
          const [earlier, later] = a < b ? [a, b] : [b, a];
          // Index locality depends on this holding for the string form, since
          // that is what Postgres sorts a `uuid` column by.
          expect(uuidv7At(earlier) < uuidv7At(later)).toBe(true);
        },
      ),
    );
  });
});
