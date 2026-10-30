// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Tier 2 of the enforcement hierarchy in [[Code Standards and Guardrails]]:
 * "a rule that is only written down is a rule that will be broken."
 *
 * Every block implements a row from that document's tier-2 table, and the
 * comment names the rule, so a future reader can tell a load-bearing
 * restriction from a style preference. Adapted from the Fastify spike's
 * config with one structural change: `process.env` is now permitted only in
 * `start/env.ts` (AdonisJS's own convention for this), not in a hand-written
 * `config.ts` — see `platform/config.ts`'s header comment and NOTES.md §1.
 */
const FS_WRITE_PATHS = [
  {
    name: 'node:fs',
    importNames: [
      'writeFile',
      'writeFileSync',
      'appendFile',
      'appendFileSync',
      'createWriteStream',
      'mkdir',
      'mkdirSync',
      'rm',
      'rmSync',
      'unlink',
      'unlinkSync',
    ],
    message: 'ADR-022 rule 3: the container is disposable. Uploads go to object storage.',
  },
  {
    name: 'node:fs/promises',
    importNames: ['writeFile', 'appendFile', 'mkdir', 'rm', 'unlink'],
    message: 'ADR-022 rule 3: the container is disposable. Uploads go to object storage.',
  },
];

// Evolution Path rule 2: no cross-module queries. A module is reachable only
// through its `index.ts`.
const CROSS_MODULE_PATTERNS = [
  {
    group: [
      '**/modules/*/repository*',
      '**/modules/*/schema*',
      '**/modules/*/service*',
      '**/modules/*/events*',
      '**/modules/*/routes*',
    ],
    message:
      'Evolution Path rule 2: import another module only through its index.ts. Reaching its repository or schema means querying its tables.',
  },
];

export default tseslint.config(
  { ignores: ['build/**', 'node_modules/**', 'openapi.json'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ---- Tier 1 patterns, backed by lint ------------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // ---- ADR-022 rule 2: config from env only -------------------------
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'ADR-022 rule 2: read configuration through start/env.ts (AdonisJS boot-time validation) via platform/config.ts, never process.env directly.',
        },
      ],

      // ---- "Money is never a float" -------------------------------------
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'Money is integer Cents. parseFloat is how a float enters the system; use toCents() or Number.parseInt.',
        },
      ],

      // ---- ADR-022 rule 3 and Evolution Path rule 2 ---------------------
      'no-restricted-imports': ['error', { paths: FS_WRITE_PATHS, patterns: CROSS_MODULE_PATTERNS }],

      // ---- Unfinished-work markers need an owner and a tracking key -----
      'no-warning-comments': ['error', { terms: ['todo', 'fixme'], location: 'anywhere' }],

      // ---- Boring is a requirement --------------------------------------
      'no-console': 'error',
      'no-eval': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  /**
   * `start/env.ts` is the one place AdonisJS itself reads `process.env` — the
   * framework's own convention for exactly the job ADR-022 rule 2 assigns to
   * one file.
   *
   * `config/*.ts` is a second, narrow exception, found empirically rather
   * than chosen: `@adonisjs/config`'s loader dynamically imports every file
   * in `config/` from inside `node_modules`, outside Vite's SSR module
   * graph, so a config file cannot safely import `start/env.ts` (or any of
   * our other TypeScript source) by a relative specifier — see
   * `config/app.ts`'s header comment. Reading `process.env` directly in
   * `config/*.ts` is the one-file-wider version of the same rule.
   */
  {
    files: ['start/env.ts', 'config/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  /**
   * The only parsing boundary where a brand is minted, and therefore the only
   * file where a type assertion is allowed.
   */
  {
    files: ['platform/types/branded.ts'],
    rules: { '@typescript-eslint/consistent-type-assertions': 'off' },
  },

  /**
   * **The data-layer chokepoint, as lint.** [[Tenancy Model]] non-negotiable 2
   * says tenant scope is applied "at a single chokepoint in the data layer,
   * not hand-written per query", and the tier-2 table says raw queries are
   * "banned outside a module's `repository.ts`".
   *
   * So: nothing outside a repository, a schema, or the connection-lifecycle
   * files may import Drizzle or the raw `pg` driver at all.
   */
  {
    files: ['**/*.ts'],
    ignores: [
      '**/repository.ts',
      '**/schema.ts',
      'platform/db/*.ts',
      'platform/outbox/listener.ts',
      '**/__tests__/**',
      'platform/test/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...FS_WRITE_PATHS,
            {
              name: 'drizzle-orm',
              message:
                'Tenancy Model non-negotiable 2: queries live in repository.ts, where tenant scope is applied unconditionally.',
            },
            {
              name: 'drizzle-orm/pg-core',
              message: 'A Drizzle table belongs in schema.ts, queried only from repository.ts.',
            },
            {
              name: 'drizzle-orm/node-postgres',
              message: 'The database handle is built once, in platform/db/client.ts.',
            },
            {
              name: 'pg',
              message:
                'The raw driver is for connection lifecycle only: the pool in db/client.ts and the dedicated LISTEN client in outbox/listener.ts, which must stay out of the pool.',
            },
          ],
          patterns: [
            ...CROSS_MODULE_PATTERNS,
            {
              group: ['**/schema.js', './schema.js', '../schema.js'],
              message:
                'A Drizzle table outside a repository is an unscoped query waiting to happen.',
            },
          ],
        },
      ],
    },
  },

  /**
   * `new Date()` is banned in business logic; time is injected so it can be
   * frozen in a test ([[Code Standards and Guardrails]] § Money, Time, and
   * Identifiers rule 2).
   */
  {
    files: ['modules/*/service.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Inject a Clock. `new Date()` in business logic cannot be frozen in a test.',
        },
      ],
    },
  },

  /**
   * `adonisrc.ts`'s `commands`/`providers`/`preloads` arrays are AdonisJS's
   * own `() => import('...')` lazy-loader idiom throughout. Annotating each
   * with the import's inferred module type is pure ceremony that the
   * framework itself expects you to skip — every AdonisJS app's `adonisrc.ts`
   * looks like this.
   */
  {
    files: ['adonisrc.ts'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' },
  },

  /**
   * Tests may assert, log and reach for internals; they are not the system.
   */
  {
    files: ['**/__tests__/**/*.ts', 'platform/test/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-imports': 'off',
      '@typescript-eslint/consistent-type-assertions': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  {
    files: ['eslint.config.mjs', 'vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
