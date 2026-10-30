import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildOpenApiDocument } from '../src/platform/openapi/document';

/**
 * `npm run openapi` — writes the generated document. Committed output is
 * deliberately avoided; CI regenerates and diffs it so a contract change
 * cannot land without being visible in review.
 */
const target = join(__dirname, '..', 'openapi.json');
writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`);
process.stdout.write(`wrote ${target}\n`);
