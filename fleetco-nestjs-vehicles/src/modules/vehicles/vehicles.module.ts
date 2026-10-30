import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers';
import { OutboxModule } from '../../platform/outbox/outbox.module';
import { VehiclesController } from './routes';
import { VehiclesRepository } from './repository';
import { VehiclesService } from './service';

/**
 * `imports: [CustomersModule]` is the cross-module dependency made explicit at
 * tier 1, and it is the first real test of the claim that Nest's `exports` is
 * the framework's strongest structural feature.
 *
 * What this module can reach is exactly what `CustomersModule` exports —
 * `CustomersService` — and nothing else. `CustomersRepository` is not merely
 * discouraged here, it is unresolvable: asking Nest to inject it throws at
 * bootstrap. That is [[Evolution Path]] rule 2 enforced by the container
 * rather than by lint.
 */
@Module({
  imports: [CustomersModule, OutboxModule],
  controllers: [VehiclesController],
  providers: [VehiclesRepository, VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
