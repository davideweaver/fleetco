import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { DbModule } from './platform/db/db.module';
import { DomainErrorFilter } from './platform/http/domain-error.filter';
import { HealthController } from './platform/http/health.controller';
import { PrincipalGuard } from './platform/http/principal.guard';
import { OutboxModule } from './platform/outbox/outbox.module';
import { CustomersModule } from './modules/customers';

/**
 * The composition root. Every edge in the application's dependency graph is
 * declared here or in a module's own `imports`, which is the one place to look
 * when asking "what can reach what".
 */
@Module({
  imports: [DbModule, OutboxModule, CustomersModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
