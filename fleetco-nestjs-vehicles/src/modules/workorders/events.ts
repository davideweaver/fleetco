import type { CustomerId, TenantId, WorkOrderId } from '../../platform/types/branded';
import type { NewOutboxEvent } from '../../platform/outbox/repository';
import type { WorkOrder } from './contracts';

/** `entity.past_tense_verb`, per [[Realtime and Events]] § Event Shape. */
export const WORK_ORDER_EVENT_NAMES = [
  'work_order.created',
  'work_order.updated',
  'work_order.status_changed',
  'work_order.line_added',
  'work_order.line_removed',
] as const;

export type WorkOrderEventName = (typeof WORK_ORDER_EVENT_NAMES)[number];

/**
 * One work order's topic. A service advisor watching a repair watches the
 * order, not the whole shop.
 */
export function workOrderTopic(tenantId: TenantId, workOrderId: WorkOrderId): string {
  return `work_order:${tenantId}:${workOrderId}`;
}

/**
 * Builds the outbox row for a work-order event.
 *
 * Same two wrinkles as `vehicles`: `customerId` is the portal scope key (the
 * fleet being billed, not the order), and the order's own id rides in the
 * payload because `platform.outbox_events` has no generic subject column.
 * Third module, same workaround — this is now the clearest argument for giving
 * the outbox a `subject_id`.
 */
export function workOrderEvent(
  name: WorkOrderEventName,
  workOrder: WorkOrder,
  payload: Readonly<Record<string, unknown>>,
): NewOutboxEvent {
  return {
    tenantId: workOrder.tenantId,
    customerId: workOrder.customerId satisfies CustomerId,
    topic: workOrderTopic(workOrder.tenantId, workOrder.id),
    name,
    payload: { workOrderId: workOrder.id, ...payload },
    occurredAt: workOrder.updatedAt,
  };
}
