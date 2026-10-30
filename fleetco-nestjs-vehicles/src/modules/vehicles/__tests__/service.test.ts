import { describe, expect, it } from 'vitest';

import { newCustomerId, newVehicleId, toInstant } from '../../../platform/types/branded';
import { BusinessRuleViolated } from '../../../platform/types/errors';
import {
  FIXED_NOW,
  makeCreateVehicle,
  makeTenant,
  makeVehicle,
} from '../../../platform/test/factories';
import {
  applyPatch,
  assertActivationAllowed,
  assertModelYear,
  assertOdometerRules,
  buildNewVehicle,
  canTransition,
  changedFieldNames,
  eventNameFor,
  legalNextStatuses,
  normalizeUnitNumber,
  normalizeVin,
  yearOf,
} from '../service';

/**
 * Pure unit layer. No database, no fakes, no Nest — and notably no fake of
 * `CustomersService` either.
 *
 * That last point is the one worth reading. This module depends on another
 * module, and the cross-module rule (`assertActivationAllowed`) is still
 * testable here with no mock, because it takes the customer's *status* as data
 * rather than taking the service. The fetch lives in the orchestration half,
 * which is asserted against real Postgres in `repository.test.ts`.
 */
const TENANT = makeTenant();
const CUSTOMER = newCustomerId();

describe('normalization', () => {
  it('uppercases and trims the unit number, so trk-14 and TRK-14 are one truck', () => {
    expect(normalizeUnitNumber('  trk-14 ')).toBe('TRK-14');
  });

  it('uppercases and trims the VIN', () => {
    expect(normalizeVin(' 1fujgldr9csbf0001 ')).toBe('1FUJGLDR9CSBF0001');
  });
});

describe('yearOf', () => {
  it('reads the year from an instant without constructing a Date', () => {
    expect(yearOf(toInstant('2026-10-10T00:00:00.000Z'))).toBe(2026);
  });

  it('agrees with the Date it is standing in for, across a year boundary', () => {
    const instant = toInstant('2027-01-01T00:00:00.000Z');
    expect(yearOf(instant)).toBe(new Date(instant).getUTCFullYear());
  });
});

describe('status transitions', () => {
  it('adds a vehicle out of service, because a new unit is not yet cleared for work', () => {
    const vehicle = buildNewVehicle(
      TENANT,
      newVehicleId(),
      FIXED_NOW,
      makeCreateVehicle(CUSTOMER),
    );
    expect(vehicle.status).toBe('out_of_service');
  });

  it('allows out_of_service to go active or retired', () => {
    expect(legalNextStatuses('out_of_service')).toEqual(['active', 'retired']);
  });

  it('allows an active truck to be parked or retired', () => {
    expect(legalNextStatuses('active')).toEqual(['out_of_service', 'retired']);
  });

  it('treats retired as terminal', () => {
    expect(legalNextStatuses('retired')).toEqual([]);
    expect(canTransition('retired', 'active')).toBe(false);
    expect(canTransition('retired', 'out_of_service')).toBe(false);
  });

  it('treats a no-op transition as legal, including out of a terminal state', () => {
    expect(canTransition('retired', 'retired')).toBe(true);
  });

  it('refuses to resurrect a retired vehicle through applyPatch', () => {
    const retired = makeVehicle(TENANT, CUSTOMER, { status: 'retired' });
    expect(() => applyPatch(retired, { status: 'active' }, FIXED_NOW)).toThrow(
      BusinessRuleViolated,
    );
  });
});

describe('the odometer only goes up', () => {
  it('accepts an increase', () => {
    expect(() => assertOdometerRules(412_000, 412_500)).not.toThrow();
  });

  it('accepts an unchanged reading', () => {
    expect(() => assertOdometerRules(412_000, 412_000)).not.toThrow();
  });

  it('refuses a rollback, which is either a typo or fraud', () => {
    expect(() => assertOdometerRules(412_000, 41_200)).toThrow(BusinessRuleViolated);
  });

  it('refuses a rollback through applyPatch, against the locked current value', () => {
    const vehicle = makeVehicle(TENANT, CUSTOMER, { odometerMiles: 412_000 });
    expect(() => applyPatch(vehicle, { odometerMiles: 1_000 }, FIXED_NOW)).toThrow(
      BusinessRuleViolated,
    );
  });
});

