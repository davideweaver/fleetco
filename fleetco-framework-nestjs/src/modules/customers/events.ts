import type { CustomerId, TenantId } from '../../platform/types/branded';
import type { NewOutboxEvent } from '../../platform/outbox/repository';
import type { Customer } from './contracts';

/**
 * The module's outbox event definitions. Names follow the
 * `entity.past_tense_verb` convention in [[Realtime and Events]]
 * § Event Shape.
 */
export const CUSTOMER_EVENT_NAMES = [
  'customer.created',
  'customer.updated',
  'customer.status_changed',
] as const;

export type CustomerEventName = (typeof CUSTOMER_EVENT_NAMES)[number];

/**
 * The portal topic from [[Realtime and Events]] § Authorization:
 *
 *     customer:{tenantId}:{customerId}    ← portal users, one customer only
 *
 * The tenant is in the topic string as well as in the row's `tenant_id`. That
 * is redundant on purpose: the string is what a client subscribes to and the
 * column is what the scope predicate filters on, and a leak needs both to be
 * wrong at once.
 */
export function customerTopic(tenantId: TenantId, customerId: CustomerId): string {
  return `customer:${tenantId}:${customerId}`;
}

/**
 * Builds the outbox row for a customer event.
 *
 * `customerId` is set on the row, not only in the topic, because that is what
 * lets a portal principal's scope predicate match without re-reading the
 * source table.
 */
export function customerEvent(
  name: CustomerEventName,
  customer: Customer,
  payload: Readonly<Record<string, unknown>>,
): NewOutboxEvent {
  return {
    tenantId: customer.tenantId,
    customerId: customer.id,
    topic: customerTopic(customer.tenantId, customer.id),
    name,
    payload,
    occurredAt: customer.updatedAt,
  };
}
