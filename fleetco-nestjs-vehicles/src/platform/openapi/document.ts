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
import {
  addWorkOrderLineSchema,
  createWorkOrderSchema,
  listWorkOrdersQuerySchema,
  updateWorkOrderSchema,
  workOrderDetailSchema,
  workOrderEventSchema,
  workOrderLineSchema,
  workOrderPageSchema,
  workOrderSchema,
} from '../../modules/workorders/contracts';
import {
  createVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
  vehicleEventSchema,
  vehiclePageSchema,
  vehicleSchema,
} from '../../modules/vehicles/contracts';

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
 * cannot silently fall behind", and `platform/__tests__/leak.test.ts`
 * cross-checks it against Nest's own router so an undocumented route fails the
 * build.
 *
 * ---------------------------------------------------------------------------
 * Why this file is a list of resources rather than a wall of paths
 * ---------------------------------------------------------------------------
 *
 * Both modules expose exactly the same five operations over different nouns —
 * list, create, get, update, stream — because that is what the golden module
 * prescribes. Written out longhand that was ~60 lines of near-identical path
 * objects per module, hand-maintained, and it was already wrong once: the
 * customers copy of the `Last-Event-ID` parameter said `minimum: 1` while the
 * code accepts `0`, so a generated client would have rejected a legal request.
 *
 * A duplicated literal that drifts is exactly the case an abstraction is for.
 * Unlike the repository seam, nothing here fights it: these are plain objects,
 * no ORM types involved, so the whole shape collapses into one function and a
 * five-line declaration per resource.
 *
 * A resource that needs an operation this shape does not cover adds it to its
 * own entry in `PATHS` below rather than bending `crudPaths`.
 */

// ---------------------------------------------------------------------------
// The component registry
// ---------------------------------------------------------------------------

const registry = z.registry<{ id: string }>();

/**
 * Registers the five schemas every resource has, under the names `crudPaths`
 * expects. Keeping the naming in one place is what lets the path builder refer
 * to components by convention instead of by argument.
 */
function registerResource(
  entity: string,
  schemas: {
    readonly entity: z.ZodType;
    readonly page: z.ZodType;
    readonly create: z.ZodType;
    readonly update: z.ZodType;
    readonly event: z.ZodType;
  },
): void {
  registry.add(schemas.entity, { id: entity });
  registry.add(schemas.page, { id: `${entity}Page` });
  registry.add(schemas.create, { id: `Create${entity}` });
  registry.add(schemas.update, { id: `Update${entity}` });
  registry.add(schemas.event, { id: `${entity}Event` });
}

registerResource('Customer', {
  entity: customerSchema,
  page: customerPageSchema,
  create: createCustomerSchema,
  update: updateCustomerSchema,
  event: customerEventSchema,
});

registerResource('Vehicle', {
  entity: vehicleSchema,
  page: vehiclePageSchema,
  create: createVehicleSchema,
  update: updateVehicleSchema,
  event: vehicleEventSchema,
});

registerResource('WorkOrder', {
  entity: workOrderSchema,
  page: workOrderPageSchema,
  create: createWorkOrderSchema,
  update: updateWorkOrderSchema,
  event: workOrderEventSchema,
});

// The line sub-resource's own components. Not part of `registerResource`,
// because they are not the five schemas every resource has.
registry.add(workOrderDetailSchema, { id: 'WorkOrderDetail' });
registry.add(workOrderLineSchema, { id: 'WorkOrderLine' });
registry.add(addWorkOrderLineSchema, { id: 'AddWorkOrderLine' });

registry.add(problemSchema, { id: 'Problem' });

// ---------------------------------------------------------------------------
// The resources
// ---------------------------------------------------------------------------

type Resource = {
  /** The collection path segment, e.g. `customers`. */
  readonly collection: string;
  /** The path parameter, e.g. `customerId`. */
  readonly idParam: string;
  /** The component-schema stem, e.g. `Customer`. Also the operationId stem. */
  readonly entity: string;
  /** The list endpoint's query contract; its parameters are derived from it. */
  readonly listQuery: z.ZodType;
  /** Only where the generic wording would be wrong. */
  readonly summaries?: Partial<Record<'list' | 'create' | 'get' | 'update' | 'stream', string>>;
  /** When the detail endpoint returns more than the resource schema. */
  readonly getResponseSchema?: string;
  /** Operations this resource has that the golden-module shape does not. */
  readonly extraPaths?: () => Record<string, unknown>;
};

