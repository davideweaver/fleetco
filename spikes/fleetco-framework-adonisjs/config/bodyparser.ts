import { defineConfig } from '@adonisjs/core/bodyparser';

/**
 * Trimmed to what `customers` actually accepts: JSON bodies on `POST` and
 * `PATCH`. Multipart is disabled rather than left at its default — ADR-022
 * rule 3 bans local filesystem writes, and `autoProcess: true` writes
 * uploaded files to the OS temp directory, which is exactly that.
 */
const bodyParserConfig = defineConfig({
  allowedMethods: ['POST', 'PATCH'],

  form: {
    convertEmptyStringsToNull: true,
    types: [],
  },

  json: {
    convertEmptyStringsToNull: true,
    types: ['application/json'],
  },

  multipart: {
    autoProcess: false,
    convertEmptyStringsToNull: true,
    processManually: [],
    limit: '20mb',
    types: [],
  },
});

export default bodyParserConfig;
