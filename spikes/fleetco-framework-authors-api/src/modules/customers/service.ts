import { BusinessRuleViolated, Conflict, NotFound } from '../../lib/errors/DomainError.js';
import type { OutboxEvent } from '../../lib/outbox/repository.js';
import {
  newCustomerId,
  toCents,
  type Cents,
  type CustomerId,
} from '../../lib/types/branded.js';
import type { Clock } from '../../lib/types/clock.js';
import type { Scope } from '../../lib/types/scope.js';
import type {
  CreateCustomer,
  Customer,
  CustomerPage,
  CustomerStatus,
  ListCustomersQuery,
  UpdateCustomer,
} from './contracts.js';
import { customerCreated, eventForUpdate } from './events.js';
import type { CustomerPatch, CustomersRepository } from './repository.js';

/**
 * The module's business rules.
 *
 * Two kinds of thing live in this file, and the split is the point:
 *
 *  - **Pure functions over plain data** at the top. [[Testing Strategy]]:
 *    "pull the arithmetic out of anything that touches the database so it can
 *    be tested exhaustively and cheaply. If a calculation is hard to unit test,
 *    that is a design smell." These are what `invariants.test.ts` generates
 *    thousands of cases against.
 *  - **The service itself** below, which reads, decides using those functions,
 *    and writes. It holds no SQL and no `new Date()`; the repository and the
 *    clock arrive as arguments, so `service.test.ts` runs it with an object
 *    literal and a frozen clock and no database at all.
 *
 * **Source of the rules.** [[PRD]] section 5 is still an outline, so the three
 * rules below were invented for this spike and are recorded in NOTES.md
 * section 1.2 as needing Dave's confirmation. They are written here the way a
 * confirmed rule would be, because the shape of the code is what the spike is
 * judging, but none of them should be treated as settled domain truth.
 */

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

/**
 * A fleet code is upper case and trimmed. Stored normalised rather than
 * normalised on read, so the unique index on `(tenant_id, code)` is what
 * actually prevents `acme` and `ACME` from both existing.
 */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * The legal status moves. An exhaustive `switch` with a `never` check, so
 * adding a fourth status produces a compile error here instead of a silently
 * rejected transition ([[Code Standards and Guardrails]] tier 1).
 *
 * `prospect` is terminal in reverse: a fleet that has ever been active is not a
 * prospect again, because quotes and service history now exist against it.
 */
export function isLegalStatusTransition(from: CustomerStatus, to: CustomerStatus): boolean {
  if (from === to) {
    return true;
  }

  switch (from) {
    case 'prospect':
      return to === 'active' || to === 'inactive';
    case 'active':
      return to === 'inactive';
    case 'inactive':
      return to === 'active';
    default: {
      const unreachable: never = from;
      return unreachable;
    }
  }
}

type CreditFacing = {
  readonly creditLimitCents: Cents;
  readonly isOnCreditHold: boolean;
};

/**
 * What a fleet may still run up before hitting its limit. Never negative: a
 * fleet already over its limit has zero available, not a negative number that
 * a caller might add to something.
 *
 * Integer cents throughout, so there is no rounding to get wrong.
 */
export function availableCreditCents(customer: CreditFacing, openBalanceCents: Cents): Cents {
  const remaining = customer.creditLimitCents - openBalanceCents;
  return toCents(Math.max(0, remaining));
}

/**
 * Whether a shop may authorise more work for this fleet.
 *
 * This is the function the service-order module will call across the module
 * boundary once it exists, and it is the reason the invariant "any sequence of
 * authorized line items sums to no more than the authorization limit"
 * ([[Testing Strategy]]) is testable at all: it is arithmetic over plain data,
 * with no order, no database and no clock in it.
 */
