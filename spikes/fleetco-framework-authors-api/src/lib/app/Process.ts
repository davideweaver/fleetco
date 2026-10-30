import * as inspector from 'node:inspector';

import { environment } from '../environment.js';
import logging from '../logging/index.js';

/**
 * Ported from `authors-api`'s `lib/app/Process.ts`.
 *
 * This class is the whole reason this spike exists. [[Framework Evaluation]]
 * § Prior Art calls it out: "an abstract lifecycle class: signal handling,
 * `uncaughtException` and `unhandledRejection`, a readiness delay before
 * shutdown, graceful exit" — and notes it already satisfies ADR-022 rule 7,
 * which the other three candidates have to build or configure.
 *
 * It follows the graceful-shutdown sequence from
 * https://blog.risingstack.com/graceful-shutdown-node-js-kubernetes/ — stop
 * being advertised as ready, wait out the load balancer's health-check window,
 * *then* close connections. Doing it in the other order drops in-flight
 * requests on every deploy, and with SSE it drops every connected user.
 *
 * Changes from the original, both for testability rather than taste:
 *
 *  1. `exit()` is `protected` rather than `private`, so a test subclass can
 *     record the code instead of killing the test runner. The original was
 *     covered by mocking `process.exit`, which leaks across test files.
 *  2. Signal registration happens in `start()` only. Tests drive `startup()`
 *     and `shutdown()` directly, so an integration suite never installs a
 *     SIGTERM handler it then has to remove.
 */

export enum ProcessStatus {
  Starting = 'starting',
  Started = 'started',
  Stopping = 'stopping',
  Stopped = 'stopped',
}

const SIGNALS = new Map<NodeJS.Signals, number>([
  ['SIGHUP', 1],
  ['SIGINT', 2],
  ['SIGTERM', 15],
  ['SIGUSR2', 12],
]);

export default abstract class Process {
  private _status: ProcessStatus = ProcessStatus.Starting;

  /** Start the process: install the signal handlers, then run `startup()`. */
  public async start(): Promise<void> {
    this.status = ProcessStatus.Starting;

    for (const [signal, value] of SIGNALS) {
      process.on(signal, () => {
        void this.exitGracefully(signal, 128 + value).catch((err: unknown) => {
          this.exitWithError('Error during exitGracefully', err);
        });
      });
    }

    // An uncaught exception leaves the process in an unknown state. Log it and
    // die; the orchestrator restarts a fresh one. Attempting to continue is how
    // a half-initialised module serves wrong answers.
    process.on('uncaughtException', (err) => {
      this.exitWithError('Uncaught exception', err);
    });

    process.on('unhandledRejection', (reason) => {
      this.exitWithError('Unhandled rejection', reason);
    });

    await this.startup();

    this.status = ProcessStatus.Started;
  }

  public get status(): ProcessStatus {
    return this._status;
  }

  /**
   * Drain and exit. Idempotent: a second SIGTERM while already stopping is
   * ignored rather than racing the first one through `shutdown()`.
   */
  public async exitGracefully(signal: NodeJS.Signals, code: number): Promise<void> {
    if (this.status === ProcessStatus.Stopping || this.status === ProcessStatus.Stopped) {
      return;
    }

    this.status = ProcessStatus.Stopping;

    // The health endpoint now reports not-ready (it reads `status`), so this
    // delay is the window in which the load balancer notices and stops routing
    // new work here. PROCESS_READINESS_DELAY_MS >= failureThreshold *
    // periodSeconds.
    const { PROCESS_READINESS_DELAY_MS } = environment;
    if (PROCESS_READINESS_DELAY_MS > 0) {
      logging.debug(`Process waiting for readiness check: ${PROCESS_READINESS_DELAY_MS}ms`, [
        'lifecycle',
        'process',
      ]);
      await delay(PROCESS_READINESS_DELAY_MS);
    }

    await this.shutdown(signal, code);

    if (inspector.url()) {
      inspector.close();
    }

    this.status = ProcessStatus.Stopped;
    this.exit(code);
  }

  /** Exit immediately. For failures where draining is not meaningful. */
  public exitWithError(message: string, error?: unknown): void {
    this.status = ProcessStatus.Stopping;
    this.kill(message, error);
    this.status = ProcessStatus.Stopped;
    this.exit(1);
  }

  /** Implement to initialise the application's modules, in order. */
  protected abstract startup(): Promise<void>;

  /** Implement to close them again, in the reverse order. */
  protected abstract shutdown(signal: NodeJS.Signals, code: number): Promise<void>;

  /** Override to report a fatal error before the process dies. */
  protected kill(_message: string, _error?: unknown): void {
    // Intentionally empty: the base class has no opinion about how a fatal
    // error is reported. `App` logs it.
  }

  /**
   * Leaves the process, and does nothing else. The original kept the
   * `Stopped` bookkeeping in here; moving it to the two callers means a
   * subclass that overrides `exit` — which a test must, to avoid killing the
   * runner — still observes the correct final status. The test that caught
   * this is in `__tests__/lifecycle.test.ts`.
   */
  protected exit(code: number): void {
    process.exit(code);
  }

  private set status(status: ProcessStatus) {
    logging.debug(`Process ${status}`, ['lifecycle', 'process']);
    this._status = status;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
