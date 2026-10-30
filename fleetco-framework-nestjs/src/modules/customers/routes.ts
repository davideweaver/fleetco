import {
  Body,
  Controller,
  Get,
  Headers,
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
import type { Principal } from '../../platform/types/principal';
import {
  createCustomerSchema,
  customerEventSchema,
  customerIdParamSchema,
  customerPageSchema,
  customerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './contracts';
import type {
  CreateCustomer,
  Customer,
  CustomerPage,
  ListCustomersQuery,
  UpdateCustomer,
} from './contracts';
import { CustomersService } from './service';

/**
 * Thin by rule: parse, authorize, call one service method, serialize. There is
 * no `if` in this file that is not a null check on an optional header.
 *
 * Named `routes.ts` rather than `customers.controller.ts` to match the golden
 * module layout in [[Code Standards and Guardrails]]. The class keeps Nest's
 * name so the framework's own conventions still read correctly.
 */
@Controller({ path: 'customers', version: '1' })
@UseGuards(RolesGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles('operator', 'staff', 'portal')
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodPipe(listCustomersQuerySchema)) query: ListCustomersQuery,
  ): Promise<CustomerPage> {
    return customerPageSchema.parse(await this.customers.list(principal, query));
  }

  @Get(':customerId')
  @Roles('operator', 'staff', 'portal')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(customerIdParamSchema)) params: { customerId: Customer['id'] },
  ): Promise<Customer> {
    return customerSchema.parse(await this.customers.get(principal, params.customerId));
  }

  @Post()
  @Roles('operator', 'staff')
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodPipe(createCustomerSchema)) body: CreateCustomer,
  ): Promise<Customer> {
    return customerSchema.parse(await this.customers.create(principal, body));
  }

  @Patch(':customerId')
  @Roles('operator', 'staff')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(customerIdParamSchema)) params: { customerId: Customer['id'] },
    @Body(new ZodPipe(updateCustomerSchema)) body: UpdateCustomer,
  ): Promise<Customer> {
    return customerSchema.parse(await this.customers.update(principal, params.customerId, body));
  }

  /**
   * Customer-scoped event stream.
   *
   * The handler is `async` on purpose. Nest commits the `text/event-stream`
   * headers only after the returned promise resolves, so an authorization
   * failure raised while the service is resolving the customer still becomes a
   * real 403/404 JSON body through `DomainErrorFilter` rather than an error
   * frame inside an already-200 stream.
   *
   * `Last-Event-ID` is the replay cursor, per [[Realtime and Events]]
   * § Replay on Reconnect. It is the browser's own header — `EventSource`
   * sends it automatically after a reconnect — so a technician's tablet
   * resumes without the client having to track anything.
   */
  @Sse(':customerId/events')
  @Roles('operator', 'staff', 'portal')
  async events(
    @CurrentPrincipal() principal: Principal,
    @Param(new ZodPipe(customerIdParamSchema)) params: { customerId: Customer['id'] },
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Promise<Observable<MessageEvent>> {
    const stream = await this.customers.streamFor(
      principal,
      params.customerId,
      parseCursor(lastEventId),
    );

    const frames = stream.pipe(
      map(
        (event): MessageEvent => ({
          id: String(event.id),
          type: event.name,
          data: customerEventSchema.parse(event),
        }),
      ),
    );

    // Keeps idle corporate proxies from closing the connection. A comment
    // frame carries no event, so a client never sees it.
    const heartbeat = interval(loadConfig().SSE_HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ comment: 'keep-alive' })),
    );

    return merge(frames, heartbeat);
  }
}

/**
 * An unparseable `Last-Event-ID` means "no cursor", not an error — a client
 * must never be stuck in a reconnect loop because of a malformed header.
 *
 * Zero is a *valid* cursor meaning "replay the whole retained stream", so the
 * bound is `>= 0`. Treating it as absent would silently turn a full replay
 * into a tail-from-now, which is the kind of off-by-one that loses a
 * technician's last twenty minutes of updates.
 */
function parseCursor(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
