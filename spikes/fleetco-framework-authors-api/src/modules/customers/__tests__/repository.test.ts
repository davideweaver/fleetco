import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { request, startHarness, type Harness } from '../../../lib/test/harness.js';
import { claimPending } from '../../../lib/outbox/repository.js';
import { createCustomersRepository } from '../repository.js';
import {
  makeCreateCustomer,
  makeCustomerId,
  makePortalPrincipal,
  makeScope,
  makeStaffPrincipal,
  makeTenantId,
} from '../../../lib/test/factories.js';
import { toCents } from '../../../lib/types/branded.js';
import type { Customer } from '../contracts.js';

/**
 * Integration, against real Postgres, through the real migrations.
 *
 * [[Testing Strategy]] § Integration lists what must be covered here, and each
 * `describe` below is one of its bullets:
 *
 *  - every repository method, asserting tenant scoping is applied
 *  - the outbox: state change and outbox row commit atomically, and a rollback
 *    leaves neither
 *  - the dispatcher: `SKIP LOCKED` with concurrent workers, idempotent
 *    redelivery
 *  - migrations apply cleanly from empty
 *
 * The harness boots a real `App`, so the schema in this database was built by
 * `0001_platform_outbox.sql` and `0002_customers.sql` running from scratch —
 * which makes every test in this file also a migration test, exactly as the
 * document intends.
 */

const TENANT_A = makeTenantId(1);
const TENANT_B = makeTenantId(2);

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, 180_000);

afterAll(async () => {
  await harness.stop();
});

beforeEach(async () => {
  await harness.truncate();
});

function service() {
  return harness.app.customers.service;
}

async function outboxRows(): Promise<
  { id: number; tenant_id: string; customer_id: string | null; name: string; dispatched_at: Date | null }[]
> {
  const result = await harness.app.db.handle.execute<{
    id: number;
    tenant_id: string;
    customer_id: string | null;
    name: string;
    dispatched_at: Date | null;
  }>(sql`select id, tenant_id, customer_id, name, dispatched_at from platform.outbox order by id`);
  return result.rows;
}

// ---------------------------------------------------------------------------
// Scoping
// ---------------------------------------------------------------------------

describe('tenant scoping', () => {
  it('does not return another tenant’s customer by id', async () => {
    const created = await service().create(makeScope(TENANT_A), makeCreateCustomer());

    await expect(service().get(makeScope(TENANT_B), created.id)).rejects.toThrow(/not found/i);
  });

  it('does not list another tenant’s customers', async () => {
    await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'AAA' }));
    await service().create(makeScope(TENANT_B), makeCreateCustomer({ code: 'BBB' }));

    const page = await service().list(makeScope(TENANT_A), { limit: 25 });

    expect(page.items.map((customer) => customer.code)).toEqual(['AAA']);
  });

  it('does not update another tenant’s customer', async () => {
    const created = await service().create(makeScope(TENANT_A), makeCreateCustomer());

    await expect(
      service().update(makeScope(TENANT_B), created.id, { name: 'Taken over' }),
    ).rejects.toThrow(/not found/i);

    // And the row is untouched, not merely the response refused.
    const unchanged = await service().get(makeScope(TENANT_A), created.id);
    expect(unchanged.name).toBe('Acme Trucking');
  });

  it('restricts a portal scope to its own customer inside the same tenant', async () => {
    const mine = await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'MINE' }));
    const theirs = await service().create(
      makeScope(TENANT_A),
      makeCreateCustomer({ code: 'THEIRS' }),
    );

    const portalScope = makeScope(TENANT_A, mine.id);

    await expect(service().get(portalScope, mine.id)).resolves.toMatchObject({ code: 'MINE' });
    await expect(service().get(portalScope, theirs.id)).rejects.toThrow(/not found/i);

    const page = await service().list(portalScope, { limit: 25 });
    expect(page.items.map((customer) => customer.code)).toEqual(['MINE']);
  });

  it('scopes uniqueness per tenant, so two tenants may both use one code', async () => {
    await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'ACME' }));

    await expect(
      service().create(makeScope(TENANT_B), makeCreateCustomer({ code: 'ACME' })),
    ).resolves.toMatchObject({ code: 'ACME', tenantId: TENANT_B });
  });

  it('refuses a duplicate code within one tenant', async () => {
    await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'ACME' }));

    await expect(
      service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'acme' })),
    ).rejects.toThrow(/already exists/i);
  });
});

