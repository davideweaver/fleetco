import { Controller, Get, Header, Inject, VERSION_NEUTRAL } from '@nestjs/common';

import { Public } from '../http/principal.guard';
import { DATABASE } from '../db/db.module';
import { pingDatabase } from '../db/client';
import type { Database } from '../db/client';
import { DEAD_LETTER_AFTER_ATTEMPTS, OutboxDispatcher } from '../outbox/dispatcher';
import { OutboxRepository } from '../outbox/repository';
import { InMemoryTelemetry } from './telemetry';
import { loadConfig } from '../../config';

/**
 * The scrape surface, plus the readiness probe ADR-022 rule 7 implies and
 * [[Infrastructure Checklist]] asks for by name ("readiness separate from
 * liveness").
 *
 * **Why `/ready` is separate from `/health`.** They answer different
 * questions and a load balancer needs both. `/health` is liveness: is this
 * process alive and is its database reachable — if not, restart it. `/ready`
 * is "should traffic be sent here", which is false during the shutdown drain
 * *while the process is still perfectly healthy*. Conflating them means the
 * balancer either keeps sending requests into a draining task or kills a
 * task that is merely busy.
 *
 * All three routes are unauthenticated and unversioned: they are read by
 * infrastructure, not by a tenant, and they carry no tenant data. The leak
 * suite asserts they stay outside the OpenAPI document.
 */
@Controller({ path: '', version: VERSION_NEUTRAL })
@Public()
export class MetricsController {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly outbox: OutboxRepository,
    private readonly dispatcher: OutboxDispatcher,
    private readonly telemetry: InMemoryTelemetry,
  ) {
    const serviceId = loadConfig().OBSERVE_SERVICE_ID;

    /**
     * Backlog, lag and dead letters come from one query at scrape time.
     *
     * These are deliberately *not* labelled by instance: they describe the
     * shared outbox table, so every instance reports the same figures and
     * labelling them per-process would multiply one truth into N and make
     * `sum()` wrong. The per-instance metrics below are labelled; these are
     * not, on purpose.
     */
    this.telemetry.collect(
      'fleetco_outbox_pending',
      'Outbox rows not yet dispatched (shared across instances)',
      async () => [{ value: (await this.outbox.stats(DEAD_LETTER_AFTER_ATTEMPTS)).pending }],
    );
    this.telemetry.collect(
      'fleetco_outbox_oldest_pending_age_seconds',
      'Age of the oldest undispatched row — the number that distinguishes busy from stalled',
      async () => [
        { value: (await this.outbox.stats(DEAD_LETTER_AFTER_ATTEMPTS)).oldestPendingAgeSeconds },
      ],
    );
    this.telemetry.collect(
      'fleetco_outbox_dead_lettered',
      `Undispatched rows past ${DEAD_LETTER_AFTER_ATTEMPTS} failed attempts`,
      async () => [{ value: (await this.outbox.stats(DEAD_LETTER_AFTER_ATTEMPTS)).deadLettered }],
    );

    /**
     * The dispatcher heartbeat, per instance. With two instances polling the
     * same table, one can die while the other keeps the backlog at zero — so
     * the backlog alone cannot detect a half-dead deployment. This can.
     */
    this.telemetry.collect(
      'fleetco_outbox_last_tick_age_seconds',
      'Seconds since this instance last completed a dispatch tick',
      // Not async: the heartbeat is in-process state, not a query. `-1` is
      // deliberately distinguishable from `0` — it means "has never ticked",
      // which at startup is normal and after a minute is an incident.
      () => {
        const age = this.dispatcher.secondsSinceLastTick();
        return Promise.resolve([{ value: age ?? -1, labels: { instance: serviceId } }]);
      },
    );
  }

  /** Liveness. Touches the database, per ADR-022 rule 7. */
  @Get('health')
  async health(): Promise<{ status: 'ok'; outboxPending: number }> {
    await pingDatabase(this.database);
    return { status: 'ok', outboxPending: await this.outbox.countPending() };
  }

  /**
   * Readiness. Returns 503 while draining so the balancer deregisters this
   * task before it stops answering — the readiness delay in `main.ts` exists
   * to give that propagation time to happen.
   */
  @Get('ready')
  ready(): { status: 'ready' } {
    return { status: 'ready' };
  }

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): Promise<string> {
    return this.telemetry.render();
  }
}
