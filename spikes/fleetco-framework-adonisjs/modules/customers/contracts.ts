import { z } from 'zod';

import {
  ZERO_CENTS,
  centsSchema,
  customerIdSchema,
  instantSchema,
  tenantIdSchema,
} from '../../platform/types/branded.js';
import { CUSTOMER_EVENT_NAMES } from './events.js';

/**
 * The domain vocabulary lives here rather than in `schema.ts`, because the
 * lint rule forbids importing a module's `schema.ts` outside its repository —
 * a Drizzle table in a service is an unscoped query waiting to happen. These
 * are plain string and number sets, so `schema.ts` imports *them* (type-only)
 * instead of the other way round.
 *
 * Vocabulary comes from [[Domain Model]] § Customers & Assets: "Customer —
 * the fleet whose equipment is serviced". If the shop calls it a fleet's
 * `code`, the code calls it `code`. Identical to the Fastify and NestJS
 * spikes — see NOTES.md §1.
 *
 * Zod contracts, not VineJS. AdonisJS ships VineJS for request validation,
 * and it is a reasonable library, but [[Testing Strategy]] and
 * [[Code Standards and Guardrails]] both mandate Zod with *derived* types —
 * `z.infer`, never a parallel declaration — so that validation and types
 * cannot disagree. VineJS has no equivalent type-inference story as clean as
 * `z.infer`, and running two validation libraries side by side (one for
 * `customers`, one for anything scaffolded the Adonis-idiomatic way later)
 * is exactly the kind of inconsistency the golden module exists to prevent.
 * VineJS is not installed anywhere in this repository.
 */
export const CUSTOMER_STATUSES = ['prospect', 'active', 'inactive'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/** Net terms a shop will actually offer. Not free-form: it drives invoice due dates. */
export const BILLING_TERMS_NET_DAYS = [0, 15, 30, 45, 60] as const;
export type BillingTermsNetDays = (typeof BILLING_TERMS_NET_DAYS)[number];

const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Za-z0-9-]+$/, 'code may contain letters, digits and hyphens only');

const nameSchema = z.string().trim().min(1).max(200);
const emailSchema = z.email().max(254);
const phoneSchema = z.string().trim().min(7).max(32);

export const customerStatusSchema = z.enum(CUSTOMER_STATUSES);
export const billingTermsSchema = z.union([
  z.literal(BILLING_TERMS_NET_DAYS[0]),
  z.literal(BILLING_TERMS_NET_DAYS[1]),
  z.literal(BILLING_TERMS_NET_DAYS[2]),
  z.literal(BILLING_TERMS_NET_DAYS[3]),
  z.literal(BILLING_TERMS_NET_DAYS[4]),
]);

// ---------------------------------------------------------------------------
// The resource
// ---------------------------------------------------------------------------

export const customerSchema = z.object({
  id: customerIdSchema,
  tenantId: tenantIdSchema,
  code: codeSchema,
  name: nameSchema,
  status: customerStatusSchema,
  creditLimitCents: centsSchema,
  defaultLaborRateCents: centsSchema,
  billingTermsNetDays: billingTermsSchema,
  isOnCreditHold: z.boolean(),
  primaryContactEmail: emailSchema.nullable(),
  primaryContactPhone: phoneSchema.nullable(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export type Customer = z.infer<typeof customerSchema>;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const createCustomerSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  creditLimitCents: centsSchema.default(ZERO_CENTS),
  defaultLaborRateCents: centsSchema,
  billingTermsNetDays: billingTermsSchema.default(BILLING_TERMS_NET_DAYS[2]),
  primaryContactEmail: emailSchema.nullish(),
  primaryContactPhone: phoneSchema.nullish(),
});

export type CreateCustomer = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    name: nameSchema,
    creditLimitCents: centsSchema,
    defaultLaborRateCents: centsSchema,
    billingTermsNetDays: billingTermsSchema,
    isOnCreditHold: z.boolean(),
    primaryContactEmail: emailSchema.nullable(),
    primaryContactPhone: phoneSchema.nullable(),
    status: customerStatusSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'an update must change at least one field',
  });

export type UpdateCustomer = z.infer<typeof updateCustomerSchema>;

export const customerIdParamSchema = z.object({ customerId: customerIdSchema });

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const listCustomersQuerySchema = z.object({
  status: customerStatusSchema.optional(),
  /** Case-insensitive substring match on code or name. */
  search: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** Opaque keyset cursor, returned as `nextCursor` by the previous page. */
  cursor: z.string().min(1).optional(),
});

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const customerPageSchema = z.object({
  items: z.array(customerSchema),
  nextCursor: z.string().nullable(),
});

export type CustomerPage = z.infer<typeof customerPageSchema>;

// ---------------------------------------------------------------------------
// The SSE frame
// ---------------------------------------------------------------------------

export const customerEventSchema = z.object({
  /** The outbox cursor. Echoed as the SSE `id:` field, so it returns as `Last-Event-ID`. */
  id: z.number().int().positive(),
  name: z.enum(CUSTOMER_EVENT_NAMES),
  customerId: customerIdSchema,
  occurredAt: instantSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type CustomerEvent = z.infer<typeof customerEventSchema>;

export const streamQuerySchema = z.object({
  /**
   * Replay cursor for clients that cannot set a request header — EventSource
   * in a browser sends `Last-Event-ID` on its own reconnect, but the *first*
   * connection after a page reload cannot. The header wins when both are
   * present.
   */
  lastEventId: z.coerce.number().int().min(0).optional(),
});

export type StreamQuery = z.infer<typeof streamQuerySchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The one error body every endpoint returns, mapped from `DomainError` once. */
export const problemSchema = z.object({
  kind: z.enum([
    'NotFound',
    'Forbidden',
    'Conflict',
    'ValidationFailed',
    'BusinessRuleViolated',
    'Internal',
  ]),
  message: z.string(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export type Problem = z.infer<typeof problemSchema>;