describe('model year', () => {
  it('accepts next year, because manufacturers ship ahead of the calendar', () => {
    expect(() => assertModelYear(2027, FIXED_NOW)).not.toThrow();
  });

  it('refuses a year before the automobile', () => {
    expect(() => assertModelYear(1899, FIXED_NOW)).toThrow(BusinessRuleViolated);
  });

  it('refuses a year beyond the rolling lookahead', () => {
    // FIXED_NOW is 2026, lookahead is 2, so 2029 is out.
    expect(() => assertModelYear(2029, FIXED_NOW)).toThrow(BusinessRuleViolated);
  });
});

describe('the cross-module activation rule', () => {
  it('activates a vehicle whose fleet is active', () => {
    expect(() => assertActivationAllowed('out_of_service', 'active', 'active')).not.toThrow();
  });

  it('refuses to activate a vehicle whose fleet is only a prospect', () => {
    expect(() => assertActivationAllowed('out_of_service', 'active', 'prospect')).toThrow(
      BusinessRuleViolated,
    );
  });

  it('refuses to activate a vehicle whose fleet went inactive', () => {
    expect(() => assertActivationAllowed('out_of_service', 'active', 'inactive')).toThrow(
      BusinessRuleViolated,
    );
  });

  /**
   * The asymmetry that mirrors the customers module's credit-hold rule: the
   * guard is on the transition *into* active, not on the state of being
   * active. A fleet going inactive must not silently park its whole roster.
   */
  it('leaves an already-active vehicle alone when its fleet is not active', () => {
    expect(() => assertActivationAllowed('active', 'active', 'inactive')).not.toThrow();
  });

  it('permits parking or retiring a vehicle regardless of the fleet', () => {
    expect(() => assertActivationAllowed('active', 'out_of_service', 'inactive')).not.toThrow();
    expect(() => assertActivationAllowed('active', 'retired', 'inactive')).not.toThrow();
  });
});

describe('applyPatch', () => {
  it('returns a new value and leaves the original untouched', () => {
    const vehicle = makeVehicle(TENANT, CUSTOMER);
    const next = applyPatch(vehicle, { make: 'Peterbilt' }, FIXED_NOW);
    expect(next).not.toBe(vehicle);
    expect(vehicle.make).toBe('Freightliner');
    expect(next.make).toBe('Peterbilt');
  });

  it('normalizes a patched unit number', () => {
    const vehicle = makeVehicle(TENANT, CUSTOMER);
    expect(applyPatch(vehicle, { unitNumber: ' trk-99 ' }, FIXED_NOW).unitNumber).toBe('TRK-99');
  });

  it('cannot change the owning fleet — the field is not in the patch type', () => {
    const vehicle = makeVehicle(TENANT, CUSTOMER);
    const next = applyPatch(vehicle, { make: 'Mack' }, FIXED_NOW);
    expect(next.customerId).toBe(vehicle.customerId);
  });

  it('clears lastServicedAt when explicitly set to null, and leaves it when absent', () => {
    const serviced = makeVehicle(TENANT, CUSTOMER, { lastServicedAt: FIXED_NOW });
    expect(applyPatch(serviced, { lastServicedAt: null }, FIXED_NOW).lastServicedAt).toBeNull();
    expect(applyPatch(serviced, { make: 'Mack' }, FIXED_NOW).lastServicedAt).toBe(FIXED_NOW);
  });
});

describe('event naming', () => {
  it('reports a status move as status_changed', () => {
    const before = makeVehicle(TENANT, CUSTOMER, { status: 'out_of_service' });
    const after = { ...before, status: 'active' as const };
    expect(eventNameFor(before, after)).toBe('vehicle.status_changed');
  });

  it('reports anything else as updated', () => {
    const before = makeVehicle(TENANT, CUSTOMER);
    const after = { ...before, odometerMiles: before.odometerMiles + 100 };
    expect(eventNameFor(before, after)).toBe('vehicle.updated');
  });

  it('never reports identity fields or updatedAt as changed', () => {
    const before = makeVehicle(TENANT, CUSTOMER);
    const after = { ...before, updatedAt: toInstant('2030-01-01T00:00:00.000Z') };
    expect(changedFieldNames(before, after)).toEqual([]);
  });

  it('lists exactly the fields that moved', () => {
    const before = makeVehicle(TENANT, CUSTOMER, { odometerMiles: 100, status: 'out_of_service' });
    const after = { ...before, odometerMiles: 200, status: 'active' as const };
    expect(changedFieldNames(before, after).sort()).toEqual(['odometerMiles', 'status']);
  });
});
