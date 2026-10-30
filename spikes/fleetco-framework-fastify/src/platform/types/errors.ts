/**
 * The domain error taxonomy from [[Code Standards and Guardrails]] § Errors.
 * Mapped to HTTP status codes exactly once, in `platform/http/errors.ts`.
 *
 * `context` is structured and deliberately narrow: ids, rule names, counts.
 * Never raw PII — these end up in logs and in Sentry.
 */
export type ErrorContext = Readonly<Record<string, string | number | boolean | null>>;

export const ERROR_KINDS = [
  'NotFound',
  'Forbidden',
  'Conflict',
  'ValidationFailed',
  'BusinessRuleViolated',
  'Internal',
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

/**
 * One base class, five concrete kinds. A class per kind rather than a `kind`
 * argument so `instanceof` works at a call site and so the taxonomy is
 * greppable; the shared `kind` field is what the HTTP mapping switches on.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: ErrorKind;

  constructor(
    message: string,
    readonly context: ErrorContext = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFound extends DomainError {
  readonly kind = 'NotFound';
}

export class Forbidden extends DomainError {
  readonly kind = 'Forbidden';
}

export class Conflict extends DomainError {
  readonly kind = 'Conflict';
}

export class ValidationFailed extends DomainError {
  readonly kind = 'ValidationFailed';
}

export class BusinessRuleViolated extends DomainError {
  readonly kind = 'BusinessRuleViolated';
}
