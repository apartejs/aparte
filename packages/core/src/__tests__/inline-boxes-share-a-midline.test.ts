/**
 * Every inline box the kit draws sits on the midline (UI audit — LOT 24).
 *
 * Inline boxes fall on the BASELINE unless they say otherwise, and none of the kit's
 * did: the icon button rode 3px above the row every other control shared, the three
 * spinners lined up on a bottom edge rather than a centre (6px of spread on a row
 * whose only job is to compare sizes), a badge's dot rode high, avatars of different
 * sizes aligned on the baseline of their initials. One declaration per recipe —
 * `vertical-align: middle` — puts them on one line; the icon already had it, as
 * `-0.125em`, and keeps it.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet';

const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Base recipe classes (no `--`, no `__`) whose own rule sets an inline display. */
function inlineRecipes(): Array<{ selector: string; body: string }> {
    const out: Array<{ selector: string; body: string }> = [];
    for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        const selectors = m[1]!.split(',').map((s) => s.trim());
        for (const s of selectors) {
            if (!/^\.aparte-[a-z0-9-]+$/.test(s) || /--|__/.test(s)) continue;
            if (/(?:^|;)\s*display\s*:\s*inline-/.test(m[2]!)) out.push({ selector: s, body: m[2]! });
        }
    }
    return out;
}

describe('inline recipes', () => {
    it('read the corpus', () => {
        expect(inlineRecipes().length).toBeGreaterThanOrEqual(8);
    });

    it('each declares its vertical alignment', () => {
        const silent = inlineRecipes().filter((r) => !/vertical-align\s*:/.test(r.body)).map((r) => r.selector);
        expect(silent, 'an inline box with no vertical-align falls on the baseline, off the row its neighbours share').toEqual([]);
    });
});
