import { z } from 'zod';

import { customerIdSchema, tenantIdSchema, userIdSchema } from './branded.js';

/**
 * The authN port's output, from [[Auth and Identity]] § The authN Port.
 * Authorization code depends on this and never on how the person
 * authenticated, which is what makes SSO additive later.
 *
 * Modelled as a discriminated union on `plane` rather than the document's
 * `plane` + optional `customerId`, because the optional field is the bug:
 * a portal principal without a `customerId` would type-check and would be
 * scoped to the whole tenant. Here it cannot be constructed.
 */
export const PLANES = ['vendor', 'tenant', 'portal'] as const;
export type Plane = (typeof PLANES)[number];

export const principalSchema = z.discriminatedUnion('plane', [
  z.object({
    plane: z.literal('vendor'),
    userId: userIdSchema,
    tenantId: tenantIdSchema,
    roles: z.array(z.string()).default([]),
    authMethod: z.enum(['password', 'sso', 'api_key', 'impersonation']),
  }),
  z.object({
    plane: z.literal('tenant'),
    userId: userIdSchema,
    tenantId: tenantIdSchema,
    roles: z.array(z.string()).default([]),
    authMethod: z.enum(['password', 'sso', 'api_key', 'impersonation']),
  }),
  z.object({
    plane: z.literal('portal'),
    userId: userIdSchema,
    tenantId: tenantIdSchema,
    /** Present only for portal principals, and required for them. */
    customerId: customerIdSchema,
    roles: z.array(z.string()).default([]),
    authMethod: z.enum(['password', 'sso', 'api_key', 'impersonation']),
  }),
]);

export type Principal = z.infer<typeof principalSchema>;
