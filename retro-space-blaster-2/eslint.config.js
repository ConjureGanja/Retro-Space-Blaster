/**
 * ESLint flat config — a spell-checker for code. Catches bugs (unused
 * variables, forgotten awaits, typos in globals) before they reach players.
 *
 * Three zones, three rule sets:
 *   1. src/client/game/**   plain-JS game (browser globals, recommended rules)
 *   2. src/** + *.ts         TypeScript (type-aware rules, e.g. no-floating-promises)
 *   3. scripts/**           Node.js build scripts
 *
 * Analogy: one style guide, but the costume department, the lighting crew and
 * the sound team each get the chapter that applies to them.
 */
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default defineConfig([
  // Never lint generated output, vendored history, or art sources.
  globalIgnores(['dist/**', 'node_modules/**', 'legacy/**', 'art/**', 'public/**', 'coverage/**']),

  // ---------- 1. The game (plain JS, runs in the browser) ----------
  {
    files: ['src/client/game/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      // Unused vars are usually leftovers, not bugs — flag, don't block CI.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      // e.g. game.js sets `hit = true` right before the loop ends. Harmless;
      // surfaced as a warning so it gets tidied someday without blocking CI.
      'no-useless-assignment': 'warn',
    },
  },

  // ---------- 2. TypeScript (client glue, server, shared) ----------
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      parserOptions: {
        // Lets rules read real types from the tsconfig projects in tools/.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // An un-awaited promise that rejects = a silently dropped save or score.
      // Use `void promise` to mark fire-and-forget on purpose.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/server/**/*.ts', 'src/shared/**/*.ts', '*.config.ts', 'vite.*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/client/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    // node:test's test() returns a promise the runner tracks for us.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },

  // ---------- 3. Node build scripts ----------
  {
    files: ['scripts/**/*.{js,mjs}', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
]);
