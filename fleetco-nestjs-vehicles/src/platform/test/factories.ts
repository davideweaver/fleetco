import {
  toCents as toCentsBrand,
  newCustomerId,
  newTenantId,
  newUserId,
  newVehicleId,
  toCents,
  toInstant,
} from '../types/branded';
import type { CustomerId, TenantId } from '../types/branded';
import type { Principal, Role } from '../types/principal';
import type { CreateCustomer, Customer } from '../../modules/customers';
import type { CreateVehicle, Vehicle } from '../../modules/vehicles';
import type { AddWorkOrderLine, CreateWorkOrder } from '../../modules/workorders';

/**
 * The one factory module, used by every test and by `npm run seed`
 * ([[Testing Strategy]] § Test Data: "no test invents its own customer").
 *
 * Deterministic by default — the only randomness is the UUIDv7s, which must be
 * unique. Seeded randomness belongs in the property tests, where fast-check
 * owns it.
 */
export const FIXED_NOW = toInstant('2026-10-09T14:00:00.000Z');

let codeCounter = 0;

/** Unique per process, so two customers in one test cannot collide on the code index. */
function nextCode(prefix: string): string {
  codeCounter += 1;
  return `${prefix}${String(codeCounter).padStart(4, '0')}`;
}

export function makeTenant(): TenantId {
  return newTenantId();
}

export function makeStaffPrincipal(tenantId: TenantId): Principal {
  return { userId: newUserId(), tenantId, role: 'staff', customerId: null };
}

export function makePortalPrincipal(tenantId: TenantId, customerId: CustomerId): Principal {
  return { userId: newUserId(), tenantId, role: 'portal', customerId };
}

export function makePrincipal(tenantId: TenantId, role: Role, customerId: CustomerId | null = null): Principal {
  return { userId: newUserId(), tenantId, role, customerId };
}

export function makeCreateCustomer(overrides: Partial<CreateCustomer> = {}): CreateCustomer {
  return {
    code: nextCode('ACME'),
    name: 'Acme Trucking',
    creditLimitCents: toCents(500_000),
    defaultLaborRateCents: toCents(14_500),
    billingTermsNetDays: 30,
    primaryContactEmail: 'dispatch@acme.example',
    primaryContactPhone: '+1-717-555-0100',
    ...overrides,
  };
}

export function makeCustomer(tenantId: TenantId, overrides: Partial<Customer> = {}): Customer {
  return {
    id: newCustomerId(),
    tenantId,
    code: nextCode('ACME'),
    name: 'Acme Trucking',
    status: 'prospect',
    creditLimitCents: toCents(500_000),
    defaultLaborRateCents: toCents(14_500),
    billingTermsNetDays: 30,
    isOnCreditHold: false,
    primaryContactEmail: 'dispatch@acme.example',
    primaryContactPhone: '+1-717-555-0100',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

let vinCounter = 0;

/**
 * A structurally valid VIN. 17 characters from the ISO 3779 alphabet, which
 * excludes I, O and Q — so the counter is padded with digits and the prefix is
 * fixed. Not a real-world check-digit-valid VIN; the schema does not verify
 * the check digit and neither does a shop's front desk.
 */
function nextVin(): string {
  vinCounter += 1;
  return `1FUJGLDR9CSBF${String(vinCounter).padStart(4, '0')}`;
}

export function makeCreateVehicle(
  customerId: CustomerId,
  overrides: Partial<CreateVehicle> = {},
): CreateVehicle {
  return {
    customerId,
    unitNumber: nextCode('TRK-'),
    vin: nextVin(),
    make: 'Freightliner',
    model: 'Cascadia',
    modelYear: 2022,
    vehicleClass: 'heavy_duty',
    odometerMiles: 412_000,
    ...overrides,
  };
}

export function makeVehicle(
  tenantId: TenantId,
  customerId: CustomerId,
  overrides: Partial<Vehicle> = {},
): Vehicle {
  return {
    id: newVehicleId(),
    tenantId,
    customerId,
    unitNumber: nextCode('TRK-'),
    vin: nextVin(),
    make: 'Freightliner',
    model: 'Cascadia',
    modelYear: 2022,
    vehicleClass: 'heavy_duty',
    status: 'out_of_service',
    odometerMiles: 412_000,
    lastServicedAt: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Work orders
// ---------------------------------------------------------------------------

export function makeCreateWorkOrder(
  vehicleId: string,
  overrides: Partial<CreateWorkOrder> = {},
): CreateWorkOrder {
  return {
    vehicleId: vehicleId as CreateWorkOrder['vehicleId'],
    number: nextCode('RO-'),
    complaint: 'Driver reports air brakes slow to release on cold start.',
    odometerInMiles: 412_500,
    ...overrides,
  };
}

export function makeAddLine(overrides: Partial<AddWorkOrderLine> = {}): AddWorkOrderLine {
  return {
    kind: 'labor',
    description: 'Diagnose air brake release',
    // 1.5 hours, at $145/hr.
    quantity: 150,
    unitPriceCents: toCentsBrand(14_500),
    ...overrides,
  };
}
