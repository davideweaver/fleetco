import type { FastifyInstance } from 'fastify';

import type { Database } from '../db/client.js';
import { countPending } from '../outbox/repository.js';
import type { SseRegistry } from './sse.js';

/**
 * ADR-022 rule 7: "a real health endpoint that touches the database."
 *
 * It counts undispatched outbox rows, which touches the database *and* reports
 * something worth alerting on — a stalled dispatcher means the portal activity
 * feed and the audit log have both quietly stopped.
 *
 * Registered directly rather than through the route table: it takes no
 * principal, so the table's plane check does not apply, and the leak suite has
 * nothing to assert about an endpoint that returns no tenant data.
 */
export function installHealth(
  app: FastifyInstance,
  database: Database,
  sse: SseRegistry,
): void {
  app.get('/health', async (_request, reply) => {
    try {
      const pending = await countPending(database.drizzle);
      await reply.status(200).send({ status: 'ok', outboxPending: pending, sseOpen: sse.open });
    } catch (error) {
      app.log.error({ err: String(error) }, 'health check failed');
      await reply.status(503).send({ status: 'degraded' });
    }
  });
}
