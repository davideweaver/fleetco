import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';

import type { Principal } from '../types/principal.js';
import { authenticate } from './authenticate.js';

/**
 * One route, described once.
 *
 * ADR-014 wants the OpenAPI document *generated from the Zod schemas* rather
 * than written beside them, and [[Testing Strategy]] wants the leak suite to
 * "enumerate routes from the OpenAPI document so the suite cannot silently
 * fall behind". Both of those need the schemas and the paths to be data, not
 * arguments buried in five `fastify.get(...)` calls.
 *
 * So an `Operation` is a value. `routes.ts` exports its operations as an array;
 * `register` binds each one to its handler; `lib/openapi/document.ts` reads the
 * same array. A route cannot exist without appearing in the document, and the
 * document cannot describe a route that does not exist.
 *
 * This is the one helper in the codebase that exists at a single layer of
 * indirection above the framework, and the "no abstraction until two real call
 * sites" rule is satisfied with five. What it buys, beyond the document, is
 * that each handler receives parsed, branded values and therefore contains no
 * parsing — which is what "routes are thin" has to mean to be checkable.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH';

/** Used by operations with no path parameters, no query, or no body. */
export const NOTHING = z.object({});

export type RouteContext<TParams, TQuery, TBody> = {
  readonly principal: Principal;
  readonly params: TParams;
  readonly query: TQuery;
  readonly body: TBody;
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
};

/**
 * The non-generic view of an operation: what the document builder and the leak
 * suite need. Zod's schema types are covariant in their output, so a concrete
 * `ZodType<Customer>` satisfies `ZodType` here without a cast.
 */
export type OperationDoc = {
  readonly method: HttpMethod;
  /** Fastify's `:param` form. The OpenAPI builder rewrites it to `{param}`. */
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly status: number;
  readonly params: ZodType;
  readonly query: ZodType;
  readonly body: ZodType;
  /**
   * `null` for the SSE endpoint: an event stream has no JSON response body, and
   * claiming one in the document would be a lie a generated client acts on.
   */
  readonly response: ZodType | null;
};

/** The same operation with its payload types recovered, for binding a handler. */
export type Operation<TParams, TQuery, TBody, TResult> = OperationDoc & {
  readonly params: ZodType<TParams>;
  readonly query: ZodType<TQuery>;
  readonly body: ZodType<TBody>;
  readonly response: ZodType<TResult> | null;
};

export type Handler<TParams, TQuery, TBody, TResult> = (
  context: RouteContext<TParams, TQuery, TBody>,
) => Promise<TResult | undefined>;

export function register<TParams, TQuery, TBody, TResult>(
  fastify: FastifyInstance,
  operation: Operation<TParams, TQuery, TBody, TResult>,
  handler: Handler<TParams, TQuery, TBody, TResult>,
): void {
  fastify.route({
    method: operation.method,
    url: operation.path,
    handler: async (request, reply) => {
      // Authenticate, parse, delegate, serialise. In that order, in one place,
      // for every endpoint. A `ZodError` from any of the three `parse` calls is
      // turned into a 400 by the error handler.
      const principal = authenticate(request);

      const context: RouteContext<TParams, TQuery, TBody> = {
        principal,
        params: operation.params.parse(request.params),
        query: operation.query.parse(request.query),
        body: operation.body.parse(request.body ?? {}),
        request,
        reply,
      };

      const result = await handler(context);

      // The SSE handler hijacks the reply and returns nothing; everything else
      // returns a value to serialise. `reply.sent` covers the first case
      // without the handler having to say so.
      if (result === undefined) {
        return reply;
      }
      return reply.status(operation.status).send(result);
    },
  });
}