// ---------------------------------------------------------------------------
// The outbox transaction
// ---------------------------------------------------------------------------

describe('the outbox transaction', () => {
  it('commits the customer and its event together', async () => {
    const created = await service().create(makeScope(TENANT_A), makeCreateCustomer());

    const rows = await outboxRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('customer.created');
    expect(rows[0]?.tenant_id).toBe(TENANT_A);
    expect(rows[0]?.customer_id).toBe(created.id);
    expect(rows[0]?.dispatched_at).toBeNull();
  });

  it('leaves neither behind when the insert fails', async () => {
    await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'ACME' }));
    const before = await outboxRows();

    // The unique index on (tenant_id, code) aborts the transaction after the
    // event row has already been appended inside it. If the two were not
    // atomic, this is where a phantom event would appear.
    await expect(
      service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'ACME' })),
    ).rejects.toThrow(/already exists/i);

    expect(await outboxRows()).toHaveLength(before.length);
  });

  it('writes exactly one event per update, not one per changed field', async () => {
    const created = await service().create(makeScope(TENANT_A), makeCreateCustomer());

    await service().update(makeScope(TENANT_A), created.id, {
      name: 'Acme Trucking LLC',
      creditLimitCents: toCents(900_000),
      billingTermsNetDays: 45,
    });

    const rows = await outboxRows();
    expect(rows.map((row) => row.name)).toEqual(['customer.created', 'customer.updated']);
  });

  it('refuses an update prepared against a row that has since changed', async () => {
    const created = await service().create(makeScope(TENANT_A), makeCreateCustomer());
    const repository = createCustomersRepository(harness.app.db.handle);

    // Move `updated_at` out from under the next write, the way a concurrent
    // writer would.
    await harness.app.db.handle.execute(
      sql`update customers.customers set updated_at = now() + interval '1 second' where id = ${created.id}`,
    );

    const applied = await repository.applyUpdate(
      makeScope(TENANT_A),
      created.id,
      // The timestamp the caller read, which is no longer the row's.
      created.updatedAt,
      { name: 'Stale writer', updatedAt: created.updatedAt },
      {
        tenantId: TENANT_A,
        customerId: created.id,
        name: 'customer.updated',
        payload: {},
        occurredAt: created.updatedAt,
      },
    );

    expect(applied).toBeNull();
    // And no event was written for a change that did not happen.
    expect((await outboxRows()).map((row) => row.name)).toEqual(['customer.created']);
  });
});

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

describe('list', () => {
  beforeEach(async () => {
    for (const code of ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO']) {
      await service().create(
        makeScope(TENANT_A),
        makeCreateCustomer({ code, name: `Fleet ${code}` }),
      );
    }
  });

  it('pages by keyset without repeating or skipping a row', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;

    do {
      const page = await service().list(makeScope(TENANT_A), {
        limit: 2,
        ...(cursor === undefined ? {} : { cursor }),
      });
      seen.push(...page.items.map((customer) => customer.code));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(seen).toEqual(['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO']);
  });

  it('reports no cursor on the last page', async () => {
    const page = await service().list(makeScope(TENANT_A), { limit: 25 });
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(5);
  });

  it('filters by status', async () => {
    const page = await service().list(makeScope(TENANT_A), { limit: 25, status: 'active' });
    expect(page.items).toHaveLength(0);
  });

  it('searches code and name, case-insensitively', async () => {
    const byCode = await service().list(makeScope(TENANT_A), { limit: 25, search: 'brav' });
    expect(byCode.items.map((customer) => customer.code)).toEqual(['BRAVO']);

    const byName = await service().list(makeScope(TENANT_A), { limit: 25, search: 'fleet ec' });
    expect(byName.items.map((customer) => customer.code)).toEqual(['ECHO']);
  });
});

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

