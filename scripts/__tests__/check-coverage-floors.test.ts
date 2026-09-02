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
