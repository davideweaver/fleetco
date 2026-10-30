import { Global, Module } from '@nestjs/common';

import { OutboxModule } from '../outbox/outbox.module';
import { MetricsController } from './metrics.controller';
import { InMemoryTelemetry, TELEMETRY } from './telemetry';

/**
 * `@Global` because telemetry is genuinely cross-cutting — the alternative is
 * importing it into every module, which is noise rather than a boundary. It
 * is also the one thing in the system that is allowed to be ambient: a module
 * that cannot emit a metric is a module you cannot see.
 *
 * One instance, exported under both its class (for `render()`) and the
 * `TELEMETRY` token (for the port). Application code injects the token; only
 * the scrape endpoint injects the class.
 */
@Global()
@Module({
  imports: [OutboxModule],
  controllers: [MetricsController],
  providers: [InMemoryTelemetry, { provide: TELEMETRY, useExisting: InMemoryTelemetry }],
  exports: [InMemoryTelemetry, TELEMETRY],
})
export class ObservabilityModule {}
