import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { DbModule } from './platform/db/db.module';
import { DomainErrorFilter } from './platform/http/domain-error.filter';
import { PrincipalGuard } from './platform/http/principal.guard';
import { ObservabilityModule } from './platform/observability/observability.module';
import { OutboxModule } from './platform/outbox/outbox.module';
import { CustomersModule } from './modules/customers';
import { VehiclesModule } from './modules/vehicles';
import { WorkOrdersModule } from './modules/workorders';
import { observeImports } from './platform/observability/observe';

/**
 * The composition root. Every edge in the application's dependency graph is
 * declared here or in a module's own `imports`, which is the one place to look
 * when asking "what can reach what".
 */
@Module({
  imports: [
    // Empty unless OBSERVE_APP_KEY/SECRET are set — see observability/observe.ts.
    ...observeImports(),
    DbModule,
    OutboxModule,
    ObservabilityModule,
    CustomersModule,
    VehiclesModule,
    WorkOrdersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: PrincipalGuard },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
})
export class AppModule {}
