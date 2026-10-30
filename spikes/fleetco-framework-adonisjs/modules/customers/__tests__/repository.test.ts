import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { claimPending, countPending, markDispatched } from '../../../platform/outbox/repository.js';
import { transactor } from '../../../platform/db/client.js';
import { startHarness, stopHarness } from '../../../platform/test/harness.js';
import {
  FROZEN_NOW,
  makeCreateCustomer,
  makeCustomer,
  makeTenant,
  portalPrincipal,
  staffPrincipal,
} from '../../../platform/test/factories.js';
import { toCents, toInstant } from '../../../platform/types/branded.js';
import type { TenantId } from '../../../platform/types/branded.js';
import { createCustomerStore } from '../repository.js';
import type { CustomerStore } from '../repository.js';
import { customerTopic } from '../events.js';

/**
 * Integration, against real Postgres and never a mock
 * ([[Testing Strategy]] § Integration). Every repository method asserts tenant
 * scoping, and the outbox gets the two atomicity tests the document names
 * explicitly:
 *
 *   - "state change and outbox row commit atomically, and a rollback leaves
 *     neither"
 *   - "`SKIP LOCKED` behaviour with concurrent workers"
 *
 * The schema comes from the real migration files, run from scratch by the
 * harness, which doubles as a migration test. This file does not touch
 * AdonisJS at all beyond booting it — `store` and `harness.wiring.customers`
 * are the same framework-independent values the Fastify spike tests.
 */
let harness: Awaited<ReturnType<typeof startHarness>>;
let store: CustomerStore;
let tenantA: TenantId;
let tenantB: TenantId;

beforeAll(async () => {
  harness = await startHarness();
  store = createCustomerStore(harness.wiring.database);
});

afterAll(async () => {
  await stopHarness(harness);
});

beforeEach(async () => {
  await harness.reset();
  tenantA = makeTenant().tenantId;
  tenantB = makeTenant().tenantId;
});

const scopeOfTenant = (tenantId: TenantId) => ({ tenantId, customerId: null });

describe('the migrations', () => {
  it('apply from empty and are idempotent on a second run', async () => {
    const { rows } = await harness.wiring.database.pool.query<{ name: string }>(
      'select name from platform.schema_migrations order by name',
    );
    expect(rows.map((row) => row.name)).toEqual(['0001_platform_outbox.sql', '0002_customers.sql']);
  });

  it('puts tenant_id on every domain table', async () => {
    // [[Tenancy Model]] non-negotiable 1, as the test the standards doc asks
    // for: "a test enumerating tables; fails if one lacks it". It reads the
    // live catalog rather than a hand-kept list, so a new table added without
    // `tenant_id` fails here without anybody remembering to update the test.
    const { rows } = await harness.wiring.database.pool.query<{
      table_schema: string;
      table_name: string;
    }>(
      `select t.table_schema, t.table_name
         from information_schema.tables t
        where t.table_schema in ('customers', 'platform')
          and t.table_type = 'BASE TABLE'
          and t.table_name <> 'schema_migrations'
          and not exists (
            select 1 from information_schema.columns c
             where c.table_schema = t.table_schema
               and c.table_name = t.table_name
               and c.column_name = 'tenant_id'
          )`,
    );
    expect(rows).toEqual([]);
  });
});

describe('tenant scoping', () => {
  it('hides another tenant’s customer from findById', async () => {
    const theirs = makeCustomer(tenantB);
    await store.inTransaction((tx) => tx.insert(scopeOfTenant(tenantB), theirs));

    expect(await store.findById(scopeOfTenant(tenantB), theirs.id)).not.toBeNull();
    expect(await store.findById(scopeOfTenant(tenantA), theirs.id)).toBeNull();
  });

  it('hides another tenant’s customer from findByCode', async () => {
    await store.inTransaction((tx) =>
      tx.insert(scopeOfTenant(tenantB), makeCustomer(tenantB, { code: 'ACME' })),
    );
    expect(await store.findByCode(scopeOfTenant(tenantA), 'ACME')).toBeNull();
  });

  it('hides another tenant’s customers from list', async () => {
    await store.inTransaction(async (tx) => {
      await tx.insert(scopeOfTenant(tenantA), makeCustomer(tenantA, { code: 'MINE' }));
      await tx.insert(scopeOfTenant(tenantB), makeCustomer(tenantB, { code: 'THEIRS' }));
    });
    const page = await store.list(scopeOfTenant(tenantA), { limit: 25 });
    expect(page.items.map((customer) => customer.code)).toEqual(['MINE']);
  });

  it('narrows list to one row for a portal scope', async () => {
    const mine = makeCustomer(tenantA, { code: 'ACME', name: 'Acme' });
    const sibling = makeCustomer(tenantA, { code: 'CITY', name: 'City' });
    await store.inTransaction(async (tx) => {
      await tx.insert(scopeOfTenant(tenantA), mine);
      await tx.insert(scopeOfTenant(tenantA), sibling);
    });
    const page = await store.list({ tenantId: tenantA, customerId: mine.id }, { limit: 25 });
    expect(page.items.map((customer) => customer.id)).toEqual([mine.id]);
  });

  it('refuses to update another tenant’s row', async () => {
    const theirs = makeCustomer(tenantB, { status: 'active' });
    await store.inTransaction((tx) => tx.insert(scopeOfTenant(tenantB), theirs));

    const result = await store.inTransaction((tx) =>
      tx.update(scopeOfTenant(tenantA), theirs.id, {
        name: 'Hijacked',
        status: 'inactive',
        creditLimitCents: toCents(1),
        defaultLaborRateCents: toCents(1),
        billingTermsNetDays: 0,
        isOnCreditHold: false,
        primaryContactEmail: null,
        primaryContactPhone: null,
        updatedAt: FROZEN_NOW,
      }),
    );
    expect(result).toBeNull();

    const untouched = await store.findById(scopeOfTenant(tenantB), theirs.id);
    expect(untouched?.name).toBe(theirs.name);
  });

  it('writes tenant_id from the scope, not from the value handed in', async () => {
    // A service that built a customer stamped with the wrong tenant cannot
    // persist it: the repository overwrites the column from the scope.
    const mislabelled = makeCustomer(tenantB);
    await store.inTransaction((tx) => tx.insert(scopeOfTenant(tenantA), mislabelled));

    expect(await store.findById(scopeOfTenant(tenantB), mislabelled.id)).toBeNull();
    expect(await store.findById(scopeOfTenant(tenantA), mislabelled.id)).not.toBeNull();
  });
});

