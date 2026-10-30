import type { App } from '../../app/index.js';
import AppModule from '../../lib/app/AppModule.js';
import { assertNotProduction } from '../../lib/http/authenticate.js';
import { systemClock } from '../../lib/types/clock.js';
import logging from '../../lib/logging/index.js';
import { createCustomersRepository } from './repository.js';
import { registerCustomerRoutes } from './routes.js';
import { createCustomersService, type CustomersService } from './service.js';

/**
 * **The module's public interface — the only legal import surface.**
 *
 * [[Code Standards and Guardrails]] § The Golden Module names `index.ts` as
 * that surface, and Evolution Path rule 2 is what makes it matter: another
 * module asks this one for what it needs ("modules call each other through
 * explicit TypeScript interfaces, not by reaching into each other's tables").
 * A lint rule forbids importing this module's `repository`, `schema`, `service`
 * or `routes` from outside the directory, so `service` below is the whole of
 * what the rest of the system can reach.
 *
 * It is also the module's `AppModule`, which is where this spike differs from
 * the other three. The lifecycle class and the public interface are the same
 * object: `App` holds it as a field, `init()` registers its routes, and a
 * sibling module calls `app.customers.service.get(...)`. One file answers both
 * "what is this module" and "when does it start".
 *
 * The wiring is three lines in the constructor. There is no container, no
 * provider token, and no `wire.ts` — the dependency is visible in the line that
 * creates it, which is the property [[Framework Evaluation]] credits this
 * pattern with ("manual, ordered, greppable").
 */
export default class CustomersModule extends AppModule<App> {
  /**
   * Public, because the service *is* the module's interface to the rest of the
   * system. Non-null for the whole life of the process: `app.db.handle` exists
   * at construction time, so there is no "initialised yet?" guard anywhere.
   */
  public readonly service: CustomersService;

  /** Where this module's forward-only SQL lives. `DbModule` collects these. */
  public readonly migrations = new URL('./migrations/', import.meta.url);

  constructor(app: App) {
    super(app);
    const repository = createCustomersRepository(app.db.handle);
    this.service = createCustomersService({ repository, clock: systemClock });
  }

  public override init(): Promise<void> {
    // Route-registration time, not request time: a deploy that still has the
    // header-based authentication stub must fail to start.
    assertNotProduction();

    registerCustomerRoutes(this.app.http.fastify, {
      service: this.service,
      notifier: this.app.outbox.notifier,
      streams: this.app.http.streams,
    });

    logging.debug('Customers routes registered', ['lifecycle', 'customers']);
    return Promise.resolve();
  }
}

/**
 * The module's public types and its HTTP contract. A consumer imports from
 * here; nothing else in the directory is reachable.
 */
export type {
  Customer,
  CustomerEvent,
  CustomerPage,
  CustomerStatus,
  BillingTermsNetDays,
  CreateCustomer,
  UpdateCustomer,
  ListCustomersQuery,
} from './contracts.js';

export { CUSTOMER_STATUSES, BILLING_TERMS_NET_DAYS } from './contracts.js';
export { CUSTOMER_EVENT_NAMES, type CustomerEventName } from './events.js';
export { customerOperations } from './routes.js';
export type { CustomersService } from './service.js';
