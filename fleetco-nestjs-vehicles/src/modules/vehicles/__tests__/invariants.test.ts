import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { newVehicleId, newCustomerId, toInstant } from '../../../platform/types/branded';
import { DomainError } from '../../../platform/types/errors';
import { FIXED_NOW, makeCreateVehicle, makeTenant, makeVehicle } from '../../../platform/test/factories';
import {
  MIN_MODEL_YEAR,
  MAX_MODEL_YEAR_LOOKAHEAD,
  VEHICLE_CLASSES,
  VEHICLE_STATUSES,
  vehicleSchema,
} from '../contracts';
import type { CustomerStatus } from '../../customers';
import type { UpdateVehicle, VehicleClass, VehicleStatus } from '../contracts';
import {
  applyPatch,
  assertActivationAllowed,
  assertModelYear,
  assertOdometerRules,
  buildNewVehicle,
  canTransition,
  changedFieldNames,
  legalNextStatuses,
  normalizeUnitNumber,
  normalizeVin,
  yearOf,
} from '../service';

/**
 * Property-based layer. [[Testing Strategy]] calls these "the highest-value
 * tests in this system", because the implementation was written by an agent and
 * an invariant is a claim the *spec* makes rather than a claim the code makes
 * about itself.
 *
 * Each property below restates a rule independently of how the implementation
 * computes it — the activation property in particular re-derives the predicate
 * from the written rule rather than calling the same helper, so it fails if the
 * implementation drifts.
 */
const TENANT = makeTenant();
const CUSTOMER = newCustomerId();
const NOW_YEAR = yearOf(FIXED_NOW);

const statusArb = fc.constantFrom<VehicleStatus>(...VEHICLE_STATUSES);
const classArb = fc.constantFrom<VehicleClass>(...VEHICLE_CLASSES);
const customerStatusArb = fc.constantFrom<CustomerStatus>('prospect', 'active', 'inactive');
const odometerArb = fc.integer({ min: 0, max: 2_000_000 });
const modelYearArb = fc.integer({ min: MIN_MODEL_YEAR, max: NOW_YEAR + MAX_MODEL_YEAR_LOOKAHEAD });

/** The ISO 3779 VIN alphabet: no I, no O, no Q. */
const VIN_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'.split('');
const vinArb = fc
  .array(fc.constantFrom(...VIN_ALPHABET), { minLength: 17, maxLength: 17 })
  .map((chars) => chars.join(''));

const unitNumberArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-'.split('')), {
    minLength: 1,
    maxLength: 24,
  })
  .map((chars) => chars.join(''));

describe('normalization is idempotent and total', () => {
  it('normalizeUnitNumber is idempotent', () => {
    fc.assert(
      fc.property(unitNumberArb, (raw) => {
        const once = normalizeUnitNumber(raw);
        expect(normalizeUnitNumber(once)).toBe(once);
      }),
    );
  });

  it('normalizeUnitNumber always yields uppercase with no surrounding space', () => {
    fc.assert(
      fc.property(unitNumberArb, (raw) => {
        const out = normalizeUnitNumber(raw);
        expect(out).toBe(out.toUpperCase());
        expect(out).toBe(out.trim());
      }),
    );
  });

  it('normalizeVin is idempotent and preserves a valid VIN exactly', () => {
    fc.assert(
      fc.property(vinArb, (vin) => {
        expect(normalizeVin(vin)).toBe(vin);
        expect(normalizeVin(normalizeVin(vin))).toBe(vin);
      }),
    );
  });
});

describe('the status machine', () => {
  it('never lists the current status as a transition target', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        expect(legalNextStatuses(status)).not.toContain(status);
      }),
    );
  });

  it('always permits a no-op transition', () => {
    fc.assert(
      fc.property(statusArb, (status) => {
        expect(canTransition(status, status)).toBe(true);
      }),
    );
  });

  it('never permits leaving retired', () => {
    fc.assert(
      fc.property(statusArb, (to) => {
        expect(canTransition('retired', to)).toBe(to === 'retired');
      }),
    );
  });

  it('agrees with legalNextStatuses for every pair', () => {
    fc.assert(
      fc.property(statusArb, statusArb, (from, to) => {
        const expected = from === to || legalNextStatuses(from).includes(to);
        expect(canTransition(from, to)).toBe(expected);
      }),
    );
  });
});

describe('the odometer invariant', () => {
  it('throws exactly when the reading decreases', () => {
    fc.assert(
      fc.property(odometerArb, odometerArb, (previous, next) => {
        const shouldThrow = next < previous;
        let threw = false;
        try {
          assertOdometerRules(previous, next);
        } catch (error) {
          threw = error instanceof DomainError;
        }
        expect(threw).toBe(shouldThrow);
      }),
    );
  });

  it('applyPatch never lowers a vehicle odometer that it accepts', () => {
    fc.assert(
      fc.property(odometerArb, odometerArb, (current, patched) => {
        const vehicle = makeVehicle(TENANT, CUSTOMER, { odometerMiles: current });
        let next;
        try {
          next = applyPatch(vehicle, { odometerMiles: patched }, FIXED_NOW);
        } catch {
          return;
        }
        expect(next.odometerMiles).toBeGreaterThanOrEqual(current);
      }),
    );
  });
});

