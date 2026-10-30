import { newCustomerId, newTenantId, newUserId, toCents, toInstant } from '../types/branded';
import type { CustomerId, TenantId } from '../types/branded';
import type { Principal, Role } from '../types/principal';
import type { CreateCustomer, Customer } from '../../modules/customers';

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
