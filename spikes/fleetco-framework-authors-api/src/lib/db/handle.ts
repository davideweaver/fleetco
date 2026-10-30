import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * The two database handle types every repository signature is written against.
 *
 * Named here rather than imported from Drizzle at each call site for one
 * reason: ADR-002 chose Postgres and Drizzle, but [[Stack Evaluation]] keeps
 * the data layer behind a seam, and a repository that says `Transaction` reads
 * the same whatever that turns out to be. These are plain aliases, not a
 * wrapper — there is nothing to understand and nothing to maintain.
 *
 * The distinction between them is load-bearing, not cosmetic. `appendEvent`
 * takes a `Transaction`, so "the outbox row commits with the state change" is a
 * compile-time fact rather than a convention an agent has to remember.
 *
 * No relational schema is registered — `NodePgDatabase` with no type argument.
 * Drizzle's relational query builder would let a service traverse into another
 * module's tables, which Evolution Path rule 2 forbids. Explicit joins inside
 * one module's repository are the only path.
 */
export type Database = NodePgDatabase;

/**
 * Whatever `db.transaction` hands its callback, read off that signature rather
 * than reassembled from Drizzle's own generics. Spelling it out took three
 * nested type parameters and one internal helper type, and got it wrong once;
 * this cannot drift from the handle above.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
