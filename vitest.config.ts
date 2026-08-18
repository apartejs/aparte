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
      // EVERY published package is measured. Gating only core+engine was assumed
      // necessary to avoid "dilution" by the thin packages — measuring proved the
      // opposite (the global numbers went UP when they were included), so the
      // blind spot cost coverage instead of protecting it.
      include: ['packages/**/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{test,spec}.{ts,tsx}',
        '**/__tests__/**',
        '**/*.d.ts',
        '**/*.contract.ts',
        // Wrapper glue that only a browser can execute meaningfully (SFC/APF
        // templates, Angular DI wiring) — the E2E suite is what covers it.
        'packages/wrappers/**/*.svelte',
      ],
      reporter: ['text-summary', 'text', 'html'],
      // Floor (a ratchet against regressions), ~2pt under the current 70.7% lines
      // / 76.8% branches / 75.1% functions across all packages. Raise as coverage
      // grows — the thinnest spots today are the rendering layer
      // (segment-renderers ~49%), the client's error/compaction paths (~48%),
      // the transformers provider (~52%) and a few small primitives.
      thresholds: { lines: 68, statements: 68, functions: 73, branches: 74 },
    },
  },
});
