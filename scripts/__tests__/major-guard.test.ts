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
        expect(ALLOWED_MAJOR).toBe(0);
        expect(offMajor([pkg('a', '0.28.3'), pkg('b', '0.29.0-rc.1')])).toEqual([]);
    });

    it('names a 1.0.0 and a 1.0.0 pre-release, and nothing else', () => {
        const off = offMajor([pkg('a', '0.28.3'), pkg('b', '1.0.0'), pkg('c', '1.0.0-rc.1')]);
        expect(off).toEqual(['b@1.0.0', 'c@1.0.0-rc.1']);
        expect(majorRefusal(off)).toMatch(/2 package\(s\) off major 0: b@1\.0\.0, c@1\.0\.0-rc\.1/);
        expect(majorRefusal(off)).toMatch(/ALLOWED_MAJOR in scripts\/publishable\.mjs/);
    });

    it('passes on this repository as it stands', () => {
        const script = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-major.mjs');
        const out = execFileSync(process.execPath, [script], { encoding: 'utf8', windowsHide: true });
        expect(out).toMatch(/\[check-major\] \d+ package\(s\), all on 0\.x\./);
    });
});
