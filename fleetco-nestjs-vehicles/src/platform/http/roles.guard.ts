import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { Forbidden } from '../types/errors';
import type { Principal, Role } from '../types/principal';

/**
 * Role authorization at the route layer: "routes parse, authorize, call one
 * service method, serialize" ([[Code Standards and Guardrails]] § Layering).
 *
 * This is the *second* of two authorization questions, and they live in
 * different layers on purpose:
 *
 *  - **"May this role do this at all?"** — here, declaratively, per route.
 *  - **"Which rows may this principal see?"** — the repository's `Scope`
 *    chokepoint, unconditionally, on every query.
 *
 * Only the second one can cause a cross-tenant leak, which is why it is the
 * one that is structural rather than declarative.
 */
const ROLES_KEY = 'fleetco:roles';

export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed === undefined) return true;

    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const principal = request.principal;
    if (principal === undefined || !allowed.includes(principal.role)) {
      throw new Forbidden('role is not permitted on this route', {
        role: principal?.role ?? 'anonymous',
      });
    }
    return true;
  }
}
