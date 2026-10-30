import { ZodError, z } from 'zod';
import type { ZodType } from 'zod';

import { toValidationFailed } from './errors.js';
import type { Plane, Principal } from '../types/principal.js';

/**
 * Routes are **data**, not just functions — framework-independent data, on
 * purpose. This file has no AdonisJS import anywhere in it; the Adonis-specific
 * wiring that turns a `Route` into something `start/routes.ts` can register
 * lives in `platform/http/adonis_route.ts`, which is the measurable "framework
 * tax" line in NOTES.md §6.
 *
 * Keeping this file framework-independent is what makes
 * `modules/customers/routes.ts` read almost identically to the Fastify
 * spike's: the shape pays for itself three times —
 *
 *   1. the add-endpoint playbook's "parse, authorize, call **one** service
 *      method, serialize" happens in one adapter, so a handler physically
 *      cannot contain logic;
 *   2. the OpenAPI document is generated from the same table (ADR-014), so
 *      the spec cannot drift from the code;
 *   3. the leak suite enumerates the table — [[Testing Strategy]] requires
 *      "a new endpoint without leak coverage fails the build" and that
 *      routes are enumerated from the OpenAPI document.
 */
export type HttpMethod = 'GET' | 'POST' | 'PATCH';

export type JsonSchema = Record<string, unknown>;

/**
 * Zod is the source of truth; JSON Schema is the derived artifact (ADR-014).
 *
 * `io: 'input'` reads through the branded-type transforms and emits the
 * underlying wire shape — a `CustomerId` documents as a `uuid` string, which
 * is what it is on the wire.
 */
export function jsonSchemaOf(schema: ZodType): JsonSchema {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  });
  return rest;
}

export type RouteMeta = {
  readonly method: HttpMethod;
  /** Adonis form, e.g. `/v1/customers/:customerId`. */
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

/**
 * The common shape every route value has — enough to generate OpenAPI and to
 * enumerate operations for the leak suite. `JsonRoute` and `SseRoute` below
 * both satisfy it structurally; nothing needs to name it as a parent type.
 */
export type Route = {
  readonly meta: RouteMeta;
};

/** For routes with no path parameters, no query, or no body. */
export const noParams = z.object({});
export const noQuery = z.object({});
export const noBody = z.undefined();

export function parse<T>(schema: ZodType<T>, value: unknown, where: string): T {
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

export type JsonRoute<P = unknown, Q = unknown, B = unknown, R = unknown> = Route & {
  readonly meta: RouteMeta & { readonly kind: 'json' };
  readonly params: ZodType<P>;
  readonly query: ZodType<Q>;
  readonly body: ZodType<B>;
  readonly response: ZodType<R>;
  readonly handle: (context: JsonContext<P, Q, B>) => Promise<R>;
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
}): JsonRoute<P, Q, B, R> {
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
    params: def.params,
    query: def.query,
    body: def.body,
    response: def.response,
    handle: def.handle,
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

export type SseFrameData = { readonly id: number; readonly name: string; readonly data: unknown };

export type SseRoute<P = unknown, Q = unknown> = Route & {
  readonly meta: RouteMeta & { readonly kind: 'sse' };
  readonly params: ZodType<P>;
  readonly query: ZodType<Q>;
  readonly open: (context: StreamContext<P, Q>) => Promise<AsyncGenerator<SseFrameData>>;
};

/**
 * An SSE route.
 *
 * `open` is **async and returns the generator** rather than being a generator
 * itself, and that distinction is load-bearing: authorization has to happen
 * before the raw response is taken over, or a refusal would arrive as a `200`
 * with an error frame inside it instead of a `403`. The adapter in
 * `adonis_route.ts` awaits `open` before writing the SSE preamble, which gives
 * the normal error path its chance.
 */
export function sseRoute<P, Q>(def: {
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly planes: readonly Plane[];
  readonly params: ZodType<P>;
  readonly query: ZodType<Q>;
  readonly event: ZodType;
  readonly open: (context: StreamContext<P, Q>) => Promise<AsyncGenerator<SseFrameData>>;
}): SseRoute<P, Q> {
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
    params: def.params,
    query: def.query,
    open: def.open,
  };
}
