/**
 * `hidden` hides a recipe element (UI audit, follow-up of LOT 15).
 *
 * Measured on the built preview: the copy button of a tool-only turn carried `hidden`
 * (out of the accessibility tree, as intended) and was still painted, because
 * `.aparte-btn { display: inline-flex }` — an author declaration — outranks the
 * browser's `[hidden] { display: none }`. Seventy-one base recipes set `display`; six
 * had a `[hidden]` rule of their own. One rule in base.css, scoped to our classes by
 * prefix, restores the browser's meaning for all of them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('hidden means hidden', () => {
    it('base.css restores display: none for every aparte- class carrying hidden', () => {
        const rule = base.match(/\[class\^="aparte-"\]\[hidden\]\s*,\s*\[class\*=" aparte-"\]\[hidden\]\s*\{([^}]*)\}/)?.[1] ?? '';
        expect(rule).toMatch(/display:\s*none\s*!important/);
    });

    it('is scoped by prefix, never a bare [hidden] that would restyle the host page', () => {
        expect(base).not.toMatch(/(?:^|[\s,])\[hidden\]\s*\{/);
    });
});
