import { z } from 'zod';

import { customerIdSchema, tenantIdSchema, userIdSchema } from './branded';
import type { CustomerId, TenantId, UserId } from './branded';

/**
 * The three planes from [[Tenancy Model]] § Three Planes, Not Two.
 *
 * `operator` is the vendor plane, which for phase one is an admin role inside
 * the single application rather than a separate app (revised 2026-10-09). It
 * still acts inside exactly one tenant per request — impersonation selects the
 * tenant — so the scope chokepoint stays total.
 */
export type Role = 'operator' | 'staff' | 'portal';

/**
 * The authenticated subject of a request.
 *
 * `customerId` is non-null exactly when the role is `portal`. That invariant is
 * enforced in `principalSchema` below rather than by a union type, because the
 * union would force every consumer to narrow before reading `tenantId`, and
 * `tenantId` is the field they all actually want.
 */
export type Principal = {
  readonly userId: UserId;
  readonly tenantId: TenantId;
  readonly role: Role;
  readonly customerId: CustomerId | null;
};

export const principalSchema = z
  .object({
    userId: userIdSchema,
    tenantId: tenantIdSchema,
    role: z.enum(['operator', 'staff', 'portal']),
    customerId: customerIdSchema.nullable().default(null),
  })
  .refine((p) => (p.role === 'portal' ? p.customerId !== null : true), {
    message: 'a portal principal must carry exactly one customerId',
    path: ['customerId'],
  })
  .refine((p) => (p.role === 'portal' ? true : p.customerId === null), {
    message: 'only a portal principal may carry a customerId',
    path: ['customerId'],
  });

export type ParsedPrincipal = z.infer<typeof principalSchema>;
