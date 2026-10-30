import type { FastifyRequest } from 'fastify';

import { environment } from '../environment.js';
import { Forbidden, ValidationFailed } from '../errors/DomainError.js';
import { principalSchema, type Principal } from '../types/principal.js';

/**
 * **A stub, and deliberately a loud one.**
 *
 * The real thing is an opaque session token in Postgres (ADR-013), minted by
 * Better Auth behind the `AuthN` port (ADR-012), with `tenant_id` on the
 * session and verified on every request ([[Tenancy Model]] non-negotiable 5).
 * None of that is a framework question, so building it here would have cost a
 * day of the spike's timebox and told us nothing about the framework.
 *
 * What this stub does instead is read a JSON `Principal` from a request header.
 * Everything downstream of it — `Scope`, the repository chokepoint, the leak
 * suite — is the real design and does not change when the stub is replaced;
 * the function goes from reading a header to validating a token.
 *
 * `assertNotProduction()` is called at route-registration time rather than per
 * request, so a deploy with header-asserted identity fails to start instead of
 * failing a pen test.
 */

const PRINCIPAL_HEADER = 'x-fleetco-principal';

export function assertNotProduction(): void {
  if (environment.RUNTIME_ENV === 'production') {
    throw new Error(
      'The header-based authentication stub must not run in production. Replace it with the AuthN port (ADR-012) first.',
    );
  }
}

export function authenticate(request: FastifyRequest): Principal {
  const header = request.headers[PRINCIPAL_HEADER];
  if (typeof header !== 'string' || header.length === 0) {
    throw new Forbidden('Authentication required', {});
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    throw new ValidationFailed(`${PRINCIPAL_HEADER} is not valid JSON`, {});
  }

  // The schema is a discriminated union on `plane`, so a portal principal
  // without its `customerId` is rejected here rather than being silently
  // widened to the whole tenant.
  return principalSchema.parse(parsed);
}
