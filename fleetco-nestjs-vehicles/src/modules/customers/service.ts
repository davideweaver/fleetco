import { Inject, Injectable } from '@nestjs/common';
import { concat, concatMap, filter, from, map, of } from 'rxjs';
import type { Observable } from 'rxjs';

import { CLOCK } from '../../platform/db/db.module';
import { OutboxRepository } from '../../platform/outbox/repository';
import { OutboxNotifier } from '../../platform/outbox/notifier';
import type { OutboxEvent } from '../../platform/outbox/repository';
import { newCustomerId, toCents } from '../../platform/types/branded';
import type { Cents, CustomerId, Instant, TenantId } from '../../platform/types/branded';
import type { Clock } from '../../platform/types/clock';
import {
  BusinessRuleViolated,
  Conflict,
  NotFound,
  ValidationFailed,
} from '../../platform/types/errors';
import type { Principal } from '../../platform/types/principal';
import { scopeOf } from '../../platform/types/scope';
import { CustomersRepository } from './repository';
import type { CustomerPatch } from './repository';
import { CUSTOMER_EVENT_NAMES, customerEvent, customerTopic } from './events';
import type { CustomerEventName } from './events';
import type {
  CreateCustomer,
  Customer,
  CustomerStatus,
  CustomerEvent,
  CustomerPage,
  ListCustomersQuery,
  UpdateCustomer,
} from './contracts';

// ===========================================================================
// Pure domain rules
//
// Everything in this section is a pure function over plain data, with no
// repository, no clock reaching for `new Date()`, and no I/O. That is the
// design the [[Testing Strategy]] asks for: "pull the arithmetic out of
// anything that touches the database so it can be tested exhaustively and
// cheaply". `service.test.ts` and `invariants.test.ts` import only from here.
// ===========================================================================

/**
 * A labor rate ceiling of $1,000/hour.
 *
 * This exists specifically to catch a dollars-for-cents mix-up: `45` meaning
 * "$45/hr" entered where `4500` was meant passes every other check, whereas
 * `450000` does not. The `Cents` brand stops a float from entering the system;
 * this stops the other half of the same bug.
 */
export const MAX_LABOR_RATE_CENTS: Cents = toCents(100_000);

/** `prospect → active → inactive`, and reactivation. Nothing else. */
export function legalNextStatuses(status: CustomerStatus): readonly CustomerStatus[] {
  switch (status) {
    case 'prospect':
      return ['active', 'inactive'];
    case 'active':
      return ['inactive'];
    case 'inactive':
      return ['active'];
    default: {
      // Exhaustiveness check — adding a status to CUSTOMER_STATUSES breaks the
      // build here and at every other site that must handle it.
      const unhandled: never = status;
      throw new Error(`unhandled customer status: ${String(unhandled)}`);
    }
  }
}

export function canTransition(from: CustomerStatus, to: CustomerStatus): boolean {
  return from === to || legalNextStatuses(from).includes(to);
}

/**
 * The shop's code for a fleet, e.g. `ACME`. Uppercased so that `acme` and
 * `ACME` collide on the per-tenant unique index rather than becoming two
 * customers a service advisor has to tell apart.
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** The cross-field money rules. Single-field rules live in the Zod contract. */
export function assertMoneyRules(customer: {
  readonly creditLimitCents: Cents;
  readonly defaultLaborRateCents: Cents;
  readonly billingTermsNetDays: number;
}): void {
  if (customer.creditLimitCents < 0) {
    throw new ValidationFailed('credit limit cannot be negative', {
      creditLimitCents: customer.creditLimitCents,
    });
  }
  if (customer.defaultLaborRateCents <= 0) {
    throw new ValidationFailed('labor rate must be positive', {
      defaultLaborRateCents: customer.defaultLaborRateCents,
    });
  }
  if (customer.defaultLaborRateCents > MAX_LABOR_RATE_CENTS) {
    throw new ValidationFailed('labor rate exceeds the sanity ceiling — are these cents?', {
      defaultLaborRateCents: customer.defaultLaborRateCents,
      ceilingCents: MAX_LABOR_RATE_CENTS,
    });
  }
  // A shop does not extend net terms to a fleet with no credit line. Prepay
  // customers are net 0.
  if (customer.billingTermsNetDays > 0 && customer.creditLimitCents === 0) {
    throw new BusinessRuleViolated('net terms require a non-zero credit limit', {
      billingTermsNetDays: customer.billingTermsNetDays,
      creditLimitCents: customer.creditLimitCents,
    });
  }
}

