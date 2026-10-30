import { cpSync, existsSync } from 'node:fs';

/**
 * `tsc` copies TypeScript output and nothing else, so the migrations would be
 * missing from `dist/`. The Dockerfile already copies them; this makes
 * `npm run build && npm start` work the same way outside a container, which is
 * ADR-022 rule 1's "the image that runs in production must run under
 * `docker run` locally" read in the other direction.
 *
 * A plain node script rather than `copyfiles` (which `authors-api` used for its
 * `.graphql` files): the dependency allowlist's default answer is no, and
 * `cpSync` has been in Node since 16.
 */
const directories = [
  'src/lib/outbox/migrations',
  'src/modules/customers/migrations',
];

for (const directory of directories) {
  if (!existsSync(directory)) {
    throw new Error(`Missing migrations directory: ${directory}`);
  }
  cpSync(directory, `dist/${directory}`, { recursive: true });
  process.stdout.write(`copied ${directory}\n`);
}
