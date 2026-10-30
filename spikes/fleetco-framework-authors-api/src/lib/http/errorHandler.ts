import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { DomainError, type ErrorKind } from '../errors/DomainError.js';
import logging from '../logging/index.js';

/**
 * The one place a domain error becomes an HTTP status.
 *
 * [[Code Standards and Guardrails]] § Errors: "a domain error taxonomy mapped
 * **once** to HTTP status codes at the route layer". Once is the operative
 * word. A handler that sets its own status is how two endpoints come to
 * disagree about what a conflict is, and it is the first thing an agent does
 * when it cannot find this file.
 *
 * The body shape is `problemSchema` from a module's `contracts.ts`, so the
 * generated OpenAPI document describes errors as precisely as it describes
 * successes.
 */

function statusFor(kind: ErrorKind): number {
  switch (kind) {
    case 'NotFound':
      return 404;
    case 'Forbidden':
      return 403;
    case 'Conflict':
      return 409;
    // A request that is well-formed but asks for something the rules forbid.
    // Distinct from 400, which is reserved for a body that failed to parse.
    case 'BusinessRuleViolated':
      return 422;
    case 'ValidationFailed':
      return 400;
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof DomainError) {
    // Logged at info: a 404 is the system working. Only the server's own
    // failures below are logged as errors, so an alert on error volume means
    // something.
    logging.info(error.message, ['http', 'domain-error', error.kind], {
      method: request.method,
      url: request.url,
      ...error.context,
    });

    reply.status(statusFor(error.kind)).send({
      kind: error.kind,
      message: error.message,
      context: error.context,
    });
    return;
  }

  if (error instanceof ZodError) {
    // Zod's own message carries the failing path, which is what a client needs
    // and is safe to return: it describes the request the client just sent.
    reply.status(400).send({
      kind: 'ValidationFailed',
      message: 'Request failed validation',
      context: { issues: error.issues.map((issue) => issue.path.join('.')).join(', ') },
    });
    return;
  }

  // Fastify's own 4xx — an unparseable JSON body, a missing content type.
  const status = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  if (status < 500) {
    reply.status(status).send({
      kind: 'ValidationFailed',
      message: error.message,
      context: {},
    });
    return;
  }

  logging.exception('Unhandled error serving request', error, ['http'], {
    method: request.method,
    url: request.url,
  });

  // Never the real message: an unhandled error's text is as likely to be a
  // connection string as it is to be useful.
  reply.status(500).send({
    kind: 'Internal',
    message: 'Internal server error',
    context: {},
  });
}
