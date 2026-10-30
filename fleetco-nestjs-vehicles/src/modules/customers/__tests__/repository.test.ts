import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { firstValueFrom, timeout } from 'rxjs';

import { migrate } from '../../../platform/db/migrator';
import { drainOutbox, resetData, wire } from '../../../platform/test/harness';
import type { Wiring } from '../../../platform/test/harness';
import {
  FIXED_NOW,
  makeCreateCustomer,
  makeCustomer,
  makePortalPrincipal,
  makeStaffPrincipal,
  makeTenant,
} from '../../../platform/test/factories';
import { newCustomerId, toCents } from '../../../platform/types/branded';
import type { TenantId } from '../../../platform/types/branded';
import { Conflict, NotFound } from '../../../platform/types/errors';
import { scopeOf } from '../../../platform/types/scope';
import { customerTopic } from '../events';
import type { Customer } from '../contracts';

/**
 * Integration layer, against real Postgres in a container.
 * [[Testing Strategy]] § Integration: "Mocking the database hides precisely
 * the bugs that matter here" — a missing `tenant_id` predicate, a transaction
 * that does not actually roll back, an outbox row written outside the
 * transaction it was supposed to be atomic with.
 *
 * Note what the setup does *not* need: no `@nestjs/testing`, no module
 * metadata, no container. `wire()` is four `new` expressions. That is the
 * spike's testability answer for NestJS — the DI container is a bootstrap
 * concern, not a test-time one, as long as providers stay plain classes.
 */
const TENANT_A: TenantId = makeTenant();
const TENANT_B: TenantId = makeTenant();

let app: Wiring;

beforeAll(async () => {
  process.env.RUNTIME_ENV = 'integration';
  process.env.DATABASE_URL = inject('databaseUrl');
  app = wire(inject('databaseUrl'));
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetData(app.database);
});

describe('migrations', () => {
  it('are idempotent against an already-seeded database', async () => {
    await app.service.create(makeStaffPrincipal(TENANT_A), makeCreateCustomer());
    // The global setup already applied every migration to an empty database;
    // this asserts the second run is a no-op rather than an error, which is
    // what a redeploy does.
    expect(await migrate(app.database.pool)).toEqual([]);
  });
});

describe('tenant scoping', () => {
  it('hides another tenant’s customer from findById', async () => {
    const created = await app.service.create(makeStaffPrincipal(TENANT_A), makeCreateCustomer());
    const scopeB = scopeOf(makeStaffPrincipal(TENANT_B));
    expect(await app.customers.findById(scopeB, created.id)).toBeNull();
  });

  it('hides another tenant’s customer from findByCode', async () => {
    const created = await app.service.create(
      makeStaffPrincipal(TENANT_A),
      makeCreateCustomer({ code: 'SHARED' }),
    );
    const scopeB = scopeOf(makeStaffPrincipal(TENANT_B));
    expect(await app.customers.findByCode(scopeB, created.code)).toBeNull();
  });

  it('hides another tenant’s customers from list', async () => {
    await app.service.create(makeStaffPrincipal(TENANT_A), makeCreateCustomer());
    const page = await app.customers.list(scopeOf(makeStaffPrincipal(TENANT_B)), { limit: 25 });
    expect(page.items).toEqual([]);
  });

  it('refuses to update another tenant’s customer', async () => {
    const created = await app.service.create(makeStaffPrincipal(TENANT_A), makeCreateCustomer());
    await expect(
      app.service.update(makeStaffPrincipal(TENANT_B), created.id, { name: 'Hijacked' }),
    ).rejects.toThrow(NotFound);

    const unchanged = await app.customers.findById(scopeOf(makeStaffPrincipal(TENANT_A)), created.id);
    expect(unchanged?.name).toBe(created.name);
  });

  it('lets two tenants use the same customer code', async () => {
    const a = await app.service.create(
      makeStaffPrincipal(TENANT_A),
      makeCreateCustomer({ code: 'ACME' }),
    );
    const b = await app.service.create(
      makeStaffPrincipal(TENANT_B),
      makeCreateCustomer({ code: 'ACME' }),
    );
    expect(a.code).toBe('ACME');
    expect(b.code).toBe('ACME');
    expect(a.id).not.toBe(b.id);
  });

  it('refuses a duplicate code inside one tenant', async () => {
    const staff = makeStaffPrincipal(TENANT_A);
    await app.service.create(staff, makeCreateCustomer({ code: 'ACME' }));
    await expect(app.service.create(staff, makeCreateCustomer({ code: 'acme' }))).rejects.toThrow(
      Conflict,
    );
  });
});

