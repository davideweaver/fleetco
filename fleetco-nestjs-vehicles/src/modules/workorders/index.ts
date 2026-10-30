/**
 * The module's public interface ([[Code Standards and Guardrails]] § The
 * Golden Module). Neither repository is exported, so a sibling cannot query
 * `workorders.*`.
 */
export { WorkOrdersModule } from './workorders.module';
export { WorkOrdersService } from './service';
export {
  workOrderSchema,
  workOrderDetailSchema,
  workOrderLineSchema,
  workOrderEventSchema,
  createWorkOrderSchema,
  updateWorkOrderSchema,
  addWorkOrderLineSchema,
  listWorkOrdersQuerySchema,
  workOrderPageSchema,
} from './contracts';
export type {
  WorkOrder,
  WorkOrderDetail,
  WorkOrderLine,
  WorkOrderEvent,
  WorkOrderStatus,
  LineKind,
  CreateWorkOrder,
  UpdateWorkOrder,
  AddWorkOrderLine,
  ListWorkOrdersQuery,
  WorkOrderPage,
} from './contracts';
export { WORK_ORDER_EVENT_NAMES, workOrderTopic } from './events';
export type { WorkOrderEventName } from './events';
