import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { DB } from '../../platform/db/db.module';
import { TenantScopedRepository } from '../../platform/db/tenant-scoped-repository';
import type { Db, Tx } from '../../platform/db/client';
import {
  toCents,
  toCustomerId,
  toInstant,
  toTenantId,
  toVehicleId,
  toWorkOrderId,
  toWorkOrderLineId,
} from '../../platform/types/branded';
import type { Cents, Instant, WorkOrderId } from '../../platform/types/branded';
import type { Scope } from '../../platform/types/scope';
import type {
  ListWorkOrdersQuery,
  WorkOrder,
  WorkOrderLine,
  WorkOrderPage,
  WorkOrderStatus,
} from './contracts';
import { workOrderLines, workOrders } from './schema';
import type { WorkOrderLineRow, WorkOrderRow } from './schema';

/**
 * The ONLY place a `workorders.*` query is written.
 *
 * Two classes, because `TenantScopedRepository` scopes one table and this
 * module owns two. That is the shape a multi-table module takes: one subclass
 * per table, each declaring its own scope columns, both living in the file the
 * lint rule allows to import Drizzle.
 *
 * Note what is still absent: any join to `customers.*` or `vehicles.*`. The
 * foreign keys exist in the database and the service asks the other modules'
 * services for anything it needs to know — [[Evolution Path]] rule 2.
 */

/** What an update writes: every mutable column, not a sparse patch. */
export type WorkOrderPatch = {
  readonly complaint: string;
  readonly odometerInMiles: number;
  readonly status: WorkOrderStatus;
  readonly totalCents: Cents;
  readonly authorizedAt: Instant | null;
  readonly closedAt: Instant | null;
  readonly updatedAt: Instant;
};

