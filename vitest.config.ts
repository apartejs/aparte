import { defineConfig } from 'vitest/config';

// Root test config. Each package adds its own vitest.config.ts as it lands;
// this catches any root-level specs and keeps `pnpm test` green while empty.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    // Vitest 2 runs each file in a CHILD PROCESS (the `forks` pool became the
    // default in 2.0), and each one boots its own jsdom. Unbounded, that is
    // `cpus - 1` processes — 31 on a 32-thread machine, for a suite whose actual
    // test time is ~7s: the rest is per-worker startup, so the extra workers buy
    // seconds and cost gigabytes. Measured here: 31 workers 13s · 16 workers 15s ·
    // 8 workers 17s · 4 workers 24s. Half the machine is the sweet spot and leaves
    // the other half to the human running it.
    //
    // CI is left unbounded: the runner exists to run this, and its 2-4 cores make
    // a percentage cap actively harmful. `minWorkers` must be lowered too — vitest
    // errors out if the default minimum ends up above the maximum.
    ...(process.env.CI ? {} : { minWorkers: 1, maxWorkers: '50%' }),
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
