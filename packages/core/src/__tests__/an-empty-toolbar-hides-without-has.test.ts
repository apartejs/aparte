/**
 * The empty composer toolbar hides on an engine that does not know `:has()` (RA-16).
 *
 * A row with nothing in it must not draw its separator, and three selectors said so in
 * ONE rule list — `aparte-composer-toolbar[data-empty]`, the first-paint reservation
 * `aparte-composer-toolbar:not(:defined):not(:has(*))`, and `.aparte-composer-footer:empty`.
 * An unsupported selector anywhere in a comma list voids the WHOLE rule, so on such an
 * engine the two that need no `:has()` went down with the one that does, and an empty
 * row drew its 13px band forever rather than for one frame.
 *
 * Split, the reservation keeps its own rule and the two plain selectors keep theirs, so
 * the worst case degrades to what it was before the reservation existed. The same shape
 * as every other progressive-enhancement rule in the sheets: `:has()` may add, never
 * gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const composer = readFileSync(resolve(coreRoot(), 'src/styles/components/composer.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Every rule as `{ selectors, body }`, at the top level of the sheet. */
function rules(css: string): { selectors: string[]; body: string }[] {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
        selectors: m[1]!.split(',').map((s) => s.trim()).filter(Boolean),
        body: m[2]!,
    }));
}

describe('the empty-row rule', () => {
    const all = rules(composer);

    it('read the corpus', () => {
        expect(all.length).toBeGreaterThan(30);
    });

    it('hides an empty toolbar without needing :has()', () => {
        const plain = all.find(
            (r) => r.selectors.includes('aparte-composer-toolbar[data-empty]') && /display:\s*none/.test(r.body),
        );
        expect(plain, 'no rule hides [data-empty]').toBeTruthy();
        expect(plain!.selectors.some((s) => s.includes(':has('))).toBe(false);
        expect(plain!.selectors).toContain('.aparte-composer-footer:empty');
    });

    it('keeps the first-paint reservation in a rule of its own', () => {
        const reservation = all.find((r) => r.selectors.some((s) => s.startsWith('aparte-composer-toolbar:not(:defined)')));
        expect(reservation, 'the :not(:defined) reservation is gone').toBeTruthy();
        expect(reservation!.selectors).toEqual(['aparte-composer-toolbar:not(:defined):not(:has(*))']);
        expect(reservation!.body).toMatch(/display:\s*none/);
    });

    it('lets no :has() selector share a rule list with one that does not need it', () => {
        const mixed = all
            .filter((r) => r.selectors.length > 1 && r.selectors.some((s) => s.includes(':has(')))
            .filter((r) => r.selectors.some((s) => !s.includes(':has(')))
            .map((r) => r.selectors.join(', '));
        expect(mixed).toEqual([]);
    });
});
