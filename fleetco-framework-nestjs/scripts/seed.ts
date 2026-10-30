import { loadConfig } from '../src/config';
import { createDatabase } from '../src/platform/db/client';
import { migrate } from '../src/platform/db/migrator';
import { CustomersRepository } from '../src/modules/customers/repository';
import { CustomersService } from '../src/modules/customers/service';
import { OutboxNotifier } from '../src/platform/outbox/notifier';
import { OutboxRepository } from '../src/platform/outbox/repository';
import {
  makeCreateCustomer,
  makeStaffPrincipal,
  makeTenant,
} from '../src/platform/test/factories';
import { systemClock } from '../src/platform/types/clock';

/**
 * `npm run seed` — local development data, built from **the same factories the
 * tests use** ([[Testing Strategy]] § Test Data: "the realistic dataset and
 * the test fixtures never diverge").
 *
 * Two tenants, two customers each, which is also the shape the leak suite
 * seeds. Running the app against the same data the leak tests run against is
 * the cheapest way to notice a scoping bug by hand.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  if (config.RUNTIME_ENV === 'production') {
    throw new Error('refusing to seed a production database');
  }

  const database = createDatabase(config.DATABASE_URL);
  try {
    await migrate(database.pool);

    const customers = new CustomersRepository(database.db);
    const outbox = new OutboxRepository(database.db);
    const service = new CustomersService(
      customers,
      outbox,
      new OutboxNotifier(database),
      systemClock,
    );

    for (const [tenantIndex, names] of [
      ['Acme Trucking', 'City Hauling'],
      ['Regional Hospital', 'Keystone Freight'],
    ].entries()) {
      const staff = makeStaffPrincipal(makeTenant());
      for (const name of names) {
        const created = await service.create(staff, makeCreateCustomer({ name }));
        process.stdout.write(`tenant ${tenantIndex + 1}: ${created.code} ${created.name}\n`);
      }
    }
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
