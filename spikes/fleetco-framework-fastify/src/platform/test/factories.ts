import { newCustomerId, newTenantId, newUserId, toCents, toInstant } from '../types/branded.js';
import type { Cents, CustomerId, Instant, TenantId } from '../types/branded.js';
import type { Principal } from '../types/principal.js';
import type { CreateCustomer, Customer, CustomerStore } from '../../modules/customers/index.js';

/**
 * One factory module, used everywhere ([[Testing Strategy]] § Test Data).
 * No test invents its own customer inline — that is how fixtures drift and how
 * tests start depending on each other.
 *
 * Deterministic by default; the only randomness is the UUIDv7 generator, and
 * seeded randomness belongs to the property tests.
 */
export const FROZEN_NOW: Instant = toInstant('2026-10-09T14:30:00.000Z');

export function makeTenant(): { readonly tenantId: TenantId } {
  return { tenantId: newTenantId() };
}

export function staffPrincipal(tenantId: TenantId): Principal {
  return {
    plane: 'tenant',
    userId: newUserId(),
    tenantId,
    roles: ['service_advisor'],
    authMethod: 'password',
  };
}

export function portalPrincipal(tenantId: TenantId, customerId: CustomerId): Principal {
  return {
    plane: 'portal',
    userId: newUserId(),
    tenantId,
    customerId,
    roles: ['fleet_manager'],
    authMethod: 'password',
  };
}

export function vendorPrincipal(tenantId: TenantId): Principal {
  return {
    plane: 'vendor',
    userId: newUserId(),
    tenantId,
    roles: ['operator'],
    authMethod: 'impersonation',
  };
}

const DEFAULT_LABOR_RATE: Cents = toCents(14_500);
const DEFAULT_CREDIT_LIMIT: Cents = toCents(5_000_000);

export function makeCreateCustomer(overrides: Partial<CreateCustomer> = {}): CreateCustomer {
  return {
    code: 'ACME',
    name: 'Acme Trucking',
    creditLimitCents: DEFAULT_CREDIT_LIMIT,
    defaultLaborRateCents: DEFAULT_LABOR_RATE,
    billingTermsNetDays: 30,
    primaryContactEmail: 'dispatch@acme.example',
    primaryContactPhone: '717-555-0100',
    ...overrides,
  };
}

export function makeCustomer(
  tenantId: TenantId,
  overrides: Partial<Customer> = {},
): Customer {
  return {
    id: newCustomerId(),
    tenantId,
    code: 'ACME',
    name: 'Acme Trucking',
    status: 'prospect',
    creditLimitCents: DEFAULT_CREDIT_LIMIT,
    defaultLaborRateCents: DEFAULT_LABOR_RATE,
    billingTermsNetDays: 30,
    isOnCreditHold: false,
    primaryContactEmail: 'dispatch@acme.example',
    primaryContactPhone: '717-555-0100',
    createdAt: FROZEN_NOW,
    updatedAt: FROZEN_NOW,
    ...overrides,
  };
}

/**
 * Two customers per tenant, which is exactly what the leak suite needs:
 * [[Tenancy Model]] non-negotiable 7 asks for two tenants with two customers
 * each so the cross-*customer* case inside one tenant is covered too.
 *
 * Writes through the real store, so the seed path is the production write path.
 */
export async function seedTenant(
  store: CustomerStore,
  tenant: { readonly tenantId: TenantId },
): Promise<Customer[]> {
  const scope = { tenantId: tenant.tenantId, customerId: null };
  const seeds = [
    makeCustomer(tenant.tenantId, { code: 'ACME', name: 'Acme Trucking', status: 'active' }),
    makeCustomer(tenant.tenantId, { code: 'CITY', name: 'City Hauling', status: 'active' }),
  ];
  await store.inTransaction(async (tx) => {
    for (const customer of seeds) await tx.insert(scope, customer);
  });
  return seeds;
}
