import type { OutboxEvent, OutboxListener } from '../../platform/outbox/index.js';
import { toCents } from '../../platform/types/branded.js';
import type { Cents, CustomerId, Instant, TenantId } from '../../platform/types/branded.js';
import type { Clock } from '../../platform/types/clock.js';
import {
  BusinessRuleViolated,
  Conflict,
  NotFound,
  ValidationFailed,
} from '../../platform/types/errors.js';
import type { Principal } from '../../platform/types/principal.js';
import { scopeOf } from '../../platform/types/scope.js';
import type { Scope } from '../../platform/types/scope.js';
import type {
  CreateCustomer,
  Customer,
  CustomerEvent,
  CustomerPage,
  CustomerStatus,
  ListCustomersQuery,
  UpdateCustomer,
} from './contracts.js';
import { CUSTOMER_EVENT_NAMES, customerEvent, customerTopic } from './events.js';
import type { CustomerEventName } from './events.js';
import type { CustomerPatch, CustomerStore } from './repository.js';

// ===========================================================================
// Pure domain rules
//
// Everything in this section is a pure function over plain data: no store, no
// `new Date()`, no I/O — the same design [[Testing Strategy]] asks for, and
// identical to the Fastify and NestJS spikes. `service.test.ts` and
// `invariants.test.ts` import only from here, and neither needs AdonisJS
// running to do it.
// ===========================================================================

/**
 * A labor rate ceiling of $1,000/hour.
 *
 * This exists specifically to catch a dollars-for-cents mix-up: `45` meaning
 * "$45/hr" entered where `4500` was meant passes every other check, whereas
 * `450000` does not. The `Cents` brand stops a float entering the system;
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
      // Exhaustiveness check. Adding a status to CUSTOMER_STATUSES breaks the
      // build here and at every other site that must handle it
      // ([[Code Standards and Guardrails]] § Other Tier 1 Patterns).
      const unhandled: never = status;
      throw new Error(`unhandled customer status: ${String(unhandled)}`);
    }
  }
}

export function canTransition(from: CustomerStatus, to: CustomerStatus): boolean {
  return from === to || legalNextStatuses(from).includes(to);
}

/**
 * The shop's code for a fleet, e.g. `ACME`. Uppercased so `acme` and `ACME`
 * collide on the per-tenant unique index rather than becoming two customers a
 * service advisor has to tell apart.
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

/** Builds the new customer value. Pure: the id, the tenant and the time are arguments. */
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
 * Applies an update and returns a new value. Pure, total, and the only place a
 * status transition is decided.
 *
 * "`readonly` by default on domain objects; state changes return new values"
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
  // transition into `active`, not the state of being active: putting an
  // already-active customer on hold is exactly what a credit manager does when
  // an account goes past due, and it must not deactivate them.
  //
  // Clearing the hold and activating in one request is allowed — the patch is
  // evaluated as one resulting state, not as a sequence.
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
 * `satisfies` makes a typo here a compile error. A new column that belongs in
 * the activity feed is one line.
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

