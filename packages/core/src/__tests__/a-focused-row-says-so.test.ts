/**
 * A keyboard-focused conversation row carries a visible indicator (the CSS/a11y audit,
 * 2026-09-05 — C1, critical).
 *
 * The ring on the row's title button was removed on 2026-09-05 for good reasons — it
 * drew the BUTTON's box, so the ⋯ sat outside it with the ring's end hidden underneath,
 * and a rectangle inside a rounded row read as a mistake — and the whole indication was
 * left to one background swap: "keyboard focus on a row IS the hover". Measured in
 * Chromium with core's own tokens, after letting `transition: background` settle:
 *
 *   light   focused row rgb(228.7, 222.8, 212.2)   neighbour rgb(241, 235, 223)   1.12 : 1
 *   dark    focused row rgb(54, 47.2, 61.8)        neighbour rgb(42, 35, 51)      1.18 : 1
 *
 * `--aparte-conv-item-bg-hover` is `--aparte-surface-3`, a 6% tint of the text colour;
 * `--aparte-conv-item-color` and `-color-active` are the same value, so the `color`
 * half of the rule changes nothing. SC 1.4.11 asks 3:1 of the visual that identifies a
 * component's state — this is a third of it, on the primary navigation of every chat
 * product this library is meant to build, thirteen tab stops into the page.
 *
 * The fix keeps every reason the old ring was removed. It is drawn on the ROW, so the ⋯
 * is inside it and it follows the row's 9px radius; it is INSET by its own width, so the
 * list's horizontal clip cannot cut it (measured: row x=14 w=248 in a list x=14 w=248,
 * whole on both edges); and it is the kit's own ring — same token, same colour, same
 * 1px. Measured after: 4.22:1 against the focused row's own fill and 4.72:1 against the
 * sidebar ground in light, 5.79:1 in dark.
 *
 * The button keeps `outline: none`, and that is not an oversight: with it dropped
 * Chromium draws its default `auto 1px rgb(16,16,16)` on a box 34px narrower than the
 * row, i.e. two rings, the inner one black and ending under the ⋯ — the exact picture
 * the 2026-09-05 review rejected. Measured both ways.
 *
 * jsdom resolves no `var()` and applies no stylesheet it was not given, so what this
 * suite holds is the source shape. The ratios above belong to a browser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const conversation = readFileSync(resolve(coreRoot(), 'src/styles/components/conversation.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

const rule = (selector: string): string => {
    for (const m of conversation.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

const FOCUSED_ROW = '.aparte-conv-item:has(.aparte-conv-item__select:focus-visible)';

describe('a focused conversation row', () => {
    it('read the corpus', () => {
        expect(conversation.length).toBeGreaterThan(2000);
    });

    it('draws the kit’s ring, on the row', () => {
        const body = rule(FOCUSED_ROW);
        expect(body, 'the focused-row rule is gone').toBeTruthy();
        expect(body).toMatch(/outline:\s*var\(--aparte-focus-outline-width\)\s+solid\s+var\(--aparte-border-focus\)/);
    });

    it('insets it by its own width, so the list’s clip cannot cut it', () => {
        expect(rule(FOCUSED_ROW)).toMatch(/outline-offset:\s*calc\(-1\s*\*\s*var\(--aparte-focus-outline-width\)\)/);
    });

    it('keeps the lift as warmth, not as the indicator', () => {
        const body = rule(FOCUSED_ROW);
        expect(body).toMatch(/background:\s*var\(--aparte-conv-item-bg-hover\)/);
        expect(body).toMatch(/color:\s*var\(--aparte-conv-item-color-active\)/);
    });

    it('draws nothing on the title button, so there is one ring and not two', () => {
        expect(rule('.aparte-conv-item__select:focus-visible')).toMatch(/outline:\s*none/);
    });
});
