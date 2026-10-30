/**
 * The wire shapes, hand-written.
 *
 * Deliberately not generated from `openapi.json`: a generator is a build step
 * and a dependency, and this is a harness. The cost is that these can drift
 * from the API — which is itself useful to feel, since it is the same cost a
 * real client would pay.
 */
export type Role = 'operator' | 'staff' | 'portal';

export type Principal = {
  userId: string;
  tenantId: string;
  role: Role;
  customerId?: string | null;
};

export type CustomerStatus = 'prospect' | 'active' | 'inactive';

export type Customer = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  status: CustomerStatus;
  creditLimitCents: number;
  defaultLaborRateCents: number;
  billingTermsNetDays: number;
  isOnCreditHold: boolean;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VehicleStatus = 'out_of_service' | 'active' | 'retired';
export type VehicleClass = 'light_duty' | 'medium_duty' | 'heavy_duty' | 'trailer';

export type Vehicle = {
  id: string;
  tenantId: string;
  customerId: string;
  unitNumber: string;
  vin: string;
  make: string;
  model: string;
  modelYear: number;
  vehicleClass: VehicleClass;
  status: VehicleStatus;
  odometerMiles: number;
  lastServicedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

/** The one error body every endpoint returns. */
export type Problem = {
  kind:
    | 'NotFound'
    | 'Forbidden'
    | 'Conflict'
    | 'ValidationFailed'
    | 'BusinessRuleViolated'
    | 'Internal';
  message: string;
  context: Record<string, string | number | boolean | null>;
};

/** One SSE frame, as the stream reader hands it over. */
export type StreamFrame = {
  id: string;
  event: string;
  data: unknown;
  receivedAt: string;
};

export type WorkOrderStatus = 'draft' | 'authorized' | 'in_progress' | 'completed' | 'cancelled';
export type LineKind = 'labor' | 'part';

export type WorkOrderLine = {
  id: string;
  tenantId: string;
  customerId: string;
  workOrderId: string;
  kind: LineKind;
  description: string;
  /** Hundredths of a unit: 150 is 1.5 hours. */
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  createdAt: string;
};

export type WorkOrder = {
  id: string;
  tenantId: string;
  customerId: string;
  vehicleId: string;
  number: string;
  status: WorkOrderStatus;
  complaint: string;
  odometerInMiles: number;
  totalCents: number;
  authorizedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What `GET /v1/work-orders/{id}` returns — the order with its lines. */
export type WorkOrderDetail = WorkOrder & { lines: WorkOrderLine[] };
