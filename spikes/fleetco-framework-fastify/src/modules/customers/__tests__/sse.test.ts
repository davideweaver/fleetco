import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { startHarness, stopHarness, asPrincipal } from '../../../platform/test/harness.js';
import {
  makeCreateCustomer,
  makeTenant,
  portalPrincipal,
  staffPrincipal,
} from '../../../platform/test/factories.js';
import type { CustomerId, TenantId } from '../../../platform/types/branded.js';
import type { Customer, CustomerEvent } from '../contracts.js';

/**
 * The SSE surface — the one genuinely non-trivial requirement in
 * [[Framework Evaluation]]'s spike brief, so it gets its own file.
 *
 * Two levels, because they fail differently:
 *
 *   - the service generator, driven directly, which is where replay, the
 *     `LISTEN/NOTIFY` wake-up and the scope re-read live;
 *   - the HTTP endpoint over a real socket, which is where the framing,
 *     `Last-Event-ID`, authorization-before-hijack and the `SIGTERM` drain
 *     live.
 */
let harness: Awaited<ReturnType<typeof startHarness>>;
let baseUrl: string;
let tenantA: TenantId;
let tenantB: TenantId;

beforeAll(async () => {
  harness = await startHarness();
  baseUrl = await harness.app.listen({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  await stopHarness(harness);
});

beforeEach(async () => {
  await harness.reset();
  tenantA = makeTenant().tenantId;
  tenantB = makeTenant().tenantId;
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function createCustomer(tenantId: TenantId, code: string): Promise<Customer> {
  const customer = await harness.wiring.customers.create(
    staffPrincipal(tenantId),
    makeCreateCustomer({ code }),
  );
  await harness.wiring.dispatcher.tick();
  return customer;
}

describe('the service generator', () => {
  it('replays from a cursor of zero, then resumes live on a NOTIFY', async () => {
    const customer = await createCustomer(tenantA, 'ACME');
    const principal = staffPrincipal(tenantA);
    const aborter = new AbortController();

    const stream = await harness.wiring.customers.stream(
      principal,
      customer.id,
      0,
      aborter.signal,
    );
    try {
      const replayed = await stream.next();
      expect(replayed.value?.name).toBe('customer.created');

      // Resume the generator first so it is actually waiting on a wake-up; a
      // notification that arrives while it is suspended at a `yield` is missed,
      // and this test must prove the NOTIFY path rather than the catch-up tick
      // (which the harness sets to five seconds for exactly that reason).
      const pending = stream.next();
      await sleep(50);

      await harness.wiring.customers.update(principal, customer.id, { status: 'active' });
      await harness.wiring.dispatcher.tick();

      const live = await pending;
      expect(live.value?.name).toBe('customer.status_changed');
      expect(live.value?.payload).toMatchObject({ status: 'active' });
      // The cursor advanced, which is what the client echoes back as
      // `Last-Event-ID`.
      expect(live.value?.id).toBeGreaterThan(replayed.value?.id ?? 0);
    } finally {
      aborter.abort();
      await stream.return(undefined);
    }
  });

  it('starts from now when no cursor is supplied, so a new subscriber gets no history', async () => {
    const customer = await createCustomer(tenantA, 'ACME');
    const aborter = new AbortController();
    const stream = await harness.wiring.customers.stream(
      staffPrincipal(tenantA),
      customer.id,
      null,
      aborter.signal,
    );
    try {
      const pending = stream.next();
      await sleep(50);
      await harness.wiring.customers.update(staffPrincipal(tenantA), customer.id, {
        name: 'Acme Fleet',
      });
      await harness.wiring.dispatcher.tick();
      const first = await pending;
      // Not `customer.created`: the subscription began after it.
      expect(first.value?.name).toBe('customer.updated');
    } finally {
      aborter.abort();
      await stream.return(undefined);
    }
  });

  it('refuses before it streams — authorization is the same code path as GET', async () => {
    const theirs = await createCustomer(tenantB, 'THEIRS');
    const aborter = new AbortController();
    await expect(
      harness.wiring.customers.stream(staffPrincipal(tenantA), theirs.id, 0, aborter.signal),
    ).rejects.toThrow(/not found/);
  });

  it('ends the stream if the customer becomes unreadable mid-session', async () => {
    const customer = await createCustomer(tenantA, 'ACME');
    const aborter = new AbortController();
    const stream = await harness.wiring.customers.stream(
      staffPrincipal(tenantA),
      customer.id,
      0,
      aborter.signal,
    );
    try {
      await stream.next();

      const pending = stream.next();
      await sleep(50);
      // Revocation, simulated at the only level that matters to the stream:
      // the row the scope would have matched is gone.
      await harness.wiring.database.pool.query('delete from customers.customers where id = $1', [
        customer.id,
      ]);
      await harness.wiring.database.pool.query(
        `select pg_notify('outbox_events', $1)`,
        [JSON.stringify({ id: 999_999, tenantId: tenantA, topic: `customer:${tenantA}:${customer.id}` })],
      );

      const ended = await pending;
      expect(ended.done).toBe(true);
    } finally {
      aborter.abort();
      await stream.return(undefined);
    }
  });
});

describe('the HTTP endpoint', () => {
  it('answers an unauthorized subscription with a JSON 403, not a stream', async () => {
    const customer = await createCustomer(tenantA, 'ACME');
    const response = await fetch(`${baseUrl}/v1/customers/${customer.id}/events`);
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/json');
    await response.text();
  });

  it('answers another tenant’s customer with a JSON 404, not a stream', async () => {
    const theirs = await createCustomer(tenantB, 'THEIRS');
    const response = await fetch(`${baseUrl}/v1/customers/${theirs.id}/events`, {
      headers: asPrincipal(staffPrincipal(tenantA)),
    });
    expect(response.status).toBe(404);
    await response.text();
  });

  it('streams text/event-stream frames a browser EventSource can read', async () => {
    const customer = await createCustomer(tenantA, 'ACME');
    const aborter = new AbortController();
    const response = await fetch(`${baseUrl}/v1/customers/${customer.id}/events?lastEventId=0`, {
      headers: asPrincipal(portalPrincipal(tenantA, customer.id)),
      signal: aborter.signal,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform');

    const frames = await readFrames(response, 1, aborter);
    expect(frames[0]?.event).toBe('customer.created');
    expect(frames[0]?.id).toBeGreaterThan(0);
    const data: CustomerEvent = JSON.parse(frames[0]?.data ?? '{}');
    expect(data.customerId).toBe(customer.id);
  });

  it('resumes after Last-Event-ID without repeating what the client already has', async () => {
    const customer = await createCustomer(tenantA, 'ACME');
    await harness.wiring.customers.update(staffPrincipal(tenantA), customer.id, {
      status: 'active',
    });
    await harness.wiring.dispatcher.tick();

    // First connection: read both events and remember the last id.
    const firstAborter = new AbortController();
    const first = await fetch(`${baseUrl}/v1/customers/${customer.id}/events?lastEventId=0`, {
      headers: asPrincipal(staffPrincipal(tenantA)),
      signal: firstAborter.signal,
    });
    const initial = await readFrames(first, 2, firstAborter);
    expect(initial.map((frame) => frame.event)).toEqual([
      'customer.created',
      'customer.status_changed',
    ]);
    const resumeFrom = initial[1]?.id ?? 0;

    // Something happens while the client is away.
    await harness.wiring.customers.update(staffPrincipal(tenantA), customer.id, {
      name: 'Acme Fleet Services',
    });
    await harness.wiring.dispatcher.tick();

    // Reconnect the way a browser does.
    const secondAborter = new AbortController();
    const second = await fetch(`${baseUrl}/v1/customers/${customer.id}/events`, {
      headers: { ...asPrincipal(staffPrincipal(tenantA)), 'last-event-id': String(resumeFrom) },
      signal: secondAborter.signal,
    });
    const resumed = await readFrames(second, 1, secondAborter);
    // Exactly the one it missed — no gap, and no replay of the first two.
    expect(resumed[0]?.event).toBe('customer.updated');
    expect(resumed[0]?.id).toBeGreaterThan(resumeFrom);
  });

  it('drains open streams on shutdown instead of dropping them mid-session', async () => {
    // ADR-022 rule 7. Uses its own server so the shared harness survives.
    const own = await startHarness();
    const url = await own.app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const tenant = makeTenant().tenantId;
      const customer = await own.wiring.customers.create(
        staffPrincipal(tenant),
        makeCreateCustomer(),
      );
      await own.wiring.dispatcher.tick();

      const aborter = new AbortController();
      const response = await fetch(`${url}/v1/customers/${customer.id}/events?lastEventId=0`, {
        headers: asPrincipal(staffPrincipal(tenant)),
        signal: aborter.signal,
      });
      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      await reader?.read();
      expect(own.wiring.sse.open).toBe(1);

      own.wiring.sse.closeAll();
      expect(own.wiring.sse.open).toBe(0);

      // The socket ends cleanly rather than erroring, which is what lets the
      // browser reconnect with its cursor instead of surfacing a failure.
      for (let read = await reader?.read(); read?.done === false; read = await reader?.read()) {
        // drain whatever was buffered
      }
      aborter.abort();
    } finally {
      await stopHarness(own);
    }
  });
});

type Frame = { readonly id: number; readonly event: string; readonly data: string };

/**
 * Reads `count` SSE frames off a live response. Deliberately a hand-rolled
 * parser rather than a client library: the point of the test is that the bytes
 * on the wire are what the specification says, and a library that normalises
 * them would hide a malformed frame.
 */
async function readFrames(
  response: Response,
  count: number,
  aborter: AbortController,
): Promise<Frame[]> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('response had no body');
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let buffer = '';

  try {
    while (frames.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let split = buffer.indexOf('\n\n');
      while (split !== -1) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const frame = parseFrame(block);
        if (frame !== null) frames.push(frame);
        split = buffer.indexOf('\n\n');
      }
    }
  } finally {
    aborter.abort();
  }
  return frames;
}

function parseFrame(block: string): Frame | null {
  // Comment-only blocks are the `retry:` preamble and the heartbeats.
  const lines = block.split('\n');
  const field = (name: string): string | undefined =>
    lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2);
  const id = field('id');
  const event = field('event');
  const data = field('data');
  if (id === undefined || event === undefined || data === undefined) return null;
  return { id: Number.parseInt(id, 10), event, data };
}

/** Narrows the stream's element type for the assertions above. */
export type _StreamedEvent = { readonly id: CustomerId };
