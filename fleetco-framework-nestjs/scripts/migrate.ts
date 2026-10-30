import { loadConfig } from '../src/config';
import { createDatabase } from '../src/platform/db/client';
import { migrate } from '../src/platform/db/migrator';

/**
 * `npm run migrate` — a plain command the platform merely invokes
 * (ADR-022 rule 6), so it runs identically under EventBridge, a Kubernetes
 * Job, or a shell.
 */
async function main(): Promise<void> {
  const database = createDatabase(loadConfig().DATABASE_URL);
  try {
    const applied = await migrate(database.pool);
    process.stdout.write(
      applied.length === 0 ? 'no pending migrations\n' : `applied: ${applied.join(', ')}\n`,
    );
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
