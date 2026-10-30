// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Tier 2 of the enforcement hierarchy in [[Code Standards and Guardrails]]:
 * "a rule that is only written down is a rule that will be broken."
 *
 * Every block implements a row from that document's tier-2 table, and the
 * comment names the rule, so a future reader can tell a load-bearing
 * restriction from a style preference.
 *
 * This file is where the Fastify candidate pays its bill. [[Framework
 * Evaluation]] notes that under NestJS "module boundaries become
 * framework-enforced rather than lint-enforced"; here they are these two
 * `no-restricted-imports` zones and nothing else.
 */
/**
 * Shared `no-restricted-imports` entries.
 *
 * Hoisted because a later flat-config block **replaces** an earlier block's
 * value for the same rule name on an overlapping file rather than merging with
 * it. Splitting these restrictions across blocks silently disabled whichever
 * came first — the exact class of quiet erosion this document's tier-2 table
 * exists to prevent — so every block that sets `no-restricted-imports` spreads
 * these in.
 */

// ADR-022 rule 3: no local filesystem state. The ban is on *write* APIs
// specifically, per the tier-2 table; reading migration SQL at startup is not
// local state, and banning the module outright would have forced an exception
// for the migrator.
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
// through its `index.ts`. Relative imports *within* a module do not match these
// globs, so the rule constrains the boundary and not the internals.
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
  { ignores: ['dist/**', 'node_modules/**', 'openapi.json'] },

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
      // "No `any`, no non-null assertions (`!`), no type assertions outside
      // parsing boundaries — all three are lint-banned."
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
            'ADR-022 rule 2: read configuration through loadConfig() in src/config.ts, the only file permitted to touch process.env.',
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
      // A bare marker is how an agent leaves a gap nobody owns.
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
      // Interpolating a number is not the ambiguity this rule exists for.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  /**
   * ADR-022 rule 2 names this file as the single place configuration is read.
   * The restriction above is what makes that true, so it cannot also apply
   * here.
   */
  {
    files: ['src/config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  /**
   * The only parsing boundary where a brand is minted, and therefore the only
   * file where a type assertion is allowed. Keeping the override this narrow is
   * what stops `as` from spreading.
   */
  {
    files: ['src/platform/types/branded.ts'],
    rules: { '@typescript-eslint/consistent-type-assertions': 'off' },
  },

  /**
   * **The data-layer chokepoint, as lint.** [[Tenancy Model]] non-negotiable 2
   * says tenant scope is applied "at a single chokepoint in the data layer, not
   * hand-written per query", and the tier-2 table says raw queries are "banned
   * outside a module's `repository.ts`".
   *
   * So: nothing outside a repository, a schema, or the two
   * connection-lifecycle files may import Drizzle or the raw `pg` driver at
   * all. A service that wanted to write its own query would have to add itself
   * to this list in the same commit, which is a review signal rather than a
   * silent regression.
   *
   * The allowance is slightly wider than ideal: `outbox/listener.ts` is
   * permitted to import Drizzle, which it does not use, because the exception
   * it genuinely needs is for raw `pg`.
   */
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/**/repository.ts',
      'src/**/schema.ts',
      'src/platform/db/*.ts',
      'src/platform/outbox/listener.ts',
      'src/**/__tests__/**',
      'src/platform/test/**',
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
    files: ['src/modules/*/service.ts'],
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
   * Tests may assert, log and reach for internals; they are not the system. The
   * rules that still apply are the ones a sloppy test would otherwise hide.
   */
  {
    files: ['src/**/__tests__/**/*.ts', 'src/platform/test/**/*.ts', 'scripts/**/*.ts'],
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
      // `expect(() => fn()).toThrow()` is the idiom; the rule reads it as a
      // confusing void return.
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/require-await': 'off',
      // A test helper's return type is its assertions; annotating every arrow
      // in a fixture is ceremony that hides nothing.
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  {
    files: ['eslint.config.mjs', 'vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
