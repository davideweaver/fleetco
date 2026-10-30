import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadConfig } from '../src/config';
import { createDatabase } from '../src/platform/db/client';
import { migrate } from '../src/platform/db/migrator';
import { CustomersRepository } from '../src/modules/customers/repository';
import { CustomersService } from '../src/modules/customers/service';
import { VehiclesRepository } from '../src/modules/vehicles/repository';
import { VehiclesService } from '../src/modules/vehicles/service';
import {
  WorkOrderLinesRepository,
  WorkOrdersRepository,
} from '../src/modules/workorders/repository';
import { WorkOrdersService } from '../src/modules/workorders/service';
import { OutboxNotifier } from '../src/platform/outbox/notifier';
import { OutboxRepository } from '../src/platform/outbox/repository';
import {
  makeAddLine,
  makeCreateCustomer,
  makeCreateVehicle,
  makeCreateWorkOrder,
  makeStaffPrincipal,
  makeTenant,
} from '../src/platform/test/factories';
import { systemClock } from '../src/platform/types/clock';
import { toCents } from '../src/platform/types/branded';

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
    const notifier = new OutboxNotifier(database);
    const service = new CustomersService(
      customers,
      outbox,
      notifier,
      systemClock,
    );

    /**
     * Machine-readable principals for the UI harness in `ui/`.
     *
     * This is seed *output*, like the lines printed below — not an API
     * endpoint. The API deliberately has no "list tenants" route, because a
     * tenant is something a principal has, never something a caller picks.
     */
    const presets: {
      label: string;
      tenantId: string;
      userId: string;
      customers: { id: string; code: string; name: string }[];
    }[] = [];

    const vehiclesRepo = new VehiclesRepository(database.db);
    const vehicles = new VehiclesService(vehiclesRepo, service, outbox, notifier, systemClock);

    const ordersRepo = new WorkOrdersRepository(database.db);
    const linesRepo = new WorkOrderLinesRepository(database.db);
    const orders = new WorkOrdersService(
      ordersRepo,
      linesRepo,
      service,
      vehicles,
      outbox,
      notifier,
      systemClock,
    );
    let orderNumber = 1000;

    for (const [tenantIndex, names] of [
      ['Acme Trucking', 'City Hauling'],
      ['Regional Hospital', 'Keystone Freight'],
    ].entries()) {
      const tenantId = makeTenant();
      const staff = makeStaffPrincipal(tenantId);

      // The tenant id and a ready-to-paste principal are printed because
      // identity is header-asserted in the spike and the previous version of
      // this script made you go to psql to drive the API by hand.
      process.stdout.write(`\ntenant ${tenantIndex + 1}: ${tenantId}\n`);
      process.stdout.write(`  principal: ${JSON.stringify(staff)}\n`);

      const preset = {
        label: `tenant ${tenantIndex + 1} — ${names[0] ?? ''}`,
        tenantId,
        userId: staff.userId,
        customers: [] as { id: string; code: string; name: string }[],
      };
      presets.push(preset);

      for (const name of names) {
        const created = await service.create(staff, makeCreateCustomer({ name }));
        const active = await service.update(staff, created.id, { status: 'active' });
        process.stdout.write(`  customer ${active.code} ${active.name} (${active.id})\n`);
        preset.customers.push({ id: active.id, code: active.code, name: active.name });

        // Two trucks per fleet, one of them cleared for service, so the
        // cross-module activation rule is exercised by the seed itself.
        for (const unit of ['TRK-101', 'TRK-102']) {
          const vehicle = await vehicles.create(
            staff,
            makeCreateVehicle(active.id, { unitNumber: unit }),
          );
          const final =
            unit === 'TRK-101'
              ? await vehicles.update(staff, vehicle.id, { status: 'active' })
              : vehicle;
          process.stdout.write(
            `    vehicle ${final.unitNumber} ${final.vin} ${final.status} (${final.id})\n`,
          );

          // One work order per unit, so the harness has something to open:
          // the active unit's order is authorized, the parked unit's is a
          // draft with no lines — which is the state that cannot be
          // authorized, and the most useful thing to poke at.
          orderNumber += 1;
          const order = await orders.create(
            staff,
            makeCreateWorkOrder(final.id, { number: `RO-${orderNumber}` }),
          );
          if (unit === 'TRK-101') {
            await orders.addLine(staff, order.id, makeAddLine());
            await orders.addLine(
              staff,
              order.id,
              makeAddLine({
                kind: 'part',
                description: 'Air dryer cartridge',
                quantity: 100,
                unitPriceCents: toCents(8_000),
              }),
            );
            const authorized = await orders.update(staff, order.id, { status: 'authorized' });
            process.stdout.write(
              `      work order ${authorized.number} ${authorized.status} ` +
                `$${(authorized.totalCents / 100).toFixed(2)}\n`,
            );
          } else {
            process.stdout.write(`      work order ${order.number} ${order.status} (no lines)\n`);
          }
        }
      }
    }
    const uiPresets = join(__dirname, '..', 'ui', 'public', 'dev-principals.json');
    writeFileSync(uiPresets, `${JSON.stringify(presets, null, 2)}\n`);
    process.stdout.write(`\nwrote ${uiPresets}\n`);
  } finally {
    await database.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
