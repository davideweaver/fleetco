import app from './app/index.js';
import { extractErrorMessage } from './lib/logging/logger.js';

/**
 * The entrypoint, unchanged from `authors-api`: start the application, and if
 * starting throws, report it and exit non-zero.
 *
 * Four lines, because every decision about *what* starts and in what order
 * lives in `app/index.ts`, and everything about signals, draining and exit
 * codes lives in `lib/app/Process.ts`.
 */
export default app.start().catch((err: unknown) => {
  app.exitWithError('Error during start()', extractErrorMessage(err));
});
