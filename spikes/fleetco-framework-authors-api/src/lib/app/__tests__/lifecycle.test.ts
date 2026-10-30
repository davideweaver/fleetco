import { afterEach, describe, expect, it } from 'vitest';

import AppModule from '../AppModule.js';
import Process, { ProcessStatus } from '../Process.js';

/**
 * The ported lifecycle classes are ours, so they are tested. [[Testing
 * Strategy]] § What Does Not Get Tested excludes "framework behaviour — Fastify
 * routing, Drizzle query building"; `Process` is neither. It is roughly 120
 * lines of our own code that decides whether a deploy drops connections, which
 * makes it one of the few places in this spike where a bug is invisible until
 * it is a production incident.
 *
 * Observing it needs no harness: `startup`, `shutdown`, `kill` and `exit` are
 * protected, so a subclass sees all four. That is the same door the integration
 * harness uses, and it is a genuine ergonomic point in the pattern's favour.
 */

class TestProcess extends Process {
  public readonly calls: string[] = [];
  public exitedWith: number | null = null;

  protected override async startup(): Promise<void> {
    this.calls.push('startup');
  }

  protected override async shutdown(signal: NodeJS.Signals, code: number): Promise<void> {
    this.calls.push(`shutdown:${signal}:${code}`);
  }

  protected override kill(message: string): void {
    this.calls.push(`kill:${message}`);
  }

  /** The reason `exit` is protected rather than private. */
  protected override exit(code: number): void {
    this.exitedWith = code;
  }

  public async boot(): Promise<void> {
    await this.startup();
  }
}

const SIGNAL_EVENTS: NodeJS.Signals[] = ['SIGHUP', 'SIGINT', 'SIGTERM', 'SIGUSR2'];

describe('Process', () => {
  // `start()` registers handlers on the real process. Removing them keeps one
  // test from interfering with the runner's own error reporting.
  afterEach(() => {
    for (const signal of SIGNAL_EVENTS) {
      process.removeAllListeners(signal);
    }
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  it('reports Starting before anything has run', () => {
    expect(new TestProcess().status).toBe(ProcessStatus.Starting);
  });

  it('runs startup and reaches Started', async () => {
    const proc = new TestProcess();
    await proc.start();

    expect(proc.calls).toEqual(['startup']);
    expect(proc.status).toBe(ProcessStatus.Started);
  });

  it('drains and exits with the signal’s code', async () => {
    const proc = new TestProcess();
    await proc.boot();

    await proc.exitGracefully('SIGTERM', 143);

    expect(proc.calls).toEqual(['startup', 'shutdown:SIGTERM:143']);
    expect(proc.exitedWith).toBe(143);
    expect(proc.status).toBe(ProcessStatus.Stopped);
  });

  it('ignores a second signal while already stopping, rather than draining twice', async () => {
    const proc = new TestProcess();
    await proc.boot();

    await proc.exitGracefully('SIGTERM', 143);
    await proc.exitGracefully('SIGINT', 130);

    // A deploy that sends SIGTERM and then SIGINT a moment later must not run
    // shutdown concurrently with itself; closing the same pool twice throws.
    expect(proc.calls.filter((call) => call.startsWith('shutdown'))).toHaveLength(1);
    expect(proc.exitedWith).toBe(143);
  });

  it('reports and exits non-zero on a fatal error, without draining', () => {
    const proc = new TestProcess();

    proc.exitWithError('Uncaught exception', new Error('boom'));

    expect(proc.calls).toEqual(['kill:Uncaught exception']);
    expect(proc.exitedWith).toBe(1);
  });
});

describe('AppModule', () => {
  it('holds the application so a module can reach its siblings explicitly', () => {
    const app = { name: 'app' };

    class Example extends AppModule<typeof app> {
      public parentName(): string {
        return this.app.name;
      }
    }

    expect(new Example(app).parentName()).toBe('app');
  });

  it('defaults init and close to no-ops, so a module overrides only what it needs', async () => {
    const module = new AppModule<null>(null);

    await expect(module.init()).resolves.toBeUndefined();
    await expect(module.close()).resolves.toBeUndefined();
  });
});
