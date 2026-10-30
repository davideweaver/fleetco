import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * SSE plumbing. This is the hand-built piece [[Framework Evaluation]] predicted
 * under "roughly ten things get hand-built and then maintained" — NestJS has
 * `@Sse()`, Fastify has nothing, so here it is: about ninety lines, all of it
 * ordinary HTTP.
 *
 * Transport choice is ADR-015: SSE, not WebSocket. Plain HTTP that traverses a
 * hospital's network, automatic reconnection, and `Last-Event-ID` *is* the
 * replay cursor.
 */
export type SseFrame = {
  /** The outbox cursor. Written as the `id:` field, so it returns as `Last-Event-ID`. */
  readonly id: number;
  readonly name: string;
  readonly data: unknown;
};

export type SseStream = {
  readonly send: (frame: SseFrame) => void;
  readonly comment: (text: string) => void;
  /** Aborted when the client disconnects or the process is draining. */
  readonly signal: AbortSignal;
  readonly close: () => void;
};

/**
 * Tracks every open stream so `SIGTERM` can drain them.
 *
 * ADR-022 rule 7 is explicit that this is not optional: "SSE holds long-lived
 * connections, so without draining every deploy drops every connected user
 * mid-session." `authors-api` solved the same problem with `http-terminator`;
 * a `Set` of abort controllers is the same idea with nothing to install.
 */
export type SseRegistry = {
  readonly open: number;
  readonly closeAll: () => void;
  readonly track: (close: () => void) => () => void;
};

export function createSseRegistry(): SseRegistry {
  const closers = new Set<() => void>();
  return {
    get open(): number {
      return closers.size;
    },
    closeAll: (): void => {
      for (const close of [...closers]) close();
    },
    track: (close: () => void): (() => void) => {
      closers.add(close);
      return () => closers.delete(close);
    },
  };
}

/**
 * Takes the socket over from Fastify and writes the SSE preamble.
 *
 * `reply.hijack()` is the Fastify-specific part: it tells the framework to stop
 * managing the response so the handler can hold the socket open for hours.
 * Everything after that line is plain `node:http`.
 */
export function openSse(
  request: FastifyRequest,
  reply: FastifyReply,
  registry: SseRegistry,
  heartbeatMs: number,
): SseStream {
  const controller = new AbortController();

  reply.hijack();
  const response = reply.raw;
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    // `no-transform` matters as much as `no-cache`: a proxy that gzips the
    // stream will buffer it, and a buffered SSE stream is a broken one.
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Nginx and ALB-fronted deployments buffer by default.
    'x-accel-buffering': 'no',
  });

  // The browser's own reconnect delay. Shorter than the default so a tablet
  // coming back onto the bay Wi-Fi resumes quickly.
  response.write('retry: 3000\n\n');

  const heartbeat = setInterval(() => {
    if (!response.writableEnded) response.write(': ping\n\n');
  }, heartbeatMs);
  heartbeat.unref();

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    untrack();
    controller.abort();
    if (!response.writableEnded) response.end();
  };

  const untrack = registry.track(close);
  request.raw.on('close', close);

  return {
    send: (frame: SseFrame): void => {
      if (response.writableEnded) return;
      response.write(
        `id: ${frame.id}\nevent: ${frame.name}\ndata: ${JSON.stringify(frame.data)}\n\n`,
      );
    },
    comment: (text: string): void => {
      if (!response.writableEnded) response.write(`: ${text}\n\n`);
    },
    signal: controller.signal,
    close,
  };
}

/**
 * `Last-Event-ID` per the SSE specification, which is what the browser sends on
 * its own reconnect. The `lastEventId` query parameter is the fallback for the
 * first connection after a page load, where a client cannot set a header.
 * The header wins when both are present, because the browser's value is the
 * more recent of the two.
 */
export function lastEventIdOf(request: FastifyRequest, fallback: number | undefined): number | null {
  const header = request.headers['last-event-id'];
  if (typeof header === 'string') {
    const parsed = Number.parseInt(header, 10);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return fallback ?? null;
}