describe('the model-year window', () => {
  it('accepts exactly the range the rule describes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1800, max: 2100 }), (year) => {
        const inRange = year >= MIN_MODEL_YEAR && year <= NOW_YEAR + MAX_MODEL_YEAR_LOOKAHEAD;
        let threw = false;
        try {
          assertModelYear(year, FIXED_NOW);
        } catch (error) {
          threw = error instanceof DomainError;
        }
        expect(threw).toBe(!inRange);
      }),
    );
  });
});

describe('the cross-module activation rule', () => {
  /**
   * The predicate is restated from the written rule — "a unit cannot be cleared
   * for service while the fleet that owns it is not active, and the guard is on
   * the transition into active" — rather than by calling the implementation.
   */
  it('throws exactly when a non-active vehicle is activated under a non-active fleet', () => {
    fc.assert(
      fc.property(statusArb, statusArb, customerStatusArb, (current, next, customerStatus) => {
        const isActivating = next === 'active' && current !== 'active';
        const shouldThrow = isActivating && customerStatus !== 'active';

        let threw = false;
        try {
          assertActivationAllowed(current, next, customerStatus);
        } catch (error) {
          threw = error instanceof DomainError;
        }
        expect(threw).toBe(shouldThrow);
      }),
    );
  });

  it('never blocks a transition that is not into active', () => {
    fc.assert(
      fc.property(
        statusArb,
        fc.constantFrom<VehicleStatus>('out_of_service', 'retired'),
        customerStatusArb,
        (current, next, customerStatus) => {
          expect(() => assertActivationAllowed(current, next, customerStatus)).not.toThrow();
        },
      ),
    );
  });
});

describe('buildNewVehicle', () => {
  it('always produces a vehicle that satisfies its own contract', () => {
    fc.assert(
      fc.property(unitNumberArb, vinArb, modelYearArb, classArb, odometerArb, (unitNumber, vin, modelYear, vehicleClass, odometerMiles) => {
        const vehicle = buildNewVehicle(
          TENANT,
          newVehicleId(),
          FIXED_NOW,
          makeCreateVehicle(CUSTOMER, { unitNumber, vin, modelYear, vehicleClass, odometerMiles }),
        );
        expect(() => vehicleSchema.parse(vehicle)).not.toThrow();
      }),
      { numRuns: 60 },
    );
  });

  it('always starts out of service, unserviced, with createdAt equal to updatedAt', () => {
    fc.assert(
      fc.property(modelYearArb, odometerArb, (modelYear, odometerMiles) => {
        const vehicle = buildNewVehicle(
          TENANT,
          newVehicleId(),
          FIXED_NOW,
          makeCreateVehicle(CUSTOMER, { modelYear, odometerMiles }),
        );
        expect(vehicle.status).toBe('out_of_service');
        expect(vehicle.lastServicedAt).toBeNull();
        expect(vehicle.createdAt).toBe(vehicle.updatedAt);
      }),
    );
  });
});

describe('applyPatch preserves identity', () => {
  it('never changes id, tenantId, customerId or createdAt', () => {
    const patchArb: fc.Arbitrary<UpdateVehicle> = fc.record(
      {
        unitNumber: unitNumberArb,
        make: fc.constantFrom('Mack', 'Peterbilt', 'Volvo'),
        modelYear: modelYearArb,
        vehicleClass: classArb,
        status: statusArb,
        odometerMiles: odometerArb,
      },
      { requiredKeys: [] },
    );

    fc.assert(
      fc.property(statusArb, odometerArb, patchArb, (status, odometerMiles, patch) => {
        const vehicle = makeVehicle(TENANT, CUSTOMER, { status, odometerMiles });
        let next;
        try {
          next = applyPatch(vehicle, patch, toInstant('2027-01-01T00:00:00.000Z'));
        } catch {
          return;
        }
        expect(next.id).toBe(vehicle.id);
        expect(next.tenantId).toBe(vehicle.tenantId);
        expect(next.customerId).toBe(vehicle.customerId);
        expect(next.createdAt).toBe(vehicle.createdAt);
      }),
    );
  });

  it('never reports an identity field as changed', () => {
    fc.assert(
      fc.property(statusArb, odometerArb, (status, odometerMiles) => {
        const before = makeVehicle(TENANT, CUSTOMER, { status, odometerMiles });
        const after = { ...before, updatedAt: toInstant('2030-06-01T00:00:00.000Z') };
        const changed = changedFieldNames(before, after);
        expect(changed).not.toContain('id');
        expect(changed).not.toContain('tenantId');
        expect(changed).not.toContain('customerId');
        expect(changed).not.toContain('createdAt');
        expect(changed).not.toContain('updatedAt');
      }),
    );
  });
});
