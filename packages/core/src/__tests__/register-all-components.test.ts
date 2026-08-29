/**
 * `registerAllComponents()` knows every element, and says which one is missing.
 *
 * It used to look up four tags of twenty-four and, on a miss, log "Some components may
 * not be registered". Both halves failed a consumer: twenty of the elements could be
 * absent with the function reporting nothing, and the consumer who did get the warning
 * was not told which module to import. The guide promised it "touches every element
 * class so a bundler cannot tree-shake the `customElements.define` side effects away",
 * which four names cannot do.
 *
 * Two assertions, and the second is the one that cannot rot: the tags the function reads
 * are compared against every `customElements.define` literal in `src/**`, so adding a
 * twenty-fifth element without listing it here is red. The floor guards the matcher —
 * a regex that stops matching would otherwise compare two empty sets and pass.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { registerAllComponents } from '../index.js';

function coreSrc(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const root of ['packages/core/src', 'src']) {
            const base = join(dir, root);
            if (existsSync(join(base, 'index.ts'))) return base;
        }
    }
    throw new Error(`core's src/ not found from ${process.cwd()}`);
}

function tsFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'generated') continue;
            tsFiles(p, out);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            out.push(p);
        }
    }
    return out;
}

const SRC = coreSrc();

const defined = new Set<string>();
for (const file of tsFiles(SRC)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/customElements\.define\(\s*'([a-z-]+)'/g)) {
        defined.add(m[1]);
    }
}

/** The tags inside `APARTE_ELEMENTS`, read from the source: the array is not exported. */
const listed = new Set<string>(
    [...readFileSync(join(SRC, 'index.ts'), 'utf8')
        .split('const APARTE_ELEMENTS')[1]
        .split('];')[0]
        .matchAll(/\['(aparte-[a-z-]+)',/g)].map((m) => m[1]),
);

/** 24 the day this was written; below this the matcher, not the code, is what broke. */
const FLOOR = 21;

afterEach(() => {
    vi.restoreAllMocks();
});

describe('registerAllComponents', () => {
    it('warns about nothing once the barrel is imported', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        registerAllComponents();
        expect(warn).not.toHaveBeenCalled();
    });

    it('is safe to call more than once', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        registerAllComponents();
        registerAllComponents();
        expect(warn).not.toHaveBeenCalled();
    });

    it(`reads more than ${FLOOR} tags out of APARTE_ELEMENTS`, () => {
        expect(listed.size).toBeGreaterThan(FLOOR);
    });

    it(`reads more than ${FLOOR} customElements.define calls out of src/`, () => {
        expect(defined.size).toBeGreaterThan(FLOOR);
    });

    it('lists every tag core defines', () => {
        expect([...defined].filter((tag) => !listed.has(tag)).sort()).toEqual([]);
    });

    it('lists no tag core does not define', () => {
        expect([...listed].filter((tag) => !defined.has(tag)).sort()).toEqual([]);
    });

    it('names the missing tags rather than saying "some"', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // A tag nothing defined: the same shape as a bundler having dropped a module.
        const original = customElements.get.bind(customElements);
        vi.spyOn(customElements, 'get').mockImplementation((tag: string) =>
            tag === 'aparte-split' ? undefined : original(tag),
        );
        registerAllComponents();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('aparte-split');
        expect(String(warn.mock.calls[0][0])).toContain(`1 of ${listed.size}`);
    });
});
