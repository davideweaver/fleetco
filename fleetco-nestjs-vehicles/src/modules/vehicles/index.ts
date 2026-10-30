/**
 * The module's public interface — the only legal import surface for another
 * module ([[Code Standards and Guardrails]] § The Golden Module).
 *
 * Absent, deliberately: `repository.ts`, `schema.ts`, and the Drizzle tables.
 * A sibling that wants a vehicle asks `VehiclesService`; it cannot join
 * against `vehicles.vehicles`.
 */
export { VehiclesModule } from './vehicles.module';
export { VehiclesService } from './service';
export {
  vehicleSchema,
  vehicleEventSchema,
  createVehicleSchema,
  updateVehicleSchema,
  listVehiclesQuerySchema,
  vehiclePageSchema,
} from './contracts';
export type {
  Vehicle,
  VehicleEvent,
  VehicleStatus,
  VehicleClass,
  CreateVehicle,
  UpdateVehicle,
  ListVehiclesQuery,
  VehiclePage,
} from './contracts';
export { VEHICLE_EVENT_NAMES, vehicleTopic } from './events';
export type { VehicleEventName } from './events';
