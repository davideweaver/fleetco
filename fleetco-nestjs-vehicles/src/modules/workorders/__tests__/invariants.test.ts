import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { newVehicleId, newWorkOrderId, toCents } from '../../../platform/types/branded';
import { DomainError } from '../../../platform/types/errors';
import { FIXED_NOW, makeCreateWorkOrder, makeTenant } from '../../../platform/test/factories';
import { QUANTITY_CEILING, WORK_ORDER_STATUSES } from '../contracts';
import type { CustomerStatus } from '../../customers';
import type { WorkOrder, WorkOrderLine, WorkOrderStatus } from '../contracts';
import {
  applyPatch,
  assertAuthorizationAllowed,
  buildNewWorkOrder,
  canTransition,
  legalNextStatuses,
  lineAmountCents,
  normalizeNumber,
  totalOf,
} from '../service';

const TENANT = makeTenant();
const VEHICLE = newVehicleId();
const CUSTOMER = '01a12651-0000-7000-8000-000000000001';

const statusArb = fc.constantFrom<WorkOrderStatus>(...WORK_ORDER_STATUSES);
const customerStatusArb = fc.constantFrom<CustomerStatus>('prospect', 'active', 'inactive');
const quantityArb = fc.integer({ min: 1, max: QUANTITY_CEILING });
const priceArb = fc.integer({ min: 0, max: 5_000_00 });

function newOrder(): WorkOrder {
  return buildNewWorkOrder(
    TENANT,
    newWorkOrderId(),
    FIXED_NOW,
    { id: VEHICLE, customerId: CUSTOMER as never },
    makeCreateWorkOrder(VEHICLE),
  );
}

describe('the status machine', () => {
  it('never lists the current status as a target', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        expect(legalNextStatuses(status)).not.toContain(status);
      }),
    );
  });

  it('never permits leaving a terminal state', () => {
    fc.assert(
      fc.property(statusArb, (to) => {
        expect(canTransition('completed', to)).toBe(to === 'completed');
        expect(canTransition('cancelled', to)).toBe(to === 'cancelled');
      }),
    );
  });

  it('agrees with legalNextStatuses for every pair', () => {
    fc.assert(
      fc.property(statusArb, statusArb, (from, to) => {
        expect(canTransition(from, to)).toBe(from === to || legalNextStatuses(from).includes(to));
      }),
    );
  });
});

describe('money never goes negative or fractional', () => {
  it('a line amount is a non-negative integer', () => {
    fc.assert(
      fc.property(quantityArb, priceArb, (quantity, price) => {
        const amount = lineAmountCents(quantity, toCents(price));
        expect(Number.isInteger(amount)).toBe(true);
        expect(amount).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('a total equals the sum of its parts, independently re-derived', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(quantityArb, priceArb), { maxLength: 20 }), (raw) => {
        const lines = raw.map(([quantity, price]) => ({
          amountCents: lineAmountCents(quantity, toCents(price)),
        })) as WorkOrderLine[];
        const expected = lines.reduce((sum, line) => sum + line.amountCents, 0);
        expect(totalOf(lines)).toBe(expected);
      }),
    );
  });

  it('a total is monotonic in the number of lines', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(quantityArb, priceArb), { minLength: 1, maxLength: 10 }), (raw) => {
        const lines = raw.map(([q, p]) => ({ amountCents: lineAmountCents(q, toCents(p)) })) as WorkOrderLine[];
        expect(totalOf(lines)).toBeGreaterThanOrEqual(totalOf(lines.slice(0, -1)));
      }),
    );
  });
});

describe('normalizeNumber', () => {
  it('is idempotent and always uppercase', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9-]{1,24}$/), (raw) => {
        const once = normalizeNumber(raw);
        expect(normalizeNumber(once)).toBe(once);
        expect(once).toBe(once.toUpperCase());
      }),
    );
  });
});

describe('the authorization rule, re-derived from the written spec', () => {
  it('throws exactly when authorizing with no lines, a hold, or an inactive fleet', () => {
    fc.assert(
      fc.property(
        statusArb,
        statusArb,
        customerStatusArb,
        fc.boolean(),
        fc.integer({ min: 0, max: 5 }),
        (current, next, customerStatus, isOnCreditHold, lineCount) => {
          const isAuthorizing = next === 'authorized' && current !== 'authorized';
          const shouldThrow =
            isAuthorizing && (lineCount === 0 || isOnCreditHold || customerStatus !== 'active');

          let threw = false;
          try {
            assertAuthorizationAllowed(
              current,
              next,
              { status: customerStatus, isOnCreditHold },
              lineCount,
            );
          } catch (error) {
            threw = error instanceof DomainError;
          }
          expect(threw).toBe(shouldThrow);
        },
      ),
    );
  });
});

describe('applyPatch preserves identity and billing', () => {
  it('never changes the id, tenant, customer or vehicle', () => {
    fc.assert(
      fc.property(statusArb, fc.integer({ min: 0, max: 1_000_000 }), (status, total) => {
        const current = { ...newOrder(), status };
        let next;
        try {
          next = applyPatch(current, { complaint: 'changed' }, toCents(total), FIXED_NOW);
        } catch {
          return;
        }
        expect(next.id).toBe(current.id);
        expect(next.tenantId).toBe(current.tenantId);
        expect(next.customerId).toBe(current.customerId);
        expect(next.vehicleId).toBe(current.vehicleId);
      }),
    );
  });

  it('once closed, closedAt never moves again', () => {
    fc.assert(
      fc.property(fc.constantFrom<WorkOrderStatus>('completed', 'cancelled'), (terminal) => {
        const closed = { ...newOrder(), status: terminal, closedAt: FIXED_NOW };
        const next = applyPatch(closed, {}, toCents(0), FIXED_NOW);
        expect(next.closedAt).toBe(FIXED_NOW);
      }),
    );
  });
});
