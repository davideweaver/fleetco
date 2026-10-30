import CustomersModule from '../modules/customers/index.js';
import Process from '../lib/app/Process.js';
import { environment } from '../lib/environment.js';
import logging from '../lib/logging/index.js';
import DbModule from './DbModule.js';
import HttpModule from './HttpModule.js';
import OutboxModule from './OutboxModule.js';

/**
 * **The composition root, and the whole of the dependency graph.**
 *
 * This is `authors-api`'s `app/index.ts`: modules as public fields, with
 * explicit startup and shutdown ordering. [[Framework Evaluation]] summarises
 * what it replaces — "that is a module system with lifecycle hooks. He wanted
 * the structure NestJS provides and wrote it himself rather than adopt a
 * framework."
 *
 * Two kinds of order live in this file, and they are the reason it reads the
 * way it does:
 *
 *  1. **Field declaration order is construction order.** `db` is declared
 *     first because `CustomersModule`'s constructor reads `app.db.handle`.
 *     JavaScript initialises fields top to bottom, so getting this wrong is a
 *     crash on the first line of startup rather than a wrong answer later. A DI
 *     container would work this order out; here it is four lines a reviewer can
 *     see, which is the trade this spike exists to evaluate.
 *  2. **`startup()` and `shutdown()` are mirror images**, written out rather
 *     than derived. `shutdown` closing HTTP before the outbox before the
 *     database is not a detail: draining SSE first means no handler is still
 *     reading when the pool goes away.
 *
 * `http.init()` runs before `customers.init()` because Fastify will not accept
 * a route after `listen()`, and `listen()` is deliberately the last thing that
 * happens — the port opens only once every module is ready to serve.
 */
export class App extends Process {
  public db: DbModule = new DbModule(this);
  public outbox: OutboxModule = new OutboxModule(this);
  public http: HttpModule = new HttpModule(this);
  public customers: CustomersModule = new CustomersModule(this);

  protected override async startup(): Promise<void> {
    await this.db.init();
    await this.outbox.init();
    await this.http.init();
    await this.customers.init();

    await this.http.listen();

    const { NODE_ENV, RUNTIME_ENV, PACKAGE_NAME, PACKAGE_VERSION } = environment;
    logging.info(
      `Starting ${PACKAGE_NAME} v${PACKAGE_VERSION} in "${RUNTIME_ENV}/${NODE_ENV}" mode...`,
      ['lifecycle'],
      { port: this.http.port },
    );
  }

  protected override async shutdown(signal: NodeJS.Signals, code: number): Promise<void> {
    logging.info(`Graceful shutdown triggered by ${signal} with code ${code}...`, ['lifecycle']);

    // SSE streams and in-flight requests first, so nothing is still running
    // when its dependencies disappear beneath it.
    await this.http.close();
    await this.customers.close();
    await this.outbox.close();
    await this.db.close();
  }

  protected override kill(message: string, error?: unknown): void {
    logging.exception(message, error, ['lifecycle']);
  }
}

export default new App();
