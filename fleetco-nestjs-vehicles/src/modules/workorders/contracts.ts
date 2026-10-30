import { z } from 'zod';

import {
  centsSchema,
  customerIdSchema,
  instantSchema,
  tenantIdSchema,
  vehicleIdSchema,
  workOrderIdSchema,
  workOrderLineIdSchema,
} from '../../platform/types/branded';
import { WORK_ORDER_EVENT_NAMES } from './events';

/**
 * The repair-order vocabulary. Terms follow what a service advisor says, per
 * the ubiquitous-language rule: a shop writes a *repair order*, a driver
 * reports a *complaint*, and the shop *authorizes* work before touching it.
 */

/**
 * `draft → authorized → in_progress → completed`, with `cancelled` reachable
 * from the two states before any work has happened. `completed` and
 * `cancelled` are terminal: a closed order is the billing record, and
 * reopening it would rewrite history that an invoice already referenced.
 */
export const WORK_ORDER_STATUSES = [
  'draft',
  'authorized',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/** A line is either labour or a part. Shops price and tax the two differently. */
export const LINE_KINDS = ['labor', 'part'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

const orderNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9-]+$/, 'order number may contain letters, digits and hyphens only');

const complaintSchema = z.string().trim().min(1).max(2000);
const descriptionSchema = z.string().trim().min(1).max(500);

/** Quantity in hundredths, so 1.5 hours of labour is `150`. Never a float. */
const QUANTITY_CEILING = 1_000_00;
const quantitySchema = z.int().min(1).max(QUANTITY_CEILING);

const odometerSchema = z.int().min(0).max(2_000_000);

export const workOrderStatusSchema = z.enum(WORK_ORDER_STATUSES);
export const lineKindSchema = z.enum(LINE_KINDS);

export { QUANTITY_CEILING };

// ---------------------------------------------------------------------------
// The line
// ---------------------------------------------------------------------------

export const workOrderLineSchema = z.object({
  id: workOrderLineIdSchema,
  tenantId: tenantIdSchema,
  /** Denormalised from the parent so a portal principal can be scoped here directly. */
  customerId: customerIdSchema,
  workOrderId: workOrderIdSchema,
  kind: lineKindSchema,
  description: descriptionSchema,
  quantity: quantitySchema,
  unitPriceCents: centsSchema,
  /** `quantity * unitPrice / 100`, computed by the service and never accepted from a caller. */
  amountCents: centsSchema,
  createdAt: instantSchema,
});

export type WorkOrderLine = z.infer<typeof workOrderLineSchema>;

export const addWorkOrderLineSchema = z.object({
  kind: lineKindSchema,
  description: descriptionSchema,
  quantity: quantitySchema,
  unitPriceCents: centsSchema,
});

export type AddWorkOrderLine = z.infer<typeof addWorkOrderLineSchema>;

// ---------------------------------------------------------------------------
// The resource
// ---------------------------------------------------------------------------

export const workOrderSchema = z.object({
  id: workOrderIdSchema,
  tenantId: tenantIdSchema,
  /** The fleet being billed. The portal scope key. */
  customerId: customerIdSchema,
  /** The unit in the bay. Must belong to the same fleet — checked via the vehicles module. */
  vehicleId: vehicleIdSchema,
  number: orderNumberSchema,
  status: workOrderStatusSchema,
  complaint: complaintSchema,
  odometerInMiles: odometerSchema,
  /** Sum of the lines. Derived, stored for query speed, recomputed on every change. */
  totalCents: centsSchema,
  authorizedAt: instantSchema.nullable(),
  closedAt: instantSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export type WorkOrder = z.infer<typeof workOrderSchema>;

/** A work order plus its lines — what the detail endpoint returns. */
export const workOrderDetailSchema = workOrderSchema.extend({
  lines: z.array(workOrderLineSchema),
});

export type WorkOrderDetail = z.infer<typeof workOrderDetailSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const createWorkOrderSchema = z.object({
  vehicleId: vehicleIdSchema,
  number: orderNumberSchema,
  complaint: complaintSchema,
  odometerInMiles: odometerSchema,
});

export type CreateWorkOrder = z.infer<typeof createWorkOrderSchema>;

/**
 * `customerId` is absent: the fleet is derived from the vehicle, not chosen by
 * the caller. `totalCents` is absent: it is the sum of the lines. Both would
 * be ways to assert something the server must decide.
 */
export const updateWorkOrderSchema = z
  .object({
    complaint: complaintSchema,
    odometerInMiles: odometerSchema,
    status: workOrderStatusSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an update must change at least one field',
  });

export type UpdateWorkOrder = z.infer<typeof updateWorkOrderSchema>;

export const workOrderIdParamSchema = z.object({ workOrderId: workOrderIdSchema });
export const workOrderLineParamSchema = z.object({
  workOrderId: workOrderIdSchema,
  lineId: workOrderLineIdSchema,
});

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const listWorkOrdersQuerySchema = z.object({
  customerId: customerIdSchema.optional(),
  vehicleId: vehicleIdSchema.optional(),
  status: workOrderStatusSchema.optional(),
  /** Case-insensitive substring match on the order number or the complaint. */
  search: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
});

export type ListWorkOrdersQuery = z.infer<typeof listWorkOrdersQuerySchema>;

export const workOrderPageSchema = z.object({
  items: z.array(workOrderSchema),
  nextCursor: z.string().nullable(),
});

export type WorkOrderPage = z.infer<typeof workOrderPageSchema>;

// ---------------------------------------------------------------------------
// The SSE frame
// ---------------------------------------------------------------------------

export const workOrderEventSchema = z.object({
  id: z.number().int().positive(),
  name: z.enum(WORK_ORDER_EVENT_NAMES),
  workOrderId: workOrderIdSchema,
  customerId: customerIdSchema,
  occurredAt: instantSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type WorkOrderEvent = z.infer<typeof workOrderEventSchema>;
