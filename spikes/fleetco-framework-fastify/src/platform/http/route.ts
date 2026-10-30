import { ZodError, z } from 'zod';
import type { ZodType } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { assertPlane, requirePrincipal } from './authenticate.js';
import { toValidationFailed } from './errors.js';
import { lastEventIdOf, openSse } from './sse.js';
import type { SseFrame, SseRegistry } from './sse.js';
import type { Plane, Principal } from '../types/principal.js';

/**
 * Routes are **data**, not just functions.
 *
 * This is the one piece of structure the spike invents, and it pays for itself
 * three times:
 *
 *   1. `registerRoutes` performs the add-endpoint playbook's steps 4 and 5
 *      (parse with Zod, authorize, call one service method, serialize) in one
 *      place, so a handler physically cannot contain logic — it is a lambda
 *      from parsed input to a service call.
 *   2. The OpenAPI document is generated from the same table (ADR-014), so the
 *      spec cannot drift from the code.
 *   3. **The leak suite enumerates the table.** [[Testing Strategy]] requires
 *      that "a new endpoint without leak coverage fails the build" and that
 *      routes are enumerated from the OpenAPI document so the suite cannot
 *      silently fall behind. A table makes that a `for` loop instead of a
 *      convention.
 *
 * NestJS gets 1 and 2 from decorators and reflection. This is what they cost
 * when you hold them yourself.
 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH';

export type JsonSchema = Record<string, unknown>;

/**
 * Zod is the source of truth; JSON Schema is the derived artifact (ADR-014).
 *
 * `io: 'input'` reads through the branded-type transforms and emits the
 * underlying wire shape — a `CustomerId` documents as a `uuid` string, which
 * is what it is on the wire. Our schemas have the same input and output shape
 * by construction (brand a string, brand an integer), so one mode covers both
 * requests and responses.
 */
export function jsonSchemaOf(schema: ZodType): JsonSchema {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  });
  // OpenAPI 3.1 declares the dialect once for the whole document, so the
  // per-schema `$schema` key is noise in every one of them.
  return rest;
}

export type RouteMeta = {
  readonly method: HttpMethod;
  /** Fastify form, e.g. `/v1/customers/:customerId`. */
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  /** Which plane may call this — the add-endpoint playbook's step 5. */
  readonly planes: readonly Plane[];
  readonly successStatus: number;
  readonly kind: 'json' | 'sse';
  readonly schemas: {
    readonly params: () => JsonSchema;
    readonly query: () => JsonSchema;
    readonly body: () => JsonSchema | null;
    readonly response: () => JsonSchema;
  };
};

export type Route = {
  readonly meta: RouteMeta;
  readonly handle: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
};

/** For routes with no path parameters, no query, or no body. */
export const noParams = z.object({});
export const noQuery = z.object({});
export const noBody = z.undefined();

function parse<T>(schema: ZodType<T>, value: unknown, where: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) throw toValidationFailed(error, where);
    throw error;
  }
}

export type JsonContext<P, Q, B> = {
  readonly principal: Principal;
  readonly params: P;
  readonly query: Q;
  readonly body: B;
};

export function jsonRoute<P, Q, B, R>(def: {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly planes: readonly Plane[];
  readonly successStatus: number;
  readonly params: ZodType<P>;
  readonly query: ZodType<Q>;
  readonly body: ZodType<B>;
  readonly response: ZodType<R>;
  readonly handle: (context: JsonContext<P, Q, B>) => Promise<R>;
}): Route {
  return {
    meta: {
      method: def.method,
      path: def.path,
      operationId: def.operationId,
      summary: def.summary,
      planes: def.planes,
      successStatus: def.successStatus,
      kind: 'json',
      schemas: {
        params: (): JsonSchema => jsonSchemaOf(def.params),
        query: (): JsonSchema => jsonSchemaOf(def.query),
        body: (): JsonSchema | null => (def.method === 'GET' ? null : jsonSchemaOf(def.body)),
        response: (): JsonSchema => jsonSchemaOf(def.response),
      },
    },
    handle: async (request, reply): Promise<void> => {
      const principal = requirePrincipal(request);
      assertPlane(def.planes, principal);
      const result = await def.handle({
        principal,
        params: parse(def.params, request.params, 'params'),
        query: parse(def.query, request.query, 'query'),
        body: parse(def.body, request.body, 'body'),
      });
      // The response is validated against its own contract on the way out, so
      // a drift between the handler and the generated OpenAPI document is a
      // failing request rather than a wrong document.
      await reply.status(def.successStatus).send(parse(def.response, result, 'response'));
    },
  };
}

export type StreamContext<P, Q> = {
  readonly principal: Principal;
  readonly params: P;
  readonly query: Q;
  /** `Last-Event-ID`, or the query fallback, or `null` for "start from now". */
  readonly lastEventId: number | null;
  readonly signal: AbortSignal;
};

/**
 * An SSE route.
 *
 * `open` is **async and returns the generator** rather than being a generator
 * itself, and that distinction is load-bearing: authorization has to happen
 * before the socket is hijacked, or a refusal would arrive as a `200` with an
 * error frame inside it instead of a `403`. Awaiting `open` gives the normal
 * error handler its chance; only then does the response become a stream.
 */
export function sseRoute<P, Q>(def: {
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly planes: readonly Plane[];
  readonly params: ZodType<P>;
  readonly query: ZodType<Q>;
  readonly event: ZodType;
  readonly open: (context: StreamContext<P, Q>) => Promise<AsyncGenerator<SseFrame>>;
  readonly registry: SseRegistry;
  readonly heartbeatMs: number;
}): Route {
  return {
    meta: {
      method: 'GET',
      path: def.path,
      operationId: def.operationId,
      summary: def.summary,
      planes: def.planes,
      successStatus: 200,
      kind: 'sse',
      schemas: {
        params: (): JsonSchema => jsonSchemaOf(def.params),
        query: (): JsonSchema => jsonSchemaOf(def.query),
        body: (): JsonSchema | null => null,
        response: (): JsonSchema => jsonSchemaOf(def.event),
      },
    },
    handle: async (request, reply): Promise<void> => {
      const principal = requirePrincipal(request);
      assertPlane(def.planes, principal);
      const params = parse(def.params, request.params, 'params');
      const query = parse(def.query, request.query, 'query');

      // One controller for "the handler is done with this stream", wired to
      // the socket by `openSse` below. Created first so `open`'s generator can
      // hold it.
      const aborter = new AbortController();
      const events = await def.open({
        principal,
        params,
        query,
        lastEventId: lastEventIdOf(request, undefined),
        signal: aborter.signal,
      });

      const stream = openSse(request, reply, def.registry, def.heartbeatMs);
      stream.signal.addEventListener('abort', () => {
        aborter.abort();
      });

      try {
        for await (const frame of events) {
          if (stream.signal.aborted) break;
          stream.send(frame);
        }
      } catch (error) {
        // The socket is already a 200. All that is left is to say so and close;
        // the client reconnects with its `Last-Event-ID` and loses nothing.
        request.log.error({ err: String(error), operation: def.operationId }, 'sse stream failed');
        stream.comment('stream error, reconnect');
      } finally {
        await events.return(undefined);
        stream.close();
      }
    },
  };
}

export function registerRoutes(app: FastifyInstance, routes: readonly Route[]): void {
  for (const route of routes) {
    app.route({
      method: route.meta.method,
      url: route.meta.path,
      handler: route.handle,
    });
  }
}
