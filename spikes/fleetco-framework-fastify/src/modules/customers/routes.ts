import {
  jsonRoute,
  noBody,
  noParams,
  noQuery,
  sseRoute,
} from '../../platform/http/route.js';
import type { Route } from '../../platform/http/route.js';
import type { SseFrame, SseRegistry } from '../../platform/http/sse.js';
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
 * Thin by construction. Every handler below is one expression: call one
 * service method with values the route table has already parsed.
 *
 * There is nowhere for logic to go. `platform/http/route.ts` owns parsing,
 * the plane check, serialization and the error mapping, so a handler that
 * wanted to branch would have to be rewritten into a shape that no other route
 * has — which is exactly the review signal the layering rule wants.
 */
export function customerRoutes(
  service: CustomerService,
  sse: { readonly registry: SseRegistry; readonly heartbeatMs: number },
): Route[] {
  return [
    jsonRoute({
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
    }),

    jsonRoute({
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
    }),

    jsonRoute({
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
    }),

    jsonRoute({
      method: 'PATCH',
      path: '/v1/customers/:customerId',
      operationId: 'updateCustomer',
      summary: 'Change a fleet’s details, credit terms, or status.',
      planes: ['vendor', 'tenant'],
      successStatus: 200,
      params: customerIdParamSchema,
      query: noQuery,
      body: updateCustomerSchema,
      response: customerSchema,
      handle: ({ principal, params, body }) =>
        service.update(principal, params.customerId, body),
    }),

    /**
     * The one SSE endpoint, per [[Realtime and Events]]. Customer-scoped:
     * `customer:{tenantId}:{customerId}` is the portal topic from
     * § Authorization, and this is the endpoint a portal user's activity feed
     * subscribes to.
     */
    sseRoute({
      path: '/v1/customers/:customerId/events',
      operationId: 'streamCustomerEvents',
      summary: 'Stream this fleet’s events, resuming from Last-Event-ID.',
      planes: ['vendor', 'tenant', 'portal'],
      params: customerIdParamSchema,
      query: streamQuerySchema,
      event: customerEventSchema,
      registry: sse.registry,
      heartbeatMs: sse.heartbeatMs,
      open: async ({ principal, params, query, lastEventId, signal }) => {
        const events = await service.stream(
          principal,
          params.customerId,
          lastEventId ?? query.lastEventId ?? null,
          signal,
        );
        return toFrames(events);
      },
    }),
  ];
}

/** The event contract is the frame's `data`; the outbox cursor is its `id`. */
async function* toFrames(events: AsyncGenerator<CustomerEvent>): AsyncGenerator<SseFrame> {
  for await (const event of events) {
    yield { id: event.id, name: event.name, data: event };
  }
}
