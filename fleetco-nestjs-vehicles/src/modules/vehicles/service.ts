import { Inject, Injectable } from '@nestjs/common';
import { concat, concatMap, filter, from, map, of } from 'rxjs';
import type { Observable } from 'rxjs';

import { CLOCK } from '../../platform/db/db.module';
import { OutboxRepository } from '../../platform/outbox/repository';
import { OutboxNotifier } from '../../platform/outbox/notifier';
import type { OutboxEvent } from '../../platform/outbox/repository';
import { newVehicleId, toVehicleId } from '../../platform/types/branded';
import type { CustomerId, Instant, TenantId, VehicleId } from '../../platform/types/branded';
import type { Clock } from '../../platform/types/clock';
import { BusinessRuleViolated, Conflict, NotFound } from '../../platform/types/errors';
import type { Principal } from '../../platform/types/principal';
import { scopeOf } from '../../platform/types/scope';
import { CustomersService } from '../customers';
import type { Customer } from '../customers';
import { VehiclesRepository } from './repository';
import type { VehiclePatch } from './repository';
import { VEHICLE_EVENT_NAMES, vehicleEvent, vehicleTopic } from './events';
import type { VehicleEventName } from './events';
import {
  MAX_MODEL_YEAR_LOOKAHEAD,
  MIN_MODEL_YEAR,
} from './contracts';
import type {
  CreateVehicle,
  UpdateVehicle,
  Vehicle,
  VehicleEvent,
  VehiclePage,
  VehicleStatus,
  ListVehiclesQuery,
} from './contracts';

// ===========================================================================
// Pure domain rules
//
// Pure functions over plain data: no repository, no clock reaching for
// `new Date()`, no I/O. `service.test.ts` and `invariants.test.ts` import only
// from this section.
//
// One rule here — `assertActivationAllowed` — depends on the *customers*
// module. It stays pure by taking the customer's status as an argument rather
// than fetching it, which is what keeps the cross-module dependency in the
// orchestration half where it can be read.
// ===========================================================================

/** `out_of_service ⇄ active`, either into `retired`, and `retired` is terminal. */
export function legalNextStatuses(status: VehicleStatus): readonly VehicleStatus[] {
  switch (status) {
    case 'out_of_service':
      return ['active', 'retired'];
    case 'active':
      return ['out_of_service', 'retired'];
    case 'retired':
      // Terminal on purpose. A sold or scrapped unit keeps its service history
      // and must never re-enter the rotation under the same row, because its
      // odometer and its warranty clock no longer belong to this fleet.
      return [];
    default: {
      const unhandled: never = status;
      throw new Error(`unhandled vehicle status: ${String(unhandled)}`);
    }
  }
}

export function canTransition(from: VehicleStatus, to: VehicleStatus): boolean {
  return from === to || legalNextStatuses(from).includes(to);
}

/** The shop's unit number for a truck, e.g. `TRK-14`. Uppercased so `trk-14` collides. */
export function normalizeUnitNumber(raw: string): string {
  return raw.trim().toUpperCase();
}

