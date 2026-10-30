import { z } from 'zod';

import {
  createCustomerSchema,
  customerEventSchema,
  customerPageSchema,
  customerSchema,
  listCustomersQuerySchema,
  problemSchema,
  updateCustomerSchema,
} from '../../modules/customers/contracts';

/**
 * The OpenAPI document, generated from the Zod contracts (ADR-014). Not
 * `@nestjs/swagger`: that reads decorators off DTO classes, which would make
 * the classes a second source of truth alongside the Zod schemas and hand the
 * handlers unbranded objects.
 *
 * `io: 'input'` is what makes this work. Every branded schema is
 * `z.uuid().transform(toCustomerId)`, and `toJSONSchema` cannot represent a
 * transform's output — but the *input* side is the wire shape, which is
 * exactly what the document should describe. The brands are a TypeScript
 * concern and correctly invisible here.
 *
 * This document is also the leak suite's route list. [[Testing Strategy]]
 * requires routes to be "enumerated from the OpenAPI document so the suite
 * cannot silently fall behind", and `leak.test.ts` additionally cross-checks
 * it against Nest's own router so an undocumented route fails the build.
 */
const registry = z.registry<{ id: string }>();
registry.add(customerSchema, { id: 'Customer' });
registry.add(customerPageSchema, { id: 'CustomerPage' });
registry.add(createCustomerSchema, { id: 'CreateCustomer' });
registry.add(updateCustomerSchema, { id: 'UpdateCustomer' });
registry.add(customerEventSchema, { id: 'CustomerEvent' });
registry.add(problemSchema, { id: 'Problem' });

const ref = (id: string): { $ref: string } => ({ $ref: `#/components/schemas/${id}` });

const customerIdParam = {
  name: 'customerId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;

const errorResponses = {
  '400': { description: 'Validation failed', content: json('Problem') },
  '403': { description: 'Role or scope refuses the request', content: json('Problem') },
  '404': { description: 'Not found, or not visible to this scope', content: json('Problem') },
  '409': { description: 'Conflict', content: json('Problem') },
  '422': { description: 'Business rule violated', content: json('Problem') },
};

export function buildOpenApiDocument(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(registry, {
    target: 'openapi-3.0',
    io: 'input',
    uri: (id) => `#/components/schemas/${id}`,
  });

  return {
    openapi: '3.0.3',
    info: {
      title: 'Fleetco API — customers',
      version: '1.0.0',
      description:
        'The customers module. Every path is scoped to the authenticated principal’s ' +
        'tenant, and to a single customer when the principal is a portal user.',
    },
    paths: {
      '/v1/customers': {
        get: {
          operationId: 'listCustomers',
          summary: 'List customers visible to the principal',
          parameters: queryParameters(),
          responses: { '200': { description: 'A page of customers', content: json('CustomerPage') }, ...errorResponses },
        },
        post: {
          operationId: 'createCustomer',
          summary: 'Create a customer',
          requestBody: { required: true, content: json('CreateCustomer') },
          responses: { '201': { description: 'The created customer', content: json('Customer') }, ...errorResponses },
        },
      },
      '/v1/customers/{customerId}': {
        get: {
          operationId: 'getCustomer',
          summary: 'Fetch one customer',
          parameters: [customerIdParam],
          responses: { '200': { description: 'The customer', content: json('Customer') }, ...errorResponses },
        },
        patch: {
          operationId: 'updateCustomer',
          summary: 'Update a customer',
          parameters: [customerIdParam],
          requestBody: { required: true, content: json('UpdateCustomer') },
          responses: { '200': { description: 'The updated customer', content: json('Customer') }, ...errorResponses },
        },
      },
      '/v1/customers/{customerId}/events': {
        get: {
          operationId: 'streamCustomerEvents',
          summary: 'Server-Sent Events for one customer',
          description:
            'Replays outbox events after `Last-Event-ID`, then streams live. The SSE `id` ' +
            'field is the outbox cursor, so a reconnecting client resumes without a gap.',
          parameters: [
            customerIdParam,
            {
              name: 'Last-Event-ID',
              in: 'header',
              required: false,
              description: 'Replay cursor. Sent automatically by `EventSource` on reconnect.',
              schema: { type: 'integer', minimum: 1 },
            },
          ],
          responses: {
            '200': {
              description: 'An event stream of CustomerEvent frames',
              content: {
                'text/event-stream': { schema: ref('CustomerEvent') },
              },
            },
            ...errorResponses,
          },
        },
      },
    },
    components: {
      schemas: stripIds(schemas),
    },
  };
}

function json(id: string): Record<string, unknown> {
  return { 'application/json': { schema: ref(id) } };
}

/** Turns the list query schema into OpenAPI `in: query` parameters. */
function queryParameters(): Record<string, unknown>[] {
  const schema = z.toJSONSchema(listCustomersQuerySchema, {
    target: 'openapi-3.0',
    io: 'input',
  });
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: 'query',
    required: required.includes(name),
    schema: propertySchema,
  }));
}

/**
 * Zod stamps `$id` into each registered schema. Harmless, but OpenAPI
 * component schemas conventionally do not carry one and a validator will
 * flag it.
 */
function stripIds(schemas: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schemas).map(([id, schema]) => {
      if (!isRecord(schema)) return [id, schema];
      const { $id: _dropped, ...rest } = schema;
      return [id, rest];
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every documented operation as `METHOD /path`, with OpenAPI path templates
 * (`{customerId}`) left in place. The leak suite walks this.
 */
export function documentedOperations(): string[] {
  const document = buildOpenApiDocument();
  const paths = isRecord(document.paths) ? document.paths : {};
  return Object.entries(paths)
    .flatMap(([path, operations]) =>
      isRecord(operations)
        ? Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`)
        : [],
    )
    .sort();
}
