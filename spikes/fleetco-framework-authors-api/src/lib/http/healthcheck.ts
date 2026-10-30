import type { FastifyInstance } from 'fastify';

import { environment } from '../environment.js';
import logging from '../logging/index.js';

/**
 * ADR-022 rule 7: "a **real** health endpoint that touches the database."
 *
 * Real means two things, and both of them have cost somebody a bad afternoon:
 *
 *  - It runs a query. An endpoint that returns `{ ok: true }` from a constant
 *    reports healthy while the connection pool is exhausted, which is when you
 *    most need it to say otherwise.
 *  - It reports not-ready as soon as the process starts stopping. That is what
 *    makes `Process`'s readiness delay work: the load balancer sees the failure
 *    and stops routing new requests *before* connections start closing.
 *
 * `authors-api` imported the application singleton here to read its status.
 * This version takes the two things it needs as arguments instead, so `lib/`
 * never imports `app/` and the dependency arrow points one way. It is the same
 * endpoint with an explicit seam.
 */

export type HealthDeps = {
  readonly isReady: () => boolean;
  readonly ping: () => Promise<void>;
};

export function registerHealthcheck(fastify: FastifyInstance, deps: HealthDeps): void {
  const { RUNTIME_ENV, NODE_ENV, PACKAGE_NAME, PACKAGE_VERSION } = environment;

  fastify.get('/health', async (_request, reply) => {
    if (!deps.isReady()) {
      // 503 and not 500: the process is fine, it is just no longer accepting
      // work. The distinction is what a load balancer acts on.
      return reply.status(503).send({ ok: false, reason: 'not ready' });
    }

    try {
      await deps.ping();
    } catch (err) {
      logging.exception('Healthcheck database ping failed', err, ['health']);
      return reply.status(503).send({ ok: false, reason: 'database unavailable' });
    }

    return reply.send({
      ok: true,
      env: `${RUNTIME_ENV}/${NODE_ENV}`,
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
    });
  });
}
