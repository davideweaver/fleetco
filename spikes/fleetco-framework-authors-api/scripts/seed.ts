import { App } from '../src/app/index.js';
import {
  makeCreateCustomer,
  makeTenantId,
} from '../src/lib/test/factories.js';
import { makeScope } from '../src/lib/test/factories.js';

/**
 * Local development data, **from the same factories the tests use**
 * ([[Testing Strategy]] § Test Data: "the same factories seed local
 * development, so the realistic dataset and the test fixtures never diverge").
 *
 * Two tenants, two fleets each — the same shape the leak suite seeds, so a
 * developer poking at the API by hand is looking at the data the gate runs
 * against.
 */
const app = new App();
await app.db.init();

const tenants = [makeTenantId(1), makeTenantId(2)];
const fleets = [
  { code: 'ACME', name: 'Acme Trucking' },
  { code: 'CITY', name: 'City Hauling' },
];

for (const tenantId of tenants) {
  for (const fleet of fleets) {
    const created = await app.customers.service.create(
      makeScope(tenantId),
      makeCreateCustomer(fleet),
    );
    process.stdout.write(`${tenantId} ${created.code} ${created.id}\n`);
  }
}

await app.db.close();
