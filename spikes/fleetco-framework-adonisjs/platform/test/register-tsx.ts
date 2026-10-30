import { register } from 'tsx/esm/api';

/**
 * Vitest `setupFiles` entry for the `integration` and `leak` projects only.
 *
 * AdonisJS's own bootstrap code — the RC file loader and `@adonisjs/config`'s
 * `fsImportAll` — issues bare `import(new URL('adonisrc.js', appRoot))` and
 * equivalent calls with a hardcoded `.js` extension, assuming either a
 * compiled `build/` output or a global Node loader hook that rewrites `.js`
 * to a sibling `.ts` file. `tsx`'s CLI provides exactly that hook, which is
 * why every one of these spikes' manual `tsx -e '...'` reproductions of the
 * boot sequence worked. Vitest's own SSR module runner (`vite-node`) does
 * not install that hook for bare imports issued from inside `node_modules`
 * — it only transforms modules it discovers by walking its own graph from a
 * test file — so without this, `app.rcFile.providers` comes back empty (the
 * RC loader treats "cannot find adonisrc.js" as "no rc file" and silently
 * falls back to defaults) and `FleetcoProvider` is never constructed.
 *
 * `tsx` is already on the dependency allowlist for exactly this class of
 * problem; this is its documented programmatic API
 * (https://tsx.is/node/esm-loader#programmatic-usage), not a new dependency
 * or a workaround outside the toolchain. See NOTES.md §2 for the full story,
 * discovered by reading `@adonisjs/application`'s and `@poppinss/utils`'s
 * compiled source rather than guessing from the error message.
 */
register();
