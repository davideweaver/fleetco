import { toInstant } from './branded';
import type { Instant } from './branded';

/**
 * [[Code Standards and Guardrails]] § Money, Time, and Identifiers rule 2:
 * `new Date()` is banned in business logic; time is injected so it can be
 * frozen in tests.
 */
export type Clock = { readonly now: () => Instant };

export const systemClock: Clock = { now: () => toInstant(new Date()) };

export function fixedClock(at: string): Clock {
  const frozen = toInstant(at);
  return { now: () => frozen };
}
