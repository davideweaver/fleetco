import { loadConfig } from './config.js';
import { buildServer } from './server.js';

/**
 * The process lifecycle. This is `authors-api`'s `lib/app/Process.ts` reduced
 * to the part that is actually load-bearing, which turned out to be about forty
 * lines rather than a base class — see NOTES.md §2.
 *
 * ADR-022 rule 7 in order:
 *
 *   SIGTERM → stop passing readiness → wait out the readiness delay →
 *   stop the dispatcher → drain SSE → finish in-flight requests → close the pool
 *
 * The SSE drain is the reason the order matters. Without it every deploy drops
 * every connected tablet mid-session; with it they get a clean close and
 * reconnect to the new task with their `Last-Event-ID` intact.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const { app, wiring } = buildServer(config);

  await wiring.listener.start();
  wiring.dispatcher.start();
  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  let draining = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (draining) return;
    draining = true;
    app.log.info({ signal, sseOpen: wiring.sse.open }, 'shutdown requested');

    // Readiness fails first, so the load balancer stops sending new work
    // before anything is torn down. Sized against
    // `failureThreshold * periodSeconds` in the deployment manifest.
    if (config.SHUTDOWN_READINESS_DELAY_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.SHUTDOWN_READINESS_DELAY_MS));
    }

    wiring.dispatcher.stop();
    wiring.sse.closeAll();
    await app.close();
    await wiring.close();
    app.log.info({ signal }, 'shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // An unhandled rejection has already corrupted whatever request produced it.
  // Log it and die; the orchestrator restarts a clean process.
  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ err: String(reason) }, 'unhandled rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (error: Error) => {
    app.log.fatal({ err: error.message, stack: error.stack }, 'uncaught exception');
    process.exit(1);
  });
}

await main();
