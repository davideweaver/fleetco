import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/platform/db/client.js';
import { loadMigrations, migrate } from '../src/platform/db/migrator.js';

/**
 * ADR-022 rule 6: scheduled and operational jobs are plain commands the
 * platform merely invokes. `npm run migrate` runs identically under
 * `docker run`, an ECS task, and a Kubernetes Job.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const database = openDatabase(loadConfig());
try {
  const ran = await migrate(database, await loadMigrations(root));
  process.stdout.write(ran.length === 0 ? 'no migrations to apply\n' : `applied: ${ran.join(', ')}\n`);
} finally {
  await closeDatabase(database);
}
