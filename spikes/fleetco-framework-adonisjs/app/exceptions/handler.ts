import app from '@adonisjs/core/services/app';
import { ExceptionHandler } from '@adonisjs/core/http';
import type { HttpContext } from '@adonisjs/core/http';

import { problemFor } from '../../platform/http/errors.js';
import type { Problem } from '../../platform/http/errors.js';

/**
 * [[Code Standards and Guardrails]] § Errors: "a domain error taxonomy mapped
 * **once** to HTTP status codes at the route layer." This is that once, for
 * AdonisJS — its own blessed extension point for exactly this job, which is
 * arguably a cleaner fit than Fastify's `setErrorHandler` call in `server.ts`:
 * there is nowhere else a reader would look for it.
 *
 * `problemFor` carries the actual mapping and is shared with nothing else —
 * it is framework-independent so a unit test can call it directly without
 * booting an application, which `app/exceptions/handler.ts` itself cannot be.
 */
export default class HttpExceptionHandler extends ExceptionHandler {
  protected override debug = !app.inProduction;

  // Not `async`: nothing here awaits. The override still has to return a
  // `Promise`, because the base class's `handle` is declared `Promise<any>`.
  override handle(error: unknown, ctx: HttpContext): Promise<void> {
    if (isRouteNotFound(error)) {
      ctx.response.status(404).send({
        kind: 'NotFound',
        message: 'no such route',
        context: { path: ctx.request.url() },
      } satisfies Problem);
      return Promise.resolve();
    }

    const { status, body } = problemFor(error);
    ctx.response.status(status).send(body);
    return Promise.resolve();
  }

  // Not `async`, same reasoning as `handle` above: every branch is
  // synchronous, and the override still has to return `Promise<void>`.
  override report(error: unknown, ctx: HttpContext): Promise<void> {
    const { status } = problemFor(error);
    if (status >= 500) {
      ctx.logger.error({ err: error, operation: ctx.request.url() }, 'unhandled error');
    }
    // A 4xx `DomainError` — not found, forbidden, a conflict, a validation
    // failure — is ordinary client behaviour, not an operational incident,
    // and `handle()` already sent the correct response. Deliberately NOT
    // delegating to `super.report()` here: AdonisJS's default reporter has
    // no concept of our taxonomy, sees an error with no `.status` property,
    // and logs it at its own error level regardless — confirmed by running
    // the real built server and watching an ordinary 403 show up in stdout
    // as `"status":500`. Silence is correct for the ones we already mapped.
    return Promise.resolve();
  }
}

function isRouteNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'E_ROUTE_NOT_FOUND'
  );
}
