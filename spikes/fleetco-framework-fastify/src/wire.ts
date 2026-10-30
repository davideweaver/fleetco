import type { FastifyBaseLogger } from 'fastify';

import type { Config } from './config.js';
import { closeDatabase, openDatabase, transactor } from './platform/db/client.js';
import type { Database } from './platform/db/client.js';
import { createSseRegistry } from './platform/http/sse.js';
import type { SseRegistry } from './platform/http/sse.js';
import type { Route } from './platform/http/route.js';
import { createOutboxDispatcher, createOutboxListener } from './platform/outbox/index.js';
import type { OutboxDispatcher, OutboxListener } from './platform/outbox/index.js';
import { newCustomerId } from './platform/types/branded.js';
import type { CustomerId } from './platform/types/branded.js';
import { systemClock } from './platform/types/clock.js';
import type { Clock } from './platform/types/clock.js';
import { createCustomerService, createCustomerStore, customerRoutes } from './modules/customers/index.js';
import type { CustomerService } from './modules/customers/index.js';

/**
 * The composition root. Everything is constructed here, once, in order, by
 * hand.
 *
 * This is the whole of what [[Framework Evaluation]] calls "explicit
 * construction" and what it records as Dave's existing habit in `authors-api`:
 * "modules receive the parent app via constructor and reach siblings through
 * `this.app.schema1`. Manual, ordered, greppable."
 *
 * The thing to compare against NestJS is not the line count — it is that the
 * dependency graph is this one function. There is no provider token, no
 * `@Module({ imports })` to reconcile, and no class whose constructor tells you
 * what it needs only once the container has resolved it. Reading this file is
 * reading the whole graph.
 */
export type Wiring = {
  readonly config: Config;
  readonly database: Database;
  readonly clock: Clock;
  readonly listener: OutboxListener;
  readonly dispatcher: OutboxDispatcher;
  readonly sse: SseRegistry;
  readonly customers: CustomerService;
  readonly routes: Route[];
  readonly close: () => Promise<void>;
};

export function wire(
  config: Config,
  log: FastifyBaseLogger,
  overrides: { readonly clock?: Clock; readonly newCustomerId?: () => CustomerId } = {},
): Wiring {
  const clock = overrides.clock ?? systemClock;
  const database = openDatabase(config);
  const sse = createSseRegistry();

  const listener = createOutboxListener(config.DATABASE_URL, log);
  const dispatcher = createOutboxDispatcher({
    database,
    transaction: transactor(database),
    clock,
    config,
    log,
  });

  const customers = createCustomerService({
    store: createCustomerStore(database),
    clock,
    newCustomerId: overrides.newCustomerId ?? newCustomerId,
    watch: listener.watch,
    streamTickMs: config.SSE_TICK_MS,
  });

  return {
    config,
    database,
    clock,
    listener,
    dispatcher,
    sse,
    customers,
    routes: customerRoutes(customers, { registry: sse, heartbeatMs: config.SSE_HEARTBEAT_MS }),
    close: async (): Promise<void> => {
      dispatcher.stop();
      await listener.stop();
      await closeDatabase(database);
    },
  };
}
