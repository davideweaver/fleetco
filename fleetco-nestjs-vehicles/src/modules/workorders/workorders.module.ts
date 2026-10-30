import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers';
import { VehiclesModule } from '../vehicles';
import { OutboxModule } from '../../platform/outbox/outbox.module';
import { WorkOrdersController } from './routes';
import { WorkOrderLinesRepository, WorkOrdersRepository } from './repository';
import { WorkOrdersService } from './service';

/**
 * Two module dependencies, both at tier 1. What this module can reach is
 * exactly what the other two export — their services — and nothing else.
 * Asking Nest for `CustomersRepository` or `VehiclesRepository` here throws at
 * bootstrap rather than merely failing review.
 */
@Module({
  imports: [CustomersModule, VehiclesModule, OutboxModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersRepository, WorkOrderLinesRepository, WorkOrdersService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