describe('keyset pagination', () => {
  it('walks every row exactly once across pages', async () => {
    const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'];
    await store.inTransaction(async (tx) => {
      for (const [index, name] of names.entries()) {
        await tx.insert(scopeOfTenant(tenantA), makeCustomer(tenantA, { code: `C${index}`, name }));
      }
    });

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await store.list(scopeOfTenant(tenantA), {
        limit: 2,
        ...(cursor === undefined ? {} : { cursor }),
      });
      seen.push(...result.items.map((customer) => customer.name));
      if (result.nextCursor === null) break;
      cursor = result.nextCursor;
    }
    expect(seen).toEqual(names);
  });

  it('survives a name containing the characters a delimited cursor would split on', async () => {
    await store.inTransaction(async (tx) => {
      await tx.insert(scopeOfTenant(tenantA), makeCustomer(tenantA, { code: 'WEST', name: 'ACME | WEST' }));
      await tx.insert(scopeOfTenant(tenantA), makeCustomer(tenantA, { code: 'EAST', name: 'ACME | EAST' }));
    });
    const first = await store.list(scopeOfTenant(tenantA), { limit: 1 });
    expect(first.nextCursor).not.toBeNull();
    const second = await store.list(scopeOfTenant(tenantA), {
      limit: 1,
      cursor: first.nextCursor ?? '',
    });
    expect(second.items[0]?.name).toBe('ACME | WEST');
  });
});

describe('the database constraints', () => {
  it('refuses a duplicate code within a tenant', async () => {
    await store.inTransaction((tx) => tx.insert(scopeOfTenant(tenantA), makeCustomer(tenantA, { code: 'ACME' })));
    await expect(
      store.inTransaction((tx) => tx.insert(scopeOfTenant(tenantA), makeCustomer(tenantA, { code: 'ACME' }))),
    ).rejects.toThrow();
  });

  it('allows the same code in two different tenants', async () => {
    await store.inTransaction((tx) => tx.insert(scopeOfTenant(tenantA), makeCustomer(tenantA, { code: 'ACME' })));
    await expect(
      store.inTransaction((tx) => tx.insert(scopeOfTenant(tenantB), makeCustomer(tenantB, { code: 'ACME' }))),
    ).resolves.toBeUndefined();
  });

  it('refuses a negative credit limit even if the service is bypassed', async () => {
    await expect(
      store.inTransaction((tx) =>
        tx.insert(scopeOfTenant(tenantA), makeCustomer(tenantA, { creditLimitCents: toCents(-1) })),
      ),
    ).rejects.toThrow();
  });
});

