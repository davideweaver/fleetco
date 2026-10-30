import app from '@adonisjs/core/services/app';
import { Secret } from '@adonisjs/core/helpers';
import { defineConfig } from '@adonisjs/core/http';

/**
 * `appKey` is required by `@adonisjs/core`'s cookie and encryption services
 * even though this API issues no cookies — the `Response` class takes an
 * `Encryption` instance unconditionally. One generated value in `.env`.
 *
 * Reads `process.env` directly rather than importing `start/env.ts`'s typed
 * `env`, and that is a constraint discovered empirically, not a style choice:
 * `@adonisjs/config`'s loader (`@poppinss/utils`'s `fsImportAll`) dynamically
 * `import()`s every file in `config/` from inside `node_modules`, which Vite's
 * SSR module graph does not instrument the way it instruments our own
 * source files. A further relative import from a config file — even a
 * correct, nodenext-style `./start/env.js` — resolves under bare Node ESM
 * there, which has no `.ts` extension fallback, and the boot fails looking
 * for a literal `start/env.js` that only exists after `npm run build`. So
 * `config/*.ts` is a second, narrow exception to "process.env lives in
 * start/env.ts only" — see eslint.config.mjs and NOTES.md §2.
 */
export const appKey = new Secret(process.env['APP_KEY'] ?? '');

export const http = defineConfig({
  generateRequestId: true,
  allowMethodSpoofing: false,
  useAsyncLocalStorage: false,
  cookie: {
    domain: '',
    path: '/',
    maxAge: '2h',
    httpOnly: true,
    secure: app.inProduction,
    sameSite: 'lax',
  },
});
