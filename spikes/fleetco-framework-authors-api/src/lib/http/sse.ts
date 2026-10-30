import type { FastifyReply, FastifyRequest } from 'fastify';

import { environment } from '../environment.js';

/**
 * Server-Sent Events, by hand. ADR-015 and [[Realtime and Events]] § Transport:
 * SSE for v1, because the traffic is overwhelmingly server to client, it is
 * plain HTTP that a hospital's proxy will pass, it reconnects on its own, and
 * `Last-Event-ID` *is* our replay cursor.
 *
 * This is the piece [[Framework Evaluation]] calls "our only genuinely
 * non-trivial requirement", and the piece NestJS has in the box as `@Sse()`.
 * What that decorator would save is the forty lines below. What it would cost
 * is control over three things this file gets right and a generic wrapper
 * typically does not:
 *
 *  1. **`reply.hijack()`.** Fastify must be told it no longer owns this socket,
 *     or it will try to serialise a reply onto a response that is already
 *     streaming.
 *  2. **The heartbeat.** A comment frame every 15s, because an idle proxy will
 *     close a silent connection and shop-floor Wi-Fi is full of idle proxies.
 *  3. **Draining.** Every open stream is registered with the caller, so
 *     ADR-022 rule 7 can close them on `SIGTERM`. Without this, every deploy
 *     drops every connected user mid-session — the document calls rule 7 "not
 *     optional" for exactly this reason.
 *
 * Framing is the whole of the SSE specification that we use: `id:`, `event:`,
 * `data:`, blank line. There is no library here because there is no problem
 * here.
 */

export type SseStream = {
  /** One event frame. `id` is echoed back by the browser as `Last-Event-ID`. */
  readonly send: (id: number, event: string, data: unknown) => void;
  /** A comment frame. Keeps proxies from closing an idle connection. */
  readonly comment: (text: string) => void;
  readonly close: () => void;
  /** False once the client has gone or `close()` has run. */
  readonly isOpen: () => boolean;
  /** Resolves when the client disconnects or `close()` is called. */
  readonly finished: Promise<void>;
};

export function openStream(request: FastifyRequest, reply: FastifyReply): SseStream {
  // Fastify must stop managing this response before anything is written to the
  // raw socket.
  reply.hijack();

  const raw = reply.raw;
  raw.writeHead(200, {
    'content-type': 'text/event-stream',
    // `no-transform` as well as `no-cache`: a proxy that gzips the stream will
    // buffer it, and a buffered event stream is not an event stream.
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // nginx-specific, and harmless elsewhere. Without it nginx buffers.
    'x-accel-buffering': 'no',
  });

  // Tells the browser how long to wait before reconnecting. Sent once, up
  // front, so it applies to the disconnect we have not had yet.
  raw.write(`retry: ${environment.SSE_RETRY_MS}\n\n`);

  let settled = false;
  let resolveFinished: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const heartbeat = setInterval(() => {
    write(': heartbeat\n\n');
  }, environment.SSE_HEARTBEAT_MS);

  function write(frame: string): void {
    if (settled || raw.writableEnded) {
      return;
    }
    raw.write(frame);
  }

  function settle(): void {
    if (settled) {
      return;
    }
    settled = true;
    clearInterval(heartbeat);
    if (!raw.writableEnded) {
      raw.end();
    }
    resolveFinished();
  }

  // Both events matter: `close` on the request fires when the client goes away,
  // `close` on the response when we end it ourselves or the socket errors.
  request.raw.on('close', settle);
  raw.on('close', settle);
  raw.on('error', settle);

  return {
    send: (id: number, event: string, data: unknown): void => {
      write(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    comment: (text: string): void => {
      write(`: ${text}\n\n`);
    },
    close: settle,
    // The stream's own state, rather than a parallel boolean in the caller.
    // The SSE handler's pump loop reads this between awaits, so one source of
    // truth matters: a flag the handler maintained alongside this one was the
    // first version, and TypeScript's control-flow analysis could not see that
    // an await might change it.
    isOpen: (): boolean => !settled && !raw.writableEnded,
    finished,
  };
}

/**
 * The `Last-Event-ID` header, which a browser's `EventSource` sends on its own
 * reconnect. Anything unparseable is treated as "from the beginning" rather
 * than as an error: a client with a corrupt cursor should re-read history, not
 * be refused.
 */
export function lastEventIdFrom(request: FastifyRequest): number | null {
  const header = request.headers['last-event-id'];
  if (typeof header !== 'string') {
    return null;
  }
  const parsed = Number.parseInt(header, 10);
  return Number.isNaN(parsed) || parsed < 0 ? null : parsed;
}
