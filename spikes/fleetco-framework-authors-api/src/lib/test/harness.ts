import { sql } from 'drizzle-orm';

import { App } from '../../app/index.js';
import type { Principal } from '../types/principal.js';

/**
 * The integration harness: a real `App`, a real port, a real Postgres.
 *
 * **`startup()` and `shutdown()` stay protected on `Process`, and the harness
 * subclasses to reach them.** Making them public so a test could call them
 * would have widened the production surface for the tests' convenience; a
 * three-line subclass does not. It is the same trick `Process`'s own unit test
 * uses to observe the exit code without killing the runner, and it is a point
 * in the lifecycle-class pattern's favour — there is no test harness to learn,
 * because the thing under test is a class.
 *
 * `app.start()` is deliberately *not* used: it installs signal handlers and
 * ends with `process.exit`, neither of which belongs in a test worker.
 */
class TestApp extends App {
  public async boot(): Promise<void> {
    await this.startup();
  }

  public async halt(): Promise<void> {
    await this.shutdown('SIGTERM', 15);
  }
}

export type Harness = {
  readonly app: TestApp;
  readonly baseUrl: string;
  readonly truncate: () => Promise<void>;
  readonly stop: () => Promise<void>;
};

export async function startHarness(): Promise<Harness> {
  const app = new TestApp();
  await app.boot();

  // PORT is 0 in `.env.integration`, so the kernel picks a free one and
  // parallel workers cannot collide.
  const baseUrl = `http://127.0.0.1:${app.http.port}`;

  return {
    app,
    baseUrl,

    /**
     * Between tests, rather than a transaction that rolls back.
     *
     * [[Testing Strategy]] offers either, and a transaction is the better
     * default — but not here: the dispatcher, the `LISTEN` connection and the
     * SSE pump all use *different* connections, and none of them can see rows
     * another connection has not committed. A transaction-wrapped test of the
     * outbox would pass while testing nothing.
     *
     * `restart identity` resets the outbox sequence, so each test's cursors
     * start at 1 and a failure message reads as `id: 2` rather than `id: 2847`.
     */
    truncate: async () => {
      await app.db.handle.execute(
        sql`truncate table customers.customers, platform.outbox restart identity cascade`,
      );
    },

    stop: async () => {
      await app.halt();
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export type Response = { status: number; body: unknown };

/**
 * Over a real socket rather than through `fastify.inject()`.
 *
 * `inject` is faster and would serve the four CRUD endpoints perfectly, but the
 * SSE endpoint hijacks the raw response and `inject`'s light-my-request
 * response is not a socket. One mechanism for all five keeps the leak suite's
 * "for **every** endpoint" literal, including the stream.
 */
export async function request(
  harness: Harness,
  method: string,
  path: string,
  principal: Principal | null,
  body?: unknown,
): Promise<Response> {
  const response = await fetch(`${harness.baseUrl}${path}`, {
    method,
    headers: headersFor(principal, body !== undefined),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  return {
    status: response.status,
    body: text.length === 0 ? null : JSON.parse(text),
  };
}

function headersFor(principal: Principal | null, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (principal) {
    headers['x-fleetco-principal'] = JSON.stringify(principal);
  }
  if (hasBody) {
    headers['content-type'] = 'application/json';
  }
  return headers;
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------

export type SseFrame = { id: number; event: string; data: Record<string, unknown> };

export type EventStream = {
  readonly status: number;
  /** Resolves when `count` frames have arrived, or rejects on timeout. */
  readonly take: (count: number, timeoutMs?: number) => Promise<SseFrame[]>;
  readonly frames: () => readonly SseFrame[];
  /** Comment frames — the heartbeat, and the shutdown notice. */
  readonly comments: () => readonly string[];
  readonly close: () => void;
};

/**
 * An SSE client, parsed from the raw byte stream.
 *
 * Deliberately not `EventSource`: the browser API cannot set a request header,
 * so it could not carry the authentication stub, and it hides `id:` handling,
 * which is the thing under test.
 */
export async function openEventStream(
  harness: Harness,
  path: string,
  principal: Principal | null,
  lastEventId?: number,
): Promise<EventStream> {
  const controller = new AbortController();
  const headers = headersFor(principal, false);
  headers.accept = 'text/event-stream';
  if (lastEventId !== undefined) {
    headers['last-event-id'] = String(lastEventId);
  }

  const response = await fetch(`${harness.baseUrl}${path}`, {
    headers,
    signal: controller.signal,
  });

  const frames: SseFrame[] = [];
  const comments: string[] = [];
  const waiters: { count: number; resolve: () => void }[] = [];

  const body = response.body;
  if (body) {
    void (async () => {
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for await (const chunk of streamChunks(body)) {
          buffer += decoder.decode(chunk, { stream: true });

          // Frames are separated by a blank line. Comments (heartbeats) parse
          // to nothing and are dropped.
          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            for (const line of block.split('\n')) {
              if (line.startsWith(':')) {
                comments.push(line.slice(1).trim());
              }
            }
            const frame = parseFrame(block);
            buffer = buffer.slice(boundary + 2);
            if (frame) {
              frames.push(frame);
              for (const waiter of [...waiters]) {
                if (frames.length >= waiter.count) {
                  waiters.splice(waiters.indexOf(waiter), 1);
                  waiter.resolve();
                }
              }
            }
            boundary = buffer.indexOf('\n\n');
          }
        }
      } catch {
        // An aborted read is how `close()` works, not an error.
      }
    })();
  }

  return {
    status: response.status,
    frames: () => frames,
    comments: () => comments,
    take: async (count: number, timeoutMs = 5_000): Promise<SseFrame[]> => {
      if (frames.length >= count) {
        return frames.slice(0, count);
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(`Timed out waiting for ${count} SSE frames; saw ${frames.length}`),
          );
        }, timeoutMs);
        waiters.push({
          count,
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
        });
      });
      return frames.slice(0, count);
    },
    close: () => {
      controller.abort();
    },
  };
}

async function* streamChunks(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }
    if (value) {
      yield value;
    }
  }
}

function parseFrame(raw: string): SseFrame | null {
  let id: number | null = null;
  let event = 'message';
  let data = '';

  for (const line of raw.split('\n')) {
    if (line.startsWith(':') || line.length === 0) {
      continue;
    }
    const separator = line.indexOf(':');
    const field = line.slice(0, separator);
    const value = line.slice(separator + 1).trimStart();

    if (field === 'id') {
      id = Number.parseInt(value, 10);
    } else if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      data = value;
    }
  }

  if (id === null || data.length === 0) {
    return null;
  }
  return { id, event, data: JSON.parse(data) };
}

// ---------------------------------------------------------------------------
// Waiting
// ---------------------------------------------------------------------------

/**
 * Polls rather than sleeping. A fixed sleep long enough for a loaded CI box is
 * a slow suite, and one short enough to be quick is a flaky one.
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for condition');
}
