import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
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
  createVehicleSchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
  vehicleEventSchema,
  vehicleIdParamSchema,
  vehiclePageSchema,
  vehicleSchema,
} from './contracts';
import type {
  CreateVehicle,
  ListVehiclesQuery,
  UpdateVehicle,
  Vehicle,
  VehiclePage,
} from './contracts';
import { VehiclesService } from './service';

/**
 * Thin by rule: parse, authorize, call one service method, serialize.
 *
 * Byte for byte this is the customers controller with the nouns changed, which
 * is the point of measuring module two: five handlers, five `@Roles` lines,
 * five `ZodPipe` constructions, one SSE handler, one cursor parser.
 */
@Controller({ path: 'vehicles', version: '1' })
@UseGuards(RolesGuard)
export class VehiclesController {
  constructor(
    @Inject(TELEMETRY) private readonly telemetry: Telemetry,
    private readonly vehicles: VehiclesService,
  ) {}

  @Get()
  @Roles('operator', 'staff', 'portal')
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodPipe(listVehiclesQuerySchema)) query: ListVehiclesQuery,
  ): Promise<VehiclePage> {
    return vehiclePageSchema.parse(await this.vehicles.list(principal, query));
  }

  @Get(':vehicleId')
  @Roles('operator', 'staff', 'portal')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(vehicleIdParamSchema)) params: { vehicleId: Vehicle['id'] },
  ): Promise<Vehicle> {
    return vehicleSchema.parse(await this.vehicles.get(principal, params.vehicleId));
  }

  @Post()
  @Roles('operator', 'staff')
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createVehicleSchema)) body: CreateVehicle,
  ): Promise<Vehicle> {
    return vehicleSchema.parse(await this.vehicles.create(principal, body));
  }

  @Patch(':vehicleId')
  @Roles('operator', 'staff')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(vehicleIdParamSchema)) params: { vehicleId: Vehicle['id'] },
    @Body(new ZodPipe(updateVehicleSchema)) body: UpdateVehicle,
  ): Promise<Vehicle> {
    return vehicleSchema.parse(await this.vehicles.update(principal, params.vehicleId, body));
  }

  /**
   * One vehicle's event stream.
   *
   * `async` for the same reason as the customers stream: Nest commits the
   * `text/event-stream` headers only after the returned promise resolves, so an
   * authorization failure still becomes a real JSON 403/404 through
   * `DomainErrorFilter` rather than an error frame inside an already-200 body.
   */
  @Sse(':vehicleId/events')
  @Roles('operator', 'staff', 'portal')
  async events(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(vehicleIdParamSchema)) params: { vehicleId: Vehicle['id'] },
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    const stream = await this.vehicles.streamFor(
      principal,
      params.vehicleId,
      parseCursor(lastEventId),
    );

    const frames = stream.pipe(
      map(
        (event): MessageEvent => ({
          id: String(event.id),
          type: event.name,
          data: vehicleEventSchema.parse(event),
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
      this.telemetry.trackStream('fleetco_sse_connections_open', { resource: 'vehicles' }),
    );
  }
}

/**
 * An unparseable `Last-Event-ID` means "no cursor", not an error — a client
 * must never be stuck in a reconnect loop because of a malformed header. Zero
 * is a *valid* cursor meaning "replay the whole retained stream", so the bound
 * is `>= 0`.
 */
function parseCursor(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
