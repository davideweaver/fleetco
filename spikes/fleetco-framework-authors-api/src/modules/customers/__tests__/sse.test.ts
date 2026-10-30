import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  makeCreateCustomer,
  makeCustomerId,
  makePortalPrincipal,
  makeScope,
  makeStaffPrincipal,
  makeTenantId,
} from '../../../lib/test/factories.js';
import {
  openEventStream,
  request,
  startHarness,
  waitFor,
  type EventStream,
  type Harness,
} from '../../../lib/test/harness.js';
import type { Customer } from '../contracts.js';

/**
 * The SSE endpoint, over a real socket, with a real `LISTEN/NOTIFY` round trip.
 *
 * This is the only genuinely non-trivial requirement in the spike
 * ([[Framework Evaluation]]), so it gets the most careful tests. Each one maps
 * to a sentence in [[Realtime and Events]]:
 *
 *  - replay: "the server authorizes the subscription, then replays outbox rows
 *    after that id that the principal is permitted to see, then resumes live
 *    push. No gap, no silent loss, no full refetch."
 *  - authorization: "subscription authorization and request authorization call
 *    the same code" and "per-event filtering re-checks the principal before
 *    each push."
 *  - fanout: "the worker issues NOTIFY after dispatching an outbox row."
 *  - draining: ADR-022 rule 7, "graceful shutdown on SIGTERM that drains SSE
 *    connections."
 *
 * The background dispatcher poll is disabled in `.env.integration`, so every
 * test below dispatches explicitly. That is the difference between asserting
 * what the design does and asserting what a timer happened to do.
 */

const TENANT_A = makeTenantId(1);
const TENANT_B = makeTenantId(2);

let harness: Harness;
const opened: EventStream[] = [];

beforeAll(async () => {
  harness = await startHarness();
}, 180_000);

afterAll(async () => {
  await harness.stop();
});

beforeEach(async () => {
  await harness.truncate();
});

afterEach(() => {
  for (const stream of opened) {
    stream.close();
  }
  opened.length = 0;
});

function service() {
  return harness.app.customers.service;
}

async function open(
  customerId: string,
  principal: Parameters<typeof openEventStream>[2],
  lastEventId?: number,
): Promise<EventStream> {
  const stream = await openEventStream(
    harness,
    `/v1/customers/${customerId}/events`,
    principal,
    lastEventId,
  );
  opened.push(stream);
  return stream;
}

