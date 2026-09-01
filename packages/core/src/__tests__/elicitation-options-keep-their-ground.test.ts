/**
 * The recommended option keeps its ground, and the options leave room for the focus
 * ring (UI audit, visual half — LOTs 2 and 28).
 *
 * Two things measured on the elicitation preview, in both schemes at every width:
 *
 * - The recommended option — the one that takes focus on mount — was the ONLY row with
 *   no ground: sampled at x=600 it rendered the page background byte for byte while
 *   its sisters did not. Cause: `--recommended:focus-within { background: transparent }`,
 *   written to avoid a double outline, which took the row's ground away with its tint.
 *   The recommended state draws IN ADDITION to the resting state, never instead of it;
 *   under focus only the tinted border steps aside, so the ring is the one edge.
 * - The ring itself was amputated: the options sat 2px apart (`--aparte-space-1`),
 *   narrower than the ring's outset, so the next row painted over its bottom edge and
 *   ~8px of it survived. With the ring outset everywhere (T10), any list of options
 *   needs a gap at least as wide as the offset.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/components/elicitation.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const rule = (selector: string) => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

describe('the elicitation options', () => {
    it('sit far enough apart for an outset focus ring', () => {
        expect(rule('.aparte-elic-options')).toMatch(/gap:\s*var\(--aparte-space-3\)/);
    });

    it('the recommended one keeps its ground while it holds the focus', () => {
        const focused = rule('.aparte-elic-option--recommended:focus-within');
        expect(focused, 'the focus-within rule must exist: it is what steps the tinted border aside').not.toBe('');
        expect(focused).not.toMatch(/background\s*:\s*transparent/);
        expect(focused).toMatch(/border-color\s*:/);
    });
});
