import { Forbidden } from '../types/errors.js';
import { principalSchema } from '../types/principal.js';
import type { Plane, Principal } from '../types/principal.js';

/**
 * **This is a spike stub, and the only stub in the spike.**
 *
 * The real thing is an opaque session token in our own Postgres (ADR-013),
 * minted by Better Auth behind the `AuthN` port (ADR-012), with `tenant_id` on
 * the session and verified on every request ([[Tenancy Model]] non-negotiable
 * 5). None of that is a framework question, so the spike asserts the
 * principal through a header instead — identical in spirit to the Fastify
 * spike's stub, just split so the header-reading half can live in an Adonis
 * middleware class (`app/middleware/authenticate_middleware.ts`) while the
 * pure rules stay framework-independent here.
 */
export const PRINCIPAL_HEADER = 'x-fleetco-principal';

export function parsePrincipalHeader(raw: string | undefined): Principal | null {
  if (raw === undefined) return null;
  const parsed = principalSchema.safeParse(safeJson(raw));
  // A malformed header leaves the request unauthenticated rather than
  // half-authenticated. `requirePrincipal` is what refuses it.
  return parsed.success ? parsed.data : null;
}

export function requirePrincipal(principal: Principal | null): Principal {
  if (principal === null) {
    throw new Forbidden('authentication required', {});
  }
  return principal;
}

/**
 * The plane gate from the add-endpoint playbook step 5: "which plane may call
 * this — vendor, tenant, or portal?" Declared per route and checked here, so
 * the answer is in the route table rather than in a handler's head.
 *
 * Narrowing a *portal* principal to its own `customer_id` is not done here —
 * that is `scopeOf`'s job in the data layer, which is the only place it can be
 * made unconditional.
 */
export function assertPlane(allowed: readonly Plane[], principal: Principal): void {
  if (!allowed.includes(principal.plane)) {
    throw new Forbidden('this endpoint is not available to your plane', {
      plane: principal.plane,
    });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
