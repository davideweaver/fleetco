import type { HttpContext } from '@adonisjs/core/http';

import type { Database } from '../db/client.js';
import { countPending } from '../outbox/repository.js';
import type { SseRegistry } from './sse.js';

/**
 * ADR-022 rule 7: "a real health endpoint that touches the database."
 *
 * It counts undispatched outbox rows, which touches the database *and*
 * reports something worth alerting on — a stalled dispatcher means the
 * portal activity feed and the audit log have both quietly stopped.
 *
 * Registered directly in `start/routes.ts` rather than through the route
 * table: it takes no principal, so the table's plane check does not apply,
 * and the leak suite has nothing to assert about an endpoint that returns no
 * tenant data.
 */
export async function health(ctx: HttpContext, database: Database, sse: SseRegistry): Promise<void> {
  try {
    const pending = await countPending(database.drizzle);
    ctx.response.status(200).send({ status: 'ok', outboxPending: pending, sseOpen: sse.open });
  } catch (error) {
    ctx.logger.error({ err: String(error) }, 'health check failed');
    ctx.response.status(503).send({ status: 'degraded' });
  }
}