export function canAuthorize(
  customer: CreditFacing,
  openBalanceCents: Cents,
  estimateCents: Cents,
): boolean {
  if (customer.isOnCreditHold) {
    return false;
  }
  return estimateCents <= availableCreditCents(customer, openBalanceCents);
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

export type CustomersServiceDeps = {
  readonly repository: CustomersRepository;
  readonly clock: Clock;
};

/** How many replayed events one read returns. Also the SSE replay page size. */
const EVENT_PAGE_SIZE = 200;

/* eslint-disable-next-line @typescript-eslint/explicit-function-return-type --
 * Inferred for the same reason as the repository factory: `CustomersService` is
 * `ReturnType<typeof this>`, so there is no hand-written interface with one
 * implementation, and a route that calls a method this object does not have
 * fails to compile. */
export function createCustomersService({ repository, clock }: CustomersServiceDeps) {
  /**
   * The single read that every other operation authorises through, including
   * the SSE subscription. [[Realtime and Events]]: "subscription authorization
   * and request authorization call the same code."
   *
   * `NotFound` and not `Forbidden` when the row belongs to another tenant: a
   * scoped repository cannot tell the two apart, and that is deliberate, since
   * a 403 on another tenant's id confirms the id exists.
   */
  async function requireCustomer(scope: Scope, id: CustomerId): Promise<Customer> {
    const customer = await repository.findById(scope, id);
    if (!customer) {
      throw new NotFound('Customer not found', { customerId: id });
    }
    return customer;
  }

  return {
    get: requireCustomer,

    async list(scope: Scope, query: ListCustomersQuery): Promise<CustomerPage> {
      return repository.list(scope, query);
    },

    /**
     * A new fleet starts as a `prospect` and never on credit hold. Neither is
     * accepted from the request body: a client that could post
     * `status: 'active'` has skipped whatever the shop's onboarding is, and a
     * client that could post `isOnCreditHold` has skipped the credit decision.
     */
    async create(scope: Scope, input: CreateCustomer): Promise<Customer> {
      if (scope.customerId !== null) {
        // A portal user is scoped to one fleet. There is no reading of that
        // scope under which it may create another.
        throw new BusinessRuleViolated('A portal user cannot create a customer', {
          customerId: scope.customerId,
        });
      }

      const now = clock.now();
      const customer: Customer = {
        // Minted here, not by the database, so the id exists before the insert
        // and can go into the outbox event in the same breath.
        id: newCustomerId(),
        tenantId: scope.tenantId,
        code: normalizeCode(input.code),
        name: input.name,
        status: 'prospect',
        creditLimitCents: input.creditLimitCents,
        defaultLaborRateCents: input.defaultLaborRateCents,
        billingTermsNetDays: input.billingTermsNetDays,
        isOnCreditHold: false,
        primaryContactEmail: input.primaryContactEmail ?? null,
        primaryContactPhone: input.primaryContactPhone ?? null,
        createdAt: now,
        updatedAt: now,
      };

      const event = customerCreated(
        { tenantId: customer.tenantId, customerId: customer.id, occurredAt: now },
        {
          code: customer.code,
          status: customer.status,
          creditLimitCents: customer.creditLimitCents,
        },
      );

      try {
        return await repository.insert(scope, customer, event);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new Conflict('A customer with that code already exists', {
            code: customer.code,
          });
        }
        throw err;
      }
    },

    /**
     * Read, decide, write. The decision is made against the row that was read,
     * and `applyUpdate` only applies it if that row has not changed since,
     * which is how a concurrent edit becomes a `Conflict` rather than a lost
     * update.
     */
    async update(scope: Scope, id: CustomerId, patch: UpdateCustomer): Promise<Customer> {
      const before = await requireCustomer(scope, id);

      const nextStatus = patch.status ?? before.status;
      if (!isLegalStatusTransition(before.status, nextStatus)) {
        throw new BusinessRuleViolated('Illegal customer status transition', {
          from: before.status,
          to: nextStatus,
          customerId: id,
        });
      }

      const nextOnHold = patch.isOnCreditHold ?? before.isOnCreditHold;

      // A fleet on credit hold cannot be activated: activating it is what lets
      // a service advisor authorise work against it, which is the thing the
      // hold exists to stop. Releasing the hold first is one extra request and
      // an explicit decision by somebody.
      if (nextOnHold && nextStatus === 'active' && before.status !== 'active') {
        throw new BusinessRuleViolated('A customer on credit hold cannot be activated', {
          customerId: id,
        });
      }

      const now = clock.now();
      // `Instant`, not a `Date`. The repository owns the conversion, which is
      // what keeps `new Date()` out of business logic entirely rather than
      // merely out of the clock.
      const values: CustomerPatch = { updatedAt: now };
      const changedFields: string[] = [];

      if (patch.name !== undefined && patch.name !== before.name) {
        values.name = patch.name;
        changedFields.push('name');
      }
      if (patch.status !== undefined && patch.status !== before.status) {
        values.status = patch.status;
        changedFields.push('status');
      }
      if (
        patch.creditLimitCents !== undefined &&
        patch.creditLimitCents !== before.creditLimitCents
      ) {
        values.creditLimitCents = patch.creditLimitCents;
        changedFields.push('creditLimitCents');
      }
      if (
        patch.defaultLaborRateCents !== undefined &&
        patch.defaultLaborRateCents !== before.defaultLaborRateCents
      ) {
        values.defaultLaborRateCents = patch.defaultLaborRateCents;
        changedFields.push('defaultLaborRateCents');
      }
      if (
        patch.billingTermsNetDays !== undefined &&
        patch.billingTermsNetDays !== before.billingTermsNetDays
      ) {
        values.billingTermsNetDays = patch.billingTermsNetDays;
        changedFields.push('billingTermsNetDays');
      }
      if (patch.isOnCreditHold !== undefined && patch.isOnCreditHold !== before.isOnCreditHold) {
        values.isOnCreditHold = patch.isOnCreditHold;
        changedFields.push('isOnCreditHold');
      }
      if (
        patch.primaryContactEmail !== undefined &&
        patch.primaryContactEmail !== before.primaryContactEmail
      ) {
        values.primaryContactEmail = patch.primaryContactEmail;
        changedFields.push('primaryContactEmail');
      }
      if (
        patch.primaryContactPhone !== undefined &&
        patch.primaryContactPhone !== before.primaryContactPhone
      ) {
        values.primaryContactPhone = patch.primaryContactPhone;
        changedFields.push('primaryContactPhone');
      }

      // A patch whose every field already matches is not an error and is not a
      // state change either, so it writes nothing and emits nothing. Emitting
      // `customer.updated` with an empty `changedFields` would put a row in the
      // audit log that says nothing happened.
      if (changedFields.length === 0) {
        return before;
      }

      const event = eventForUpdate(
        { tenantId: before.tenantId, customerId: id, occurredAt: now },
        { status: before.status, isOnCreditHold: before.isOnCreditHold },
        { status: nextStatus, isOnCreditHold: nextOnHold },
        changedFields,
      );

      let after: Customer | null;
      try {
        after = await repository.applyUpdate(scope, id, before.updatedAt, values, event);
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new Conflict('A customer with that code already exists', { customerId: id });
        }
        throw err;
      }

      if (!after) {
        throw new Conflict('The customer changed while this update was being prepared', {
          customerId: id,
        });
      }
      return after;
    },

    /**
     * The customer-scoped event feed behind the SSE endpoint.
     *
     * `requireCustomer` runs first, so a subscription is authorised by exactly the code
     * that authorises `GET /v1/customers/{id}`. The scope handed to the
     * repository is then narrowed to that one customer, so a tenant-wide staff
     * principal subscribed to one fleet still receives only that fleet's
     * events.
     *
     * Called once per connection for replay and again on every dispatcher
     * notification, which is what makes [[Realtime and Events]]' "per-event
     * filtering re-checks the principal before each push" true: a revoked
     * permission takes effect on the next event rather than at reconnect.
     */
    async readEvents(scope: Scope, id: CustomerId, afterId: number): Promise<OutboxEvent[]> {
      await requireCustomer(scope, id);
      return repository.listEvents({ tenantId: scope.tenantId, customerId: id }, afterId, EVENT_PAGE_SIZE);
    },
  };
}

export type CustomersService = ReturnType<typeof createCustomersService>;

/**
 * Postgres `23505`, unique violation. The only constraint this module can
 * collide on is the tenant-scoped code index, so one check is enough.
 *
 * **The cause chain is the whole point of this function.** Drizzle wraps every
 * driver error in a `DrizzleQueryError` whose message is the failed SQL, and
 * puts the `pg` error — the one carrying the SQLSTATE — on `cause`. A plain
 * `err.code === '23505'` compiles, reads correctly, and never fires; the first
 * version of this file had exactly that, and `repository.test.ts` caught it as
 * a 500 where a 409 belonged. Recorded in NOTES.md section 2.
 */
const UNIQUE_VIOLATION = '23505';
const MAX_CAUSE_DEPTH = 5;

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return false;
    }
    if ('code' in current && current.code === UNIQUE_VIOLATION) {
      return true;
    }
    current = 'cause' in current ? current.cause : null;
  }

  return false;
}
