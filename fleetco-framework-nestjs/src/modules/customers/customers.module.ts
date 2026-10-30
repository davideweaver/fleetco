import { Module } from '@nestjs/common';

import { OutboxModule } from '../../platform/outbox/outbox.module';
import { CustomersController } from './routes';
import { CustomersRepository } from './repository';
import { CustomersService } from './service';

/**
 * `exports: [CustomersService]` is the module's public interface at tier 1.
 * Another module can ask this one for a customer; it cannot reach
 * `CustomersRepository`, and therefore cannot query `customers.*` — which is
 * [[Evolution Path]] rule 2 enforced by the framework rather than by lint.
 */
@Module({
  imports: [OutboxModule],
  controllers: [CustomersController],
  providers: [CustomersRepository, CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
