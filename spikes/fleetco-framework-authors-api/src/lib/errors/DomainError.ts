/**
 * The domain error taxonomy from [[Code Standards and Guardrails]] § Errors,
 * "mapped once to HTTP status codes at the route layer" — that mapping lives in
 * `lib/http/errorHandler.ts` and nowhere else.
 *
 * Five classes in one file rather than five files, because each is four lines
 * and the taxonomy reads better as a list than as a directory.
 *
 * `context` is deliberately narrow: primitives only, so an agent cannot pass a
 * whole customer row — and with it a contact email — into a log line. The
 * standards doc is explicit that errors carry "the rule violated, never raw
 * PII".
 */
export type ErrorContext = Readonly<Record<string, string | number | boolean | null>>;

export type ErrorKind =
  | 'NotFound'
  | 'Forbidden'
  | 'Conflict'
  | 'ValidationFailed'
  | 'BusinessRuleViolated';

export abstract class DomainError extends Error {
  public abstract readonly kind: ErrorKind;
  public readonly context: ErrorContext;

  constructor(message: string, context: ErrorContext = {}) {
    super(message);
    // 'Error' breaks the prototype chain under a down-level target; restore it
    // so `instanceof` works. Carried over from authors-api's UserError.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
    this.context = context;
  }
}

/**
 * Also the answer to "exists, but not in your scope". A scoped repository
 * cannot tell the two apart, and that is the point: a 403 on another tenant's
 * row confirms the row exists.
 */
export class NotFound extends DomainError {
  public override readonly kind = 'NotFound' as const;
}

export class Forbidden extends DomainError {
  public override readonly kind = 'Forbidden' as const;
}

export class Conflict extends DomainError {
  public override readonly kind = 'Conflict' as const;
}

export class ValidationFailed extends DomainError {
  public override readonly kind = 'ValidationFailed' as const;
}

export class BusinessRuleViolated extends DomainError {
  public override readonly kind = 'BusinessRuleViolated' as const;
}
