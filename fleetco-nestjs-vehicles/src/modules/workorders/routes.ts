import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { interval, map, merge } from 'rxjs';
import type { Observable } from 'rxjs';

import { loadConfig } from '../../config';
import { CurrentPrincipal } from '../../platform/http/principal.guard';
import { Roles, RolesGuard } from '../../platform/http/roles.guard';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { TELEMETRY } from '../../platform/observability/telemetry';
import type { Telemetry } from '../../platform/observability/telemetry';
import type { Principal } from '../../platform/types/principal';
import {
  addWorkOrderLineSchema,
  createWorkOrderSchema,
  listWorkOrdersQuerySchema,
  updateWorkOrderSchema,
  workOrderDetailSchema,
  workOrderEventSchema,
  workOrderIdParamSchema,
  workOrderLineParamSchema,
  workOrderLineSchema,
  workOrderPageSchema,
  workOrderSchema,
} from './contracts';
import type {
  AddWorkOrderLine,
  CreateWorkOrder,
  ListWorkOrdersQuery,
  UpdateWorkOrder,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderLine,
  WorkOrderPage,
} from './contracts';
import { WorkOrdersService } from './service';

/**
 * Thin by rule: parse, authorize, call one service method, serialize.
 *
 * Seven handlers rather than five — the two extra are the line sub-resource,
 * which is the first thing in the codebase that does not fit the golden
 * module's shape.
 */
@Controller({ path: 'work-orders', version: '1' })
@UseGuards(RolesGuard)
export class WorkOrdersController {
  constructor(
    @Inject(TELEMETRY) private readonly telemetry: Telemetry,
    private readonly orders: WorkOrdersService,
  ) {}

  @Get()
  @Roles('operator', 'staff', 'portal')
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodPipe(listWorkOrdersQuerySchema)) query: ListWorkOrdersQuery,
  ): Promise<WorkOrderPage> {
    return workOrderPageSchema.parse(await this.orders.list(principal, query));
  }

  /** The detail view returns the lines with the order — one round trip for a bay tablet. */
  @Get(':workOrderId')
  @Roles('operator', 'staff', 'portal')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(workOrderIdParamSchema)) params: { workOrderId: WorkOrder['id'] },
  ): Promise<WorkOrderDetail> {
    return workOrderDetailSchema.parse(await this.orders.getDetail(principal, params.workOrderId));
  }

  @Post()
  @Roles('operator', 'staff')
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createWorkOrderSchema)) body: CreateWorkOrder,
  ): Promise<WorkOrder> {
    return workOrderSchema.parse(await this.orders.create(principal, body));
  }

  @Patch(':workOrderId')
  @Roles('operator', 'staff')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(workOrderIdParamSchema)) params: { workOrderId: WorkOrder['id'] },
    @Body(new ZodPipe(updateWorkOrderSchema)) body: UpdateWorkOrder,
  ): Promise<WorkOrder> {
    return workOrderSchema.parse(await this.orders.update(principal, params.workOrderId, body));
  }

  // -------------------------------------------------------------------------
  // The line sub-resource
  // -------------------------------------------------------------------------

  @Get(':workOrderId/lines')
  @Roles('operator', 'staff', 'portal')
  async listLines(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(workOrderIdParamSchema)) params: { workOrderId: WorkOrder['id'] },
  ): Promise<WorkOrderLine[]> {
    const lines = await this.orders.listLines(principal, params.workOrderId);
    return lines.map((line) => workOrderLineSchema.parse(line));
  }

  @Post(':workOrderId/lines')
  @Roles('operator', 'staff')
  async addLine(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(workOrderIdParamSchema)) params: { workOrderId: WorkOrder['id'] },
    @Body(new ZodPipe(addWorkOrderLineSchema)) body: AddWorkOrderLine,
  ): Promise<WorkOrderLine> {
    return workOrderLineSchema.parse(
      await this.orders.addLine(principal, params.workOrderId, body),
    );
  }

  @Delete(':workOrderId/lines/:lineId')
  @Roles('operator', 'staff')
  @HttpCode(204)
  async removeLine(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(workOrderLineParamSchema))
    params: { workOrderId: WorkOrder['id']; lineId: WorkOrderLine['id'] },
  ): Promise<void> {
    await this.orders.removeLine(principal, params.workOrderId, params.lineId);
  }

  // -------------------------------------------------------------------------

  @Sse(':workOrderId/events')
  @Roles('operator', 'staff', 'portal')
  async events(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(workOrderIdParamSchema)) params: { workOrderId: WorkOrder['id'] },
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    const stream = await this.orders.streamFor(
      principal,
      params.workOrderId,
      parseCursor(lastEventId),
    );

    const frames = stream.pipe(
      map(
        (event): MessageEvent => ({
          id: String(event.id),
          type: event.name,
          data: workOrderEventSchema.parse(event),
        }),
      ),
    );

    const heartbeat = interval(loadConfig().SSE_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ comment: 'keep-alive' })),
    );

    // Counts this connection while it is open and decrements however it
    // ends — including the client simply vanishing, which is the only way
    // an SSE connection actually ends in the field.
    return merge(frames, heartbeat).pipe(
      this.telemetry.trackStream('fleetco_sse_connections_open', { resource: 'work-orders' }),
    );
  }
}

/** Zero is a valid cursor meaning "replay the whole retained stream". */
function parseCursor(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