/** VINs are conventionally uppercase, and the per-tenant unique index is case-sensitive. */
export function normalizeVin(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * The year from an ISO-8601 UTC instant, without constructing a `Date`.
 *
 * `new Date()` is lint-banned in this file (time is injected so it can be
 * frozen), and the rule's selector matches every `new Date(...)`, not only the
 * zero-argument form. Slicing the instant is the honest way through: an
 * `Instant` is branded precisely because it is known to be ISO 8601 in UTC, so
 * the first four characters are the year by construction.
 */
export function yearOf(instant: Instant): number {
  return Number.parseInt(instant.slice(0, 4), 10);
}

/**
 * A model year within reach of reality. The upper bound is rolling because
 * manufacturers ship next year's trucks this autumn, so a fixed literal would
 * start rejecting valid data in January.
 */
export function assertModelYear(modelYear: number, now: Instant): void {
  const ceiling = yearOf(now) + MAX_MODEL_YEAR_LOOKAHEAD;
  if (modelYear < MIN_MODEL_YEAR || modelYear > ceiling) {
    throw new BusinessRuleViolated('model year is outside the plausible range', {
      modelYear,
      floor: MIN_MODEL_YEAR,
      ceiling,
    });
  }
}

/**
 * An odometer only goes up.
 *
 * This is the cross-field rule that justifies a service layer for this module:
 * it cannot live in a Zod schema, which sees one request in isolation, and it
 * cannot live in a `CHECK` constraint, which sees one row with no memory of its
 * previous value. A rollback is either a transcription error or fraud, and in
 * a shop it silently corrupts every PM interval computed from it.
 */
export function assertOdometerRules(previousMiles: number, nextMiles: number): void {
  if (nextMiles < previousMiles) {
    throw new BusinessRuleViolated('odometer cannot decrease', {
      previousMiles,
      nextMiles,
    });
  }
}

/**
 * The cross-module rule: a unit cannot be cleared for service while the fleet
 * that owns it is not active.
 *
 * Pure, and takes `customerStatus` as data rather than reaching for the
 * customers module itself. That is what lets this be unit-tested with no
 * database and no fake of `CustomersService` — the orchestration below fetches
 * the status and hands it in.
 *
 * Note the asymmetry with the customers module's credit-hold rule, which it
 * deliberately mirrors: the guard is on the *transition into* `active`, not on
 * the state of being active. A fleet going inactive must not silently park
 * every truck it owns; that is a separate, deliberate operation.
 */
export function assertActivationAllowed(
  currentStatus: VehicleStatus,
  nextStatus: VehicleStatus,
  customerStatus: Customer['status'],
): void {
  const isActivating = nextStatus === 'active' && currentStatus !== 'active';
  if (isActivating && customerStatus !== 'active') {
    throw new BusinessRuleViolated('a vehicle cannot be activated while its customer is not active', {
      customerStatus,
    });
  }
}

/** Builds the new vehicle value. Pure: the id, tenant and time are arguments. */
export function buildNewVehicle(
  tenantId: TenantId,
  id: VehicleId,
  now: Instant,
  input: CreateVehicle,
): Vehicle {
  assertModelYear(input.modelYear, now);

  // A unit is added to the fleet before it is cleared to take work, so every
  // vehicle starts out of service. Activation is a transition, which is where
  // the customer-status rule gets its chance to refuse.
  return {
    id,
    tenantId,
    customerId: input.customerId,
    unitNumber: normalizeUnitNumber(input.unitNumber),
    vin: normalizeVin(input.vin),
    make: input.make.trim(),
    model: input.model.trim(),
    modelYear: input.modelYear,
    vehicleClass: input.vehicleClass,
    status: 'out_of_service',
    odometerMiles: input.odometerMiles,
    lastServicedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Applies an update and returns a new value. Pure, total, and the only place a
 * status transition or an odometer move is decided.
 *
 * The customer-status rule is *not* applied here, because it needs a row this
 * module may not read. `update` below calls `assertActivationAllowed`
 * separately, after fetching the fleet through `CustomersService`.
 */
export function applyPatch(current: Vehicle, patch: UpdateVehicle, now: Instant): Vehicle {
  const status = patch.status ?? current.status;
  const odometerMiles = patch.odometerMiles ?? current.odometerMiles;

  if (!canTransition(current.status, status)) {
    throw new BusinessRuleViolated('illegal vehicle status transition', {
      from: current.status,
      to: status,
      legal: legalNextStatuses(current.status).join(',') || '(terminal)',
    });
  }
  assertOdometerRules(current.odometerMiles, odometerMiles);

  const modelYear = patch.modelYear ?? current.modelYear;
  assertModelYear(modelYear, now);

  return {
    ...current,
    unitNumber:
      patch.unitNumber === undefined ? current.unitNumber : normalizeUnitNumber(patch.unitNumber),
    make: patch.make === undefined ? current.make : patch.make.trim(),
    model: patch.model === undefined ? current.model : patch.model.trim(),
    modelYear,
    vehicleClass: patch.vehicleClass ?? current.vehicleClass,
    status,
    odometerMiles,
    lastServicedAt:
      patch.lastServicedAt === undefined ? current.lastServicedAt : patch.lastServicedAt,
    updatedAt: now,
  };
}

/** Exactly one event per state change ([[Realtime and Events]]). */
export function eventNameFor(before: Vehicle, after: Vehicle): VehicleEventName {
  return before.status === after.status ? 'vehicle.updated' : 'vehicle.status_changed';
}

/**
 * Which fields actually moved, for the event payload. Spelled out rather than
 * derived from `Object.keys` so identity fields and `updatedAt` can never be
 * reported as changes, and so `satisfies` makes a typo a compile error.
 */
const REPORTED_FIELDS = [
  'unitNumber',
  'vin',
  'make',
  'model',
  'modelYear',
  'vehicleClass',
  'status',
  'odometerMiles',
  'lastServicedAt',
] as const satisfies readonly (keyof Vehicle)[];

export function changedFieldNames(before: Vehicle, after: Vehicle): string[] {
  return REPORTED_FIELDS.filter((field) => before[field] !== after[field]);
}

// ===========================================================================
// Orchestration
// ===========================================================================

/** Replay is bounded so a client with an ancient cursor cannot ask for the world. */
const MAX_REPLAY_ROWS = 500;

@Injectable()
export class VehiclesService {
  /**
   * `customers: CustomersService` is the cross-module edge, and it is the only
   * way this module can learn anything about a fleet.
   *
   * It is injected as the *service*, imported from `modules/customers/index.ts`
   * — not the repository, which the lint rule and the Nest module's `exports`
   * both refuse. That means every cross-module read is already tenant-scoped by
   * the other module's own chokepoint, so the FK validation below gets its
   * isolation for free rather than re-implementing it.
   */
  constructor(
    private readonly vehicles: VehiclesRepository,
    private readonly customers: CustomersService,
    private readonly outbox: OutboxRepository,
    private readonly notifier: OutboxNotifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  list(principal: Principal, query: ListVehiclesQuery): Promise<VehiclePage> {
    return this.vehicles.list(scopeOf(principal), query);
  }

  async get(principal: Principal, id: VehicleId): Promise<Vehicle> {
    const vehicle = await this.vehicles.findById(scopeOf(principal), id);
    if (vehicle === null) throw notFound(id);
    return vehicle;
  }

  /**
   * The state change and its outbox row commit together or not at all.
   *
   * The first thing this does is ask the customers module for the fleet. That
   * call is the cross-module reference check *and* the authorization check at
   * once: `CustomersService.get` applies its own scope and throws `NotFound`
   * when the principal cannot reach the customer, so a staff user in tenant A
   * cannot attach a vehicle to a customer in tenant B — and does not learn
   * whether that customer exists.
   */
  async create(principal: Principal, input: CreateVehicle): Promise<Vehicle> {
    const scope = scopeOf(principal);

    // Throws NotFound if the fleet is absent or out of scope.
    await this.customers.get(principal, input.customerId);

    const unitNumber = normalizeUnitNumber(input.unitNumber);
    const vin = normalizeVin(input.vin);

    const unitClash = await this.vehicles.findByUnitNumber(scope, input.customerId, unitNumber);
    if (unitClash !== null) {
      throw new Conflict('a vehicle with that unit number already exists in this fleet', {
        unitNumber,
        customerId: input.customerId,
      });
    }
    const vinClash = await this.vehicles.findByVin(scope, vin);
    if (vinClash !== null) {
      throw new Conflict('a vehicle with that VIN already exists in this tenant', { vin });
    }

    const vehicle = buildNewVehicle(scope.tenantId, newVehicleId(), this.clock.now(), {
      ...input,
      unitNumber,
      vin,
    });

    try {
      return await this.vehicles.transaction(async (tx) => {
        await this.vehicles.insert(tx, vehicle);
        await this.outbox.append(
          tx,
          vehicleEvent('vehicle.created', vehicle, {
            unitNumber: vehicle.unitNumber,
            vin: vehicle.vin,
            status: vehicle.status,
          }),
        );
        return vehicle;
      });
    } catch (error) {
      // The pre-checks above race: two concurrent creates both see no clash.
      // The unique indexes are what actually decide, so translate a violation
      // rather than leaking a driver error.
      if (isUniqueViolation(error)) {
        throw new Conflict('that unit number or VIN is already taken', { unitNumber, vin });
      }
      throw error;
    }
  }

  /**
   * The activation rule needs the owning fleet's status, and this module cannot
   * read `customers.customers`. So the fetch happens here, outside the
   * transaction, and the pure rule is applied to its result.
   *
   * Reading the customer outside the vehicle's transaction is a deliberate
   * choice, not an oversight: the alternative is holding a lock on another
   * module's row for the duration of this module's write, which couples the
   * two modules' contention and is exactly what [[Evolution Path]] is trying
   * to avoid. The cost is a narrow race — a fleet deactivated in the
   * microseconds after this read still permits one activation. A stale
   * `active` for one request is an acceptable outcome for a shop; a
   * cross-module lock is not.
   */
  async update(principal: Principal, id: VehicleId, patch: UpdateVehicle): Promise<Vehicle> {
    const scope = scopeOf(principal);

    const isActivationAttempt = patch.status === 'active';
    const customer = isActivationAttempt
      ? await this.customerFor(principal, id)
      : null;

    return this.vehicles.transaction(async (tx) => {
      // Locked read, so the status and odometer the rules were validated
      // against are the values being written over.
      const current = await this.vehicles.findByIdForUpdate(tx, scope, id);
      if (current === null) throw notFound(id);

      // `applyPatch` runs first on purpose. It holds the rules this module
      // owns outright — transition legality, the odometer, the model year —
      // and they are the more fundamental refusal. Asking the customers module
      // first meant that un-retiring a truck under an inactive fleet reported
      // "customer is not active" rather than "retired is terminal", which is
      // true but is not the reason.
      const next = applyPatch(current, patch, this.clock.now());

      if (customer !== null) {
        assertActivationAllowed(current.status, next.status, customer.status);
      }
      const saved = await this.vehicles.update(tx, scope, id, toRowPatch(next));
      if (saved === null) throw notFound(id);

      await this.outbox.append(
        tx,
        vehicleEvent(eventNameFor(current, next), saved, {
          changed: changedFieldNames(current, next),
          status: saved.status,
        }),
      );
      return saved;
    });
  }

  /**
   * Vehicle-scoped SSE stream. Same three steps as the customers stream, and
   * the same reason for each: authorize through the REST code path, replay from
   * the cursor, then resume live and re-authorize every frame.
   */
  async streamFor(
    principal: Principal,
    vehicleId: VehicleId,
    lastEventId: number | null,
  ): Promise<Observable<VehicleEvent>> {
    const vehicle = await this.get(principal, vehicleId);
    const scope = scopeOf(principal);
    const topic = vehicleTopic(vehicle.tenantId, vehicle.id);

    const from_ = lastEventId ?? (await this.outbox.currentCursor(scope, topic));
    const replayed = await this.outbox.readTopicSince(scope, topic, from_, MAX_REPLAY_ROWS);
    const resumeAt = replayed[replayed.length - 1]?.id ?? from_;

    const live = this.notifier.notifications().pipe(
      filter((note) => note.topic === topic && note.id > resumeAt),
      // `concatMap`, NOT `mergeMap`. The original spike used `mergeMap`,
      // which runs these reads concurrently and emits in *completion* order:
      // two events dispatched milliseconds apart could reach the client
      // reversed. Because a client records `Last-Event-ID` from the last
      // frame it saw, receiving 5 then 4 makes it store 5 and skip 4 forever
      // on reconnect — silent loss in the mechanism built to prevent loss.
      // Serialising costs throughput we do not need and buys ordering we do.
      concatMap((note) => from(this.outbox.readScopedById(scope, note.id))),
      filter((event): event is OutboxEvent => event !== null),
    );

    return concat(of(...replayed), live).pipe(
      map(toVehicleEvent),
      filter((event): event is VehicleEvent => event !== null),
    );
  }

  /** Resolves the owning fleet of a vehicle this principal can reach. */
  private async customerFor(principal: Principal, id: VehicleId): Promise<Customer> {
    const vehicle = await this.get(principal, id);
    return this.customers.get(principal, vehicle.customerId);
  }
}

function notFound(id: VehicleId): NotFound {
  return new NotFound('vehicle not found', { vehicleId: id });
}

/**
 * Narrows an outbox row to this module's event contract, or `null` if it is not
 * one.
 *
 * `vehicleId` comes out of the payload rather than off a column, because the
 * outbox has no generic subject id — see the note in `events.ts`. The read is a
 * parse rather than an assertion, so a malformed payload is dropped instead of
 * reaching a browser as a half-built frame.
 */
function toVehicleEvent(event: OutboxEvent): VehicleEvent | null {
  const name = VEHICLE_EVENT_NAMES.find((known) => known === event.name);
  if (name === undefined || event.customerId === null) return null;

  const rawVehicleId = event.payload['vehicleId'];
  if (typeof rawVehicleId !== 'string') return null;

  return {
    id: event.id,
    name,
    vehicleId: toVehicleId(rawVehicleId),
    customerId: event.customerId satisfies CustomerId,
    occurredAt: event.occurredAt,
    payload: event.payload,
  };
}

function toRowPatch(next: Vehicle): VehiclePatch {
  return {
    unitNumber: next.unitNumber,
    make: next.make,
    model: next.model,
    modelYear: next.modelYear,
    vehicleClass: next.vehicleClass,
    status: next.status,
    odometerMiles: next.odometerMiles,
    lastServicedAt: next.lastServicedAt,
    updatedAt: next.updatedAt,
  };
}

/** Postgres `unique_violation`. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === '23505';
}
