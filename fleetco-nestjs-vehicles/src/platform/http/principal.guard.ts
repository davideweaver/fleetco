import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { loadConfig } from '../../config';
import { Forbidden } from '../types/errors';
import { principalSchema } from '../types/principal';
import type { Principal } from '../types/principal';

/**
 * SPIKE SCAFFOLDING — NOT AN AUTHENTICATION IMPLEMENTATION.
 *
 * The real thing is an opaque session token in Postgres, looked up per request
 * (ADR-013), minted by Better Auth behind the `AuthN` port (ADR-012). None of
 * that is in scope for a framework spike, so this guard trusts a request
 * header instead.
 *
 * It refuses to start under `RUNTIME_ENV=production`, so the spike cannot be
 * deployed with header-asserted identity even by accident. That refusal is the
 * reason this is acceptable scaffolding rather than a hole.
 *
 * What it *does* establish, which is what the spike is measuring: every
 * request arrives with a validated `Principal`, and `Scope` is derivable from
 * nothing else. The leak suite authenticates as tenant A and asks for tenant
 * B's rows through exactly this path.
 */
export const PRINCIPAL_HEADER = 'x-fleetco-principal';

/**
 * Opts a route out of authentication. The guard is global and default-deny, so
 * every tenant-scoped route is protected whether or not anyone remembered to
 * annotate it; this marks the one route that must answer an anonymous caller.
 *
 * The only legitimate use is the health endpoint, which is read by the load
 * balancer and carries no tenant data (ADR-022 rule 7). `leak.test.ts`
 * enumerates the OpenAPI document and asserts every documented operation
 * refuses an unauthenticated request, so marking a tenant-scoped route public
 * fails the build.
 */
const PUBLIC_KEY = 'fleetco:public';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);

type RequestWithPrincipal = Request & { principal?: Principal };

@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {
    if (loadConfig().RUNTIME_ENV === 'production') {
      throw new Error(
        'PrincipalGuard is spike scaffolding and must never run in production — ' +
          'replace it with the ADR-012 session lookup first',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const raw = request.header(PRINCIPAL_HEADER);
    if (raw === undefined) {
      throw new Forbidden('no authenticated principal', {});
    }

    const parsed = principalSchema.safeParse(safeJson(raw));
    if (!parsed.success) {
      throw new Forbidden('principal is not well formed', {});
    }
    request.principal = parsed.data;
    return true;
  }
}

/** Reads the principal the guard attached. Throws rather than returning `undefined`. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;
    if (principal === undefined) {
      throw new Forbidden('no authenticated principal', {});
    }
    return principal;
  },
);

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
