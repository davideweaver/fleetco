import { toInstant } from './branded.js';
import type { Instant } from './branded.js';

/**
 * `new Date()` is banned in business logic; time is injected so it can be
 * frozen in a test ([[Code Standards and Guardrails]] § Money, Time, and
 * Identifiers rule 2).
 *
 * One method. The temptation is to add `today(timezone)` for shop-local days;
 * there is no second call site yet, so there is no second method yet.
 */
export type Clock = {
  readonly now: () => Instant;
};

export const systemClock: Clock = {
  now: (): Instant => toInstant(new Date()),
};

/** Used by every unit test, which is the second implementation that earns the type. */
export function fixedClock(at: Instant): Clock {
  return { now: (): Instant => at };
}