describe('customer scoping — the portal case', () => {
  it('shows a portal principal only its own customer', async () => {
    const staff = makeStaffPrincipal(TENANT_A);
    const mine = await app.service.create(staff, makeCreateCustomer({ code: 'MINE' }));
    await app.service.create(staff, makeCreateCustomer({ code: 'THEIRS' }));

    const portal = makePortalPrincipal(TENANT_A, mine.id);
    const page = await app.customers.list(scopeOf(portal), { limit: 25 });
    expect(page.items.map((customer) => customer.code)).toEqual(['MINE']);
  });

  it('hides a sibling customer in the same tenant from findById', async () => {
    const staff = makeStaffPrincipal(TENANT_A);
    const mine = await app.service.create(staff, makeCreateCustomer({ code: 'MINE' }));
    const theirs = await app.service.create(staff, makeCreateCustomer({ code: 'THEIRS' }));

    const portal = makePortalPrincipal(TENANT_A, mine.id);
    expect(await app.customers.findById(scopeOf(portal), theirs.id)).toBeNull();
  });
});

describe('the outbox', () => {
  it('commits the customer row and its event in one transaction', async () => {
    const created = await app.service.create(makeStaffPrincipal(TENANT_A), makeCreateCustomer());

    const { rows } = await app.database.pool.query<{
      tenant_id: string;
      customer_id: string;
      name: string;
      topic: string;
      dispatched_at: Date | null;
    }>('SELECT tenant_id, customer_id, name, topic, dispatched_at FROM platform.outbox_events');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('customer.created');
    expect(rows[0]?.tenant_id).toBe(TENANT_A);
    expect(rows[0]?.customer_id).toBe(created.id);
    expect(rows[0]?.topic).toBe(customerTopic(TENANT_A, created.id));
    expect(rows[0]?.dispatched_at).toBeNull();
  });

  it('writes exactly one event per state change', async () => {
    const staff = makeStaffPrincipal(TENANT_A);
    const created = await app.service.create(staff, makeCreateCustomer());
    await app.service.update(staff, created.id, { name: 'Acme Trucking LLC' });
    await app.service.update(staff, created.id, { status: 'active' });

    const { rows } = await app.database.pool.query<{ name: string }>(
      'SELECT name FROM platform.outbox_events ORDER BY id',
    );
    expect(rows.map((row) => row.name)).toEqual([
      'customer.created',
      'customer.updated',
      'customer.status_changed',
    ]);
  });

  it('leaves neither row behind when the transaction rolls back', async () => {
    const staff = makeStaffPrincipal(TENANT_A);
    const customer = buildUnsaved(TENANT_A);

    await expect(
      app.customers.transaction(async (tx) => {
        await app.customers.insert(tx, customer);
        await app.outbox.append(tx, {
          tenantId: customer.tenantId,
          customerId: customer.id,
          topic: customerTopic(customer.tenantId, customer.id),
          name: 'customer.created',
          payload: {},
          occurredAt: FIXED_NOW,
        });
        throw new Error('deliberate failure after both writes');
      }),
    ).rejects.toThrow('deliberate failure');

    expect(await app.customers.findById(scopeOf(staff), customer.id)).toBeNull();
    const { rows } = await app.database.pool.query('SELECT 1 FROM platform.outbox_events');
    expect(rows).toHaveLength(0);
  });

  it('is invisible to the dispatcher until its transaction commits', async () => {
    const customer = buildUnsaved(TENANT_A);
    let claimedWhileOpen = -1;

    await app.customers.transaction(async (tx) => {
      await app.customers.insert(tx, customer);
      await app.outbox.append(tx, {
        tenantId: customer.tenantId,
        customerId: customer.id,
        topic: customerTopic(customer.tenantId, customer.id),
        name: 'customer.created',
        payload: {},
        occurredAt: FIXED_NOW,
      });
      // A concurrent dispatcher on a different connection cannot see this row,
      // which is why NOTIFY must wait for the commit.
      claimedWhileOpen = await app.dispatcher.tick();
    });

    expect(claimedWhileOpen).toBe(0);
    expect(await app.dispatcher.tick()).toBe(1);
  });

  it('does not redeliver a dispatched event', async () => {
    await app.service.create(makeStaffPrincipal(TENANT_A), makeCreateCustomer());
    expect(await app.dispatcher.tick()).toBe(1);
    expect(await app.dispatcher.tick()).toBe(0);
    expect(await app.outbox.countPending()).toBe(0);
  });
});

