import { z } from 'zod';

import { customerIdSchema, tenantIdSchema, userIdSchema } from './branded.js';

/**
 * The `Principal` from the authN port in [[Auth and Identity]], with one
 * deliberate change: the document sketches
 *
 *   { plane: 'vendor' | 'tenant' | 'portal', customerId?: string }
 *
 * and that optional field is the bug. A portal principal constructed without a
 * `customerId` type-checks and is then scoped to the entire tenant — the exact
 * failure the leak suite exists to catch, made possible by the type. Modelled
 * as a union on `plane`, a portal principal without its customer **cannot be
 * constructed**, which moves the rule from tier 4 to tier 1.
 *
 * Authorization code depends only on this shape, never on how the person
 * authenticated, so adding SSO stays additive.
 */
export const AUTH_METHODS = ['password', 'sso', 'api_key', 'impersonation'] as const;

const basePrincipal = {
  userId: userIdSchema,
  tenantId: tenantIdSchema,
  roles: z.array(z.string().min(1)).readonly(),
  authMethod: z.enum(AUTH_METHODS),
};

export const principalSchema = z.discriminatedUnion('plane', [
  z.object({ ...basePrincipal, plane: z.literal('vendor') }),
  z.object({ ...basePrincipal, plane: z.literal('tenant') }),
  z.object({ ...basePrincipal, plane: z.literal('portal'), customerId: customerIdSchema }),
]);

export type Principal = z.infer<typeof principalSchema>;
