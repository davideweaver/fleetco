import type { CustomerId, TenantId } from './branded.js';
import type { Principal } from './principal.js';

/**
 * The authorization chokepoint value, per [[Tenancy Model]] § Authorization
 * Chokepoint: "tenant scope is applied at one place in the data layer, not
 * hand-written per query."
 *
 * Every repository function takes a `Scope` as its first argument. There is no
 * repository function that does not, which is what makes an unscoped query
 * unexpressible rather than merely discouraged. AdonisJS's IoC container is
 * deliberately not involved here: `Scope` is a plain value, derived once per
 * request and threaded through ordinary function arguments.
 *
 * Two levels of authorization, one level of tenancy:
 *   - `tenantId` always applies.
 *   - `customerId`, when non-null, pins the query to one customer as well.
 *     That is the portal case — [[Tenancy Model]] calls it "the one that
 *     matters on day one".
 */
export type Scope = {
  readonly tenantId: TenantId;
  readonly customerId: CustomerId | null;
};

/**
 * The only way to obtain a `Scope`. Derived from the authenticated principal,
 * so a route cannot widen its own access by building one from a request body.
 */
export function scopeOf(principal: Principal): Scope {
  return {
    tenantId: principal.tenantId,
    customerId: principal.plane === 'portal' ? principal.customerId : null,
  };
}
