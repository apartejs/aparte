/**
 * A composite token declared on `:root` freezes its parts (UI audit, visual half — LOT 15).
 *
 * `--aparte-message-padding: var(--aparte-message-padding-block) var(--aparte-message-padding-inline)`
 * was declared on `:root`. A custom property is substituted WHERE IT IS DECLARED, so the
 * two parts were resolved at the root, once — and `responsive.css` reassigning them on
 * `.aparte-message` inside `@container (max-width: 520px)` changed nothing the bubble
 * read: the whole narrow-container rule was dead, measured as 8px inline and 4px block
 * of padding that never moved between 375 and 768.
 *
 * The rule, exact because the corpus is small: a `:root` token whose value is only other
 * tokens must not have any of those parts redeclared on a non-root selector. Either the
 * reader takes the parts directly (what the bubble does now), or the composite is
 * declared where the parts are.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readAparteStylesheet } from './read-stylesheet';
import { coreRoot } from './read-stylesheet.js';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const css = strip(readAparteStylesheet());

const rootDecl = new Map<string, string>();
const scopedDeclarers = new Map<string, Set<string>>();
for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1]!.trim().replace(/\s+/g, ' ');
    const isRoot = /^:root\b/.test(selector);
    for (const d of block[2]!.matchAll(/(--aparte-[\w-]+)\s*:\s*([^;]+);/g)) {
        if (isRoot) {
            if (!rootDecl.has(d[1]!)) rootDecl.set(d[1]!, d[2]!.trim());
        } else {
            if (!scopedDeclarers.has(d[1]!)) scopedDeclarers.set(d[1]!, new Set());
            scopedDeclarers.get(d[1]!)!.add(selector);
        }
    }
}

/** `var(--a) var(--b)` and nothing else: a token made only of other tokens. */
function partsOf(value: string): string[] | null {
    const parts = [...value.matchAll(/var\((--aparte-[\w-]+)\)/g)].map((m) => m[1]!);
    if (parts.length < 2) return null;
    return value.replace(/var\(--aparte-[\w-]+\)/g, '').trim() === '' ? parts : null;
}

describe('composite tokens on :root', () => {
    it('read the corpus', () => {
        expect(rootDecl.size).toBeGreaterThan(300);
        expect(scopedDeclarers.size).toBeGreaterThan(20);
    });

    it('none has a part that is redeclared on a non-root selector — the composite would never see it', () => {
        const frozen: string[] = [];
        for (const [name, value] of rootDecl) {
            const parts = partsOf(value);
            if (!parts) continue;
            for (const part of parts) {
                const where = scopedDeclarers.get(part);
                if (where) frozen.push(`${name} = ${value} — but ${part} is redeclared on: ${[...where].join(' | ')}`);
            }
        }
        expect(frozen).toEqual([]);
    });
});

describe('the message row', () => {
    it('reads the two padding parts directly, so a container query can move them', () => {
        const bubble = strip(readFileSync(resolve(coreRoot(), 'src/styles/components/bubble.css'), 'utf8'));
        const row = bubble.match(/(?:^|\n)\.aparte-message\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(row).toMatch(/padding:\s*var\(--aparte-message-padding-block\)\s+var\(--aparte-message-padding-inline\)/);
    });
});
