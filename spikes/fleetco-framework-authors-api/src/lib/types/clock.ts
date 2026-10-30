import { toInstant, type Instant } from './branded.js';

/**
 * "`new Date()` is banned in business logic; time is injected so it can be
 * frozen in tests" — [[Code Standards and Guardrails]] § Money, Time, and
 * Identifiers.
 *
 * A one-method object rather than a passed-in `() => Instant`, so a call site
 * reads `clock.now()` and a reviewer can see what the dependency is.
 */
export type Clock = { now: () => Instant };

export const systemClock: Clock = {
  now: () => toInstant(new Date()),
};

/** Frozen time for tests. Advances only when a test asks it to. */
export function fixedClock(start: Instant): Clock & { advance: (ms: number) => void } {
  let current = new Date(start).getTime();
  return {
    now: (): Instant => toInstant(new Date(current)),
    advance: (ms: number): void => {
      current += ms;
    },
  };
}