@Injectable()
export class WorkOrdersRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Db) {
    super(db);
  }

  protected readonly tenantColumn = workOrders.tenantId;
  protected readonly scopeColumn = workOrders.customerId;

  async findById(scope: Scope, id: WorkOrderId): Promise<WorkOrder | null> {
    const rows = await this.db
      .select()
      .from(workOrders)
      .where(and(...this.scopedWhere(scope), eq(workOrders.id, id)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toWorkOrder(row);
  }

  /** Used for the per-tenant order-number uniqueness rule. */
  async findByNumber(scope: Scope, number: string): Promise<WorkOrder | null> {
    const rows = await this.db
      .select()
      .from(workOrders)
      .where(and(...this.scopedWhere(scope), eq(workOrders.number, number)))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toWorkOrder(row);
  }

  async list(scope: Scope, query: ListWorkOrdersQuery): Promise<WorkOrderPage> {
    const predicates: SQL[] = [...this.scopedWhere(scope)];

    if (query.customerId !== undefined) {
      predicates.push(eq(workOrders.customerId, query.customerId));
    }
    if (query.vehicleId !== undefined) {
      predicates.push(eq(workOrders.vehicleId, query.vehicleId));
    }
    if (query.status !== undefined) {
      predicates.push(eq(workOrders.status, query.status));
    }
    if (query.search !== undefined) {
      const pattern = `%${query.search}%`;
      const match = or(ilike(workOrders.number, pattern), ilike(workOrders.complaint, pattern));
      if (match !== undefined) predicates.push(match);
    }
    if (query.cursor !== undefined) {
      predicates.push(this.keysetAfter(workOrders.number, workOrders.id, query.cursor));
    }

    const rows = await this.db
      .select()
      .from(workOrders)
      .where(and(...predicates))
      .orderBy(asc(workOrders.number), asc(workOrders.id))
      .limit(query.limit + 1);

    return this.toPage(rows.map(toWorkOrder), query.limit, (order) => ({
      sort: order.number,
      id: order.id,
    }));
  }

  async insert(tx: Tx, order: WorkOrder): Promise<void> {
    await tx.insert(workOrders).values({
      id: order.id,
      tenantId: order.tenantId,
      customerId: order.customerId,
      vehicleId: order.vehicleId,
      number: order.number,
      status: order.status,
      complaint: order.complaint,
      odometerInMiles: order.odometerInMiles,
      totalCents: order.totalCents,
      authorizedAt: order.authorizedAt === null ? null : new Date(order.authorizedAt),
      closedAt: order.closedAt === null ? null : new Date(order.closedAt),
      createdAt: new Date(order.createdAt),
      updatedAt: new Date(order.updatedAt),
    });
  }

  async update(
    tx: Tx,
    scope: Scope,
    id: WorkOrderId,
    patch: WorkOrderPatch,
  ): Promise<WorkOrder | null> {
    const rows = await tx
      .update(workOrders)
      .set({
        ...patch,
        authorizedAt: patch.authorizedAt === null ? null : new Date(patch.authorizedAt),
        closedAt: patch.closedAt === null ? null : new Date(patch.closedAt),
        updatedAt: new Date(patch.updatedAt),
      })
      .where(and(...this.scopedWhere(scope), eq(workOrders.id, id)))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toWorkOrder(row);
  }

  async findByIdForUpdate(tx: Tx, scope: Scope, id: WorkOrderId): Promise<WorkOrder | null> {
    const rows = await tx
      .select()
      .from(workOrders)
      .where(and(...this.scopedWhere(scope), eq(workOrders.id, id)))
      .limit(1)
      .for('update');
    const row = rows[0];
    return row === undefined ? null : toWorkOrder(row);
  }
}

/**
 * The child table's repository.
 *
 * It scopes on its own denormalised `customer_id` rather than reaching through
 * the parent, which is the whole reason that column exists. A portal principal
 * asking for a line gets the same predicate it gets everywhere else.
 */
@Injectable()
export class WorkOrderLinesRepository extends TenantScopedRepository {
  constructor(@Inject(DB) db: Db) {
    super(db);
  }

  protected readonly tenantColumn = workOrderLines.tenantId;
  protected readonly scopeColumn = workOrderLines.customerId;

  /** Every line on one order, oldest first — the order a shop reads them in. */
  async listForOrder(scope: Scope, workOrderId: WorkOrderId): Promise<WorkOrderLine[]> {
    const rows = await this.db
      .select()
      .from(workOrderLines)
      .where(and(...this.scopedWhere(scope), eq(workOrderLines.workOrderId, workOrderId)))
      .orderBy(asc(workOrderLines.createdAt), asc(workOrderLines.id));
    return rows.map(toWorkOrderLine);
  }

  /** Inside the transaction, so a total recomputed from this is the committed total. */
  async listForOrderInTx(tx: Tx, scope: Scope, workOrderId: WorkOrderId): Promise<WorkOrderLine[]> {
    const rows = await tx
      .select()
      .from(workOrderLines)
      .where(and(...this.scopedWhere(scope), eq(workOrderLines.workOrderId, workOrderId)))
      .orderBy(asc(workOrderLines.createdAt), asc(workOrderLines.id));
    return rows.map(toWorkOrderLine);
  }

  async insert(tx: Tx, line: WorkOrderLine): Promise<void> {
    await tx.insert(workOrderLines).values({
      id: line.id,
      tenantId: line.tenantId,
      customerId: line.customerId,
      workOrderId: line.workOrderId,
      kind: line.kind,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      amountCents: line.amountCents,
      createdAt: new Date(line.createdAt),
    });
  }

  /** Returns the number of rows removed, so the caller can tell "gone" from "not yours". */
  async remove(tx: Tx, scope: Scope, workOrderId: WorkOrderId, lineId: string): Promise<number> {
    const rows = await tx
      .delete(workOrderLines)
      .where(
        and(
          ...this.scopedWhere(scope),
          eq(workOrderLines.workOrderId, workOrderId),
          eq(workOrderLines.id, lineId),
        ),
      )
      .returning({ id: workOrderLines.id });
    return rows.length;
  }
}

function toWorkOrder(row: WorkOrderRow): WorkOrder {
  return {
    id: toWorkOrderId(row.id),
    tenantId: toTenantId(row.tenantId),
    customerId: toCustomerId(row.customerId),
    vehicleId: toVehicleId(row.vehicleId),
    number: row.number,
    status: row.status,
    complaint: row.complaint,
    odometerInMiles: row.odometerInMiles,
    totalCents: toCents(row.totalCents),
    authorizedAt: row.authorizedAt === null ? null : toInstant(row.authorizedAt),
    closedAt: row.closedAt === null ? null : toInstant(row.closedAt),
    createdAt: toInstant(row.createdAt),
    updatedAt: toInstant(row.updatedAt),
  };
}

function toWorkOrderLine(row: WorkOrderLineRow): WorkOrderLine {
  return {
    id: toWorkOrderLineId(row.id),
    tenantId: toTenantId(row.tenantId),
    customerId: toCustomerId(row.customerId),
    workOrderId: toWorkOrderId(row.workOrderId),
    kind: row.kind,
    description: row.description,
    quantity: row.quantity,
    unitPriceCents: toCents(row.unitPriceCents),
    amountCents: toCents(row.amountCents),
    createdAt: toInstant(row.createdAt),
  };
}
