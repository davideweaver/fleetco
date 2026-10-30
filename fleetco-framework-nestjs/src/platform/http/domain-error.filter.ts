import { Catch, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';

import { DomainError } from '../types/errors';
import type { Problem } from '../../modules/customers/contracts';

/**
 * The domain error taxonomy mapped to HTTP status codes **once**
 * ([[Code Standards and Guardrails]] § Errors). No handler, service or
 * repository mentions a status code.
 *
 * Unrecognised errors become a bare 500 with no detail. The detail goes to the
 * log, where it is allowed to contain the tenant id; the response body is not.
 */
/**
 * At or above this, the failure is ours rather than the caller's, so it is
 * logged with its stack and the response body carries no detail. A plain
 * number because comparing a `number` against a `HttpStatus` enum member is
 * exactly the mixed-enum comparison lint objects to.
 */
const SERVER_ERROR_FLOOR = 500;

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.translate(exception);

    if (status >= SERVER_ERROR_FLOOR) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    // Headers are already out on an SSE stream that failed mid-flight; Nest
    // has written the error frame itself and there is nothing to send.
    if (response.headersSent) return;
    response.status(status).json(body);
  }

  private translate(exception: unknown): { status: number; body: Problem } {
    if (exception instanceof DomainError) {
      return {
        status: statusFor(exception),
        body: { kind: exception.kind, message: exception.message, context: exception.context },
      };
    }
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          kind: 'ValidationFailed',
          message: 'request failed validation',
          context: Object.fromEntries(
            exception.issues.map((issue) => [issue.path.join('.') || '(root)', issue.message]),
          ),
        },
      };
    }
    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        body: { kind: 'Internal', message: exception.message, context: {} },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { kind: 'Internal', message: 'internal error', context: {} },
    };
  }
}

function statusFor(error: DomainError): number {
  switch (error.kind) {
    case 'NotFound':
      return HttpStatus.NOT_FOUND;
    case 'Forbidden':
      return HttpStatus.FORBIDDEN;
    case 'Conflict':
      return HttpStatus.CONFLICT;
    case 'ValidationFailed':
      return HttpStatus.BAD_REQUEST;
    case 'BusinessRuleViolated':
      return HttpStatus.UNPROCESSABLE_ENTITY;
    default: {
      // Adding a kind to the taxonomy breaks the build here, which is the
      // point of mapping it in exactly one place.
      const unhandled: never = error.kind;
      throw new Error(`unmapped domain error kind: ${String(unhandled)}`);
    }
  }
}
