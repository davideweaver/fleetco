import type { Cents, CustomerId, Instant, TenantId } from '../../lib/types/branded.js';
import type { NewOutboxEvent } from '../../lib/outbox/repository.js';
import type { CustomerStatus } from './contracts.js';

/**
 * The module's outbox events.
 *
 * Naming follows [[Realtime and Events]] § Event Shape — `entity.past_tense`,
 * lower snake case. Every one carries `customerId`, which is what makes it
 * visible to that fleet's portal users and nothing else; a shop-only event
 * would leave it null and never reach a portal stream.
 *
 * **Exactly one event per state change**, which is the rule the transaction
 * boundary exists to protect. An update that both moves the status and places a
 * credit hold emits one event, chosen by the precedence in `eventForUpdate`
 * below, rather than two rows that a replaying client could see half of.
 */
export const CUSTOMER_EVENT_NAMES = [
  'customer.created',
  'customer.updated',
  'customer.status_changed',
  'customer.credit_hold_placed',
  'customer.credit_hold_released',
] as const;

export type CustomerEventName = (typeof CUSTOMER_EVENT_NAMES)[number];

type EventSubject = {
  readonly tenantId: TenantId;
  readonly customerId: CustomerId;
  readonly occurredAt: Instant;
};

export function customerCreated(
  subject: EventSubject,
  detail: { readonly code: string; readonly status: CustomerStatus; readonly creditLimitCents: Cents },
): NewOutboxEvent {
  return event(subject, 'customer.created', {
    code: detail.code,
    status: detail.status,
    creditLimitCents: detail.creditLimitCents,
  });
}

/**
 * One event for an update, by precedence: a status change is the most
 * significant thing that can happen to a customer, then a credit-hold
 * transition, then everything else.
 *
 * The precedence is here rather than in the service because it is a statement
 * about the event vocabulary, and a future module adding an event has to read
 * this file anyway.
 */
export function eventForUpdate(
  subject: EventSubject,
  before: { readonly status: CustomerStatus; readonly isOnCreditHold: boolean },
  after: { readonly status: CustomerStatus; readonly isOnCreditHold: boolean },
  changedFields: readonly string[],
): NewOutboxEvent {
  if (before.status !== after.status) {
    return event(subject, 'customer.status_changed', {
      from: before.status,
      to: after.status,
    });
  }

  if (before.isOnCreditHold !== after.isOnCreditHold) {
    return event(
      subject,
      after.isOnCreditHold ? 'customer.credit_hold_placed' : 'customer.credit_hold_released',
      { status: after.status },
    );
  }

  // The field *names* only. A payload is readable by every portal user of that
  // fleet, so it carries what changed and not what it changed to — the
  // standards doc's "never raw PII" applies here more than anywhere.
  return event(subject, 'customer.updated', { changedFields: [...changedFields] });
}

function event(
  subject: EventSubject,
  name: CustomerEventName,
  payload: Record<string, unknown>,
): NewOutboxEvent {
  return {
    tenantId: subject.tenantId,
    customerId: subject.customerId,
    name,
    payload,
    occurredAt: subject.occurredAt,
  };
}
