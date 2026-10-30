import type { Logger } from '@adonisjs/core/logger';

import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { closeDatabase, openDatabase, transactor } from './db/client.js';
import type { Database } from './db/client.js';
import { createSseRegistry } from './http/sse.js';
import type { SseRegistry } from './http/sse.js';
import { createOutboxDispatcher, createOutboxListener } from './outbox/index.js';
import type { OutboxDispatcher, OutboxListener } from './outbox/index.js';
import { newCustomerId } from './types/branded.js';
import type { CustomerId } from './types/branded.js';
import { systemClock } from './types/clock.js';
import type { Clock } from './types/clock.js';
import { createCustomerService, createCustomerStore, customerRoutes } from '../modules/customers/index.js';
import type { CustomerRoutes, CustomerService } from '../modules/customers/index.js';

/**
 * The composition root — the AdonisJS spike's equivalent of the Fastify
 * spike's `wire.ts`, and deliberately built the same way: everything
 * constructed here, once, in order, by hand, as plain function calls rather
 * than container bindings.
 *
 * [[Framework Evaluation]] records Dave's dislike of DI containers as
 * specifically about *containers*, not about structure. AdonisJS's IoC
 * container would happily resolve `CustomerService` for you given a
 * `@inject()` on a controller constructor, but that reintroduces exactly the
 * "provider token nobody can grep to" indirection the Fastify spike avoided.
 * So this object graph is built here, with imports, and
 * `providers/fleetco_provider.ts` — the one place that *does* touch the
 * container — only stores the result where `platform/wiring.ts`'s own
 * `getWiring()` can hand it back out. See NOTES.md §2.
 */
export type Wiring = {
  readonly config: Config;
  readonly database: Database;
  readonly clock: Clock;
  readonly listener: OutboxListener;
  readonly dispatcher: OutboxDispatcher;
  readonly sse: SseRegistry;
  readonly customers: CustomerService;
  readonly customerRoutes: CustomerRoutes;
  readonly close: () => Promise<void>;
};

export type WiringOverrides = { readonly clock?: Clock; readonly newCustomerId?: () => CustomerId };

export function buildWiring(log: Logger, overrides: WiringOverrides = {}): Wiring {
  const config = loadConfig();
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
    customerRoutes: customerRoutes(customers),
    close: async (): Promise<void> => {
      dispatcher.stop();
      await listener.stop();
      await closeDatabase(database);
    },
  };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------
//
// Bound onto the AdonisJS container rather than held in a bare module-level
// variable — not a style preference, a correctness fix found empirically.
// Under Vitest, a file reached through AdonisJS's own internal module loading
// (how `providers/fleetco_provider.ts` is instantiated, and how `config/*.ts`
// is loaded by `@adonisjs/config`) and the *same* file reached through a
// plain `import` in a test file are two separate module instances with two
// separate copies of any top-level `let` — including, it turns out, the
// `@adonisjs/core/services/app` singleton itself, which is why this does
// NOT import that service and call `.container` on it: that import is
// exactly as duplicate-prone as our own module-level variable was.
//
// What is never duplicated: the live `Application` object `Ignitor` actually
// constructs, which every caller below already holds by direct reference —
// `this.app` in a provider (constructor-injected), the `app` local variable
// in `platform/test/harness.ts` (returned by `ignitor.createApp()`), and
// `ctx.containerResolver` in a controller (created from that same app's
// container on every request, by AdonisJS's own request pipeline, no module
// singleton involved anywhere in the chain). So `setWiring`/`getWiring` take
// that reference as a parameter instead of reaching for one themselves. See
// NOTES.md §2 and §3 for what this costs in traceability.
declare module '@adonisjs/core/types' {
  interface ContainerBindings {
    wiring: Wiring;
    wiringOverrides: WiringOverrides;
  }
}

/** Satisfied by `Application#container`, and by `HttpContext#containerResolver`. */
export type WiringResolver = {
  readonly hasBinding: (binding: 'wiring' | 'wiringOverrides') => boolean;
  readonly make: {
    (binding: 'wiring'): Promise<Wiring>;
    (binding: 'wiringOverrides'): Promise<WiringOverrides>;
  };
};

export type WiringBinder = {
  readonly bindValue: {
    (binding: 'wiring', value: Wiring): void;
    (binding: 'wiringOverrides', value: WiringOverrides): void;
  };
};

export function setWiring(container: WiringBinder, wiring: Wiring): void {
  container.bindValue('wiring', wiring);
}

export async function getWiring(resolver: WiringResolver): Promise<Wiring> {
  if (!resolver.hasBinding('wiring')) {
    throw new Error('wiring accessed before FleetcoProvider#boot ran');
  }
  return resolver.make('wiring');
}

/**
 * The one seam a test has for reaching into `FleetcoProvider#boot` before it
 * runs: `platform/test/harness.ts` binds this on the container *before*
 * calling `app.boot()`, so it is in place when the provider looks for it —
 * the AdonisJS-boot-based equivalent of the Fastify spike's
 * `buildServer(config, overrides)` parameter. Nothing outside
 * `platform/test/harness.ts` and `fleetco_provider.ts` touches this binding.
 */
export function setWiringOverrides(container: WiringBinder, overrides: WiringOverrides): void {
  container.bindValue('wiringOverrides', overrides);
}

export async function getWiringOverrides(resolver: WiringResolver): Promise<WiringOverrides> {
  if (!resolver.hasBinding('wiringOverrides')) return {};
  return resolver.make('wiringOverrides');
}
