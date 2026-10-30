import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';

import logging from '../logging/index.js';
import type { Database } from './handle.js';

/**
 * Forward-only SQL migrations, applied in filename order.
 *
 * Not Drizzle's own `migrate()` and not `drizzle-kit`: [[Code Standards and
 * Guardrails]] specifies "`migrations/` plain SQL, forward-only", and
 * [[Testing Strategy]] requires the integration suite to build the schema "from
 * the real migrations, run from scratch", which doubles as a migration test.
 * Generated migrations are a thing a reviewer skims; hand-written SQL is a
 * thing a reviewer reads, and the migration review checklist in ADR-011 assumes
 * the latter.
 *
 * Directories are passed in explicitly rather than discovered by a glob, so the
 * set of migrating modules is one greppable list in `DbModule` instead of a
 * startup-time surprise.
 */

const LEDGER = sql`platform.migrations`;

export async function migrate(db: Database, directories: readonly URL[]): Promise<string[]> {
  await db.execute(sql`create schema if not exists platform`);
  await db.execute(sql`
    create table if not exists ${LEDGER} (
      filename   text        primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = await db.execute<{ filename: string }>(sql`select filename from ${LEDGER}`);
  const alreadyApplied = new Set(applied.rows.map((row) => row.filename));

  const pending = collect(directories).filter((file) => !alreadyApplied.has(file.filename));
  const ran: string[] = [];

  for (const file of pending) {
    // One transaction per migration, so a failure halfway through a file leaves
    // neither the change nor the ledger row. Postgres runs DDL transactionally,
    // which is most of why this is twenty lines rather than a tool.
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(file.body));
      await tx.execute(sql`insert into ${LEDGER} (filename) values (${file.filename})`);
    });
    ran.push(file.filename);
    logging.info(`Applied migration ${file.filename}`, ['lifecycle', 'migration']);
  }

  return ran;
}

type MigrationFile = { filename: string; body: string };

function collect(directories: readonly URL[]): MigrationFile[] {
  const files: MigrationFile[] = [];

  for (const directory of directories) {
    const path = fileURLToPath(directory);
    for (const filename of readdirSync(path)) {
      if (filename.endsWith('.sql')) {
        files.push({ filename, body: readFileSync(`${path}/${filename}`, 'utf8') });
      }
    }
  }

  // Ordered globally by filename, across modules. The numeric prefix is
  // allocated once per repository rather than once per module, so two modules
  // cannot both claim `0003`.
  files.sort((left, right) => left.filename.localeCompare(right.filename));

  const duplicate = files.find((file, index) => files[index - 1]?.filename === file.filename);
  if (duplicate) {
    throw new Error(`Duplicate migration filename across modules: ${duplicate.filename}`);
  }

  return files;
}
