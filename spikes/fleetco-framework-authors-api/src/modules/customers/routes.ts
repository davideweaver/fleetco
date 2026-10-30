import type { FastifyInstance } from 'fastify';

import { NOTHING, register, type OperationDoc } from '../../lib/http/route.js';
import { lastEventIdFrom, openStream, type SseStream } from '../../lib/http/sse.js';
import logging from '../../lib/logging/index.js';
import type { OutboxNotifier } from '../../lib/outbox/notifier.js';
import { scopeFor } from '../../lib/types/scope.js';
import {
  createCustomerSchema,
  customerIdParamSchema,
  customerPageSchema,
  customerSchema,
  listCustomersQuerySchema,
  streamQuerySchema,
  updateCustomerSchema,
} from './contracts.js';
import type { CustomersService } from './service.js';

/**
 * The module's HTTP surface. Five operations, declared as data, bound to
 * handlers below.
 *
 * [[Code Standards and Guardrails]] § Layering: "routes parse, authorize, call
 * one service method, serialize. No logic, no queries." Parsing and
 * authentication happen in `lib/http/route.ts`, once, for all five — so each
 * handler here is the "call one service method" step and nothing else. The
 * four CRUD handlers are one line each, and that is the whole point of the
 * layer: there is no room in them for a rule to hide.
 *
 * The SSE handler is the exception, and deliberately so. Its twenty lines are
 * all plumbing — subscribe, replay, pump, unsubscribe — with the two decisions
 * that matter (may this principal see this fleet, and which events) both made
 * inside `service.readEvents`.
 */

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

const listCustomers = {
  method: 'GET',
  path: '/v1/customers',
  operationId: 'listCustomers',
  summary: 'List the fleets this principal may see, a keyset page at a time, ordered by name.',
  params: NOTHING,
  query: listCustomersQuerySchema,
  body: NOTHING,
  status: 200,
  response: customerPageSchema,
} satisfies OperationDoc;

const getCustomer = {
  method: 'GET',
  path: '/v1/customers/:customerId',
  operationId: 'getCustomer',
  summary: 'Fetch one fleet.',
  params: customerIdParamSchema,
  query: NOTHING,
  body: NOTHING,
  status: 200,
  response: customerSchema,
} satisfies OperationDoc;

const createCustomer = {
  method: 'POST',
  path: '/v1/customers',
  operationId: 'createCustomer',
  summary: 'Register a new fleet. It starts as a prospect and not on credit hold.',
  params: NOTHING,
  query: NOTHING,
  body: createCustomerSchema,
  status: 201,
  response: customerSchema,
} satisfies OperationDoc;

const updateCustomer = {
  method: 'PATCH',
  path: '/v1/customers/:customerId',
  operationId: 'updateCustomer',
  summary: 'Change one or more fields of a fleet.',
  params: customerIdParamSchema,
  query: NOTHING,
  body: updateCustomerSchema,
  status: 200,
  response: customerSchema,
} satisfies OperationDoc;

const streamCustomerEvents = {
  method: 'GET',
  path: '/v1/customers/:customerId/events',
  operationId: 'streamCustomerEvents',
  summary:
    'Server-Sent Events for one fleet: replay from Last-Event-ID, then live. Authorized by the same code as GET /v1/customers/{customerId}.',
  params: customerIdParamSchema,
  query: streamQuerySchema,
  body: NOTHING,
  status: 200,
  response: null,
} satisfies OperationDoc;

/**
 * Every operation this module exposes, in one array.
 *
 * `lib/openapi/document.ts` builds the specification from this, and
 * `leak.test.ts` enumerates it to assert that no endpoint is missing
 * cross-tenant coverage. A new route that is not added here is a route the
 * document does not describe and the leak gate does not check, so the array,
 * not the registration below, is the module's real HTTP contract.
 *
 * `satisfies OperationDoc` rather than an annotation: the literal keeps its
 * precise schema types for `register` to infer handler arguments from, and
 * still fails to compile if a field is missing or misspelled. Tier 1 of the
 * enforcement hierarchy names `satisfies` for exactly this.
 */
