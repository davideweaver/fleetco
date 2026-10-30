import type { HttpContext } from '@adonisjs/core/http';
import type { NextFn } from '@adonisjs/core/types/http';

import { PRINCIPAL_HEADER, parsePrincipalHeader } from '../../platform/http/authenticate.js';
import type { Principal } from '../../platform/types/principal.js';

declare module '@adonisjs/core/http' {
  interface HttpContext {
    principal: Principal | null;
  }
}

/**
 * Reads the spike's stub principal header and assigns `ctx.principal`. The
 * production guard — refusing to boot this stub under `RUNTIME_ENV=production`
 * — lives in `providers/fleetco_provider.ts#boot`, which is the one place that
 * genuinely runs once; a middleware class's constructor is not reliably that
 * in AdonisJS (the container may re-resolve it), so the check does not belong
 * here.
 */
export default class AuthenticateMiddleware {
  // Not `async`: resolving a principal from a header needs no I/O, same as
  // the Fastify spike's callback-form hook. The real session lookup will hit
  // Postgres and will be `async`, which is the one line that changes here.
  handle(ctx: HttpContext, next: NextFn): unknown {
    ctx.principal = parsePrincipalHeader(ctx.request.header(PRINCIPAL_HEADER));
    return next();
  }
}
