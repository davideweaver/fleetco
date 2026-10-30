import { Controller, Get, Inject, VERSION_NEUTRAL } from '@nestjs/common';

import { Public } from './principal.guard';
import { DATABASE } from '../db/db.module';
import { pingDatabase } from '../db/client';
import type { Database } from '../db/client';
import { OutboxRepository } from '../outbox/repository';

/**
 * ADR-022 rule 7: "a real health endpoint that touches the database."
 *
 * Unversioned and unauthenticated — it is read by the load balancer, not by a
 * tenant. It reports the outbox backlog as well, because a stalled dispatcher
 * is the failure mode that is invisible from the outside: requests keep
 * succeeding while every SSE client silently stops receiving anything.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
@Public()
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly outbox: OutboxRepository,
  ) {}

  @Get()
  async check(): Promise<{ status: 'ok'; outboxPending: number }> {
    await pingDatabase(this.database);
    return { status: 'ok', outboxPending: await this.outbox.countPending() };
  }
}
