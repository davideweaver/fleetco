import type { CustomerId, TenantId } from './branded';
import type { Principal } from './principal';

/**
 * The authorization chokepoint value, per [[Tenancy Model]] § Authorization
 * Chokepoint: "tenant scope is applied at one place in the data layer, not
 * hand-written per query."
 *
 * Every repository method takes a `Scope` as its first argument. There is no
 * repository method that does not, which is what makes an unscoped query
 * unexpressible rather than merely discouraged.
 *
 * Two levels of authorization, one level of tenancy:
 *   - `tenantId` is always applied.
 *   - `customerId`, when non-null, pins the query to one customer as well.
 *     This is the portal case, which [[Tenancy Model]] calls "the one that
 *     matters on day one".
 */
export type Scope = {
  readonly tenantId: TenantId;
  readonly customerId: CustomerId | null;
};

/**
 * The only way to obtain a `Scope`. Derives it from the authenticated
 * principal so a route cannot widen its own access by constructing one.
 */
export function scopeOf(principal: Principal): Scope {
  return {
    tenantId: principal.tenantId,
    customerId: principal.role === 'portal' ? principal.customerId : null,
  };
}