describe('the dispatcher under concurrency', () => {
  let other: Wiring;

  beforeEach(() => {
    other = wire(inject('databaseUrl'));
  });

  afterEach(async () => {
    await other.close();
  });

  it('hands disjoint rows to two workers with SKIP LOCKED, without blocking', async () => {
    const staff = makeStaffPrincipal(TENANT_A);
    for (let i = 0; i < 6; i += 1) {
      await app.service.create(staff, makeCreateCustomer());
    }

    let firstIds: number[] = [];
    let secondIds: number[] = [];
    let secondFinishedWhileFirstHeldLock = false;

    await Promise.all([
      app.customers.transaction(async (tx) => {
        firstIds = (await app.outbox.claimPending(tx, 3)).map((event) => event.id);
        await delay(400);
        secondFinishedWhileFirstHeldLock = secondIds.length > 0;
      }),
      delay(100).then(() =>
        other.customers.transaction(async (tx) => {
          secondIds = (await other.outbox.claimPending(tx, 3)).map((event) => event.id);
        }),
      ),
    ]);

    expect(firstIds).toHaveLength(3);
    expect(secondIds).toHaveLength(3);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    // The second worker did not wait for the first to commit — that is SKIP
    // LOCKED rather than row-level serialization.
    expect(secondFinishedWhileFirstHeldLock).toBe(true);
  });
});

describe('LISTEN/NOTIFY', () => {
  it('fires only after the dispatcher has committed the dispatch mark', async () => {
    await app.notifier.start();
    const created = await app.service.create(makeStaffPrincipal(TENANT_A), makeCreateCustomer());

    const arrived = firstValueFrom(app.notifier.notifications().pipe(timeout(5_000)));
    await app.dispatcher.tick();
    const notification = await arrived;

    expect(notification.tenantId).toBe(TENANT_A);
    expect(notification.topic).toBe(customerTopic(TENANT_A, created.id));

    // By the time the notification is observable, the row is committed as
    // dispatched on every other connection. A listener that woke earlier would
    // read a row it could not yet see.
    const { rows } = await app.database.pool.query<{ dispatched_at: Date | null }>(
      'SELECT dispatched_at FROM platform.outbox_events WHERE id = $1',
      [notification.id],
    );
    expect(rows[0]?.dispatched_at).not.toBeNull();
  });

  it('never fires for a rolled-back event', async () => {
    await app.notifier.start();
    const seen: number[] = [];
    const subscription = app.notifier
      .notifications()
      .subscribe((note) => seen.push(note.id));

    const customer = buildUnsaved(TENANT_A);
    await app.customers
      .transaction(async (tx) => {
        await app.customers.insert(tx, customer);
        await app.outbox.append(tx, {
          tenantId: customer.tenantId,
          customerId: customer.id,
          topic: customerTopic(customer.tenantId, customer.id),
          name: 'customer.created',
          payload: {},
          occurredAt: FIXED_NOW,
        });
        throw new Error('rolled back');
      })
      .catch(() => undefined);

    await drainOutbox(app.dispatcher);
    await delay(250);
    subscription.unsubscribe();
    expect(seen).toEqual([]);
  });
});

