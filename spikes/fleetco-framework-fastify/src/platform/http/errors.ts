import { ZodError } from 'zod';
import type { FastifyInstance } from 'fastify';

import { DomainError, ValidationFailed } from '../types/errors.js';
import type { ErrorContext, ErrorKind } from '../types/errors.js';

/**
 * [[Code Standards and Guardrails]] § Errors: "a domain error taxonomy mapped
 * **once** to HTTP status codes at the route layer."
 *
 * This file is that once. No handler, service or repository knows an HTTP
 * status code.
 */
export function statusFor(kind: ErrorKind): number {
  switch (kind) {
    case 'NotFound':
      return 404;
    case 'Forbidden':
      return 403;
    case 'Conflict':
      return 409;
    case 'ValidationFailed':
      return 400;
    case 'BusinessRuleViolated':
      return 422;
    case 'Internal':
      return 500;
    default: {
      const unhandled: never = kind;
      throw new Error(`unhandled error kind: ${String(unhandled)}`);
    }
  }
}

export type Problem = {
  readonly kind: ErrorKind;
  readonly message: string;
  readonly context: ErrorContext;
};

/**
 * A Zod failure at a request boundary is a client error, not a crash. The
 * issue paths are reported; the offending *values* are not, because a request
 * body is the most likely place for PII and errors carry "never raw PII".
 */
export function toValidationFailed(error: ZodError, where: string): ValidationFailed {
  return new ValidationFailed(`invalid request ${where}`, {
    where,
    fields: error.issues.map((issue) => issue.path.join('.')).join(','),
  });
}

export function problemFor(error: unknown): { status: number; body: Problem } {
  if (error instanceof DomainError) {
    return {
      status: statusFor(error.kind),
      body: { kind: error.kind, message: error.message, context: error.context },
    };
  }
  if (error instanceof ZodError) {
    const domain = toValidationFailed(error, 'payload');
    return {
      status: statusFor(domain.kind),
      body: { kind: domain.kind, message: domain.message, context: domain.context },
    };
  }
  // Never leak an internal message to a client. The real one is logged.
  return {
    status: 500,
    body: { kind: 'Internal', message: 'internal error', context: {} },
  };
}

export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(async (error, request, reply) => {
    const { status, body } = problemFor(error);
    if (status >= 500) {
      request.log.error({ err: error, operation: request.url }, 'unhandled error');
    }
    await reply.status(status).send(body);
  });

  app.setNotFoundHandler(async (request, reply) => {
    await reply.status(404).send({
      kind: 'NotFound',
      message: 'no such route',
      context: { path: request.url },
    } satisfies Problem);
  });
}
