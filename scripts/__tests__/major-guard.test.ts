/**
 * The accidental-major guard: no version off `ALLOWED_MAJOR` goes out, whether changesets
 * proposed it or a `major` changeset asked for it. `check-major` runs at the end of
 * `pnpm version-packages`; `release-pending` and `prerelease-checks` refuse it again.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED_MAJOR, offMajor, majorRefusal } from '../publishable.mjs';

const pkg = (name: string, version: string) => ({ name, version, dir: `packages/${name}` });

describe('the accidental-major guard', () => {
    it('lets every version on the allowed major through', () => {
        expect(ALLOWED_MAJOR).toBe(1);
        expect(offMajor([pkg('a', '1.0.0'), pkg('b', '1.4.2'), pkg('c', '1.5.0-rc.1')])).toEqual([]);
    });

    it('names a 2.0.0, a 2.0.0 pre-release and a 0.x, and nothing else', () => {
        const off = offMajor([pkg('a', '1.4.2'), pkg('b', '2.0.0'), pkg('c', '2.0.0-rc.1'), pkg('d', '0.32.1')]);
        expect(off).toEqual(['b@2.0.0', 'c@2.0.0-rc.1', 'd@0.32.1']);
        expect(majorRefusal(off)).toMatch(/3 package\(s\) off major 1: b@2\.0\.0, c@2\.0\.0-rc\.1, d@0\.32\.1/);
        expect(majorRefusal(off)).toMatch(/if this IS the v2 release/);
        expect(majorRefusal(off)).toMatch(/ALLOWED_MAJOR in scripts\/publishable\.mjs/);
    });

    it('passes on this repository as it stands', () => {
        const script = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-major.mjs');
        const out = execFileSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true });
        expect(out).toMatch(/\[check-major\] \d+ package\(s\), all on 1\.x\./);
    });
});
