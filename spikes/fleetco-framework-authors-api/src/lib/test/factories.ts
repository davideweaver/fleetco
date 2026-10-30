import {
  toCents,
  toCustomerId,
  toInstant,
  toTenantId,
  toUserId,
  type Cents,
  type CustomerId,
  type Instant,
  type TenantId,
  type UserId,
} from '../types/branded.js';
import type { Principal } from '../types/principal.js';
import type { Scope } from '../types/scope.js';
import type { CreateCustomer, Customer } from '../../modules/customers/contracts.js';

/**
 * **One factory module, used everywhere.** [[Testing Strategy]] § Test Data:
 * "no test invents its own customer or service order inline — that is how
 * fixtures drift and how tests start depending on each other."
 *
 * Deterministic by default: ids come from a sequence number, so a failing test
 * names the same customer on every run and a diff of two failures is readable.
 * Seeded randomness belongs in the property tests, where fast-check owns it.
 *
 * The same factories are meant to seed local development (`npm run seed`), so
 * the realistic dataset and the test fixtures cannot diverge.
 */

/**
 * A UUIDv7-shaped id built from a sequence number. The version nibble is `7`
 * and the variant is `8`, so these pass the same validation real ids do, while
 * sorting in creation order and reading as what they are in a failure message.
 */
function seededUuid(kind: number, sequence: number): string {
  // Both the kind and the sequence live in the 48-bit node field, whole. An
  // earlier version packed the sequence into the time-high group and silently
  // truncated it, so `makeTenantId(1)` and `makeTenantId(2)` were the same id
  // and two cross-tenant tests passed vacuously. Keeping the whole value in one
  // field is what makes that impossible to repeat.
  const node = `${kind.toString(16).padStart(2, '0')}${sequence.toString(16).padStart(10, '0')}`;
  return `0192f0c0-0000-7000-8000-${node}`;
}

export function makeTenantId(sequence = 1): TenantId {
  return toTenantId(seededUuid(1, sequence));
}

export function makeCustomerId(sequence = 1): CustomerId {
  return toCustomerId(seededUuid(2, sequence));
}

export function makeUserId(sequence = 1): UserId {
  return toUserId(seededUuid(3, sequence));
}

/** A fixed instant, so nothing in a test depends on the wall clock. */
export const FIXED_NOW: Instant = toInstant('2026-10-09T14:00:00.000Z');

export function makeCents(value: number): Cents {
  return toCents(value);
}

export function makeTenant(sequence = 1): { tenantId: TenantId } {
  return { tenantId: makeTenantId(sequence) };
}

export function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  const tenantId = overrides.tenantId ?? makeTenantId(1);
  const id = overrides.id ?? makeCustomerId(1);
  return {
    id,
    tenantId,
    code: 'ACME',
    name: 'Acme Trucking',
    status: 'prospect',
    creditLimitCents: toCents(500_000),
    defaultLaborRateCents: toCents(12_500),
    billingTermsNetDays: 30,
    isOnCreditHold: false,
    primaryContactEmail: 'dispatch@acme.example',
    primaryContactPhone: '717-555-0100',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...overrides,
  };
}

export function makeCreateCustomer(overrides: Partial<CreateCustomer> = {}): CreateCustomer {
  return {
    code: 'ACME',
    name: 'Acme Trucking',
    creditLimitCents: toCents(500_000),
    defaultLaborRateCents: toCents(12_500),
    billingTermsNetDays: 30,
    primaryContactEmail: 'dispatch@acme.example',
    primaryContactPhone: '717-555-0100',
    ...overrides,
  };
}

/** Shop staff: the whole tenant, no customer restriction. */
export function makeStaffPrincipal(tenantId: TenantId): Principal {
  return {
    userId: makeUserId(1),
    tenantId,
    plane: 'tenant',
    roles: ['service_advisor'],
    authMethod: 'password',
  };
}

/** A portal login, scoped to exactly one fleet. The case that matters on day one. */
export function makePortalPrincipal(tenantId: TenantId, customerId: CustomerId): Principal {
  return {
    userId: makeUserId(2),
    tenantId,
    plane: 'portal',
    customerId,
    roles: ['portal_user'],
    authMethod: 'password',
  };
}

export function makeScope(tenantId: TenantId, customerId: CustomerId | null = null): Scope {
  return { tenantId, customerId };
}
