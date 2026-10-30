import { z, type ZodType } from 'zod';

import { environment } from '../environment.js';
import type { OperationDoc } from '../http/route.js';

/**
 * The OpenAPI document, generated from the Zod schemas (ADR-014: "REST with
 * OpenAPI generated from Zod schemas"). Not written by hand and not annotated
 * onto handlers — derived from the same `OperationDoc` values the router binds,
 * so the document cannot describe a route that does not exist and a route
 * cannot exist without appearing in the document.
 *
 * That property is load-bearing twice over. [[Testing Strategy]] requires the
 * leak suite to enumerate endpoints from this document "so the suite cannot
 * silently fall behind", and ADR-014 wants a client generated from it.
 *
 * **`io: 'input'` everywhere, including for responses, and that needs saying.**
 * Zod refuses to emit a schema for a transform's output side, and every branded
 * value in this codebase is a transform — `z.uuid().transform(toCustomerId)`.
 * The input side is nevertheless the correct wire description: a brand is an
 * identity function at runtime, so a `CustomerId` on the wire *is* a uuid
 * string and `Cents` *is* an integer. The document is accurate; it is only
 * generated from the other end of a pipe that does nothing.
 *
 * No `zod-to-openapi` dependency. The dependency allowlist's default answer is
 * no, `z.toJSONSchema` is in Zod itself, and what remains is the eighty lines
 * below of walking five operations.
 */

const OPENAPI_VERSION = '3.0.3';

type JsonObject = Record<string, unknown>;

export function buildOpenApiDocument(operations: readonly OperationDoc[]): JsonObject {
  const paths: JsonObject = {};

  for (const operation of operations) {
    const path = toOpenApiPath(operation.path);
    const existing = isObject(paths[path]) ? paths[path] : {};
    paths[path] = { ...existing, [operation.method.toLowerCase()]: describe(operation) };
  }

  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: `${environment.PACKAGE_NAME} API`,
      version: environment.PACKAGE_VERSION,
      description:
        'Fleetco framework spike 4 — the customers golden module on the ported authors-api Process/AppModule pattern.',
    },
    // ADR-018: a single hostname, no tenant in the URL. The tenant comes from
    // the session, which is why there is no `{tenant}` server variable here.
    servers: [{ url: '/' }],
    paths,
    components: {
      securitySchemes: {
        // The stub, described honestly. When the AuthN port (ADR-012) replaces
        // it this becomes a cookie scheme and nothing else in the document
        // changes.
        principalHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'x-fleetco-principal',
          description:
            'Development only: a JSON Principal. Replaced by an opaque session cookie (ADR-013).',
        },
      },
    },
    security: [{ principalHeader: [] }],
  };
}

function describe(operation: OperationDoc): JsonObject {
  const described: JsonObject = {
    operationId: operation.operationId,
    summary: operation.summary,
    parameters: [
      ...parameters(operation.params, 'path'),
      ...parameters(operation.query, 'query'),
    ],
    responses: {
      [String(operation.status)]: successResponse(operation),
      '400': problem('The request failed validation.'),
      '403': problem('Authentication is required, or the principal may not act here.'),
      '404': problem('No such resource within this principal’s scope.'),
      '409': problem('The resource changed, or a unique constraint was violated.'),
      '422': problem('A business rule forbids this change.'),
      '500': problem('Internal server error.'),
    },
  };

  // `NOTHING` produces `{}` with no properties, which is how an operation
  // without a body is told apart from one with a body.
  if (hasProperties(operation.body)) {
    described.requestBody = {
      required: true,
      content: { 'application/json': { schema: jsonSchema(operation.body) } },
    };
  }

  return described;
}

function successResponse(operation: OperationDoc): JsonObject {
  if (operation.response === null) {
    return {
      description:
        'An SSE stream. Each frame carries the outbox id as its `id:` field, which the client returns as `Last-Event-ID` to replay from.',
      content: { 'text/event-stream': { schema: { type: 'string' } } },
    };
  }
  return {
    description: 'Success.',
    content: { 'application/json': { schema: jsonSchema(operation.response) } },
  };
}

function problem(description: string): JsonObject {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['kind', 'message', 'context'],
          properties: {
            kind: { type: 'string' },
            message: { type: 'string' },
            context: { type: 'object' },
          },
        },
      },
    },
  };
}

/**
 * Each property of a `params` or `query` object becomes one parameter. The
 * schemas are flat objects by construction — a nested query parameter would
 * have no sensible serialisation — so this does not recurse.
 */
function parameters(schema: ZodType, location: 'path' | 'query'): JsonObject[] {
  const document = jsonSchema(schema);
  const properties = isObject(document.properties) ? document.properties : {};
  const required = Array.isArray(document.required) ? document.required : [];

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: location,
    // A path parameter is always required; OpenAPI insists on it.
    required: location === 'path' || required.includes(name),
    schema: propertySchema,
  }));
}

function jsonSchema(schema: ZodType): JsonObject {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    // A `.refine()` has no JSON Schema representation either. Emitting the
    // shape without the refinement is the right trade: the server still
    // enforces it and returns a 400, and the alternative is no document.
    unrepresentable: 'any',
  });
}

function hasProperties(schema: ZodType): boolean {
  const document = jsonSchema(schema);
  return isObject(document.properties) && Object.keys(document.properties).length > 0;
}

/** `/v1/customers/:customerId` to `/v1/customers/{customerId}`. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
