import { App } from '../src/app/index.js';

/**
 * ADR-022 rule 6: scheduled and one-off jobs are plain commands the platform
 * merely invokes, so they run identically under EventBridge, a Kubernetes Job,
 * or a laptop.
 *
 * It boots only `DbModule` rather than the whole `App`, which is the lifecycle
 * pattern paying off: the modules are independent objects, so "the migration
 * step" is two method calls and does not open a port.
 */
const app = new App();

await app.db.init();
await app.db.close();

process.stdout.write('Migrations complete\n');
