// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Tier 2 of the enforcement hierarchy in [[Code Standards and Guardrails]]:
 * "a rule that is only written down is a rule that will be broken."
 *
 * Every block below implements a row from that document's tier-2 table. The
 * comment names the rule it enforces, so a future reader can tell a
 * load-bearing restriction from a style preference.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'openapi.json'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ---- Tier 1 patterns, backed by lint ------------------------------
      // "No `any`, no non-null assertions (`!`), no type assertions outside
      // parsing boundaries — all three are lint-banned."
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
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
            'ADR-022 rule 2: read configuration through loadConfig() in src/config.ts, which is the only file permitted to touch process.env.',
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

      // ---- ADR-022 rule 3: no local filesystem state --------------------
      // ---- Evolution Path rule 2: no cross-module queries ---------------
      //
      // The fs ban is on *write* APIs specifically, per the tier-2 table
      // ("`fs` write APIs banned outside designated temp paths"). Reading the
      // migration SQL at startup is not local state, and banning the whole
      // module would have forced an exception for the migrator.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'fs',
              importNames: ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream', 'mkdir', 'mkdirSync', 'rm', 'rmSync', 'unlink', 'unlinkSync'],
              message: 'ADR-022 rule 3: the container is disposable. Uploads go to object storage.',
            },
            {
              name: 'node:fs',
              importNames: ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream', 'mkdir', 'mkdirSync', 'rm', 'rmSync', 'unlink', 'unlinkSync'],
              message: 'ADR-022 rule 3: the container is disposable. Uploads go to object storage.',
            },
          ],
          patterns: [
            {
              group: ['**/modules/*/repository', '**/modules/*/schema', '**/modules/*/service'],
              message:
                'Evolution Path rule 2: import another module only through its index.ts. Reaching its repository or schema means querying its tables.',
            },
          ],
        },
      ],

      // ---- Unfinished-work markers need an owner and a tracking key -----
      // A bare marker is how an agent leaves a gap that nobody owns. The rule
      // bans the bare form; a tracked one carries its key in the text.
      'no-warning-comments': [
        'error',
        { terms: ['todo', 'fixme'], location: 'anywhere' },
      ],

      // ---- Boring is a requirement --------------------------------------
      'no-console': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The codebase has no need for these and they are each a footgun.
      'no-eval': 'error',
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
    rules: {
      'no-restricted-properties': 'off',
    },
  },

  /**
   * The only parsing boundary where a brand may be minted, and therefore the
   * only file where a type assertion is allowed. Narrowing this override is
   * what keeps `as` from spreading.
   */
  {
    files: ['src/platform/types/branded.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
    },
  },

  /**
   * Repositories are the only code that may touch the database
   * ([[Tenancy Model]] non-negotiable 2). Everything else is forbidden from
   * importing a Drizzle table or the query builder at all, which makes an
   * unscoped query unwritable rather than merely discouraged.
   */
  {
    files: ['src/**/*.ts'],
    ignores: [
      'src/**/repository.ts',
      'src/**/schema.ts',
      'src/platform/db/*.ts',
      'src/**/__tests__/**',
      'src/platform/test/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'drizzle-orm',
              message:
                'Tenancy Model non-negotiable 2: queries live in repository.ts, where tenant scope is applied unconditionally.',
            },
          ],
          patterns: [
            {
              group: ['**/schema', './schema', '../schema'],
              message:
                'A Drizzle table outside a repository is an unscoped query waiting to happen.',
            },
          ],
        },
      ],
    },
  },

  /**
   * A NestJS module is an empty decorated class by design. The rule that
   * objects to that is a general anti-pattern check, and the framework's own
   * idiom is the exception rather than the defect.
   */
  {
    files: ['src/**/*.module.ts', 'src/app.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  /**
   * `new Date()` is banned in business logic; time is injected so it can be
   * frozen in tests ([[Code Standards and Guardrails]] § Money, Time, and
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
   * Tests may assert, log and reach for internals; they are not the system.
   * The rules that still apply here are the ones a sloppy test would otherwise
   * hide — unused variables and floating promises.
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
    },
  },

  {
    files: ['eslint.config.mjs', 'vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
