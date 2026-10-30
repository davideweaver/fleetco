/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| Plain, idiomatic AdonisJS routing: a path, a controller, a method. The
| five `customers` routes below exist so there is somewhere a reader
| navigates to that is shaped exactly like every other AdonisJS app's
| `start/routes.ts` — the thing [[Framework Evaluation]] is actually testing.
|
| What makes this safe to keep this thin: `route.meta.path` on each value in
| `modules/customers/routes.ts` is the literal AdonisJS path string, so there
| is exactly one place that string is written, and the OpenAPI document and
| the leak suite both read it back from the same route objects rather than
| from this file.
|
*/

import router from '@adonisjs/core/services/router';

import { getWiring } from '../platform/wiring.js';
import { health } from '../platform/http/health.js';
import { buildOpenApiDocument } from '../platform/openapi/document.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the AdonisJS lazy-import idiom; see start/kernel.ts for the same disable.
const CustomersController = () => import('../app/controllers/customers_controller.js');

router.get('/v1/customers', [CustomersController, 'index']);
router.get('/v1/customers/:customerId', [CustomersController, 'show']);
router.post('/v1/customers', [CustomersController, 'store']);
router.patch('/v1/customers/:customerId', [CustomersController, 'update']);
router.get('/v1/customers/:customerId/events', [CustomersController, 'events']);

/**
 * ADR-022 rule 7: "a real health endpoint that touches the database." Takes
 * no principal, so it is registered directly rather than through the route
 * table — the leak suite has nothing to assert about an endpoint that
 * returns no tenant data.
 */
router.get('/health', async (ctx) => {
  const wiring = await getWiring(ctx.containerResolver);
  return health(ctx, wiring.database, wiring.sse);
});

/**
 * Served rather than only written to a file, so a client generator can point
 * at a running instance and so the leak suite can read the live document.
 */
router.get('/openapi.json', async (ctx) => {
  const wiring = await getWiring(ctx.containerResolver);
  ctx.response.status(200).send(buildOpenApiDocument(wiring.customerRoutes.all, '1'));
});
