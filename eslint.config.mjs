import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '.nx/**', '**/.astro/**', '**/.angular/**', '**/*.tsbuildinfo'] },
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

  // Library source (non-test): type-aware linting so the async-heavy streaming
  // code is guarded against unhandled promise rejections (`no-floating-promises`
  // / `no-misused-promises`). `no-explicit-any` is `error` here — the backlog is
  // zero and CI runs `--max-warnings 0`, so making it an error is just
  // self-documenting and consistent in IDEs. Test files are excluded (their
  // tsconfigs don't include them, and white-box tests fire promises freely).
  {
    files: ['packages/**/src/**/*.{ts,tsx}'],
    ignores: ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**'],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
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
