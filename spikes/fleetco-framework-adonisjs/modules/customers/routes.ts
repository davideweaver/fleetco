import { jsonRoute, noBody, noParams, noQuery, sseRoute } from '../../platform/http/route.js';
import type { Route, SseFrameData } from '../../platform/http/route.js';
import {
  createCustomerSchema,
  customerEventSchema,
  customerIdParamSchema,
  customerPageSchema,
  customerSchema,
  listCustomersQuerySchema,
  streamQuerySchema,
  updateCustomerSchema,
} from './contracts.js';
import type { CustomerEvent } from './contracts.js';
import type { CustomerService } from './service.js';

/**
 * The golden module's route table — framework-independent data, exactly as
 * required by [[Code Standards and Guardrails]]'s golden-module layout. This
 * file has no AdonisJS import in it and reads almost identically to the
 * Fastify spike's `routes.ts`: same shape, same four endpoints, same SSE
 * route. The AdonisJS-specific wiring — turning this table into something
 * `start/routes.ts` can register — lives in
 * `app/controllers/customers_controller.ts` and
 * `platform/http/adonis_route.ts`. See NOTES.md §1 for why the split landed
 * here rather than folding Adonis's controller convention into this file.
 *
 * Returned as a named object rather than a bare array: a controller method
 * needs to reach exactly one route (`routes.get`, say) with its specific
 * param/query/body/response types intact, which a `Route[]` erases to the
 * common `{ meta }` shape. `.all` is the array the OpenAPI generator and the
 * leak suite actually want — enumerable, and derived from the same five
 * values rather than hand-kept in sync with them.
 *
 * Every entry below is thin by construction: one expression, one service
 * call. There is nowhere for logic to go.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- `CustomerRoutes` below is `ReturnType<typeof customerRoutes>`; annotating this would be circular, same as `CustomerStore`/`CustomerService` in the sibling files.
export function customerRoutes(service: CustomerService) {
  const list = jsonRoute({
    method: 'GET',
    path: '/v1/customers',
    operationId: 'listCustomers',
    summary: 'List the fleets this principal may see.',
    // A portal principal may call this; `scopeOf` narrows it to its own
    // customer, so the page comes back with exactly one row. That is
    // deliberate — it is the same endpoint, not a parallel portal one.
    planes: ['vendor', 'tenant', 'portal'],
    successStatus: 200,
    params: noParams,
    query: listCustomersQuerySchema,
    body: noBody,
    response: customerPageSchema,
    handle: ({ principal, query }) => service.list(principal, query),
  });

  const get = jsonRoute({
    method: 'GET',
    path: '/v1/customers/:customerId',
    operationId: 'getCustomer',
    summary: 'Fetch one fleet.',
    planes: ['vendor', 'tenant', 'portal'],
    successStatus: 200,
    params: customerIdParamSchema,
    query: noQuery,
    body: noBody,
    response: customerSchema,
    handle: ({ principal, params }) => service.get(principal, params.customerId),
  });

  const create = jsonRoute({
    method: 'POST',
    path: '/v1/customers',
    operationId: 'createCustomer',
    summary: 'Register a new fleet.',
    // Not portal: a fleet does not create itself.
    planes: ['vendor', 'tenant'],
    successStatus: 201,
    params: noParams,
    query: noQuery,
    body: createCustomerSchema,
    response: customerSchema,
    handle: ({ principal, body }) => service.create(principal, body),
  });

  const update = jsonRoute({
    method: 'PATCH',
    path: '/v1/customers/:customerId',
    operationId: 'updateCustomer',
    summary: "Change a fleet's details, credit terms, or status.",
    planes: ['vendor', 'tenant'],
    successStatus: 200,
    params: customerIdParamSchema,
    query: noQuery,
    body: updateCustomerSchema,
    response: customerSchema,
    handle: ({ principal, params, body }) => service.update(principal, params.customerId, body),
  });

  /**
   * The one SSE endpoint, per [[Realtime and Events]]. Customer-scoped:
   * `customer:{tenantId}:{customerId}` is the portal topic from
   * § Authorization, and this is the endpoint a portal user's activity feed
   * subscribes to.
   */
  const events = sseRoute({
    path: '/v1/customers/:customerId/events',
    operationId: 'streamCustomerEvents',
    summary: "Stream this fleet's events, resuming from Last-Event-ID.",
    planes: ['vendor', 'tenant', 'portal'],
    params: customerIdParamSchema,
    query: streamQuerySchema,
    event: customerEventSchema,
    open: async ({ principal, params, query, lastEventId, signal }) => {
      const stream = await service.stream(
        principal,
        params.customerId,
        lastEventId ?? query.lastEventId ?? null,
        signal,
      );
      return toFrames(stream);
    },
  });

  const all: readonly Route[] = [list, get, create, update, events];

  return { list, get, create, update, events, all } as const;
}

export type CustomerRoutes = ReturnType<typeof customerRoutes>;

/** The event contract is the frame's `data`; the outbox cursor is its `id`. */
async function* toFrames(events: AsyncGenerator<CustomerEvent>): AsyncGenerator<SseFrameData> {
  for await (const event of events) {
    yield { id: event.id, name: event.name, data: event };
  }
}
