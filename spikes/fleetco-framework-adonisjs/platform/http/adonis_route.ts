import type { HttpContext } from '@adonisjs/core/http';

import { assertPlane, requirePrincipal } from './authenticate.js';
import { lastEventIdOf, openSse } from './sse.js';
import type { SseRegistry } from './sse.js';
import { parse } from './route.js';
import type { JsonRoute, SseRoute } from './route.js';

/**
 * The AdonisJS-specific half of the route table. Everything a reader needs to
 * hold about *Adonis* to understand how a request reaches a handler lives in
 * this one file — the rest of the add-endpoint playbook's parsing,
 * authorization and serialization logic is `platform/http/route.ts`, which
 * knows nothing about any framework.
 *
 * Controllers call one of these two functions and nothing else; see
 * `app/controllers/customers_controller.ts`. This is the direct analogue of
 * the Fastify spike's `registerRoutes` + `jsonRoute`/`sseRoute` handlers,
 * split along the framework-independent / framework-specific seam instead of
 * merged into one file, because AdonisJS wants a controller method per route
 * rather than a single table Adonis itself walks at boot.
 */
export async function runJsonRoute<P, Q, B, R>(
  route: JsonRoute<P, Q, B, R>,
  ctx: HttpContext,
): Promise<void> {
  const principal = requirePrincipal(ctx.principal);
  assertPlane(route.meta.planes, principal);

  const result = await route.handle({
    principal,
    params: parse(route.params, ctx.params, 'params'),
    query: parse(route.query, ctx.request.qs(), 'query'),
    body: parse(route.body, route.meta.method === 'GET' ? undefined : ctx.request.body(), 'body'),
  });

  // The response is validated against its own contract on the way out, so a
  // drift between the handler and the generated OpenAPI document is a
  // failing request rather than a wrong document.
  ctx.response.status(route.meta.successStatus).send(parse(route.response, result, 'response'));
}

export async function runSseRoute<P, Q>(
  route: SseRoute<P, Q>,
  ctx: HttpContext,
  registry: SseRegistry,
  heartbeatMs: number,
): Promise<void> {
  const principal = requirePrincipal(ctx.principal);
  assertPlane(route.meta.planes, principal);
  const params = parse(route.params, ctx.params, 'params');
  const query = parse(route.query, ctx.request.qs(), 'query');

  // One controller for "the handler is done with this stream", wired to the
  // socket by `openSse` below. Created first so `open`'s generator can hold
  // it. Awaiting `open` *before* taking over the response is load-bearing:
  // a refusal has to reach the client as a normal JSON error response, which
  // only works while AdonisJS still owns the response.
  const aborter = new AbortController();
  const events = await route.open({
    principal,
    params,
    query,
    lastEventId: lastEventIdOf(ctx, undefined),
    signal: aborter.signal,
  });

  const stream = openSse(ctx, registry, heartbeatMs);
  stream.signal.addEventListener('abort', () => {
    aborter.abort();
  });

  try {
    for await (const frame of events) {
      if (stream.signal.aborted) break;
      stream.send(frame);
    }
  } catch (error) {
    // The socket is already a 200. All that is left is to say so and close;
    // the client reconnects with its `Last-Event-ID` and loses nothing.
    ctx.logger.error({ err: String(error), operation: route.meta.operationId }, 'sse stream failed');
    stream.comment('stream error, reconnect');
  } finally {
    await events.return(undefined);
    stream.close();
  }
}
