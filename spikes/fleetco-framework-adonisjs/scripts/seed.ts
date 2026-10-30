import { loadConfig } from '../platform/config.js';
import { closeDatabase, openDatabase } from '../platform/db/client.js';
import { createCustomerStore } from '../modules/customers/index.js';
import { makeTenant, seedTenant } from '../platform/test/factories.js';

/**
 * [[Testing Strategy]] § Test Data: "the same factories seed local
 * development, so the realistic dataset and the test fixtures never diverge."
 * This script is that sentence, honoured. No AdonisJS boot needed — seeding
 * is a repository write, not an HTTP concern.
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
