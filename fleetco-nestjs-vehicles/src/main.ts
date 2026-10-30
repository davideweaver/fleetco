import 'reflect-metadata';

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Server } from 'node:http';

import { loadConfig } from './config';
import { initObserve, observeEnabled, observeInstrument } from './platform/observability/observe';
import { OutboxDispatcher } from './platform/outbox/dispatcher';
import { OutboxNotifier } from './platform/outbox/notifier';

/**
 * Process lifecycle, including the part ADR-022 rule 7 calls non-optional:
 * graceful shutdown that drains SSE connections.
 *
 * Nest's `enableShutdownHooks` runs the module `onApplicationShutdown` hooks
 * and calls `server.close()`, which stops *accepting* connections and then
 * waits for open ones to finish. An SSE connection never finishes, so that
 * alone hangs until the platform's kill timeout and every connected user is
 * dropped mid-session anyway. The sequence below is the fix:
 *
 *   1. a readiness delay, so the load balancer deregisters this task before
 *      it stops answering (sized against `failureThreshold * periodSeconds`);
 *   2. `app.close()`, which stops accepting and completes in-flight requests;
 *   3. after a drain window, `closeAllConnections()`, which ends the SSE
 *      sockets — clients reconnect to a healthy task and replay from their
 *      `Last-Event-ID` cursor, so nothing is lost.
 */
const DRAIN_WINDOW_MS = 5_000;

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger('bootstrap');

  // Before `AppModule` is imported: the SDK is ESM-only and has to be loaded
  // dynamically, and its module has to exist before the decorator runs.
  await initObserve();
  const { AppModule } = await import('./app.module.js');

  const instrument = observeInstrument();
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    ...(instrument === undefined ? {} : { instrument }),
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  await app.get(OutboxNotifier).start();
  app.get(OutboxDispatcher).start();

  await app.listen(config.PORT);
  logger.log(
    `listening on ${config.PORT} (${config.RUNTIME_ENV})` +
      (observeEnabled() ? ' · observe: on' : ' · observe: off'),
  );

  // `getHttpServer()` is typed `any`. Narrowing through `instanceof` rather
  // than asserting keeps the type-assertion ban intact and fails loudly if a
  // future adapter stops returning a Node server.
  const maybeServer: unknown = app.getHttpServer();
  if (!(maybeServer instanceof Server)) {
    throw new Error('expected a Node http.Server; SSE draining needs closeAllConnections()');
  }
  const server = maybeServer;

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`${signal} received; draining`);

    await delay(config.SHUTDOWN_READINESS_DELAY_MS);
    const closed = app.close();
    await Promise.race([closed, delay(DRAIN_WINDOW_MS)]);
    server.closeAllConnections();
    await closed;

    logger.log('drained; exiting');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // A crashed process that keeps answering health checks is worse than a dead
  // one. Log and let the platform restart the task.
  process.on('uncaughtException', (error) => {
    logger.error(`uncaughtException: ${error.stack ?? error.message}`);
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`unhandledRejection: ${String(reason)}`);
    void shutdown('unhandledRejection');
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

void bootstrap();