async function seedCustomer(code = 'ACME'): Promise<Customer> {
  return service().create(makeScope(TENANT_A), makeCreateCustomer({ code }));
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

describe('replay', () => {
  it('delivers the history a new subscriber has not seen', async () => {
    const customer = await seedCustomer();
    await service().update(makeScope(TENANT_A), customer.id, { status: 'active' });
    await harness.app.outbox.dispatchOnce();

    const stream = await open(customer.id, makeStaffPrincipal(TENANT_A));
    const frames = await stream.take(2);

    expect(frames.map((frame) => frame.event)).toEqual([
      'customer.created',
      'customer.status_changed',
    ]);
    // The SSE `id:` field is the outbox cursor, which is what comes back as
    // `Last-Event-ID`.
    expect(frames.map((frame) => frame.id)).toEqual([1, 2]);
  });

  it('resumes after Last-Event-ID without repeating or skipping', async () => {
    const customer = await seedCustomer();
    await service().update(makeScope(TENANT_A), customer.id, { status: 'active' });
    await service().update(makeScope(TENANT_A), customer.id, { isOnCreditHold: true });
    await harness.app.outbox.dispatchOnce();

    const stream = await open(customer.id, makeStaffPrincipal(TENANT_A), 2);
    const frames = await stream.take(1);

    expect(frames).toHaveLength(1);
    expect(frames[0]?.id).toBe(3);
    expect(frames[0]?.event).toBe('customer.credit_hold_placed');
  });

  it('accepts the cursor as a query parameter, for a client that cannot set a header', async () => {
    const customer = await seedCustomer();
    await service().update(makeScope(TENANT_A), customer.id, { status: 'active' });
    await harness.app.outbox.dispatchOnce();

    const stream = await openEventStream(
      harness,
      `/v1/customers/${customer.id}/events?lastEventId=1`,
      makeStaffPrincipal(TENANT_A),
    );
    opened.push(stream);

    const frames = await stream.take(1);
    expect(frames[0]?.id).toBe(2);
  });

  it('replays nothing for an event the dispatcher has not committed', async () => {
    const customer = await seedCustomer();
    // Not dispatched: the row is below the visibility horizon, so a client
    // cannot advance its cursor past a row still being worked on.
    const stream = await open(customer.id, makeStaffPrincipal(TENANT_A));

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(stream.frames()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Live push
// ---------------------------------------------------------------------------

describe('live push', () => {
  it('pushes an event produced after the subscription opened', async () => {
    const customer = await seedCustomer();
    await harness.app.outbox.dispatchOnce();

    const stream = await open(customer.id, makeStaffPrincipal(TENANT_A));
    await stream.take(1);

    // The full round trip: write in a transaction, dispatch, NOTIFY, the
    // dedicated LISTEN connection wakes, the pump re-reads by cursor.
    await service().update(makeScope(TENANT_A), customer.id, { status: 'active' });
    await harness.app.outbox.dispatchOnce();

    const frames = await stream.take(2);
    expect(frames[1]?.event).toBe('customer.status_changed');
    expect(frames[1]?.id).toBe(2);
  });

  it('pushes a burst without losing or reordering anything', async () => {
    const customer = await seedCustomer();
    await harness.app.outbox.dispatchOnce();

    const stream = await open(customer.id, makeStaffPrincipal(TENANT_A));
    await stream.take(1);

    await service().update(makeScope(TENANT_A), customer.id, { status: 'active' });
    await service().update(makeScope(TENANT_A), customer.id, { isOnCreditHold: true });
    await service().update(makeScope(TENANT_A), customer.id, { name: 'Acme Trucking LLC' });
    await harness.app.outbox.dispatchOnce();

    const frames = await stream.take(4);
    expect(frames.map((frame) => frame.id)).toEqual([1, 2, 3, 4]);
    expect(frames.map((frame) => frame.event)).toEqual([
      'customer.created',
      'customer.status_changed',
      'customer.credit_hold_placed',
      'customer.updated',
    ]);
  });

  it('does not push another fleet’s event to this stream', async () => {
    const mine = await seedCustomer('MINE');
    const theirs = await seedCustomer('THEIRS');
    await harness.app.outbox.dispatchOnce();

    const stream = await open(mine.id, makeStaffPrincipal(TENANT_A));
    await stream.take(1);

    await service().update(makeScope(TENANT_A), theirs.id, { status: 'active' });
    await harness.app.outbox.dispatchOnce();

    // The notification wakes every stream in the tenant; the scoped re-read is
    // what stops this one from sending.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(stream.frames()).toHaveLength(1);
  });

  it('does not push another tenant’s event to this stream', async () => {
    const mine = await seedCustomer('MINE');
    const theirs = await service().create(
      makeScope(TENANT_B),
      makeCreateCustomer({ code: 'OTHER' }),
    );
    await harness.app.outbox.dispatchOnce();

    const stream = await open(mine.id, makeStaffPrincipal(TENANT_A));
    await stream.take(1);

    await service().update(makeScope(TENANT_B), theirs.id, { status: 'active' });
    await harness.app.outbox.dispatchOnce();

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(stream.frames()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe('authorization', () => {
  it('refuses an unauthenticated subscription with a JSON 403, not a stream', async () => {
    const customer = await seedCustomer();

    const response = await request(
      harness,
      'GET',
      `/v1/customers/${customer.id}/events`,
      null,
    );

    expect(response.status).toBe(403);
  });

  it('refuses a subscription to another tenant’s fleet with a JSON 404', async () => {
    const customer = await seedCustomer();

    // 404 and not an empty stream: the authorizing read runs *before*
    // `reply.hijack()`, so the error handler can still serialise a body. A 200
    // event stream that silently delivers nothing is the classic version of
    // this bug.
    const response = await request(
      harness,
      'GET',
      `/v1/customers/${customer.id}/events`,
      makeStaffPrincipal(TENANT_B),
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ kind: 'NotFound' });
  });

  it('refuses a portal principal subscribing to a different fleet in its own tenant', async () => {
    const mine = await seedCustomer('MINE');
    const theirs = await seedCustomer('THEIRS');

    const response = await request(
      harness,
      'GET',
      `/v1/customers/${theirs.id}/events`,
      makePortalPrincipal(TENANT_A, mine.id),
    );

    expect(response.status).toBe(404);
  });

  it('serves a portal principal its own fleet’s stream', async () => {
    const mine = await seedCustomer('MINE');
    await harness.app.outbox.dispatchOnce();

    const stream = await open(mine.id, makePortalPrincipal(TENANT_A, mine.id));
    const frames = await stream.take(1);

    expect(frames[0]?.event).toBe('customer.created');
  });

  it('refuses a stream for a customer that does not exist', async () => {
    const response = await request(
      harness,
      'GET',
      `/v1/customers/${makeCustomerId(404)}/events`,
      makeStaffPrincipal(TENANT_A),
    );

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

describe('connection lifecycle', () => {
  it('sends a heartbeat so an idle proxy does not close the connection', async () => {
    const customer = await seedCustomer();
    const stream = await open(customer.id, makeStaffPrincipal(TENANT_A));

    // SSE_HEARTBEAT_MS is 150 in the integration environment; 15s in production.
    await waitFor(() => stream.comments().includes('heartbeat'), 3_000);
  });

  it('unsubscribes when the client disconnects, rather than leaking a listener', async () => {
    const customer = await seedCustomer();
    const stream = await open(customer.id, makeStaffPrincipal(TENANT_A));

    await waitFor(() => harness.app.outbox.notifier.subscriberCount === 1);

    stream.close();

    // A stream that unsubscribed only on process exit would accumulate one
    // listener per reconnect, and shop-floor Wi-Fi reconnects constantly.
    await waitFor(() => harness.app.outbox.notifier.subscriberCount === 0);
  });

  it('registers the stream so shutdown can drain it', async () => {
    const customer = await seedCustomer();
    await open(customer.id, makeStaffPrincipal(TENANT_A));

    await waitFor(() => harness.app.http.streams.size === 1);
  });
});