describe('the SSE stream', () => {
  it('replays from a cursor and then resumes live', async () => {
    await app.notifier.start();
    const staff = makeStaffPrincipal(TENANT_A);
    const created = await app.service.create(staff, makeCreateCustomer());
    await app.service.update(staff, created.id, { name: 'Acme Trucking LLC' });
    await drainOutbox(app.dispatcher);

    // Replay everything from the beginning of the stream.
    const stream = await app.service.streamFor(staff, created.id, 0);
    const received: string[] = [];
    const subscription = stream.subscribe((event) => received.push(event.name));

    // A live change after the subscription opened.
    await app.service.update(staff, created.id, { status: 'active' });
    await drainOutbox(app.dispatcher);
    await delay(400);
    subscription.unsubscribe();

    expect(received).toEqual([
      'customer.created',
      'customer.updated',
      'customer.status_changed',
    ]);
  });

  it('starts at the current cursor when no Last-Event-ID is supplied', async () => {
    await app.notifier.start();
    const staff = makeStaffPrincipal(TENANT_A);
    const created = await app.service.create(staff, makeCreateCustomer());
    await drainOutbox(app.dispatcher);

    const stream = await app.service.streamFor(staff, created.id, null);
    const received: string[] = [];
    const subscription = stream.subscribe((event) => received.push(event.name));
    await delay(200);
    subscription.unsubscribe();

    // `customer.created` already happened and is behind the cursor.
    expect(received).toEqual([]);
  });

  it('refuses a subscription the principal could not read over REST', async () => {
    const created = await app.service.create(makeStaffPrincipal(TENANT_A), makeCreateCustomer());
    await expect(
      app.service.streamFor(makeStaffPrincipal(TENANT_B), created.id, 0),
    ).rejects.toThrow(NotFound);
  });
});

describe('keyset pagination', () => {
  it('returns every customer exactly once across pages', async () => {
    const staff = makeStaffPrincipal(TENANT_A);
    const names = ['Delta', 'Alpha', 'Charlie', 'Echo', 'Bravo'];
    for (const name of names) {
      await app.service.create(staff, makeCreateCustomer({ name }));
    }

    const scope = scopeOf(staff);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await app.customers.list(
        scope,
        cursor === undefined ? { limit: 2 } : { limit: 2, cursor },
      );
      seen.push(...result.items.map((customer) => customer.name));
      if (result.nextCursor === null) break;
      cursor = result.nextCursor;
    }

    expect(seen).toEqual([...names].sort());
  });

  it('filters by status and by search term inside the tenant scope', async () => {
    const staff = makeStaffPrincipal(TENANT_A);
    const active = await app.service.create(staff, makeCreateCustomer({ name: 'Acme Trucking' }));
    await app.service.update(staff, active.id, { status: 'active' });
    await app.service.create(staff, makeCreateCustomer({ name: 'City Hauling' }));

    const scope = scopeOf(staff);
    expect((await app.customers.list(scope, { limit: 25, status: 'active' })).items).toHaveLength(1);
    expect((await app.customers.list(scope, { limit: 25, search: 'hauling' })).items).toHaveLength(1);
    expect((await app.customers.list(scope, { limit: 25, search: 'nothing' })).items).toHaveLength(0);
  });
});

/** A valid, unsaved customer value for the rollback tests. */
function buildUnsaved(tenantId: TenantId): Customer {
  return makeCustomer(tenantId, {
    id: newCustomerId(),
    creditLimitCents: toCents(100_000),
    defaultLaborRateCents: toCents(14_500),
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
