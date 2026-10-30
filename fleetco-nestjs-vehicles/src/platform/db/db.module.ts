import { Global, Inject, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';

import { loadConfig } from '../../config';
import { systemClock } from '../types/clock';
import type { Clock } from '../types/clock';
import { createDatabase } from './client';
import type { Database, Db } from './client';

/**
 * Injection tokens for the three things that are not classes.
 *
 * NestJS resolves class providers by their constructor type, which is the part
 * of the container that costs nothing. Everything else needs a token, and a
 * token is a name resolved at bootstrap rather than at compile time — a typo
 * here is a runtime failure, not a type error. Keeping the token count at
 * three is the mitigation.
 */
export const DATABASE = Symbol('DATABASE');
export const DB = Symbol('DB');
export const CLOCK = Symbol('CLOCK');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): Database => createDatabase(loadConfig().DATABASE_URL),
    },
    {
      provide: DB,
      inject: [DATABASE],
      useFactory: (database: Database): Db => database.db,
    },
    {
      provide: CLOCK,
      useValue: systemClock satisfies Clock,
    },
  ],
  exports: [DATABASE, DB, CLOCK],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}
