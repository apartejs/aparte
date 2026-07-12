import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.nx/**', '**/.astro/**', '**/*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Honor the `_`-prefix convention for intentionally-unused vars/args/catches.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // Node build helpers (.mjs scripts) run in Node — expose its globals so
  // `console`/`process` aren't flagged as undefined.
  {
    files: ['**/*.mjs', '**/scripts/**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },

  // Library source: `any` at framework boundaries (event contexts, dynamic
  // segment data) is tolerated as tech-debt for a later "strictest" pass — a
  // warning, not a CI blocker. Must precede the test override below so tests win.
  {
    files: ['packages/**/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Tests legitimately reach into private internals (white-box) via `as any`.
  {
    files: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**', '**/vitest.setup.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