const RESOURCES: readonly Resource[] = [
  {
    collection: 'customers',
    idParam: 'customerId',
    entity: 'Customer',
    listQuery: listCustomersQuerySchema,
  },
  {
    collection: 'vehicles',
    idParam: 'vehicleId',
    entity: 'Vehicle',
    listQuery: listVehiclesQuerySchema,
    // "Create a vehicle" is true but loses the part that matters: a vehicle
    // cannot exist without a fleet, and the request names one.
    summaries: { create: 'Add a vehicle to a fleet' },
  },
  {
    collection: 'work-orders',
    idParam: 'workOrderId',
    entity: 'WorkOrder',
    listQuery: listWorkOrdersQuerySchema,
    summaries: {
      create: 'Open a work order against a vehicle',
      get: 'Fetch one work order with its lines',
    },
    // The detail endpoint returns the lines with the order, so its 200 body is
    // richer than the resource schema `crudPaths` would otherwise reference.
    getResponseSchema: 'WorkOrderDetail',
    // Three operations the golden-module shape does not have. They are
    // declared here rather than by bending `crudPaths`, which is the escape
    // hatch the builder was written to leave open.
    extraPaths: workOrderLinePaths,
  },
];

/**
 * The line sub-resource.
 *
 * This is the first thing in the codebase that does not fit the five-operation
 * shape, and it is the reason `crudPaths` takes an `extraPaths` hook instead
 * of growing options. A resource that needs something unusual writes it out
 * longhand; the shared builder stays the shape it claims to be.
 */
