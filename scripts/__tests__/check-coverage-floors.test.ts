/**
 * Every published source root carries a coverage floor.
 *
 * The global floors are an average over ~120 files. An average cannot see one area:
 * `packages/plugins/artifacts/src` sat at 78% lines and 72% branches, and
 * `packages/wrappers/angular/src` at 62% functions, while the four global numbers
 * stayed comfortably green — and either could have gone to zero without any
 * threshold noticing, because deleting a small package's tests moves a repo-wide
 * average by a fraction of a point.
 *
 * The two per-glob floors that existed guarded `packages/core/src/client` and
 * `packages/core/src/renderers`: the two areas an audit had already looked at, and
 * two of the best-covered in the repo. Nothing else had one.
 *
 * So this asserts the property rather than the list: every package that ships from
 * this repo — the same corpus `check-dist-freshness` walks, so the two cannot drift
 * apart — has a threshold over the WHOLE of its `src`. A glob over a sub-directory
 * does not count; that is precisely the shape that left the rest of core unfloored.
 *
 * `scripts/check-coverage-floors.mjs` then keeps each of those honest from both
 * sides: below the floor fails, and more than three points ABOVE it fails too, so a
 * floor cannot quietly become decorative.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageDirs } from '../dist-freshness.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG = join(REPO, 'vitest.config.ts');

/**
 * The floor on the corpus itself. `packageDirs` walks the tree, and a walk that came
 * back short would make every assertion below vacuously true — the failure mode a
 * guard is least able to notice about itself.
 */
const ROOT_FLOOR = 15;

/** `'packages/x/src/**': { … }` — every glob threshold declared in the config. */
function declaredGlobs(): string[] {
    const config = readFileSync(CONFIG, 'utf8');
    return [...config.matchAll(/'([^']+\/\*\*)':\s*\{[^}]*\}/g)].map((m) => m[1]!);
}

/** Repo-relative, forward-slashed `src` root of every publishable package. */
const ROOTS = [...packageDirs(join(REPO, 'packages'))]
    .map((dir) => `${dir.slice(REPO.length + 1).split(/[\\/]/).join('/')}/src`);

describe('coverage floors cover every published package', () => {
    it('finds the published roots at all', () => {
        expect(ROOTS.length).toBeGreaterThanOrEqual(ROOT_FLOOR);
        expect(ROOTS).toContain('packages/core/src');
        expect(ROOTS).toContain('packages/engine/src');
    });

    it('declares a threshold over the whole src of each one', () => {
        const globs = new Set(declaredGlobs());
        // A sub-directory glob is deliberately NOT accepted: `packages/core/src/client/**`
        // and `packages/core/src/renderers/**` both existed while the other ~100 files
        // under `packages/core/src` had no floor at all.
        const unfloored = ROOTS.filter((root) => !globs.has(`${root}/**`));
        expect(unfloored, `no coverage threshold covers: ${unfloored.join(', ')}`).toEqual([]);
    });

    it('declares no threshold over a directory that does not exist', () => {
        // A stale glob measures nothing, and `check-coverage-floors.mjs` can only say so
        // during a coverage run. This says it in a second, without one.
        const missing = declaredGlobs().filter((glob) => {
            try { return !statSync(join(REPO, glob.replace(/\/\*\*$/, ''))).isDirectory(); }
            catch { return true; }
        });
        expect(missing, `these globs point at nothing: ${missing.join(', ')}`).toEqual([]);
    });
});

/*
 * The ratchet turns itself. A floor more than three points under its measurement used to
 * stop the gate with "raise it to N", ten minutes in, for an edit nobody had to think
 * about. It is now written into the config — locally; CI still refuses, so the raise is
 * committed rather than made on a runner and thrown away.
 */
describe('grading the floors', () => {
    const config = [
        'export default {',
        '  test: { coverage: {',
        '      thresholds: {',
        '        lines: 70,',
        '        statements: 70,',
        '        functions: 70,',
        '        branches: 60,',
        "        'packages/a/src/**': { lines: 70, statements: 70, functions: 70, branches: 60 },",
        '      },',
        '  } },',
        '};',
    ].join('\n');
    const file = (pct: number) => ({ covered: pct, total: 100 });
    const entry = (l: number, b: number) => ({ lines: file(l), statements: file(l), functions: file(l), branches: file(b) });

    it('raises the global block and a glob in one pass', async () => {
        const { gradeFloors } = await import('../check-coverage-floors.mjs');
        const summary = { 'packages/a/src/x.ts': entry(90, 66) };
        const { problems, raises, config: next } = gradeFloors(config, summary);
        expect(problems).toEqual([]);
        expect(raises.map((r: { label: string; metric: string; to: number }) => `${r.label} ${r.metric} ${r.to}`)).toEqual([
            'global lines 89', 'global statements 89', 'global functions 89', 'global branches 65',
            'packages/a/src/** lines 89', 'packages/a/src/** statements 89', 'packages/a/src/** functions 89', 'packages/a/src/** branches 65',
        ]);
        expect(next).toContain('        lines: 89,\n        statements: 89,\n        functions: 89,\n        branches: 65,');
        expect(next).toContain("'packages/a/src/**': { lines: 89, statements: 89, functions: 89, branches: 65 }");
    });

    it('fails a floor above its measurement, and raises nothing to hide it', async () => {
        const { gradeFloors } = await import('../check-coverage-floors.mjs');
        const summary = { 'packages/a/src/x.ts': entry(71, 59) };
        const { problems, raises } = gradeFloors(config, summary);
        expect(problems.join('\n')).toMatch(/"packages\/a\/src\/\*\*" branches measured 59\.00%, BELOW its floor of 60/);
        expect(raises).toEqual([]);
    });

    it('writes the raise locally and goes on, and refuses it in CI', async () => {
        const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { spawnSync } = await import('node:child_process');
        const script = join(REPO, 'scripts', 'check-coverage-floors.mjs');
        const run = (env: Record<string, string | undefined>) => {
            const dir = mkdtempSync(join(tmpdir(), 'floors-'));
            mkdirSync(join(dir, 'coverage'));
            writeFileSync(join(dir, 'vitest.config.ts'), config);
            writeFileSync(join(dir, 'coverage', 'coverage-summary.json'), JSON.stringify({ 'packages/a/src/x.ts': entry(90, 66) }));
            const { CI: _ci, GITHUB_ACTIONS: _gh, ...rest } = process.env;
            const out = spawnSync(process.execPath, [script], { cwd: dir, env: { ...rest, ...env }, encoding: 'utf8' });
            const written = readFileSync(join(dir, 'vitest.config.ts'), 'utf8');
            rmSync(dir, { recursive: true, force: true });
            return { status: out.status, written, stdout: out.stdout, stderr: out.stderr };
        };

        const local = run({});
        expect(local.status, local.stderr).toBe(0);
        expect(local.stdout).toMatch(/raised 8 floor\(s\)/);
        expect(local.written).toContain("'packages/a/src/**': { lines: 89, statements: 89, functions: 89, branches: 65 }");

        const ci = run({ CI: 'true' });
        expect(ci.status).toBe(1);
        expect(ci.stderr).toMatch(/Raise it to 89/);
        expect(ci.written, 'CI leaves the config alone').toBe(config);
    });

    it('fails a glob that matched no file', async () => {
        const { gradeFloors } = await import('../check-coverage-floors.mjs');
        const { problems } = gradeFloors(config, { 'packages/b/src/y.ts': entry(71, 61) });
        expect(problems.join('\n')).toMatch(/"packages\/a\/src\/\*\*" matched no file/);
    });
});
