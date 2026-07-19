import { defineConfig } from 'vitest/config';

// Root test config. Each package adds its own vitest.config.ts as it lands;
// this catches any root-level specs and keeps `pnpm test` green while empty.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['packages/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      // Gate the two packages that hold the library's logic. The wrappers,
      // plugins and providers are thin and covered by their own suites + the
      // browser E2E, so they'd only dilute a single global threshold.
      include: ['packages/core/src/**/*.ts', 'packages/engine/src/**/*.ts'],
      exclude: ['**/*.{test,spec}.ts', '**/__tests__/**', '**/*.d.ts', '**/*.contract.ts'],
      reporter: ['text-summary', 'html'],
      // Floor (a ratchet against regressions), comfortably below the current
      // ~68% lines / 77% branches / 75% functions. Raise as coverage grows.
      thresholds: { lines: 65, statements: 65, functions: 70, branches: 72 },
    },
  },
});
