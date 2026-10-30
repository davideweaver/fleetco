import { z } from 'zod';

import {
  customerIdSchema,
  instantSchema,
  tenantIdSchema,
  vehicleIdSchema,
} from '../../platform/types/branded';
import { VEHICLE_EVENT_NAMES } from './events';

/**
 * The domain vocabulary lives here rather than in `schema.ts` because the lint
 * rule forbids importing a module's `schema.ts` outside its repository — a
 * Drizzle table in a service is an unscoped query waiting to happen. These are
 * plain string sets, so `schema.ts` imports *them* (type-only) instead.
 */

/**
 * A unit is added to the fleet before it is cleared to take work, so
 * `out_of_service` is the entry state rather than a demotion. `retired` is
 * terminal: a sold or scrapped truck keeps its service history and must never
 * re-enter the rotation under the same row.
 */
export const VEHICLE_STATUSES = ['out_of_service', 'active', 'retired'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_CLASSES = ['light_duty', 'medium_duty', 'heavy_duty', 'trailer'] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

/**
 * Zod is the single source of truth for validation, types and documentation
 * (ADR-014). Every type below is *derived* with `z.infer`, never declared
 * alongside the schema, so the two cannot disagree.
 */

/**
 * The shop's unit number for the truck within the customer's fleet, e.g.
 * `TRK-14`. Unique per customer, not per tenant: two different fleets both
 * calling a truck `101` is normal and must not collide.
 */
const unitNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9-]+$/, 'unit number may contain letters, digits and hyphens only');

/**
 * A 17-character VIN. `I`, `O` and `Q` are excluded from the VIN alphabet by
 * ISO 3779 precisely because they are confusable with 1 and 0, which is the
 * transcription error a service advisor actually makes.
 */
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const vinSchema = z.string().trim().toUpperCase().regex(VIN_RE, 'VIN must be 17 characters and exclude I, O and Q');

const makeSchema = z.string().trim().min(1).max(60);
const modelSchema = z.string().trim().min(1).max(60);

/** Rolling bound, not a literal — a model year of 1899 is a typo, 2500 is a different typo. */
const MIN_MODEL_YEAR = 1900;
const MAX_MODEL_YEAR_LOOKAHEAD = 2;

const modelYearSchema = z.int().min(MIN_MODEL_YEAR).max(2100);

/**
 * Odometer in whole miles. An integer because a tenth of a mile is not a thing
 * a shop records, and because a float here would eventually be averaged.
 */
const ODOMETER_CEILING_MILES = 2_000_000;
const odometerSchema = z.int().min(0).max(ODOMETER_CEILING_MILES);

export const vehicleStatusSchema = z.enum(VEHICLE_STATUSES);
export const vehicleClassSchema = z.enum(VEHICLE_CLASSES);

export { MIN_MODEL_YEAR, MAX_MODEL_YEAR_LOOKAHEAD, ODOMETER_CEILING_MILES };

// ---------------------------------------------------------------------------
// The resource
// ---------------------------------------------------------------------------

export const vehicleSchema = z.object({
  id: vehicleIdSchema,
  tenantId: tenantIdSchema,

  /**
   * The owning fleet. This is the cross-module reference: the row carries it,
   * the database enforces it with a foreign key across schemas, and the
   * service validates it by asking the customers module — never by joining to
   * `customers.customers` ([[Evolution Path]] rule 2).
   */
  customerId: customerIdSchema,

  unitNumber: unitNumberSchema,
  vin: vinSchema,
  make: makeSchema,
  model: modelSchema,
  modelYear: modelYearSchema,
  vehicleClass: vehicleClassSchema,
  status: vehicleStatusSchema,
  odometerMiles: odometerSchema,
  lastServicedAt: instantSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export type Vehicle = z.infer<typeof vehicleSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const createVehicleSchema = z.object({
  customerId: customerIdSchema,
  unitNumber: unitNumberSchema,
  vin: vinSchema,
  make: makeSchema,
  model: modelSchema,
  modelYear: modelYearSchema,
  vehicleClass: vehicleClassSchema,
  odometerMiles: odometerSchema.default(0),
});

export type CreateVehicle = z.infer<typeof createVehicleSchema>;

/**
 * `customerId` is absent on purpose, and unlike the equivalent note in the
 * customers module this one is true of the schema below: a vehicle does not
 * change hands by field assignment. Re-assigning a truck to another fleet is a
 * transfer with its own authorization and its own event, and letting it ride
 * along in a PATCH body would let a caller move a row out of its own scope.
 *
 * `status` *is* here, and is validated as a transition rather than as a value
 * — see `applyPatch` in `service.ts`.
 */
export const updateVehicleSchema = z
  .object({
    unitNumber: unitNumberSchema,
    make: makeSchema,
    model: modelSchema,
    modelYear: modelYearSchema,
    vehicleClass: vehicleClassSchema,
    status: vehicleStatusSchema,
    odometerMiles: odometerSchema,
    lastServicedAt: instantSchema.nullable(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an update must change at least one field',
  });

export type UpdateVehicle = z.infer<typeof updateVehicleSchema>;

export const vehicleIdParamSchema = z.object({ vehicleId: vehicleIdSchema });

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const listVehiclesQuerySchema = z.object({
  /**
   * Filter to one fleet. A portal principal is already pinned to its customer
   * by `Scope`, so this narrows a staff user's view and is redundant — but
   * harmless — for a portal one.
   */
  customerId: customerIdSchema.optional(),
  status: vehicleStatusSchema.optional(),
  vehicleClass: vehicleClassSchema.optional(),
  /** Case-insensitive substring match on unit number or VIN. */
  search: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** Opaque keyset cursor returned as `nextCursor` by the previous page. */
  cursor: z.string().min(1).optional(),
});

export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;

export const vehiclePageSchema = z.object({
  items: z.array(vehicleSchema),
  nextCursor: z.string().nullable(),
});

export type VehiclePage = z.infer<typeof vehiclePageSchema>;

// ---------------------------------------------------------------------------
// The SSE frame
// ---------------------------------------------------------------------------

export const vehicleEventSchema = z.object({
  /** The outbox cursor. Echoed as the SSE `id:` field, so it returns as `Last-Event-ID`. */
  id: z.number().int().positive(),
  name: z.enum(VEHICLE_EVENT_NAMES),
  vehicleId: vehicleIdSchema,
  customerId: customerIdSchema,
  occurredAt: instantSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type VehicleEvent = z.infer<typeof vehicleEventSchema>;
