import { Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates and brands a request part against a Zod schema.
 *
 * Nest's default validation story is a DTO class plus class-validator
 * decorators, which would be a second source of truth for every shape and
 * would hand the handler an unbranded object. ADR-014 makes Zod the single
 * source, so this ten-line pipe is the adapter.
 *
 * Deliberately per-route rather than a global pipe: a global pipe has to guess
 * which schema applies, and `@Body(new ZodPipe(createCustomerSchema))` says it
 * at the call site, where a reviewer reads it.
 */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    // Throws ZodError, which DomainErrorFilter turns into a 400.
    return this.schema.parse(value);
  }
}
