import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

import { ValidationFailed } from './errors';

/**
 * Branded primitives — tier 1 of the enforcement hierarchy in
 * [[Code Standards and Guardrails]].
 *
 * This file is the ONLY place a brand is minted, and therefore the only place a
 * type assertion is permitted (see the eslint override for this path). Every
 * other file receives already-branded values or calls a constructor here.
 *
 * The repetition below is deliberate. A generic `brand<T>()` helper would be
 * shorter and would also be "clever TypeScript" that a reviewer has to decode,
 * and it would let a caller mint any brand from any string. Four near-identical
 * eight-line constructors are greppable and impossible to misuse.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type TenantId = string & { readonly __brand: 'TenantId' };
export type CustomerId = string & { readonly __brand: 'CustomerId' };
export type UserId = string & { readonly __brand: 'UserId' };

/**
 * UUIDv7, generated in the application rather than the database, per
 * [[Tenancy Model]] day-one non-negotiable 6: an id must exist before the
 * insert, and offline generation must stay possible (Q5).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, brand: string): void {
  if (!UUID_RE.test(value)) {
    throw new ValidationFailed(`${brand} must be a UUID`, { brand, length: value.length });
  }
}

export function toTenantId(value: string): TenantId {
  assertUuid(value, 'TenantId');
  return value as TenantId;
}

export function toCustomerId(value: string): CustomerId {
  assertUuid(value, 'CustomerId');
  return value as CustomerId;
}

export function toUserId(value: string): UserId {
  assertUuid(value, 'UserId');
  return value as UserId;
}

export function newTenantId(): TenantId {
  return uuidv7() as TenantId;
}

export function newCustomerId(): CustomerId {
  return uuidv7() as CustomerId;
}

export function newUserId(): UserId {
  return uuidv7() as UserId;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Integer minor units. Never a float, never a bare number. */
export type Cents = number & { readonly __brand: 'Cents' };

export function toCents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new ValidationFailed('Cents must be an integer number of minor units', { value });
  }
  if (!Number.isSafeInteger(value)) {
    throw new ValidationFailed('Cents must be a safe integer', { value });
  }
  return value as Cents;
}

export const ZERO_CENTS = 0 as Cents;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** An ISO 8601 instant in UTC. Distinct from a shop-local wall-clock day. */
export type Instant = string & { readonly __brand: 'Instant' };

/** YYYY-MM-DD in the shop's local timezone. Not an instant. */
export type LocalDay = string & { readonly __brand: 'LocalDay' };

const LOCAL_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toInstant(value: string | Date): Instant {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationFailed('Instant must be a valid date-time', {});
  }
  return date.toISOString() as Instant;
}

export function toLocalDay(value: string): LocalDay {
  if (!LOCAL_DAY_RE.test(value)) {
    throw new ValidationFailed('LocalDay must be YYYY-MM-DD', {});
  }
  return value as LocalDay;
}

// ---------------------------------------------------------------------------
// Zod schemas for the brands
// ---------------------------------------------------------------------------
//
// Declared here rather than in a module's contracts.ts so that validation and
// brand minting cannot disagree. `z.toJSONSchema(..., { io: 'input' })` reads
// through the transform and emits the underlying wire shape, which is what the
// OpenAPI document needs.

export const tenantIdSchema = z.uuid().transform(toTenantId);
export const customerIdSchema = z.uuid().transform(toCustomerId);
export const userIdSchema = z.uuid().transform(toUserId);
export const centsSchema = z.int().transform(toCents);
export const instantSchema = z.iso.datetime().transform(toInstant);
export const localDaySchema = z.string().regex(LOCAL_DAY_RE).transform(toLocalDay);
