import { Inject, Injectable } from '@nestjs/common';
import { concat, concatMap, filter, from, map, of } from 'rxjs';
import type { Observable } from 'rxjs';

import { CLOCK } from '../../platform/db/db.module';
import { OutboxRepository } from '../../platform/outbox/repository';
import { OutboxNotifier } from '../../platform/outbox/notifier';
import type { OutboxEvent } from '../../platform/outbox/repository';
import { newWorkOrderId, newWorkOrderLineId, toCents, toWorkOrderId } from '../../platform/types/branded';
import type { Cents, Instant, TenantId, WorkOrderId } from '../../platform/types/branded';
import type { Clock } from '../../platform/types/clock';
import { BusinessRuleViolated, Conflict, NotFound } from '../../platform/types/errors';
import type { Principal } from '../../platform/types/principal';
import { scopeOf } from '../../platform/types/scope';
import { CustomersService } from '../customers';
import type { Customer } from '../customers';
import { VehiclesService } from '../vehicles';
import type { Vehicle } from '../vehicles';
import { WorkOrderLinesRepository, WorkOrdersRepository } from './repository';
import type { WorkOrderPatch } from './repository';
import { WORK_ORDER_EVENT_NAMES, workOrderEvent, workOrderTopic } from './events';
import type { WorkOrderEventName } from './events';
import type {
  AddWorkOrderLine,
  CreateWorkOrder,
  ListWorkOrdersQuery,
  UpdateWorkOrder,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderEvent,
  WorkOrderLine,
  WorkOrderPage,
  WorkOrderStatus,
} from './contracts';

// ===========================================================================
// Pure domain rules
// ===========================================================================

/**
 * `draft → authorized → in_progress → completed`, with `cancelled` reachable
 * only before work starts. `completed` and `cancelled` are terminal: a closed
 * order is the billing record.
 */
export function legalNextStatuses(status: WorkOrderStatus): readonly WorkOrderStatus[] {
  switch (status) {
    case 'draft':
      return ['authorized', 'cancelled'];
    case 'authorized':
      return ['in_progress', 'cancelled'];
    case 'in_progress':
      return ['completed'];
    case 'completed':
      return [];
    case 'cancelled':
      return [];
    default: {
      const unhandled: never = status;
      throw new Error(`unhandled work order status: ${String(unhandled)}`);
    }
  }
}

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return from === to || legalNextStatuses(from).includes(to);
}

