import { writeFileSync } from 'node:fs';

import { buildOpenApiDocument } from '../src/lib/openapi/document.js';
import { customerOperations } from '../src/modules/customers/index.js';

/**
 * Writes `openapi.json`. Checked in, so a contract change shows up in a diff
 * and a reviewer sees it ("what CI decides, so a human never has to" covers
 * formatting and types; a changed API shape is one of the things only Dave can
 * decide).
 *
 * No server is started: the operations are plain values, so the document can be
 * built from them without a database or a port.
 */
const document = buildOpenApiDocument(customerOperations);
writeFileSync('openapi.json', `${JSON.stringify(document, null, 2)}\n`, 'utf8');
process.stdout.write(`openapi.json written: ${customerOperations.length} operations\n`);