function workOrderLinePaths(): Record<string, unknown> {
  const byOrder = [idParameter('workOrderId')];
  return {
    '/v1/work-orders/{workOrderId}/lines': {
      get: {
        operationId: 'listWorkOrderLines',
        summary: 'List the lines on a work order',
        parameters: byOrder,
        responses: {
          '200': {
            description: 'The lines, oldest first',
            content: {
              'application/json': {
                schema: { type: 'array', items: ref('WorkOrderLine') },
              },
            },
          },
          ...errorResponses,
        },
      },
      post: {
        operationId: 'addWorkOrderLine',
        summary: 'Add a labour or part line, and re-total the order',
        parameters: byOrder,
        requestBody: { required: true, content: json('AddWorkOrderLine') },
        responses: {
          '201': { description: 'The added line', content: json('WorkOrderLine') },
          ...errorResponses,
        },
      },
    },
    '/v1/work-orders/{workOrderId}/lines/{lineId}': {
      delete: {
        operationId: 'removeWorkOrderLine',
        summary: 'Remove a line, and re-total the order',
        parameters: [...byOrder, idParameter('lineId')],
        responses: {
          '204': { description: 'Removed' },
          ...errorResponses,
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

const ref = (id: string): { $ref: string } => ({ $ref: `#/components/schemas/${id}` });

/**
 * Every resource's paths, merged. Built into a declared record rather than
 * spread through `Object.assign({}, ...)`, which returns `any` and would need
 * the type assertion the lint rule rightly refuses.
 */
function allPaths(): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const resource of RESOURCES) {
    const own = { ...crudPaths(resource), ...(resource.extraPaths?.() ?? {}) };
    for (const [path, operations] of Object.entries(own)) {
      if (path in paths) throw new Error(`two resources claim the same path: ${path}`);
      paths[path] = operations;
    }
  }
  return paths;
}

function json(id: string): Record<string, unknown> {
  return { 'application/json': { schema: ref(id) } };
}

function idParameter(name: string): Record<string, unknown> {
  return { name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
}

/**
 * The replay cursor header, shared by every streaming endpoint.
 *
 * `minimum: 0`, not 1. Zero is a valid cursor meaning "replay the whole
 * retained stream" — `parseCursor` in both controllers accepts it — and the
 * customers module's hand-written copy of this parameter said `minimum: 1`,
 * which a generated client would have used to reject a legal request. One
 * definition is how that stops being possible to get wrong twice.
 */
const lastEventIdParam = {
  name: 'Last-Event-ID',
  in: 'header',
  required: false,
  description: 'Replay cursor. Sent automatically by `EventSource` on reconnect.',
  schema: { type: 'integer', minimum: 0 },
} as const;

const errorResponses = {
  '400': { description: 'Validation failed', content: json('Problem') },
  '403': { description: 'Role or scope refuses the request', content: json('Problem') },
  '404': { description: 'Not found, or not visible to this scope', content: json('Problem') },
  '409': { description: 'Conflict', content: json('Problem') },
  '422': { description: 'Business rule violated', content: json('Problem') },
};

/**
 * The five operations of the golden module, for one resource.
 *
 * Component ids are derived by convention from `entity` — `Customer`,
 * `CustomerPage`, `CreateCustomer`, `UpdateCustomer`, `CustomerEvent` — which
 * is the same convention `registerResource` writes them under, so the two
 * cannot disagree without failing the document's own `$ref` resolution.
 */
function crudPaths(resource: Resource): Record<string, unknown> {
  const { collection, idParam, entity, listQuery, summaries } = resource;
  const noun = entity.toLowerCase();
  const plural = `${collection.charAt(0).toUpperCase()}${collection.slice(1)}`;
  const byId = [idParameter(idParam)];

  return {
    [`/v1/${collection}`]: {
      get: {
        operationId: `list${plural}`,
        summary: summaries?.list ?? `List ${collection} visible to the principal`,
        parameters: queryParametersFor(listQuery),
        responses: {
          '200': { description: `A page of ${collection}`, content: json(`${entity}Page`) },
          ...errorResponses,
        },
      },
      post: {
        operationId: `create${entity}`,
        summary: summaries?.create ?? `Create a ${noun}`,
        requestBody: { required: true, content: json(`Create${entity}`) },
        responses: {
          '201': { description: `The created ${noun}`, content: json(entity) },
          ...errorResponses,
        },
      },
    },
    [`/v1/${collection}/{${idParam}}`]: {
      get: {
        operationId: `get${entity}`,
        summary: summaries?.get ?? `Fetch one ${noun}`,
        parameters: byId,
        responses: {
          '200': {
            description: `The ${noun}`,
            content: json(resource.getResponseSchema ?? entity),
          },
          ...errorResponses,
        },
      },
      patch: {
        operationId: `update${entity}`,
        summary: summaries?.update ?? `Update a ${noun}`,
        parameters: byId,
        requestBody: { required: true, content: json(`Update${entity}`) },
        responses: {
          '200': { description: `The updated ${noun}`, content: json(entity) },
          ...errorResponses,
        },
      },
    },
    [`/v1/${collection}/{${idParam}}/events`]: {
      get: {
        operationId: `stream${entity}Events`,
        summary: summaries?.stream ?? `Server-Sent Events for one ${noun}`,
        description:
          'Replays outbox events after `Last-Event-ID`, then streams live. The SSE `id` ' +
          'field is the outbox cursor, so a reconnecting client resumes without a gap.',
        parameters: [...byId, lastEventIdParam],
        responses: {
          '200': {
            description: `An event stream of ${entity}Event frames`,
            content: { 'text/event-stream': { schema: ref(`${entity}Event`) } },
          },
          ...errorResponses,
        },
      },
    },
  };
}

export function buildOpenApiDocument(): Record<string, unknown> {
  const { schemas } = z.toJSONSchema(registry, {
    target: 'openapi-3.0',
    io: 'input',
    uri: (id) => `#/components/schemas/${id}`,
  });

  return {
    openapi: '3.0.3',
    info: {
      title: 'Fleetco API',
      version: '1.0.0',
      description:
        'Every path is scoped to the authenticated principal’s tenant, and to a single ' +
        'customer when the principal is a portal user.',
    },
    paths: allPaths(),
    components: {
      schemas: stripIds(schemas),
    },
  };
}

/**
 * Turns a list query schema into OpenAPI `in: query` parameters.
 *
 * Took a schema argument the moment a second module needed it. Before that it
 * closed over `listCustomersQuerySchema` directly, which is the right call for
 * one call site and the wrong one for two.
 */
function queryParametersFor(querySchema: z.ZodType): Record<string, unknown>[] {
  const schema = z.toJSONSchema(querySchema, {
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
 * (`{customerId}`) left in place. The leak suites walk this.
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