/** Builds the new customer value. Pure: the id, tenant and time are arguments. */
export function buildNewCustomer(
  tenantId: TenantId,
  id: CustomerId,
  now: Instant,
  input: CreateCustomer,
): Customer {
  const customer: Customer = {
    id,
    tenantId,
    code: normalizeCode(input.code),
    name: input.name.trim(),
    // Every customer starts as a prospect. Activation is a transition, which
    // is where the credit-hold rule gets a chance to refuse.
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
  assertMoneyRules(customer);
  return customer;
}

/**
 * Applies an update to a customer and returns a new value. Pure, total, and
 * the only place a status transition is decided.
 *
 * `readonly by default; state changes return new values`
 * ([[Code Standards and Guardrails]] § Other Tier 1 Patterns).
 */
export function applyPatch(current: Customer, patch: UpdateCustomer, now: Instant): Customer {
  const status = patch.status ?? current.status;
  const isOnCreditHold = patch.isOnCreditHold ?? current.isOnCreditHold;

  if (!canTransition(current.status, status)) {
    throw new BusinessRuleViolated('illegal customer status transition', {
      from: current.status,
      to: status,
      legal: legalNextStatuses(current.status).join(','),
    });
  }
  // A fleet on credit hold cannot be *activated*. The rule guards the
  // transition into `active`, not the state of being active: placing an
  // already-active customer on hold is exactly what a credit manager does
  // when an account goes past due, and it must not deactivate them.
  //
  // Clearing the hold and activating in the same request is allowed — the
  // patch is evaluated as one resulting state, not as a sequence.
  const isActivating = status === 'active' && current.status !== 'active';
  if (isActivating && isOnCreditHold) {
    throw new BusinessRuleViolated('a customer on credit hold cannot be activated', {
      customerId: current.id,
    });
  }

  const next: Customer = {
    ...current,
    name: patch.name === undefined ? current.name : patch.name.trim(),
    status,
    isOnCreditHold,
    creditLimitCents: patch.creditLimitCents ?? current.creditLimitCents,
    defaultLaborRateCents: patch.defaultLaborRateCents ?? current.defaultLaborRateCents,
    billingTermsNetDays: patch.billingTermsNetDays ?? current.billingTermsNetDays,
    primaryContactEmail:
      patch.primaryContactEmail === undefined
        ? current.primaryContactEmail
        : patch.primaryContactEmail,
    primaryContactPhone:
      patch.primaryContactPhone === undefined
        ? current.primaryContactPhone
        : patch.primaryContactPhone,
    updatedAt: now,
  };
  assertMoneyRules(next);
  return next;
}

/**
 * Exactly one event per state change ([[Realtime and Events]]). A status move
 * is reported as `customer.status_changed` because that is what a portal
 * activity feed renders; everything else is `customer.updated`.
 */
export function eventNameFor(before: Customer, after: Customer): CustomerEventName {
  return before.status === after.status ? 'customer.updated' : 'customer.status_changed';
}

/**
 * Which fields actually moved, for the event payload.
 *
 * Spelled out rather than derived from `Object.keys`, for two reasons: the
 * identity fields and `updatedAt` must never be reported as changes, and
 * `satisfies` makes a typo a compile error. A new column that belongs in the
 * activity feed is one line here.
 */
const REPORTED_FIELDS = [
  'code',
  'name',
  'status',
  'creditLimitCents',
  'defaultLaborRateCents',
  'billingTermsNetDays',
  'isOnCreditHold',
  'primaryContactEmail',
  'primaryContactPhone',
] as const satisfies readonly (keyof Customer)[];

export function changedFieldNames(before: Customer, after: Customer): string[] {
  return REPORTED_FIELDS.filter((field) => before[field] !== after[field]);
}

// ===========================================================================
// Orchestration
// ===========================================================================

/** Replay is bounded so a client with an ancient cursor cannot ask for the world. */
const MAX_REPLAY_ROWS = 500;

@Injectable()
export class CustomersService {
  constructor(
    private readonly customers: CustomersRepository,
    private readonly outbox: OutboxRepository,
    private readonly notifier: OutboxNotifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  list(principal: Principal, query: ListCustomersQuery): Promise<CustomerPage> {
    return this.customers.list(scopeOf(principal), query);
  }

  async get(principal: Principal, id: CustomerId): Promise<Customer> {
    const customer = await this.customers.findById(scopeOf(principal), id);
    if (customer === null) throw notFound(id);
    return customer;
  }

  /**
   * The state change and its outbox row commit together or not at all. The
   * transaction is opened here, in the layer that knows the two writes belong
   * to one business fact.
   */
  async create(principal: Principal, input: CreateCustomer): Promise<Customer> {
    const scope = scopeOf(principal);
    const code = normalizeCode(input.code);

    const clash = await this.customers.findByCode(scope, code);
    if (clash !== null) {
      throw new Conflict('a customer with that code already exists in this tenant', {
        code,
        tenantId: scope.tenantId,
      });
    }

    const customer = buildNewCustomer(scope.tenantId, newCustomerId(), this.clock.now(), {
      ...input,
      code,
    });

    try {
      return await this.customers.transaction(async (tx) => {
        await this.customers.insert(tx, customer);
        await this.outbox.append(
          tx,
          customerEvent('customer.created', customer, {
            code: customer.code,
            name: customer.name,
            status: customer.status,
          }),
        );
        return customer;
      });
    } catch (error) {
      // The pre-check above races: two concurrent creates both see no clash.
      // The per-tenant unique index is what actually decides, so translate its
      // violation rather than leaking a driver error.
      if (isUniqueViolation(error)) {
        throw new Conflict('a customer with that code already exists in this tenant', {
          code,
          tenantId: scope.tenantId,
        });
      }
      throw error;
    }
  }

  async update(principal: Principal, id: CustomerId, patch: UpdateCustomer): Promise<Customer> {
    const scope = scopeOf(principal);

    return this.customers.transaction(async (tx) => {
      // Locked read, so the status the transition was validated against is the
      // status being written over.
      const current = await this.customers.findByIdForUpdate(tx, scope, id);
      if (current === null) throw notFound(id);

      const next = applyPatch(current, patch, this.clock.now());
      const saved = await this.customers.update(tx, scope, id, toRowPatch(next));
      if (saved === null) throw notFound(id);

      await this.outbox.append(
        tx,
        customerEvent(eventNameFor(current, next), saved, {
          changed: changedFieldNames(current, next),
          status: saved.status,
        }),
      );
      return saved;
    });
  }

  /**
   * Customer-scoped SSE stream.
   *
   * Three things happen in order, and the order is the design:
   *
   *  1. **Authorize the subscription through the same code path as REST.**
   *     `this.get(...)` is the GET handler's service method. If a principal
   *     cannot read the customer over REST it cannot subscribe to it either,
   *     which is the one rule in [[Realtime and Events]] § Authorization.
   *  2. **Replay from the cursor.** `Last-Event-ID` is the cursor, read
   *     through the scoped outbox repository, so a technician whose tablet
   *     dropped off the bay Wi-Fi resumes without a gap.
   *  3. **Resume live**, filtering `LISTEN/NOTIFY` wake-ups by topic and then
   *     re-reading each row through the scope. The re-read is not redundant:
   *     it is what makes a mid-session permission revocation take effect
   *     immediately instead of at reconnect.
   */
  async streamFor(
    principal: Principal,
    customerId: CustomerId,
    lastEventId: number | null,
  ): Promise<Observable<CustomerEvent>> {
    const customer = await this.get(principal, customerId);
    const scope = scopeOf(principal);
    const topic = customerTopic(customer.tenantId, customer.id);

    const from_ = lastEventId ?? (await this.outbox.currentCursor(scope, topic));
    const replayed = await this.outbox.readTopicSince(scope, topic, from_, MAX_REPLAY_ROWS);
    const resumeAt = replayed[replayed.length - 1]?.id ?? from_;

    const live = this.notifier.notifications().pipe(
      filter((note) => note.topic === topic && note.id > resumeAt),
      // `concatMap`, NOT `mergeMap`. The original spike used `mergeMap`,
      // which runs these reads concurrently and emits in *completion* order:
      // two events dispatched milliseconds apart could reach the client
      // reversed. Because a client records `Last-Event-ID` from the last
      // frame it saw, receiving 5 then 4 makes it store 5 and skip 4 forever
      // on reconnect — silent loss in the mechanism built to prevent loss.
      // Serialising costs throughput we do not need and buys ordering we do.
      concatMap((note) => from(this.outbox.readScopedById(scope, note.id))),
      filter((event): event is OutboxEvent => event !== null),
    );

    return concat(of(...replayed), live).pipe(
      map(toCustomerEvent),
      filter((event): event is CustomerEvent => event !== null),
    );
  }
}

function notFound(id: CustomerId): NotFound {
  return new NotFound('customer not found', { customerId: id });
}

/**
 * Narrows an outbox row to this module's event contract, or `null` if it is
 * not one. The topic is already customer-scoped, so this only fires if another
 * module ever writes to it — but a stream that silently forwards an unknown
 * event name to a browser is how a contract rots.
 */
function toCustomerEvent(event: OutboxEvent): CustomerEvent | null {
  const name = CUSTOMER_EVENT_NAMES.find((known) => known === event.name);
  if (name === undefined || event.customerId === null) return null;
  return {
    id: event.id,
    name,
    customerId: event.customerId,
    occurredAt: event.occurredAt,
    payload: event.payload,
  };
}

function toRowPatch(next: Customer): CustomerPatch {
  return {
    name: next.name,
    status: next.status,
    creditLimitCents: next.creditLimitCents,
    defaultLaborRateCents: next.defaultLaborRateCents,
    billingTermsNetDays: next.billingTermsNetDays,
    isOnCreditHold: next.isOnCreditHold,
    primaryContactEmail: next.primaryContactEmail,
    primaryContactPhone: next.primaryContactPhone,
    updatedAt: next.updatedAt,
  };
}

/** Postgres `unique_violation`. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === '23505';
}
