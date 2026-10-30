import { describe, expect, it } from 'vitest';

import { newVehicleId, newWorkOrderId, toCents, toInstant } from '../../../platform/types/branded';
import { BusinessRuleViolated } from '../../../platform/types/errors';
import { FIXED_NOW, makeCreateWorkOrder, makeTenant } from '../../../platform/test/factories';
import {
  acceptsLineChanges,
  applyPatch,
  assertAuthorizationAllowed,
  assertVehicleUsable,
  buildNewWorkOrder,
  canTransition,
  changedFieldNames,
  eventNameFor,
  legalNextStatuses,
  lineAmountCents,
  normalizeNumber,
  totalOf,
} from '../service';
import type { WorkOrder, WorkOrderLine } from '../contracts';

/**
 * Pure unit layer. Two cross-module rules live in this file and neither needs
 * a fake: `assertAuthorizationAllowed` takes the customer's state as data and
 * `assertVehicleUsable` takes the vehicle's, so the dependency is visible in
 * the orchestration and absent from the rules.
 */
const TENANT = makeTenant();
const VEHICLE = newVehicleId();
const CUSTOMER_OF_VEHICLE = '01a12651-0000-7000-8000-000000000001';

function order(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return { ...base(), ...overrides };
}

function base(): WorkOrder {
  return buildNewWorkOrder(
    TENANT,
    newWorkOrderId(),
    FIXED_NOW,
    { id: VEHICLE, customerId: CUSTOMER_OF_VEHICLE as never },
    makeCreateWorkOrder(VEHICLE),
  );
}

describe('the status machine', () => {
  it('opens in draft', () => {
    expect(base().status).toBe('draft');
  });

  it('runs draft → authorized → in_progress → completed', () => {
    expect(legalNextStatuses('draft')).toContain('authorized');
    expect(legalNextStatuses('authorized')).toContain('in_progress');
    expect(legalNextStatuses('in_progress')).toContain('completed');
  });

  it('allows cancelling only before work starts', () => {
    expect(legalNextStatuses('draft')).toContain('cancelled');
    expect(legalNextStatuses('authorized')).toContain('cancelled');
    expect(legalNextStatuses('in_progress')).not.toContain('cancelled');
  });

  it('treats completed and cancelled as terminal — a closed order is the billing record', () => {
    expect(legalNextStatuses('completed')).toEqual([]);
    expect(legalNextStatuses('cancelled')).toEqual([]);
    expect(canTransition('completed', 'in_progress')).toBe(false);
  });

  it('refuses to skip authorization', () => {
    expect(canTransition('draft', 'in_progress')).toBe(false);
  });
});

describe('line editing window', () => {
  it('is open in draft and authorized', () => {
    expect(acceptsLineChanges('draft')).toBe(true);
    expect(acceptsLineChanges('authorized')).toBe(true);
  });

  it('is closed once work starts or the order closes', () => {
    expect(acceptsLineChanges('in_progress')).toBe(false);
    expect(acceptsLineChanges('completed')).toBe(false);
    expect(acceptsLineChanges('cancelled')).toBe(false);
  });
});

describe('money', () => {
  it('multiplies hundredths of a unit by a cents price', () => {
    // 1.5 hours at $145.00/hr = $217.50
    expect(lineAmountCents(150, toCents(14_500))).toBe(21_750);
  });

  it('rounds half-up at the only point a fraction can appear', () => {
    // 0.01 units at 1 cent = 0.0001 cents -> 0
    expect(lineAmountCents(1, toCents(1))).toBe(0);
    // 0.5 units at 1 cent = 0.005 -> rounds to 1 under half-up... 50*1/100 = 0.5 -> 1
    expect(lineAmountCents(50, toCents(1))).toBe(1);
  });

  it('totals the lines', () => {
    const lines = [
      { amountCents: toCents(21_750) },
      { amountCents: toCents(8_000) },
    ] as WorkOrderLine[];
    expect(totalOf(lines)).toBe(29_750);
  });

  it('totals an empty order to zero', () => {
    expect(totalOf([])).toBe(0);
  });
});

