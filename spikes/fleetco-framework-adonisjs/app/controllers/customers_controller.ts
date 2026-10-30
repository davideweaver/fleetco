import type { HttpContext } from '@adonisjs/core/http';

import { runJsonRoute, runSseRoute } from '../../platform/http/adonis_route.js';
import { getWiring } from '../../platform/wiring.js';

/**
 * The Adonis-idiomatic half of the `customers` endpoints — real classes,
 * real methods, resolved by the router the way AdonisJS apps normally are.
 *
 * Every method is one line, by construction: fetch the one `Route` value it
 * corresponds to from `modules/customers/routes.ts` (via `ctx.containerResolver`,
 * not a module singleton — see `platform/wiring.ts`) and hand it to the
 * shared adapter. There is nowhere here for logic to go — the parsing, the
 * plane check and the serialization already happened by the time either
 * adapter returns, same as the Fastify spike's route-table handlers.
 *
 * No constructor, no `@inject()`, no container resolution of `CustomerService`
 * itself — see `platform/wiring.ts` for why resolving the one `wiring` value
 * is the full extent of this codebase's use of the IoC container.
 */
export default class CustomersController {
  async index(ctx: HttpContext): Promise<void> {
    return runJsonRoute((await getWiring(ctx.containerResolver)).customerRoutes.list, ctx);
  }

  async show(ctx: HttpContext): Promise<void> {
    return runJsonRoute((await getWiring(ctx.containerResolver)).customerRoutes.get, ctx);
  }

  async store(ctx: HttpContext): Promise<void> {
    return runJsonRoute((await getWiring(ctx.containerResolver)).customerRoutes.create, ctx);
  }

  async update(ctx: HttpContext): Promise<void> {
    return runJsonRoute((await getWiring(ctx.containerResolver)).customerRoutes.update, ctx);
  }

  async events(ctx: HttpContext): Promise<void> {
    const wiring = await getWiring(ctx.containerResolver);
    return runSseRoute(wiring.customerRoutes.events, ctx, wiring.sse, wiring.config.SSE_HEARTBEAT_MS);
  }
}
