/*
|--------------------------------------------------------------------------
| HTTP server entrypoint
|--------------------------------------------------------------------------
|
| ADR-022 rule 7 (graceful shutdown, SSE draining included) is handled
| entirely by `providers/fleetco_provider.ts` via the Ignitor's own
| `shutdown()` lifecycle hook — there is no hand-rolled
| `process.on('SIGTERM', ...)` dance here the way there is in the Fastify
| spike's `main.ts`. See NOTES.md §2.
|
| The three `void` operators below are the one change from the slim starter
| kit's generated file: the stock file does not pass this repo's
| `strictTypeChecked` ESLint config as generated.
| `app.listen('SIGTERM', () => app.terminate())` hands a `Promise`-returning
| callback to an API typed to expect `void` back, and `prettyPrintError`
| (called bare in the stock `.catch()`) returns `Promise<void>` too. Neither
| is a bug — both fire-and-forget calls are fine here — but
| `@typescript-eslint/no-misused-promises` and `no-floating-promises` cannot
| tell "fine to ignore" from "forgot to await" without the explicit marker.
| Worth recording because it means AdonisJS's own generated entrypoint does
| not satisfy this kind of agent-oriented lint config out of the box. See
| NOTES.md §2.
*/

import 'reflect-metadata';
import { Ignitor, prettyPrintError } from '@adonisjs/core';

const APP_ROOT = new URL('../', import.meta.url);

const IMPORTER = (filePath: string): Promise<unknown> => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href);
  }
  return import(filePath);
};

new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((app) => {
    app.booting(async () => {
      await import('../start/env.js');
    });
    app.listen('SIGTERM', () => void app.terminate());
    app.listenIf(app.managedByPm2, 'SIGINT', () => void app.terminate());
  })
  .httpServer()
  .start()
  .catch((error: unknown) => {
    process.exitCode = 1;
    void prettyPrintError(error);
  });
