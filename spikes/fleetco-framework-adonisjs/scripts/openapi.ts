import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Logger } from '@adonisjs/core/logger';

import { buildOpenApiDocument } from '../platform/openapi/document.js';
import { buildWiring } from '../platform/wiring.js';

/**
 * ADR-014: the OpenAPI document is generated and committed, so a diff shows
 * when the public contract moves — the add-endpoint playbook's step 8.
 *
 * Builds the real wiring to get the real route table. Opening the pool does
 * not connect to anything eagerly, so this needs no running database and no
 * booted AdonisJS application — generating the spec is a Zod-schema concern,
 * not an HTTP one.
 */
const wiring = buildWiring(new Logger({ enabled: false }));
const document = buildOpenApiDocument(wiring.customerRoutes.all, '1');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
await writeFile(out, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
process.stdout.write(`wrote ${out}\n`);
await wiring.close();