describe('the dispatcher', () => {
  it('marks what it claims, and claims nothing twice', async () => {
    await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'ONE' }));
    await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'TWO' }));

    expect(await harness.app.outbox.dispatchOnce()).toBe(2);
    expect(await harness.app.outbox.dispatchOnce()).toBe(0);

    const rows = await outboxRows();
    expect(rows.every((row) => row.dispatched_at !== null)).toBe(true);
  });

  it('does not double-dispatch under concurrent workers', async () => {
    for (const code of ['AA', 'BB', 'CC', 'DD', 'EE', 'FF']) {
      await service().create(makeScope(TENANT_A), makeCreateCustomer({ code }));
    }

    const db = harness.app.db.handle;

    // Two workers, racing, each taking a batch of two. `FOR UPDATE SKIP LOCKED`
    // is what makes this safe; without it one of these blocks and then
    // re-reads rows the other already took.
    const [first, second, third] = await Promise.all([
      claimPending(db, 2),
      claimPending(db, 2),
      claimPending(db, 2),
    ]);

    const claimed = [...first, ...second, ...third].map((event) => event.id);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Scoped event reads — the SSE read path
// ---------------------------------------------------------------------------

describe('scoped event reads', () => {
  it('returns only this customer’s events, for staff and portal alike', async () => {
    const mine = await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'MINE' }));
    const theirs = await service().create(
      makeScope(TENANT_A),
      makeCreateCustomer({ code: 'THEIRS' }),
    );
    await harness.app.outbox.dispatchOnce();

    const asStaff = await service().readEvents(makeScope(TENANT_A), mine.id, 0);
    expect(asStaff.map((event) => event.customerId)).toEqual([mine.id]);

    const asPortal = await service().readEvents(makeScope(TENANT_A, mine.id), mine.id, 0);
    expect(asPortal.map((event) => event.customerId)).toEqual([mine.id]);

    // And a portal principal cannot ask about the other fleet at all.
    await expect(
      service().readEvents(makeScope(TENANT_A, mine.id), theirs.id, 0),
    ).rejects.toThrow(/not found/i);
  });

  it('returns nothing until the dispatcher has committed', async () => {
    const created = await service().create(makeScope(TENANT_A), makeCreateCustomer());

    // An undispatched row is below the visibility horizon: the client would
    // otherwise advance its cursor past a row the dispatcher has not finished
    // with.
    expect(await service().readEvents(makeScope(TENANT_A), created.id, 0)).toHaveLength(0);

    await harness.app.outbox.dispatchOnce();
    expect(await service().readEvents(makeScope(TENANT_A), created.id, 0)).toHaveLength(1);
  });

  it('hides a dispatched event while a lower one is still pending', async () => {
    const created = await service().create(makeScope(TENANT_A), makeCreateCustomer());
    await service().update(makeScope(TENANT_A), created.id, { name: 'Renamed' });

    // Mark only the *second* row dispatched, leaving a hole beneath it. This is
    // the situation `SKIP LOCKED` creates when one worker commits before
    // another: a reader that accepted id 2 would advance past id 1 and lose it
    // permanently, because a cursor is a high-water mark.
    await harness.app.db.handle.execute(
      sql`update platform.outbox set dispatched_at = now() where id = 2`,
    );

    expect(await service().readEvents(makeScope(TENANT_A), created.id, 0)).toHaveLength(0);

    await harness.app.db.handle.execute(
      sql`update platform.outbox set dispatched_at = now() where id = 1`,
    );

    const visible = await service().readEvents(makeScope(TENANT_A), created.id, 0);
    expect(visible.map((event) => event.id)).toEqual([1, 2]);
  });

  it('respects the cursor', async () => {
    const created = await service().create(makeScope(TENANT_A), makeCreateCustomer());
    await service().update(makeScope(TENANT_A), created.id, { name: 'Renamed' });
    await harness.app.outbox.dispatchOnce();

    const after = await service().readEvents(makeScope(TENANT_A), created.id, 1);
    expect(after.map((event) => event.name)).toEqual(['customer.updated']);
  });

  it('is unaffected by another tenant’s events in the same table', async () => {
    const mine = await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'MINE' }));
    await service().create(makeScope(TENANT_B), makeCreateCustomer({ code: 'OTHER' }));
    await harness.app.outbox.dispatchOnce();

    const events = await service().readEvents(makeScope(TENANT_A), mine.id, 0);
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The HTTP surface, end to end
// ---------------------------------------------------------------------------