export const customerOperations: readonly OperationDoc[] = [
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  streamCustomerEvents,
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export type CustomersRoutesDeps = {
  readonly service: CustomersService;
  readonly notifier: OutboxNotifier;
  /**
   * Every open stream, owned by `HttpModule` so `SIGTERM` can close them
   * (ADR-022 rule 7). A plain `Set` rather than a registry type: it is added to
   * in one place and iterated in one place, and a class around it would be an
   * abstraction with one call site each way.
   */
  readonly streams: Set<SseStream>;
};

export function registerCustomerRoutes(fastify: FastifyInstance, deps: CustomersRoutesDeps): void {
  const { service, notifier, streams } = deps;

  register(fastify, listCustomers, async ({ principal, query }) =>
    service.list(scopeFor(principal), query),
  );

  register(fastify, getCustomer, async ({ principal, params }) =>
    service.get(scopeFor(principal), params.customerId),
  );

  register(fastify, createCustomer, async ({ principal, body }) =>
    service.create(scopeFor(principal), body),
  );

  register(fastify, updateCustomer, async ({ principal, params, body }) =>
    service.update(scopeFor(principal), params.customerId, body),
  );

  /**
   * **The SSE endpoint.** [[Realtime and Events]] § Replay on Reconnect: "a
   * client reconnects with `Last-Event-ID: 48213`. The server authorizes the
   * subscription, then replays outbox rows after that id that the principal is
   * permitted to see, then resumes live push. No gap, no silent loss, no full
   * refetch."
   *
   * In that order, and the order is the design:
   *
   *  1. **Authorize before hijacking the socket.** The first `readEvents` call
   *     runs while the reply is still a normal HTTP reply, so an unauthorized
   *     subscription gets a JSON 404 rather than a 200 event stream that
   *     immediately closes. Getting this backwards is the classic SSE
   *     authorization bug.
   *  2. **Replay, then subscribe.** Subscribing first would deliver an event
   *     mid-replay and emit it twice; replaying first and subscribing after
   *     would miss one that landed in between. Subscribing *before* the first
   *     read and letting the pump be idempotent on the cursor is what closes
   *     both windows — a wake-up that arrives during replay just finds nothing
   *     new to send.
   *  3. **The pump re-reads through the scoped repository on every wake-up**,
   *     rather than pushing the notification's contents. That is per-event
   *     re-authorization: a permission revoked mid-session takes effect on the
   *     next event, not at the next reconnect.
   */
  register(fastify, streamCustomerEvents, async ({ principal, params, query, request, reply }) => {
    const scope = scopeFor(principal);
    const customerId = params.customerId;

    // The header is a browser's own reconnect cursor and wins; the query
    // parameter is for the first connection after a page load, which cannot
    // set a header.
    let cursor = lastEventIdFrom(request) ?? query.lastEventId ?? 0;

    let wakeRequested = false;
    let pumping = false;
    // Null until the socket is live, so a notification that arrives during the
    // authorizing read is remembered rather than written to a stream that does
    // not exist yet. Afterwards the stream's own `isOpen()` is the single
    // source of truth about whether sending is still possible.
    let stream: SseStream | null = null;

    async function pump(): Promise<void> {
      const live = stream;
      if (pumping || live === null || !live.isOpen()) {
        wakeRequested = true;
        return;
      }
      pumping = true;
      try {
        let more = true;
        while (more && live.isOpen()) {
          wakeRequested = false;
          const events = await service.readEvents(scope, customerId, cursor);
          for (const event of events) {
            live.send(event.id, event.name, event);
            cursor = event.id;
          }
          // Keep going while a page came back full, or while a notification
          // arrived during the read we just did.
          more = events.length > 0 || wakeRequested;
        }
      } catch (err) {
        // A stream that cannot read is finished. Closing it makes the browser
        // reconnect with its cursor intact, which is the right recovery.
        logging.exception('SSE pump failed', err, ['sse'], { customerId });
        live.close();
      } finally {
        pumping = false;
      }
    }

    // Subscribed before the first read — see point 2 above.
    const unsubscribe = notifier.subscribe(scope.tenantId, () => {
      void pump();
    });

    let opened: SseStream;
    try {
      // Authorizes, and is also the replay query. One call, one code path.
      const replay = await service.readEvents(scope, customerId, cursor);

      opened = openStream(request, reply);
      stream = opened;
      streams.add(opened);

      for (const event of replay) {
        opened.send(event.id, event.name, event);
        cursor = event.id;
      }
    } catch (err) {
      unsubscribe();
      throw err;
    }

    // A notification may have arrived between subscribing and finishing the
    // replay. One speculative pump covers that; it finds nothing if it was not
    // needed.
    void pump();

    // Holding the handler open for the life of the connection is what gives
    // this cleanup somewhere to live.
    await opened.finished;
    unsubscribe();
    streams.delete(opened);
  });
}
