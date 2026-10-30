import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';

import { loadConfig } from '../../config';
import { CLOCK } from '../db/db.module';
import { TELEMETRY } from '../observability/telemetry';
import type { Telemetry } from '../observability/telemetry';
import type { Clock } from '../types/clock';
import { OutboxRepository } from './repository';
import { OutboxNotifier } from './notifier';

/**
 * The in-process dispatcher from [[Realtime and Events]] § Dispatcher
 * Mechanics.
 *
 *   claim with FOR UPDATE SKIP LOCKED → mark dispatched → COMMIT → NOTIFY
 *
 * The commit must precede the notify, or a listener wakes to a row it cannot
 * yet see. That ordering is the reason `notify` is outside the transaction
 * callback below rather than inside it.
 *
 * There is no handler registry. [[Realtime and Events]] lists four eventual
 * consumers — audit log, portal feed, notifications, live UI — but today only
 * the fanout exists, and "no new abstraction until there are two real call
 * sites" ([[Code Standards and Guardrails]]) applies to event handlers as much
 * as to anything else. The second consumer is where the registry gets written.
 */
export const DEAD_LETTER_AFTER_ATTEMPTS = 5;

@Injectable()
export class OutboxDispatcher implements OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastTickAt: number | null = null;

  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly outbox: OutboxRepository,
    private readonly notifier: OutboxNotifier,
    @Inject(TELEMETRY) private readonly telemetry: Telemetry,
  ) {}

  /** Started explicitly from `main.ts`; tests call `tick()` directly instead. */
  start(): void {
    if (this.timer !== null) return;
    const { OUTBOX_POLL_MS } = loadConfig();
    this.timer = setInterval(() => void this.tickSafely(), OUTBOX_POLL_MS);
    this.timer.unref();
    this.logger.log(`polling outbox every ${OUTBOX_POLL_MS}ms`);
  }

  /**
   * One dispatch pass. Returns how many rows it dispatched, so an integration
   * test can drain the outbox deterministically instead of sleeping.
   */
  async tick(): Promise<number> {
    const { OUTBOX_BATCH_SIZE } = loadConfig();
    const at = this.clock.now();

    const claimed = await this.outbox.transaction(async (tx) => {
      const events = await this.outbox.claimPending(tx, OUTBOX_BATCH_SIZE);
      await this.outbox.markDispatched(
        tx,
        events.map((event) => event.id),
        at,
      );
      return events;
    });

    // Strictly after commit. See the class comment.
    for (const event of claimed) {
      try {
        await this.notifier.publish({
          id: event.id,
          tenantId: event.tenantId,
          topic: event.topic,
        });
        this.telemetry.counter('fleetco_outbox_dispatched_total');
      } catch (error) {
        this.telemetry.counter('fleetco_outbox_dispatch_failures_total');
        await this.recordFailure(event.id, error);
      }
    }

    // Marks liveness whether or not there was anything to do: an idle
    // dispatcher is healthy, a silent one is not, and the difference is
    // exactly what this gauge exists to show.
    this.lastTickAt = Date.now();
    return claimed.length;
  }

  /** Seconds since the last completed tick, or `null` if none has finished. */
  secondsSinceLastTick(): number | null {
    return this.lastTickAt === null ? null : (Date.now() - this.lastTickAt) / 1000;
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private async tickSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(`dispatch tick failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * At-least-once delivery means a failed fanout is not a lost event — the
   * client replays by cursor. The counter exists so a persistently failing
   * row alerts rather than silently stalling the stream.
   */
  private async recordFailure(id: number, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = await this.outbox.recordFailure(id, message);
    if (attempts >= DEAD_LETTER_AFTER_ATTEMPTS) {
      this.logger.error(`outbox event ${id} dead-lettered after ${attempts} attempts: ${message}`);
    } else {
      this.logger.warn(`outbox event ${id} fanout failed (attempt ${attempts}): ${message}`);
    }
  }
}
