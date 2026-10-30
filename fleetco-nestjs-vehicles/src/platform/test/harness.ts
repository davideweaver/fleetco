import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { AppModule } from '../../app.module';
import { createDatabase } from '../db/client';
import type { Database } from '../db/client';
import { CustomersRepository } from '../../modules/customers/repository';
import { CustomersService } from '../../modules/customers/service';
import { VehiclesRepository } from '../../modules/vehicles/repository';
import { VehiclesService } from '../../modules/vehicles/service';
import {
  WorkOrderLinesRepository,
  WorkOrdersRepository,
} from '../../modules/workorders/repository';
import { WorkOrdersService } from '../../modules/workorders/service';
import { OutboxDispatcher } from '../outbox/dispatcher';
import { OutboxNotifier } from '../outbox/notifier';
import { OutboxRepository } from '../outbox/repository';
import { InMemoryTelemetry } from '../observability/telemetry';
import { PRINCIPAL_HEADER } from '../http/principal.guard';
import { fixedClock } from '../types/clock';
import type { Principal } from '../types/principal';
import { FIXED_NOW } from './factories';

/**
 * Two ways in, because the layers want different things:
 *
 *  - `wire()` constructs the real classes by hand. No container, no module
 *    metadata, no test harness — `new CustomersService(repo, outbox, notifier,
 *    clock)`. This is the answer to the spike's testability criterion: Nest's
 *    DI costs nothing at test time if the providers are plain classes with
 *    constructor arguments.
 *  - `startApp()` boots the whole HTTP application, because the leak suite has
 *    to go through guards, pipes, routing and the filter — the layers where a
 *    leak would actually happen.
 */
export type Wiring = {
  readonly database: Database;
  readonly customers: CustomersRepository;
  readonly outbox: OutboxRepository;
  readonly notifier: OutboxNotifier;
  readonly dispatcher: OutboxDispatcher;
  readonly telemetry: InMemoryTelemetry;
  readonly service: CustomersService;
  readonly vehiclesRepo: VehiclesRepository;
  readonly vehicles: VehiclesService;
  readonly ordersRepo: WorkOrdersRepository;
  readonly linesRepo: WorkOrderLinesRepository;
  readonly orders: WorkOrdersService;
  readonly close: () => Promise<void>;
};

export function wire(databaseUrl: string): Wiring {
  const database = createDatabase(databaseUrl);
  const clock = fixedClock(FIXED_NOW);

  const customers = new CustomersRepository(database.db);
  const outbox = new OutboxRepository(database.db);
  const notifier = new OutboxNotifier(database);
  const telemetry = new InMemoryTelemetry();
  const dispatcher = new OutboxDispatcher(clock, outbox, notifier, telemetry);
  const service = new CustomersService(customers, outbox, notifier, clock);

  // Module two, by hand, exactly like module one. Five `new` calls instead of
  // four — the container is still not load-bearing at test time.
  const vehiclesRepo = new VehiclesRepository(database.db);
  const vehicles = new VehiclesService(vehiclesRepo, service, outbox, notifier, clock);

  // Module three, still by hand. Seven constructor arguments is the most any
  // service takes, and the container is still not load-bearing at test time.
  const ordersRepo = new WorkOrdersRepository(database.db);
  const linesRepo = new WorkOrderLinesRepository(database.db);
  const orders = new WorkOrdersService(
    ordersRepo,
    linesRepo,
    service,
    vehicles,
    outbox,
    notifier,
    clock,
  );

  return {
    database,
    customers,
    outbox,
    notifier,
    dispatcher,
    telemetry,
    service,
    vehiclesRepo,
    vehicles,
    ordersRepo,
    linesRepo,
    orders,
    close: async (): Promise<void> => {
      dispatcher.onApplicationShutdown();
      await notifier.onApplicationShutdown();
      await database.close();
    },
  };
}

export type RunningApp = {
  readonly app: INestApplication;
  readonly baseUrl: string;
  readonly dispatcher: OutboxDispatcher;
  readonly telemetry: InMemoryTelemetry;
  readonly close: () => Promise<void>;
};

export async function startApp(): Promise<RunningApp> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useLogger(new Logger());

  await app.get(OutboxNotifier).start();
  await app.listen(0);

  const address = (app.getHttpServer() as Server).address() as AddressInfo;
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    dispatcher: app.get(OutboxDispatcher),
    telemetry: app.get(InMemoryTelemetry),
    close: () => app.close(),
  };
}

/** Builds the request headers for a principal. The leak suite's only way in. */
export function headersFor(principal: Principal): Record<string, string> {
  return {
    'content-type': 'application/json',
    [PRINCIPAL_HEADER]: JSON.stringify(principal),
  };
}

/**
 * Truncates the module's tables between tests. Chosen over a rolled-back
 * transaction per test because the outbox tests need a real COMMIT — the whole
 * point is that the state change and the event commit together.
 */
export async function resetData(database: Database): Promise<void> {
  // All three in one statement: `vehicles.vehicles` has a foreign key into
  // `customers.customers`, and TRUNCATE refuses a referenced table unless every
  // referencing table is truncated with it.
  await database.pool.query(
    'TRUNCATE workorders.work_order_lines, workorders.work_orders, ' +
      'vehicles.vehicles, customers.customers, platform.outbox_events',
  );
}

/** Drains the outbox, so a test can assert on dispatched rows without sleeping. */
export async function drainOutbox(dispatcher: OutboxDispatcher): Promise<number> {
  let total = 0;
  for (;;) {
    const dispatched = await dispatcher.tick();
    total += dispatched;
    if (dispatched === 0) return total;
  }
}