export function normalizeNumber(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Lines are open for editing only while the order has not been worked or closed. */
export function acceptsLineChanges(status: WorkOrderStatus): boolean {
  return status === 'draft' || status === 'authorized';
}

/**
 * `quantity` is hundredths, `unitPriceCents` is whole cents, so the product is
 * divided by 100. Integer arithmetic throughout, rounded half-up at the single
 * point where a fraction can appear — money never becomes a float.
 */
export function lineAmountCents(quantity: number, unitPriceCents: Cents): Cents {
  return toCents(Math.round((quantity * unitPriceCents) / 100));
}

export function totalOf(lines: readonly WorkOrderLine[]): Cents {
  return toCents(lines.reduce((sum, line) => sum + line.amountCents, 0));
}

/**
 * The cross-module authorization rule.
 *
 * A shop does not start billable work for a fleet that is on credit hold or
 * not active — that is the whole point of a hold. Pure: it takes the
 * customer's state as data, so it is unit-testable with no fake of
 * `CustomersService`.
 */
export function assertAuthorizationAllowed(
  current: WorkOrderStatus,
  next: WorkOrderStatus,
  customer: Pick<Customer, 'status' | 'isOnCreditHold'>,
  lineCount: number,
): void {
  const isAuthorizing = next === 'authorized' && current !== 'authorized';
  if (!isAuthorizing) return;

  if (lineCount === 0) {
    throw new BusinessRuleViolated('a work order cannot be authorized with no lines', {});
  }
  if (customer.isOnCreditHold) {
    throw new BusinessRuleViolated('a work order cannot be authorized for a fleet on credit hold', {});
  }
  if (customer.status !== 'active') {
    throw new BusinessRuleViolated('a work order cannot be authorized for an inactive fleet', {
      customerStatus: customer.status,
    });
  }
}

/** A retired unit does not take new work, and a unit belongs to exactly one fleet. */
export function assertVehicleUsable(vehicle: Pick<Vehicle, 'status' | 'customerId'>): void {
  if (vehicle.status === 'retired') {
    throw new BusinessRuleViolated('a retired vehicle cannot take new work', {
      vehicleStatus: vehicle.status,
    });
  }
}

export function buildNewWorkOrder(
  tenantId: TenantId,
  id: WorkOrderId,
  now: Instant,
  vehicle: Pick<Vehicle, 'id' | 'customerId'>,
  input: CreateWorkOrder,
): WorkOrder {
  return {
    id,
    tenantId,
    // Derived from the vehicle, never from the request: the fleet that owns
    // the unit is the fleet that gets billed.
    customerId: vehicle.customerId,
    vehicleId: vehicle.id,
    number: normalizeNumber(input.number),
    status: 'draft',
    complaint: input.complaint.trim(),
    odometerInMiles: input.odometerInMiles,
    totalCents: toCents(0),
    authorizedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Applies an update and returns a new value. Pure, and the only place a status
 * transition is decided. The cross-module rule is applied separately by the
 * orchestration, which has to fetch the fleet first.
 */
export function applyPatch(
  current: WorkOrder,
  patch: UpdateWorkOrder,
  totalCents: Cents,
  now: Instant,
): WorkOrder {
  const status = patch.status ?? current.status;

  if (!canTransition(current.status, status)) {
    throw new BusinessRuleViolated('illegal work order status transition', {
      from: current.status,
      to: status,
      legal: legalNextStatuses(current.status).join(',') || '(terminal)',
    });
  }

  const isAuthorizing = status === 'authorized' && current.status !== 'authorized';
  const isClosing = status === 'completed' || status === 'cancelled';

  return {
    ...current,
    complaint: patch.complaint === undefined ? current.complaint : patch.complaint.trim(),
    odometerInMiles: patch.odometerInMiles ?? current.odometerInMiles,
    status,
    totalCents,
    authorizedAt: isAuthorizing ? now : current.authorizedAt,
    closedAt: isClosing && current.closedAt === null ? now : current.closedAt,
    updatedAt: now,
  };
}

export function eventNameFor(before: WorkOrder, after: WorkOrder): WorkOrderEventName {
  return before.status === after.status ? 'work_order.updated' : 'work_order.status_changed';
}

const REPORTED_FIELDS = [
  'number',
  'status',
  'complaint',
  'odometerInMiles',
  'totalCents',
] as const satisfies readonly (keyof WorkOrder)[];

export function changedFieldNames(before: WorkOrder, after: WorkOrder): string[] {
  return REPORTED_FIELDS.filter((field) => before[field] !== after[field]);
}

// ===========================================================================
// Orchestration
// ===========================================================================

const MAX_REPLAY_ROWS = 500;

@Injectable()
export class WorkOrdersService {
  /**
   * The first module to depend on **two** others.
   *
   * Both arrive as services imported from their module's `index.ts`, and Nest
   * resolves them only because `CustomersModule` and `VehiclesModule` list
   * them in `exports`. Neither repository is reachable from here — asking for
   * one throws at bootstrap — so every cross-module read is already scoped by
   * the owning module's own chokepoint.
   */
  constructor(
    private readonly orders: WorkOrdersRepository,
    private readonly lines: WorkOrderLinesRepository,
    private readonly customers: CustomersService,
    private readonly vehicles: VehiclesService,
    private readonly outbox: OutboxRepository,
    private readonly notifier: OutboxNotifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  list(principal: Principal, query: ListWorkOrdersQuery): Promise<WorkOrderPage> {
    return this.orders.list(scopeOf(principal), query);
  }

  async get(principal: Principal, id: WorkOrderId): Promise<WorkOrder> {
    const order = await this.orders.findById(scopeOf(principal), id);
    if (order === null) throw notFound(id);
    return order;
  }

  /** The order plus its lines, each scoped independently. */
  async getDetail(principal: Principal, id: WorkOrderId): Promise<WorkOrderDetail> {
    const order = await this.get(principal, id);
    const lines = await this.lines.listForOrder(scopeOf(principal), id);
    return { ...order, lines };
  }

  async listLines(principal: Principal, id: WorkOrderId): Promise<WorkOrderLine[]> {
    // Resolve the order first, so an unreachable order is a 404 rather than an
    // empty list — "no lines" and "not yours" must not look the same.
    await this.get(principal, id);
    return this.lines.listForOrder(scopeOf(principal), id);
  }

  /**
   * Opening an order asks both other modules a question, and the order matters:
   * the vehicle resolves the fleet, so it is fetched first and its `customerId`
   * is what the order is billed to. A caller cannot name the fleet.
   */
  async create(principal: Principal, input: CreateWorkOrder): Promise<WorkOrder> {
    const scope = scopeOf(principal);

    // Throws NotFound if the unit is absent or out of scope.
    const vehicle = await this.vehicles.get(principal, input.vehicleId);
    assertVehicleUsable(vehicle);

    const number = normalizeNumber(input.number);
    const clash = await this.orders.findByNumber(scope, number);
    if (clash !== null) {
      throw new Conflict('a work order with that number already exists in this tenant', { number });
    }

    const order = buildNewWorkOrder(
      scope.tenantId,
      newWorkOrderId(),
      this.clock.now(),
      vehicle,
      { ...input, number },
    );

    try {
      return await this.orders.transaction(async (tx) => {
        await this.orders.insert(tx, order);
        await this.outbox.append(
          tx,
          workOrderEvent('work_order.created', order, {
            number: order.number,
            vehicleId: order.vehicleId,
            status: order.status,
          }),
        );
        return order;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Conflict('a work order with that number already exists in this tenant', { number });
      }
      throw error;
    }
  }

  /**
   * The fleet is fetched outside the transaction, for the same reason the
   * vehicles module fetches its customer outside one: holding a lock on
   * another module's row for the length of this module's write couples their
   * contention. The cost is a narrow race on a hold placed in the microseconds
   * after the read.
   */
  async update(principal: Principal, id: WorkOrderId, patch: UpdateWorkOrder): Promise<WorkOrder> {
    const scope = scopeOf(principal);

    const isAuthorizationAttempt = patch.status === 'authorized';
    const customer: Customer | null = isAuthorizationAttempt
      ? await this.customers.get(principal, (await this.get(principal, id)).customerId)
      : null;

    return this.orders.transaction(async (tx) => {
      const current = await this.orders.findByIdForUpdate(tx, scope, id);
      if (current === null) throw notFound(id);

      // The total is always recomputed from the committed lines, never trusted
      // from a caller and never left stale after a line change.
      const lines = await this.lines.listForOrderInTx(tx, scope, id);
      const total = totalOf(lines);

      // Local rules decide before the cross-module one, so the refusal names
      // the most specific reason.
      const next = applyPatch(current, patch, total, this.clock.now());

      if (customer !== null) {
        assertAuthorizationAllowed(current.status, next.status, customer, lines.length);
      }

      const saved = await this.orders.update(tx, scope, id, toRowPatch(next));
      if (saved === null) throw notFound(id);

      await this.outbox.append(
        tx,
        workOrderEvent(eventNameFor(current, next), saved, {
          changed: changedFieldNames(current, next),
          status: saved.status,
        }),
      );
      return saved;
    });
  }

  /** Adds a line and re-totals the order, atomically. */
  async addLine(
    principal: Principal,
    id: WorkOrderId,
    input: AddWorkOrderLine,
  ): Promise<WorkOrderLine> {
    const scope = scopeOf(principal);

    return this.orders.transaction(async (tx) => {
      const order = await this.orders.findByIdForUpdate(tx, scope, id);
      if (order === null) throw notFound(id);

      if (!acceptsLineChanges(order.status)) {
        throw new BusinessRuleViolated('lines cannot change once work has started or finished', {
          status: order.status,
        });
      }

      const line: WorkOrderLine = {
        id: newWorkOrderLineId(),
        tenantId: order.tenantId,
        customerId: order.customerId,
        workOrderId: order.id,
        kind: input.kind,
        description: input.description.trim(),
        quantity: input.quantity,
        unitPriceCents: input.unitPriceCents,
        amountCents: lineAmountCents(input.quantity, input.unitPriceCents),
        createdAt: this.clock.now(),
      };

      await this.lines.insert(tx, line);
      const total = totalOf(await this.lines.listForOrderInTx(tx, scope, id));
      const saved = await this.orders.update(tx, scope, id, {
        ...toRowPatch(order),
        totalCents: total,
        updatedAt: this.clock.now(),
      });
      if (saved === null) throw notFound(id);

      await this.outbox.append(
        tx,
        workOrderEvent('work_order.line_added', saved, {
          lineId: line.id,
          kind: line.kind,
          amountCents: line.amountCents,
          totalCents: total,
        }),
      );
      return line;
    });
  }

  /** Removes a line and re-totals. */
  async removeLine(principal: Principal, id: WorkOrderId, lineId: string): Promise<void> {
    const scope = scopeOf(principal);

    await this.orders.transaction(async (tx) => {
      const order = await this.orders.findByIdForUpdate(tx, scope, id);
      if (order === null) throw notFound(id);

      if (!acceptsLineChanges(order.status)) {
        throw new BusinessRuleViolated('lines cannot change once work has started or finished', {
          status: order.status,
        });
      }

      const removed = await this.lines.remove(tx, scope, id, lineId);
      if (removed === 0) {
        throw new NotFound('work order line not found', { lineId });
      }

      const total = totalOf(await this.lines.listForOrderInTx(tx, scope, id));
      const saved = await this.orders.update(tx, scope, id, {
        ...toRowPatch(order),
        totalCents: total,
        updatedAt: this.clock.now(),
      });
      if (saved === null) throw notFound(id);

      await this.outbox.append(
        tx,
        workOrderEvent('work_order.line_removed', saved, { lineId, totalCents: total }),
      );
    });
  }

  async streamFor(
    principal: Principal,
    workOrderId: WorkOrderId,
    lastEventId: number | null,
  ): Promise<Observable<WorkOrderEvent>> {
    const order = await this.get(principal, workOrderId);
    const scope = scopeOf(principal);
    const topic = workOrderTopic(order.tenantId, order.id);

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
      map(toWorkOrderEvent),
      filter((event): event is WorkOrderEvent => event !== null),
    );
  }
}

function notFound(id: WorkOrderId): NotFound {
  return new NotFound('work order not found', { workOrderId: id });
}

function toWorkOrderEvent(event: OutboxEvent): WorkOrderEvent | null {
  const name = WORK_ORDER_EVENT_NAMES.find((known) => known === event.name);
  if (name === undefined || event.customerId === null) return null;

  const rawId = event.payload['workOrderId'];
  if (typeof rawId !== 'string') return null;

  return {
    id: event.id,
    name,
    workOrderId: toWorkOrderId(rawId),
    customerId: event.customerId,
    occurredAt: event.occurredAt,
    payload: event.payload,
  };
}

function toRowPatch(next: WorkOrder): WorkOrderPatch {
  return {
    complaint: next.complaint,
    odometerInMiles: next.odometerInMiles,
    status: next.status,
    totalCents: next.totalCents,
    authorizedAt: next.authorizedAt,
    closedAt: next.closedAt,
    updatedAt: next.updatedAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === '23505';
}
