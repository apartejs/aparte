import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `.doc-snippets/` is the scratch folder `check-doc-snippets.mjs` writes doc
  // fences into. It is deleted on success and DELIBERATELY kept when a snippet
  // fails, so you can open the file tsc complained about — which meant a failing
  // snippet guard also made `pnpm lint` fail, on unused imports inside an excerpt.
  // Two reds for one cause, the second one meaningless.
  { ignores: ['**/dist/**', '**/node_modules/**', '.nx/**', '**/.astro/**', '**/.angular/**', '**/.svelte-kit/**', '**/*.tsbuildinfo', '.doc-snippets/**',
    // Playwright's output. A trace recorded under CI=1 ships the trace viewer's own
    // bundles into playwright-report/trace/assets, and one local e2e run then failed
    // every pre-commit on files nobody wrote. The flat config does not read .gitignore.
    '**/playwright-report/**', '**/test-results/**', '**/blob-report/**'] },

  // A stale `eslint-disable` is silent debt: it hides a rule that would now
  // pass, or masks one that started firing elsewhere on the line. Report them
  // as errors so `--max-warnings 0` can't be satisfied by leftovers.
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Honor the `_`-prefix convention for intentionally-unused vars/args/catches.
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // `interface X extends Y {}` is not a mistake here, it is the only way to
      // merge a set of members into a global interface declared elsewhere — how
      // `types/event-map.ts` puts the aparté events into HTMLElementEventMap,
      // DocumentEventMap and WindowEventMap from one declaration. Empty `{}` and
      // empty `interface X {}` stay banned; only the single-extends form is allowed.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // Node build helpers (.mjs scripts) run in Node — expose its globals so
  // `console`/`process` aren't flagged as undefined. The Web-standard half is
  // listed too: the repo targets Node >= 18, where fetch/Request/Response/streams
  // are global (the node-import contract script exercises exactly those).
  {
    files: ['**/*.mjs', '**/scripts/**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        ReadableStream: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
      },
    },
  },

  // Library source (non-test): type-aware linting so the async-heavy streaming
  // code is guarded against unhandled promise rejections (`no-floating-promises`
  // / `no-misused-promises`). `no-explicit-any` is `error` here — the backlog is
  // zero and CI runs `--max-warnings 0`, so making it an error is just
  // self-documenting and consistent in IDEs. Test files are excluded here
  // (white-box tests fire promises freely); their types are checked by
  // `pnpm typecheck:tests` instead.
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

  // CLAUDE.md: "Don't add console.log in packages/core/". It was a convention with
  // no mechanism, which is the only kind of rule this repo does not keep.
  //
  // `warn` and `error` stay allowed, and that is the point of banning only the rest:
  // core deliberately warns 35 times and errors 4 — every one of them a documented
  // affordance telling a developer their setup is incomplete (no elicitation
  // presenter, a provider returning a Promise from getModels, a plugin that failed
  // to load). `log` / `info` / `debug` / `trace` / `table` / `dir` are what debugging
  // leaves behind, and they end up in a consumer's console with nothing they can do
  // about it.
  {
    files: ['packages/core/**/*.ts'],
    ignores: ['**/*.{test,spec}.ts', '**/__tests__/**'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
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