describe('the outbox', () => {
  it('commits the state change and the event together', async () => {
    const principal = staffPrincipal(tenantA);
    const created = await harness.wiring.customers.create(principal, makeCreateCustomer());

    expect(await store.findById(scopeOfTenant(tenantA), created.id)).not.toBeNull();
    const { rows } = await harness.wiring.database.pool.query<{ name: string; topic: string }>(
      'select name, topic from platform.outbox_events where customer_id = $1',
      [created.id],
    );
    expect(rows).toEqual([{ name: 'customer.created', topic: customerTopic(tenantA, created.id) }]);
  });

  it('leaves neither behind when the transaction rolls back', async () => {
    const principal = staffPrincipal(tenantA);
    await harness.wiring.customers.create(principal, makeCreateCustomer({ code: 'ACME' }));
    const before = await countPending(harness.wiring.database.drizzle);

    // The second create hits the per-tenant unique index inside the
    // transaction, after the outbox append would have been queued.
    //
    // Asserting on `.kind` rather than `rejects.toThrow(Conflict)`: this
    // error is thrown from inside the real, container-booted AdonisJS
    // application, and AdonisJS's own bootstrap imports this file's `Conflict`
    // class through a path Vitest's SSR module graph does not unify with this
    // test file's own `import` — see NOTES.md §2. `instanceof` across that
    // boundary is unreliable; the structural `kind` field is not.
    const result: unknown = await harness.wiring.customers
      .create(principal, makeCreateCustomer({ code: 'ACME' }))
      .catch((error: unknown) => error);
    expect(result).toMatchObject({ kind: 'Conflict' });

    const { rows } = await harness.wiring.database.pool.query<{ count: string }>(
      'select count(*)::text as count from customers.customers where tenant_id = $1',
      [tenantA],
    );
    expect(rows[0]?.count).toBe('1');
    expect(await countPending(harness.wiring.database.drizzle)).toBe(before);
  });

  it('claims disjoint batches under concurrent SKIP LOCKED workers', async () => {
    const principal = staffPrincipal(tenantA);
    for (const code of ['AAA', 'BBB', 'CCC', 'DDD']) {
      await harness.wiring.customers.create(principal, makeCreateCustomer({ code }));
    }

    const transaction = transactor(harness.wiring.database);

    // Two workers hold their claims open at the same time. With SKIP LOCKED
    // neither blocks and neither sees the other's rows; without it, one would
    // either block or double-dispatch.
    const release: { resolve: () => void } = { resolve: (): void => undefined };
    const gate = new Promise<void>((resolve) => {
      release.resolve = resolve;
    });

    const workerA = transaction(async (exec) => {
      const claimed = await claimPending(exec, 2);
      await gate;
      return claimed.map((event) => event.id);
    });
    const workerB = transaction(async (exec) => {
      // Let A take its lock first, then claim without waiting on it.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const claimed = await claimPending(exec, 2);
      release.resolve();
      return claimed.map((event) => event.id);
    });

    const [idsA, idsB] = await Promise.all([workerA, workerB]);
    expect(idsA).toHaveLength(2);
    expect(idsB).toHaveLength(2);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
  });

  it('is only replayable once dispatched, and never past a gap', async () => {
    const principal = staffPrincipal(tenantA);
    const first = await harness.wiring.customers.create(principal, makeCreateCustomer({ code: 'AAA' }));
    const second = await harness.wiring.customers.create(principal, makeCreateCustomer({ code: 'BBB' }));
    const scope = scopeOfTenant(tenantA);

    // Nothing is visible before the dispatcher runs.
    expect(await store.readTopicSince(scope, customerTopic(tenantA, first.id), 0, 10)).toEqual([]);

    // Mark only the *second* row dispatched, leaving a hole beneath it. A
    // reader that accepted it would advance its cursor past the first row and
    // lose it permanently — the one failure replay exists to prevent.
    const ids = await transactor(harness.wiring.database)(async (exec) => {
      const pending = await claimPending(exec, 10);
      const secondRow = pending.find((event) => event.customerId === second.id);
      await markDispatched(exec, secondRow === undefined ? [] : [secondRow.id], FROZEN_NOW);
      return pending.map((event) => event.id);
    });
    expect(ids).toHaveLength(2);

    expect(await store.readTopicSince(scope, customerTopic(tenantA, second.id), 0, 10)).toEqual([]);
    expect(await store.currentCursor(scope, customerTopic(tenantA, second.id))).toBe(0);

    // Once the hole is filled, both become visible.
    await transactor(harness.wiring.database)((exec) => markDispatched(exec, ids, FROZEN_NOW));
    const replayed = await store.readTopicSince(scope, customerTopic(tenantA, second.id), 0, 10);
    expect(replayed.map((event) => event.name)).toEqual(['customer.created']);
  });

  it('scopes replay to the subscriber’s own tenant and customer', async () => {
    const mine = await harness.wiring.customers.create(
      staffPrincipal(tenantA),
      makeCreateCustomer({ code: 'ACME' }),
    );
    const sibling = await harness.wiring.customers.create(
      staffPrincipal(tenantA),
      makeCreateCustomer({ code: 'CITY' }),
    );
    await harness.wiring.dispatcher.tick();

    const portal = portalPrincipal(tenantA, mine.id);
    const portalScope = { tenantId: portal.tenantId, customerId: mine.id };

    expect(await store.readTopicSince(portalScope, customerTopic(tenantA, mine.id), 0, 10)).toHaveLength(1);
    // The sibling's topic, requested with the portal scope, yields nothing.
    expect(await store.readTopicSince(portalScope, customerTopic(tenantA, sibling.id), 0, 10)).toEqual([]);
  });

  it('records the event time from the injected clock', async () => {
    const created = await harness.wiring.customers.create(staffPrincipal(tenantA), makeCreateCustomer());
    await harness.wiring.dispatcher.tick();
    const [event] = await store.readTopicSince(scopeOfTenant(tenantA), customerTopic(tenantA, created.id), 0, 10);
    expect(event?.occurredAt).toBe(toInstant(FROZEN_NOW));
  });
});
