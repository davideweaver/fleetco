import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../src/config.js';
import { buildOpenApiDocument } from '../src/platform/openapi/document.js';
import { buildServer } from '../src/server.js';

/**
 * ADR-014: the OpenAPI document is generated and committed, so a diff shows
 * when the public contract moves — the add-endpoint playbook's step 8.
 *
 * It builds the real server to get the real route table. Constructing the pool
 * does not connect to anything, so this needs no running database.
 */
const { wiring } = buildServer(loadConfig());
const document = buildOpenApiDocument(wiring.routes, '1');
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
await writeFile(out, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
process.stdout.write(`wrote ${out}\n`);
await wiring.close();
