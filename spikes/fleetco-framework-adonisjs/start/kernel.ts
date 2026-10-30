/*
|--------------------------------------------------------------------------
| HTTP kernel file
|--------------------------------------------------------------------------
|
| Registers the exception handler and the middleware stack. The slim
| starter kit's `container_bindings_middleware` is deliberately not
| registered — it exists to let OTHER code resolve `HttpContext` and
| `Logger` from the IoC container, and nothing in this codebase does that;
| every function that needs either receives it as a plain argument. Keeping
| it would be keeping an abstraction with no call site.
|
*/

import router from '@adonisjs/core/services/router';
import server from '@adonisjs/core/services/server';

server.errorHandler(() => import('../app/exceptions/handler.js'));

// The lazy-import arrow is the same AdonisJS idiom as `errorHandler`'s
// argument above; the rule's "allow typed function expressions" exception
// does not reach one nested inside an array literal the way it does a bare
// argument, so it needs the same disable `errorHandler` doesn't.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
server.use([() => import('../app/middleware/authenticate_middleware.js')]);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
router.use([() => import('@adonisjs/core/bodyparser_middleware')]);

export const middleware = router.named({});