describe('the cross-module authorization rule', () => {
  const active = { status: 'active' as const, isOnCreditHold: false };

  it('authorizes against an active fleet with lines', () => {
    expect(() => assertAuthorizationAllowed('draft', 'authorized', active, 1)).not.toThrow();
  });

  it('refuses an order with no lines — there is nothing to approve', () => {
    expect(() => assertAuthorizationAllowed('draft', 'authorized', active, 0)).toThrow(
      BusinessRuleViolated,
    );
  });

  it('refuses a fleet on credit hold', () => {
    expect(() =>
      assertAuthorizationAllowed('draft', 'authorized', { ...active, isOnCreditHold: true }, 1),
    ).toThrow(BusinessRuleViolated);
  });

  it('refuses an inactive fleet', () => {
    expect(() =>
      assertAuthorizationAllowed('draft', 'authorized', { ...active, status: 'prospect' }, 1),
    ).toThrow(BusinessRuleViolated);
  });

  it('does not re-check a transition that is not into authorized', () => {
    expect(() =>
      assertAuthorizationAllowed('authorized', 'in_progress', { status: 'inactive', isOnCreditHold: true }, 0),
    ).not.toThrow();
  });
});

describe('vehicle usability', () => {
  it('accepts an active or parked unit', () => {
    expect(() => assertVehicleUsable({ status: 'active', customerId: 'x' as never })).not.toThrow();
    expect(() =>
      assertVehicleUsable({ status: 'out_of_service', customerId: 'x' as never }),
    ).not.toThrow();
  });

  it('refuses a retired unit', () => {
    expect(() => assertVehicleUsable({ status: 'retired', customerId: 'x' as never })).toThrow(
      BusinessRuleViolated,
    );
  });
});

describe('buildNewWorkOrder', () => {
  it('bills the fleet that owns the vehicle, not one the caller names', () => {
    expect(base().customerId).toBe(CUSTOMER_OF_VEHICLE);
  });

  it('opens with a zero total and no timestamps', () => {
    const created = base();
    expect(created.totalCents).toBe(0);
    expect(created.authorizedAt).toBeNull();
    expect(created.closedAt).toBeNull();
  });

  it('normalizes the order number', () => {
    expect(normalizeNumber('  ro-42 ')).toBe('RO-42');
  });
});

describe('applyPatch', () => {
  it('stamps authorizedAt on the transition into authorized, once', () => {
    const draft = order();
    const authorized = applyPatch(draft, { status: 'authorized' }, toCents(100), FIXED_NOW);
    expect(authorized.authorizedAt).toBe(FIXED_NOW);

    const later = toInstant('2026-11-01T00:00:00.000Z');
    const started = applyPatch(authorized, { status: 'in_progress' }, toCents(100), later);
    expect(started.authorizedAt).toBe(FIXED_NOW);
  });

  it('stamps closedAt when the order reaches a terminal state', () => {
    const inProgress = order({ status: 'in_progress' });
    const done = applyPatch(inProgress, { status: 'completed' }, toCents(100), FIXED_NOW);
    expect(done.closedAt).toBe(FIXED_NOW);
  });

  it('always takes the total it is given, never one from the caller', () => {
    const next = applyPatch(order(), { complaint: 'Rewritten' }, toCents(4_242), FIXED_NOW);
    expect(next.totalCents).toBe(4_242);
  });

  it('refuses an illegal transition', () => {
    expect(() => applyPatch(order(), { status: 'completed' }, toCents(0), FIXED_NOW)).toThrow(
      BusinessRuleViolated,
    );
  });
});

describe('event naming', () => {
  it('reports a status move as status_changed', () => {
    const before = order();
    const after = { ...before, status: 'authorized' as const };
    expect(eventNameFor(before, after)).toBe('work_order.status_changed');
  });

  it('reports a total change as updated', () => {
    const before = order();
    const after = { ...before, totalCents: toCents(500) };
    expect(eventNameFor(before, after)).toBe('work_order.updated');
    expect(changedFieldNames(before, after)).toEqual(['totalCents']);
  });
});
