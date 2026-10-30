import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import type { Config } from './config.js';
import { installAuthentication } from './platform/http/authenticate.js';
import { installErrorHandler } from './platform/http/errors.js';
import { installHealth } from './platform/http/health.js';
import { registerRoutes } from './platform/http/route.js';
import { buildOpenApiDocument } from './platform/openapi/document.js';
import type { Clock } from './platform/types/clock.js';
import type { CustomerId } from './platform/types/branded.js';
import { wire } from './wire.js';
import type { Wiring } from './wire.js';

export type Server = {
  readonly app: FastifyInstance;
  readonly wiring: Wiring;
};

/**
 * Builds the HTTP server. Called by `main.ts` for real and by the integration
 * and leak suites with a test database URL, so what the tests exercise is the
 * same object graph that serves traffic.
 */
export function buildServer(
  config: Config,
  overrides: { readonly clock?: Clock; readonly newCustomerId?: () => CustomerId } = {},
): Server {
  const app = Fastify({
    // ADR-022 rule 4: logs to stdout as JSON, never to a file, never through a
    // platform SDK. Fastify's bundled pino does exactly that with no wiring.
    logger: { level: config.LOG_LEVEL },
    // Both inherited from `authors-api`, where they are commented against a
    // load balancer's idle timeout. An SSE connection is long-lived by design,
    // so the server must not be the thing that decides it is idle.
    keepAliveTimeout: 72_000,
    // Trust the proxy for `x-forwarded-*`; the API sits behind an ALB.
    trustProxy: true,
  });

  const wiring = wire(config, app.log, overrides);

  installErrorHandler(app);
  installAuthentication(app, config);
  installHealth(app, wiring.database, wiring.sse);
  registerRoutes(app, wiring.routes);

  // Served rather than only written to a file, so a client generator can point
  // at a running instance and so the leak suite can read the live document.
  app.get('/openapi.json', async (_request, reply) => {
    await reply.status(200).send(buildOpenApiDocument(wiring.routes, '1'));
  });

  return { app, wiring };
}
