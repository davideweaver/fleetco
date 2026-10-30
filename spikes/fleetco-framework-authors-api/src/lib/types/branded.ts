import { randomBytes } from 'node:crypto';
import { z } from 'zod';

import { ValidationFailed } from '../errors/DomainError.js';

/**
 * Branded primitives — tier 1 of the enforcement hierarchy in
 * [[Code Standards and Guardrails]]: "the code does not compile."
 *
 * This file is the ONLY place a brand is minted, and therefore the only file
 * where a type assertion is permitted (see the narrow eslint override for this
 * path). Every other file receives already-branded values or calls a
 * constructor here.
 *
 * The repetition is deliberate. A generic `brand<B>(value)` helper would be
 * shorter, would be exactly the "clever TypeScript" the standards doc bans, and
 * would let any caller mint any brand from any string. Near-identical four-line
 * constructors are greppable and impossible to misuse.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type TenantId = string & { readonly __brand: 'TenantId' };
export type CustomerId = string & { readonly __brand: 'CustomerId' };
export type UserId = string & { readonly __brand: 'UserId' };

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

/**
 * UUIDv7 — RFC 9562 §5.7. Generated in the application, never by the database,
 * per [[Tenancy Model]] non-negotiable 6: an id must exist before the insert,
 * and offline generation has to stay possible if Q5 goes that way.
 *
 * Hand-written rather than taking the `uuidv7` package, because the dependency
 * allowlist's default answer is no and this is a dozen lines of a fully
 * specified layout over `node:crypto`. Monotonicity *within* a millisecond is
 * not attempted: ids are not replay cursors here — the outbox owns that job —
 * so millisecond-granular ordering is all the index-locality argument needs.
 *
 *   48 bits  big-endian unix milliseconds
 *    4 bits  version (7)
 *   12 bits  random
 *    2 bits  variant (0b10)
 *   62 bits  random
 */
function uuidv7(nowMs: number): string {
  const bytes = randomBytes(16);
  const ms = BigInt(nowMs);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  }
  const versionByte = bytes[6] ?? 0;
  const variantByte = bytes[8] ?? 0;
  bytes[6] = (versionByte & 0x0f) | 0x70;
  bytes[8] = (variantByte & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

export function newTenantId(): TenantId {
  return uuidv7(Date.now()) as TenantId;
}

export function newCustomerId(): CustomerId {
  return uuidv7(Date.now()) as CustomerId;
}

export function newUserId(): UserId {
  return uuidv7(Date.now()) as UserId;
}

/** Exposed for the property test that checks the layout and the time ordering. */
export const uuidv7At = uuidv7;

/**
 * Re-branding a value read back out of one of our own `uuid` columns.
 *
 * It was branded on the way in and Postgres' own type validated it, so
 * re-running the regex on every row of every page is cost for no information.
 * These live here rather than in the repositories because this file is the only
 * one permitted a type assertion — which keeps the count of places that can
 * mint a brand at one, where it belongs.
 */
export function tenantIdFromDb(value: string): TenantId {
  return value as TenantId;
}

export function customerIdFromDb(value: string): CustomerId {
  return value as CustomerId;
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

export const ZERO_CENTS: Cents = 0 as Cents;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** An ISO 8601 instant in UTC. Distinct from a shop-local wall-clock day. */
export type Instant = string & { readonly __brand: 'Instant' };

/** `YYYY-MM-DD` in the shop's local timezone. Emphatically not an instant. */
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
// Declared here, beside the constructors, so validation and brand minting
// cannot disagree. A module's `contracts.ts` composes these rather than
// re-deriving `z.uuid()` and hoping.

export const tenantIdSchema = z.uuid().transform(toTenantId);
export const customerIdSchema = z.uuid().transform(toCustomerId);
export const userIdSchema = z.uuid().transform(toUserId);
export const centsSchema = z.int().transform(toCents);
export const instantSchema = z.iso.datetime().transform(toInstant);
export const localDaySchema = z.string().regex(LOCAL_DAY_RE).transform(toLocalDay);