describe('over HTTP', () => {
  it('serves create, get, list and update as one coherent resource', async () => {
    const staff = makeStaffPrincipal(TENANT_A);

    const created = await request(harness, 'POST', '/v1/customers', staff, makeCreateCustomer());
    expect(created.status).toBe(201);

    const id = (created.body as Customer).id;

    expect((await request(harness, 'GET', `/v1/customers/${id}`, staff)).status).toBe(200);
    expect((await request(harness, 'GET', '/v1/customers', staff)).status).toBe(200);

    const patched = await request(harness, 'PATCH', `/v1/customers/${id}`, staff, {
      status: 'active',
    });
    expect(patched.status).toBe(200);
    expect((patched.body as Customer).status).toBe('active');
  });

  it('maps the error taxonomy to status codes once', async () => {
    const staff = makeStaffPrincipal(TENANT_A);

    // NotFound
    expect(
      (await request(harness, 'GET', `/v1/customers/${makeCustomerId(99)}`, staff)).status,
    ).toBe(404);

    // ValidationFailed — a body that does not parse
    expect(
      (await request(harness, 'POST', '/v1/customers', staff, { code: 'x' })).status,
    ).toBe(400);

    // Forbidden — no principal at all
    expect((await request(harness, 'GET', '/v1/customers', null)).status).toBe(403);

    // BusinessRuleViolated
    const created = await request(harness, 'POST', '/v1/customers', staff, makeCreateCustomer());
    const id = (created.body as Customer).id;
    await request(harness, 'PATCH', `/v1/customers/${id}`, staff, { status: 'active' });
    expect(
      (await request(harness, 'PATCH', `/v1/customers/${id}`, staff, { status: 'prospect' }))
        .status,
    ).toBe(422);

    // Conflict
    expect(
      (await request(harness, 'POST', '/v1/customers', staff, makeCreateCustomer())).status,
    ).toBe(409);
  });

  it('refuses a portal principal declared without its customer', async () => {
    // The discriminated union rejects this at the parsing boundary, which is
    // the whole reason `customerId` is not an optional field.
    const response = await fetch(`${harness.baseUrl}/v1/customers`, {
      headers: {
        'x-fleetco-principal': JSON.stringify({
          userId: makeCustomerId(1),
          tenantId: TENANT_A,
          plane: 'portal',
          roles: ['portal_user'],
          authMethod: 'password',
        }),
      },
    });
    expect(response.status).toBe(400);
  });

  it('scopes a portal principal’s list to its own fleet', async () => {
    const mine = await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'MINE' }));
    await service().create(makeScope(TENANT_A), makeCreateCustomer({ code: 'THEIRS' }));

    const response = await request(
      harness,
      'GET',
      '/v1/customers',
      makePortalPrincipal(TENANT_A, mine.id),
    );

    expect(response.status).toBe(200);
    expect((response.body as { items: Customer[] }).items.map((c) => c.code)).toEqual(['MINE']);
  });
});
