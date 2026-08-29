/**
 * `HTMLElementTagNameMap` names every tag core defines, and nothing else.
 *
 * The compiler already pins the map against the GENERATED `AparteElementTagName`
 * (`element-map.ts`'s `_EveryDefinedTagIsMapped` assertion). That registry comes from the
 * custom-elements manifest, which comes from the JSDoc — so it proves the map agrees
 * with what the DOCS believe core defines.
 *
 * This file closes the other half: the map against the `customElements.define` calls
 * themselves, read out of the source. The two can disagree — a component that registers
 * itself but carries no manifest entry is invisible to the type pin — and when the map
 * sat at 21 of 24 both directions were wrong at once.
 *
 * The floors matter more than the assertions. A matcher that stops matching reports
 * "0 defined ⊆ 0 mapped" and passes, which is exactly how a corpus-shaped check rots.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * `src/` of this package, walking up from the cwd: `pnpm test` at the root and
 * `nx test @aparte/core` in the package run from two different directories, and under
 * Vite `import.meta.url` is an http URL that `readFileSync` refuses.
 */
function coreSrc(): string {
    for (let dir = process.cwd(), i = 0; i < 6; i++, dir = dirname(dir)) {
        for (const root of ['packages/core/src', 'src']) {
            const base = join(dir, root);
            if (existsSync(join(base, 'types', 'element-map.ts'))) return base;
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

/** Every tag passed to `customElements.define` in core's own source. */
const defined = new Set<string>();
for (const file of tsFiles(SRC)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/customElements\.define\(\s*'([a-z-]+)'/g)) {
        defined.add(m[1]);
    }
}

/** Every key `element-map.ts` adds to `HTMLElementTagNameMap`. */
const mapped = new Set<string>(
    [...readFileSync(join(SRC, 'types', 'element-map.ts'), 'utf8').matchAll(/^\s+'(aparte-[a-z-]+)':\s/gm)].map(
        (m) => m[1],
    ),
);

/** Both sides were 24 the day this was written; a shrunk corpus is the failure worth catching. */
const FLOOR = 24;

describe('element-map — every element core defines is typed', () => {
    it(`reads at least ${FLOOR} customElements.define calls`, () => {
        expect(defined.size).toBeGreaterThanOrEqual(FLOOR);
    });

    it(`reads at least ${FLOOR} HTMLElementTagNameMap entries`, () => {
        expect(mapped.size).toBeGreaterThanOrEqual(FLOOR);
    });

    it('every defined tag is mapped', () => {
        expect([...defined].filter((tag) => !mapped.has(tag)).sort()).toEqual([]);
    });

    it('every mapped tag is defined', () => {
        expect([...mapped].filter((tag) => !defined.has(tag)).sort()).toEqual([]);
    });

    it('every defined tag is prefixed aparte-', () => {
        expect([...defined].filter((tag) => !tag.startsWith('aparte-')).sort()).toEqual([]);
    });
});
