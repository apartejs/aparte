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
    // Do NOT set `isolate: false`. The suite depends on per-file isolation, and
    // that is measured rather than assumed: `vitest run --no-isolate` fails 6 tests
    // across 4 files today — the two barrels' export-parity check, the lazy
    // renderer install, the viewport's re-parent listener count, and the composer's
    // drag-drop pair. None is a product bug; all four are state a previous file left
    // behind in a shared worker (a registered renderer, an attached listener, a
    // module registry seen once instead of twice).
    //
    // It is written down because an audit recorded one run with 74 failures across 8
    // files — the four Angular specs among them — that was never reproduced in five
    // reruns. Sharing a worker produces exactly that shape, and `isolate: false` is
    // the switch that would cause it. If that run ever recurs, start here.

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
      // `json-summary` is what `check:coverage-floors` reads. Without it the per-glob
      // numbers are printed only when a threshold FAILS — which is exactly the moment
      // they are least useful for calibrating one, and the reason two of these floors
      // drifted 14 and 21 points below their measurement without anyone noticing.
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
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
      // Per-GLOB floors on the two directories the audit named, so a thin module
      // cannot hide entirely behind the 81% global average.
      //
      // NOT per-file: an earlier version of this comment claimed `perFile`, which is
      // neither set here nor what a glob threshold does — Vitest pools a glob into one
      // figure, so `stream-adapter.ts` could still fall a long way while the client
      // aggregate holds. Real per-file enforcement needs `thresholds.perFile: true`
      // globally, which the renderers at 33% cannot meet today. The tighter aggregate
      // floors below are what is actually enforced, and they are set from the MEASURED
      // value minus a point — a follow-up audit proved the old client floor of 70
      // decorative by deleting all four client suites this lot added (462 lines, 14
      // tests) and staying green.
      thresholds: {
        lines: 81,
        statements: 81,
        functions: 77,
        branches: 83,
        // Set from the MEASURED aggregate minus a point, not from a round number.
        // A follow-up audit proved the previous 70/70/70/65 decorative: it deleted
        // all four client suites this remediation added — 462 lines, 14 tests — and
        // the gate stayed GREEN, because the glob sat 10 to 22 points above its own
        // floor. A floor with that much slack is the same defect as the global 68
        // it was introduced to fix.
        'packages/core/src/client/**': { lines: 82, statements: 82, functions: 95, branches: 95 },
        // The renderers sit at 53.6% lines, which is the thinnest area in the
        // package and the reason a per-glob floor was needed at all: the 81% global
        // average was hiding it completely. The floor is set at the MEASURED value
        // minus a point rather than at an aspiration — a threshold nobody meets is
        // a threshold that gets lowered, and writing filler tests to reach 70 would
        // buy a number instead of coverage. What it does buy today is that this
        // number can no longer go DOWN, which it silently could before.
        // Raised 56 -> 58 when the nine built-ins became nine files: the split moved
        // code out of one thinly-covered module into files the existing tests reach,
        // and measured coverage went to 59.11%. The ratchet guard caught the slack.
        'packages/core/src/renderers/**': { lines: 58, statements: 58, functions: 73, branches: 72 },
      },
    },
  },
});
