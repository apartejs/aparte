/**
 * Freshness is decided by the JavaScript, because that is what a consumer runs.
 *
 * `dist-freshness.mjs` compared `src` against the newest file in `dist` — but it
 * picked that file with `IS_INPUT`, the SOURCE filter: `.ts`, `.tsx`, `.css`,
 * `.svelte`, `.vue`, `.json`. In a `dist` the only thing that matches is a
 * declaration (`.d.ts` ends in `.ts`), so the guard never looked at a single `.js`
 * — the exact artifact whose staleness cost a red browser suite and made the guard
 * exist. Declarations and JavaScript come from different emitters, so they go out
 * of step exactly when it matters: a `typecheck` that writes into `dist` while the
 * bundle stays cached leaves fresh `.d.ts` over stale `.js`, and the guard read the
 * fresh half.
 *
 * The two tests below are that shape, and both reported GREEN before the fix.
 * The third is the control — an honest build must not turn red — and the fourth is
 * the floor: a walk that visits nothing would pass every assertion here for the
 * wrong reason.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
// The rule itself, called directly: these cases are about WHICH files it looks at,
// and running the gate step instead would only tell us the verdict.
import { distFreshness } from '../dist-freshness.mjs';

/** Three moments, far enough apart that no filesystem resolution can confuse them. */
const T0 = new Date('2020-01-01T00:00:00Z');
const T1 = new Date('2020-06-01T00:00:00Z');
const T2 = new Date('2021-01-01T00:00:00Z');

let root: string;

/** A package directory: `package.json`, a `src/` and whatever `dist/` the case needs. */
function pkg(name: string, files: Record<string, Date>): string {
    const dir = join(root, name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@t/${name}` }));
    for (const [rel, when] of Object.entries(files)) {
        const path = join(dir, rel);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `// ${rel}\n`);
        utimesSync(path, when, when);
    }
    return dir;
}

beforeAll(() => { root = mkdtempSync(join(tmpdir(), 'aparte-freshness-')); });
afterAll(() => { rmSync(root, { recursive: true, force: true }); });

describe('dist-freshness reads the built JavaScript', () => {
    it('a stale dist/index.js under a fresh .d.ts is stale', () => {
        // The emitters out of step: the declaration is newer than src, the bundle
        // it declares is older. Reading the newest `.ts` in dist reads the fresh half.
        const dir = pkg('dts-newer', {
            'src/index.ts': T1,
            'dist/index.js': T0,
            'dist/index.d.ts': T2,
        });
        const { stale } = distFreshness({ dirs: [dir] });
        expect(stale.join('\n')).toMatch(/dts-newer/);
    });

    it('a declaration-only dist is stale', () => {
        // `nx` claiming a `typecheck` output as the build's is how this happens: the
        // package "has a dist", every guard that reads built output finds nothing to
        // read, and the freshness check called it current.
        const dir = pkg('no-emit', {
            'src/index.ts': T1,
            'dist/index.d.ts': T2,
        });
        const { stale } = distFreshness({ dirs: [dir] });
        expect(stale.join('\n')).toMatch(/no-emit/);
    });

    it('an honest build is fresh', () => {
        const dir = pkg('honest', {
            'src/index.ts': T0,
            'src/theme.css': T0,
            'dist/index.js': T2,
            'dist/index.d.ts': T2,
        });
        expect(distFreshness({ dirs: [dir] }).stale).toEqual([]);
    });

    it('a `.mjs` emit counts as built JavaScript', () => {
        // The Angular wrapper ships `.mjs` and nothing else executable; a rule that
        // only knew `.js` would call every one of its builds declaration-only.
        const dir = pkg('mjs-only', {
            'src/index.ts': T0,
            'dist/index.mjs': T2,
            'dist/index.d.ts': T2,
        });
        expect(distFreshness({ dirs: [dir] }).stale).toEqual([]);
    });

    it('a test file in src does not date the build', () => {
        // `IS_INPUT` skips `__tests__` and `*.test.ts` on the src side, and must keep
        // doing so: the recorded hashes are computed from exactly that set.
        const dir = pkg('tests-ignored', {
            'src/index.ts': T0,
            'src/index.test.ts': T2,
            'dist/index.js': T1,
        });
        expect(distFreshness({ dirs: [dir] }).stale).toEqual([]);
    });

    it('every directory handed in is actually walked', () => {
        // The floor. A walk that visits nothing satisfies every "not stale"
        // assertion above, and that is precisely the failure this file exists for.
        const dirs = [
            pkg('floor-a', { 'src/index.ts': T0, 'dist/index.js': T2 }),
            pkg('floor-b', { 'src/index.ts': T0, 'dist/index.js': T2 }),
        ];
        expect(distFreshness({ dirs }).checked).toBe(2);
    });
});
