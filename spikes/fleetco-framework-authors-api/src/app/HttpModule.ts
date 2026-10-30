import Fastify, { type FastifyInstance } from 'fastify';

import type { App } from './index.js';
import AppModule from '../lib/app/AppModule.js';
import { ProcessStatus } from '../lib/app/Process.js';
import { environment } from '../lib/environment.js';
import { errorHandler } from '../lib/http/errorHandler.js';
import { registerHealthcheck } from '../lib/http/healthcheck.js';
import type { SseStream } from '../lib/http/sse.js';
import logging from '../lib/logging/index.js';

/**
 * The HTTP server. `authors-api`'s `HttpModule` with Express swapped for
 * Fastify, and the same split that module had: `init()` wires middleware,
 * `listen()` binds the port, and the two are separate so routes can be
 * registered in between.
 *
 * `http-terminator` is gone. Fastify's own `close()` stops accepting
 * connections and waits for in-flight requests, which is what the original
 * needed a package for — and the SSE half of ADR-022 rule 7, which no package
 * solves, is the `streams` set below.
 */
export default class HttpModule extends AppModule<App> {
  public readonly fastify: FastifyInstance;

  /**
   * Every open SSE stream. ADR-022 rule 7: graceful shutdown "drains SSE
   * connections". Fastify's `close()` alone would wait forever, because an
   * event stream is a request that never completes — so these are closed
   * first, which makes every connected browser reconnect to a healthy task
   * with its cursor intact.
   */
  public readonly streams = new Set<SseStream>();

  constructor(app: App) {
    super(app);
    this.fastify = Fastify({
      // Our own structured logger is the one in `lib/logging`, and two loggers
      // writing to stdout in different shapes is worse than either.
      logger: false,
      // Behind a load balancer. Needed for the client address in an audit entry.
      trustProxy: true,
      // `routerOptions` rather than the top-level `ignoreTrailingSlash`, which
      // Fastify 5 deprecates (FSTDEP022) and removes in 6. Found by running the
      // built image rather than by reading, which is the argument for doing so.
      routerOptions: { ignoreTrailingSlash: true },
    });
  }

  public override async init(): Promise<void> {
    // One error handler, for every route, mapping the domain taxonomy to
    // status codes exactly once.
    this.fastify.setErrorHandler(errorHandler);

    this.fastify.setNotFoundHandler((request, reply) => {
      void reply.status(404).send({
        kind: 'NotFound',
        message: `No route for ${request.method} ${request.url}`,
        context: {},
      });
    });

    registerHealthcheck(this.fastify, {
      // Reports not-ready the instant `Process` begins stopping, which is what
      // makes the readiness delay in `Process.exitGracefully` do anything.
      isReady: () => this.app.status === ProcessStatus.Started,
      ping: () => this.app.db.ping(),
    });

    logging.debug('HTTP server initialized', ['lifecycle', 'http']);
    return Promise.resolve();
  }

  public async listen(): Promise<void> {
    const { PORT, HOST, KEEP_ALIVE_TIMEOUT_MS, HEADERS_TIMEOUT_MS } = environment;

    // Both above any load balancer's idle timeout, so the server never closes a
    // connection the balancer still believes is usable.
    this.fastify.server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
    this.fastify.server.headersTimeout = HEADERS_TIMEOUT_MS;

    await this.fastify.listen({ port: PORT, host: HOST });
    logging.debug(`HTTP server listening on ${this.port}`, ['lifecycle', 'http']);
  }

  public override async close(): Promise<void> {
    // SSE first. Each `close()` resolves its handler's `await stream.finished`,
    // so by the time Fastify is asked to close there are no requests left that
    // cannot finish.
    for (const stream of this.streams) {
      stream.comment('server shutting down');
      stream.close();
    }
    this.streams.clear();

    await this.fastify.close();
    logging.debug('HTTP server closed', ['lifecycle', 'http']);
  }

  /** The bound port, which differs from `PORT` when it is 0 — as it is in tests. */
  public get port(): number {
    const address = this.fastify.server.address();
    return address !== null && typeof address === 'object' ? address.port : environment.PORT;
  }
}
