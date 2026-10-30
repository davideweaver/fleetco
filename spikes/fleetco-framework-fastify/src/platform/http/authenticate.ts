import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Config } from '../../config.js';
import { Forbidden } from '../types/errors.js';
import { principalSchema } from '../types/principal.js';
import type { Plane, Principal } from '../types/principal.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

/**
 * **This is a spike stub, and the only stub in the spike.**
 *
 * The real thing is an opaque session token in our own Postgres (ADR-013),
 * minted by Better Auth behind the `AuthN` port (ADR-012), with `tenant_id` on
 * the session and verified on every request ([[Tenancy Model]] non-negotiable
 * 5). None of that is a framework question, so the spike asserts the principal
 * through a header instead.
 *
 * It refuses to install when `RUNTIME_ENV=production`, so the spike cannot be
 * deployed with header-asserted identity by accident. Everything downstream —
 * `Scope`, the repository chokepoint, the leak suite — is the real design and
 * does not change when this is replaced.
 */
export const PRINCIPAL_HEADER = 'x-fleetco-principal';

export function installAuthentication(app: FastifyInstance, config: Config): void {
  if (config.RUNTIME_ENV === 'production') {
    throw new Error(
      'the header-asserted principal is a spike stub and must not run in production; ' +
        'replace it with the Better Auth session adapter behind the AuthN port (ADR-012)',
    );
  }

  app.decorateRequest('principal', null);

  // The callback form, not `async`: resolving a principal from a header needs
  // no I/O. The real session lookup will hit Postgres and will be `async`,
  // which is the one line that changes here.
  app.addHook('onRequest', (request, _reply, done) => {
    const raw = request.headers[PRINCIPAL_HEADER];
    if (typeof raw === 'string') {
      const parsed = principalSchema.safeParse(safeJson(raw));
      // A malformed header leaves the request unauthenticated rather than
      // half-authenticated. `requirePrincipal` is what refuses it.
      request.principal = parsed.success ? parsed.data : null;
    }
    done();
  });
}

export function requirePrincipal(request: FastifyRequest): Principal {
  if (request.principal === null) {
    throw new Forbidden('authentication required', {});
  }
  return request.principal;
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
