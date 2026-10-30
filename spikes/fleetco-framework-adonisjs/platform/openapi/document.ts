import { jsonSchemaOf } from '../http/route.js';
import type { JsonSchema, Route } from '../http/route.js';
import { problemSchema } from '../../modules/customers/contracts.js';

/**
 * ADR-014: the OpenAPI document is generated from the Zod schemas, never
 * written by hand. The route table is the input, so the spec cannot drift from
 * the code — and the leak suite reads its operation ids back out of this
 * document, which is what [[Testing Strategy]] means by "enumerate routes from
 * the OpenAPI document so the suite cannot silently fall behind."
 *
 * OpenAPI 3.1 rather than 3.0, because 3.1's schema dialect *is* JSON Schema
 * 2020-12 — which is what Zod 4 emits natively. 3.0 would need a conversion
 * layer and therefore a dependency.
 */
export type OpenApiDocument = {
  readonly openapi: '3.1.0';
  readonly info: { readonly title: string; readonly version: string };
  readonly paths: Record<string, Record<string, unknown>>;
  readonly components: { readonly schemas: Record<string, JsonSchema> };
};

export function buildOpenApiDocument(routes: readonly Route[], version: string): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of routes) {
    const path = toOpenApiPath(route.meta.path);
    const parameters = [
      ...pathParameters(route.meta.schemas.params()),
      ...queryParameters(route.meta.schemas.query()),
    ];
    const body = route.meta.schemas.body();

    const operation: Record<string, unknown> = {
      operationId: route.meta.operationId,
      summary: route.meta.summary,
      tags: ['customers'],
      // Not decoration: this is the authorization fact the add-endpoint
      // playbook's step 5 demands, published next to the endpoint.
      'x-fleetco-planes': route.meta.planes,
      parameters,
      responses: {
        [String(route.meta.successStatus)]: {
          description: route.meta.kind === 'sse' ? 'An SSE stream of events.' : 'Success.',
          content:
            route.meta.kind === 'sse'
              ? { 'text/event-stream': { schema: route.meta.schemas.response() } }
              : { 'application/json': { schema: route.meta.schemas.response() } },
        },
        ...problemResponses(),
      },
    };
    if (body !== null) {
      operation['requestBody'] = {
        required: true,
        content: { 'application/json': { schema: body } },
      };
    }

    paths[path] = { ...paths[path], [route.meta.method.toLowerCase()]: operation };
  }

  return {
    openapi: '3.1.0',
    info: { title: 'Fleetco API — customers', version },
    paths,
    components: { schemas: { Problem: jsonSchemaOf(problemSchema) } },
  };
}

/** Every endpoint returns the same error body, mapped once in `app/exceptions/handler.ts`. */
function problemResponses(): Record<string, unknown> {
  const content = { 'application/json': { schema: { $ref: '#/components/schemas/Problem' } } };
  return {
    '400': { description: 'ValidationFailed', content },
    '403': { description: 'Forbidden', content },
    '404': { description: 'NotFound', content },
    '409': { description: 'Conflict', content },
    '422': { description: 'BusinessRuleViolated', content },
  };
}

function toOpenApiPath(adonisPath: string): string {
  return adonisPath.replaceAll(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function pathParameters(schema: JsonSchema): unknown[] {
  return propertiesOf(schema).map(([name, property]) => ({
    name,
    in: 'path',
    required: true,
    schema: property,
  }));
}

function queryParameters(schema: JsonSchema): unknown[] {
  const required = new Set(requiredOf(schema));
  return propertiesOf(schema).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: property,
  }));
}

function propertiesOf(schema: JsonSchema): [string, unknown][] {
  const properties = schema['properties'];
  if (typeof properties !== 'object' || properties === null) return [];
  return Object.entries(properties);
}

function requiredOf(schema: JsonSchema): string[] {
  const required = schema['required'];
  if (!Array.isArray(required)) return [];
  return required.filter((name): name is string => typeof name === 'string');
}