/** Narrows an outbox row to this module's event contract, or `null` if it is not one. */
export function toCustomerEvent(event: OutboxEvent): CustomerEvent | null {
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

function notFound(id: CustomerId): NotFound {
  return new NotFound('customer not found', { customerId: id });
}

// ===========================================================================
// Orchestration
// ===========================================================================

/** A single replay page. A client with an ancient cursor cannot ask for the world. */
const REPLAY_PAGE_SIZE = 500;

/**
 * Everything the service needs, as data. No container, no decorators, no
 * tokens — `providers/fleetco_provider.ts` builds this object once and a
 * unit test builds it with fakes. This is the whole of [[Framework
 * Evaluation]]'s "testing needs no harness; call the function with fakes" —
 * true under AdonisJS exactly as it was under Fastify, because nothing here
 * asks the IoC container for anything.
 */
export type CustomerServiceDeps = {
  readonly store: CustomerStore;
  readonly clock: Clock;
  readonly newCustomerId: () => CustomerId;
  /** Wakes an open stream on a matching `NOTIFY`, and on a timer regardless. */
  readonly watch: OutboxListener['watch'];
  readonly streamTickMs: number;
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- `CustomerService` is `ReturnType<typeof createCustomerService>`; annotating it would be circular. This is the one place the derive-the-type pattern fights the lint rule — see NOTES.md §2.
export function createCustomerService(deps: CustomerServiceDeps) {
  async function get(principal: Principal, id: CustomerId): Promise<Customer> {
    const customer = await deps.store.findById(scopeOf(principal), id);
    if (customer === null) throw notFound(id);
    return customer;
  }

  return {
    list: (principal: Principal, query: ListCustomersQuery): Promise<CustomerPage> =>
      deps.store.list(scopeOf(principal), query),

    get,

    /**
     * The state change and its outbox row commit together or not at all. The
     * transaction is opened here, in the layer that knows the two writes are
     * one business fact.
     */
    async create(principal: Principal, input: CreateCustomer): Promise<Customer> {
      const scope = scopeOf(principal);
      const code = normalizeCode(input.code);

      const clash = await deps.store.findByCode(scope, code);
      if (clash !== null) {
        throw new Conflict('a customer with that code already exists in this tenant', {
          code,
          tenantId: scope.tenantId,
        });
      }

      const customer = buildNewCustomer(scope.tenantId, deps.newCustomerId(), deps.clock.now(), {
        ...input,
        code,
      });

      try {
        return await deps.store.inTransaction(async (tx) => {
          await tx.insert(scope, customer);
          await tx.appendEvent(
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
        // The per-tenant unique index is what actually decides, so translate
        // its violation rather than leaking a driver error.
        if (isUniqueViolation(error)) {
          throw new Conflict('a customer with that code already exists in this tenant', {
            code,
            tenantId: scope.tenantId,
          });
        }
        throw error;
      }
    },

    update(principal: Principal, id: CustomerId, patch: UpdateCustomer): Promise<Customer> {
      const scope = scopeOf(principal);

      return deps.store.inTransaction(async (tx) => {
        const current = await tx.findByIdForUpdate(scope, id);
        if (current === null) throw notFound(id);

        const next = applyPatch(current, patch, deps.clock.now());
        const saved = await tx.update(scope, id, toRowPatch(next));
        if (saved === null) throw notFound(id);

        await tx.appendEvent(
          customerEvent(eventNameFor(current, next), saved, {
            changed: changedFieldNames(current, next),
            status: saved.status,
          }),
        );
        return saved;
      });
    },

    /**
     * Customer-scoped SSE stream.
     *
     * The design is deliberately one code path for replay and for live push.
     * A `NOTIFY` is a wake-up, not a payload; every wake re-runs the same
     * scoped cursor read. That collapses the usual "catch up, then switch to
     * live, and hope nothing landed in between" race into a loop with no
     * seam — and it is why a dropped notification costs nothing, exactly as
     * [[Realtime and Events]] § Multi-Instance Fanout claims.
     *
     * Four properties, in the order they are established:
     *
     *  1. **Subscription authorization is request authorization.** `get` is
     *     the GET handler's own service method. A principal that cannot read
     *     the customer over REST cannot subscribe to it — the one rule in
     *     § Authorization.
     *  2. **Replay from the cursor.** `Last-Event-ID` is the cursor, read
     *     through the scoped outbox, so a technician whose tablet dropped off
     *     the bay Wi-Fi resumes with no gap.
     *  3. **Per-event re-authorization.** Each wake re-reads through the
     *     `Scope`, so every row pushed is authorized at push time rather than
     *     at subscribe time; a mid-session revocation takes effect at once.
     *  4. **Gapless.** The replay query hides any row with an undispatched
     *     row beneath it — see `platform/outbox/repository.ts`.
     */
    async stream(
      principal: Principal,
      customerId: CustomerId,
      lastEventId: number | null,
      signal: AbortSignal,
    ): Promise<AsyncGenerator<CustomerEvent>> {
      // Authorization and the opening cursor are resolved *before* the
      // generator exists, so a refusal is a plain 403 or 404 rather than a
      // stream that opens and immediately apologises. `runSseRoute` depends
      // on this: it awaits here and takes over the raw response only
      // afterwards.
      const customer = await get(principal, customerId);
      const scope = scopeOf(principal);
      const topic = customerTopic(customer.tenantId, customer.id);
      const from = lastEventId ?? (await deps.store.currentCursor(scope, topic));

      return drain(deps, scope, customerId, topic, from, signal);
    },
  };
}

export type CustomerService = ReturnType<typeof createCustomerService>;

/**
 * The stream body. One loop serves replay and live push: a wake-up — from a
 * `NOTIFY`, from the catch-up tick, or the immediate first one — re-runs the
 * same scoped cursor read. There is no "switch to live" moment, so there is no
 * window for an event to land in.
 */
async function* drain(
  deps: CustomerServiceDeps,
  scope: Scope,
  customerId: CustomerId,
  topic: string,
  from: number,
  signal: AbortSignal,
): AsyncGenerator<CustomerEvent> {
  let cursor = from;

  for await (const _wake of deps.watch(topic, signal, deps.streamTickMs)) {
    // The customer may have become unreadable since the last wake — a portal
    // membership revoked, a row deleted. Stop rather than keep streaming to a
    // principal who can no longer GET it.
    if ((await deps.store.findById(scope, customerId)) === null) return;

    for (;;) {
      const batch = await deps.store.readTopicSince(scope, topic, cursor, REPLAY_PAGE_SIZE);
      for (const row of batch) {
        const event = toCustomerEvent(row);
        if (event !== null) yield event;
        cursor = row.id;
      }
      if (batch.length < REPLAY_PAGE_SIZE) break;
    }
  }
}
