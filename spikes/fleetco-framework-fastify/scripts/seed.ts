import { loadConfig } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/platform/db/client.js';
import { createCustomerStore } from '../src/modules/customers/index.js';
import { makeTenant, seedTenant } from '../src/platform/test/factories.js';

/**
 * [[Testing Strategy]] § Test Data: "the same factories seed local
 * development, so the realistic dataset and the test fixtures never diverge."
 * This script is that sentence, honoured.
 */
const config = loadConfig();
if (config.RUNTIME_ENV === 'production') {
  throw new Error('refusing to seed a production database');
}

const database = openDatabase(config);
try {
  const store = createCustomerStore(database);
  const tenant = makeTenant();
  const seeded = await seedTenant(store, tenant);
  process.stdout.write(
    `seeded tenant ${tenant.tenantId} with ${seeded.length} customers: ${seeded
      .map((customer) => customer.code)
      .join(', ')}\n`,
  );
} finally {
  await closeDatabase(database);
}
