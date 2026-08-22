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
      // The floor, and the reason it is written like this.
      //
      // It used to be `lines: 68` with a comment saying "~2pt under the current
      // 70.7%". Coverage then rose to 75.8% and the floor never moved, leaving
      // EIGHT points of slack — enough that deleting the largest rendering suite in
      // the repo (791 lines, 77 tests) still exited 0. A ratchet that is never
      // raised is not a ratchet, it is a comment.
      //
      // Measured 2026-08-22, after the audit-remediation lot: 81.06 lines/statements,
      // 80.88 branches, 76.26 functions. The floors below sit ~1pt under that.
      //
      // No `autoUpdate` on purpose: it would rewrite this file during a test run,
      // and `pnpm release` refuses to publish from a dirty tree. The practical
      // mitigation is that `pnpm gate` now runs coverage, so the real number is in
      // front of whoever changes it, every time.
      //
      // `perFile` on the two directories the audit named: a global average lets a
      // 27%-covered module hide behind a well-tested one, and the client and the
      // renderers are exactly where the risk is concentrated.
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 75,
        branches: 79,
        'packages/core/src/client/**': { lines: 70, statements: 70, functions: 70, branches: 65 },
        // The renderers sit at 53.6% lines, which is the thinnest area in the
        // package and the reason a per-glob floor was needed at all: the 81% global
        // average was hiding it completely. The floor is set at the MEASURED value
        // minus a point rather than at an aspiration — a threshold nobody meets is
        // a threshold that gets lowered, and writing filler tests to reach 70 would
        // buy a number instead of coverage. What it does buy today is that this
        // number can no longer go DOWN, which it silently could before.
        'packages/core/src/renderers/**': { lines: 52, statements: 52, functions: 60, branches: 60 },
      },
    },
  },
});
