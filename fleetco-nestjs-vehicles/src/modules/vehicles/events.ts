import type { TenantId, VehicleId } from '../../platform/types/branded';
import type { NewOutboxEvent } from '../../platform/outbox/repository';
import type { Vehicle } from './contracts';

/**
 * The module's outbox event definitions. Names follow the
 * `entity.past_tense_verb` convention in [[Realtime and Events]]
 * § Event Shape.
 */
export const VEHICLE_EVENT_NAMES = [
  'vehicle.created',
  'vehicle.updated',
  'vehicle.status_changed',
] as const;

export type VehicleEventName = (typeof VEHICLE_EVENT_NAMES)[number];

/**
 * One vehicle's topic.
 *
 * Deliberately keyed on the vehicle rather than on its customer, so a
 * technician's tablet watching one unit in a bay is not woken by every other
 * truck in the fleet. The fleet-wide stream a portal dashboard wants is a
 * separate subscription and a separate decision.
 */
export function vehicleTopic(tenantId: TenantId, vehicleId: VehicleId): string {
  return `vehicle:${tenantId}:${vehicleId}`;
}

/**
 * Builds the outbox row for a vehicle event.
 *
 * Two things here are worth reading slowly, because both are places where the
 * outbox turns out to be shaped for the customers module:
 *
 *  1. `customerId` is the vehicle's *owning customer*, not the vehicle. The
 *     outbox column is the portal scoping column ([[Tenancy Model]]: a portal
 *     principal is pinned to one customer), so it must carry the value the
 *     principal is pinned to. In `customers` the scope key and the entity id
 *     were the same column, which hid this distinction entirely.
 *
 *  2. The vehicle's own id therefore has nowhere to go but the payload. There
 *     is no generic `entity_id` column on `platform.outbox_events`, so
 *     `vehicleId` is written into the payload by this function and read back
 *     out by `toVehicleEvent` in `service.ts`. Adding a per-entity column for
 *     every future module is not an option, so either the payload carries it
 *     or the outbox grows a generic `subject_id`. Flagged, not decided.
 */
export function vehicleEvent(
  name: VehicleEventName,
  vehicle: Vehicle,
  payload: Readonly<Record<string, unknown>>,
): NewOutboxEvent {
  return {
    tenantId: vehicle.tenantId,
    customerId: vehicle.customerId,
    topic: vehicleTopic(vehicle.tenantId, vehicle.id),
    name,
    payload: { vehicleId: vehicle.id, ...payload },
    occurredAt: vehicle.updatedAt,
  };
}
