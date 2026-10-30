import type { CustomerId, TenantId } from './branded.js';
import type { Principal } from './principal.js';

/**
 * **The authorization chokepoint, as a type.**
 *
 * [[Tenancy Model]] § Authorization Chokepoint: "tenant scope is applied at one
 * place in the data layer, not hand-written per query. A repository or
 * query-builder wrapper that *cannot* produce an unscoped query."
 *
 * `Scope` is how that is enforced here. Every repository method takes one as
 * its first argument, so a query without a scope does not compile, and the
 * repository ANDs both predicates in unconditionally. There is no second path
 * to the tables: lint forbids importing Drizzle outside `repository.ts`.
 *
 * `customerId: null` means "the whole tenant" — shop staff. A value means a
 * portal user who may see exactly one fleet, which is the two-levels-of-
 * authorization, one-level-of-tenancy model from that document.
 *
 * The same function serves REST and SSE, which is [[Realtime and Events]]
 * § Authorization's one rule: "subscription authorization and request
 * authorization call the same code."
 */
export type Scope = {
  readonly tenantId: TenantId;
  readonly customerId: CustomerId | null;
};

export function scopeFor(principal: Principal): Scope {
  switch (principal.plane) {
    case 'portal':
      return { tenantId: principal.tenantId, customerId: principal.customerId };
    case 'tenant':
      return { tenantId: principal.tenantId, customerId: null };
    // The vendor plane is an admin role inside the single application for phase
    // one ([[Tenancy Model]], revised 2026-10-09). It is still scoped to the
    // tenant it is acting on — impersonation sets that tenant, it does not
    // remove the predicate. Cross-tenant reads belong to a vendor-plane
    // application that does not exist yet. Written out rather than falling
    // through, so adding a plane cannot silently inherit this behaviour.
    case 'vendor':
      return { tenantId: principal.tenantId, customerId: null };
  }
}

/** True when the scope may see every customer in its tenant. */
export function isTenantWide(scope: Scope): boolean {
  return scope.customerId === null;
}
