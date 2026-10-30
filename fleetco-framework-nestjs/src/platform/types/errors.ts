/**
 * The domain error taxonomy from [[Code Standards and Guardrails]] § Errors.
 *
 * Why a closed set of five: they are mapped to HTTP status codes exactly once,
 * in `DomainErrorFilter`. Services and repositories therefore never import
 * anything HTTP-shaped, which is what keeps them unit-testable without Nest.
 *
 * `context` carries structured detail — tenantId, the entity id, the rule that
 * was violated — and must never carry raw PII.
 */
export type ErrorContext = Readonly<Record<string, string | number | boolean | null>>;

export abstract class DomainError extends Error {
  abstract readonly kind:
    | 'NotFound'
    | 'Forbidden'
    | 'Conflict'
    | 'ValidationFailed'
    | 'BusinessRuleViolated';

  readonly context: ErrorContext;

  constructor(message: string, context: ErrorContext = {}) {
    super(message);
    this.name = new.target.name;
    this.context = context;
  }
}

export class NotFound extends DomainError {
  readonly kind = 'NotFound' as const;
}

export class Forbidden extends DomainError {
  readonly kind = 'Forbidden' as const;
}

export class Conflict extends DomainError {
  readonly kind = 'Conflict' as const;
}

export class ValidationFailed extends DomainError {
  readonly kind = 'ValidationFailed' as const;
}

export class BusinessRuleViolated extends DomainError {
  readonly kind = 'BusinessRuleViolated' as const;
}
