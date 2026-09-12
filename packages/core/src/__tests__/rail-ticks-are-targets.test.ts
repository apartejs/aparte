/**
 * A scroll-rail tick is a 24px target on a 24px pitch (WCAG 2.5.8, Target Size Minimum).
 *
 * A tick is a real `<button>` that jumps the transcript, and it was drawn as the line it
 * stands for: 14×2 CSS px, with a `::before` that grew the pressable zone by half the
 * 8px gap in the block axis and by `--aparte-space-2` in the inline one — 22×10, on a
 * 10px pitch. 2.5.8 asks for 24×24 unless a spacing exemption applies, and none does
 * here: the exemption is measured on a 24px circle around the target's centre, and at a
 * 10px pitch the neighbours' circles overlap. The rail hides entirely under
 * `(pointer: coarse)` (responsive.css), so the bar is 2.5.8's 24px, not 2.5.5's 44px.
 *
 * The wrong fix is to grow only the pseudo-element: at a 10px pitch two 24px zones
 * overlap by 14px and the z-order decides every press, which passes the letter of the
 * rule while making mis-hits WORSE. The pitch has to rise with the zone, so one token
 * owns both — `--aparte-scroll-rail-hit-size` — and the gap derives from it: gap =
 * hit − thickness, so gap + thickness IS the pitch and the zones tile exactly, edge to
 * edge, with no overlap.
 *
 * The inline axis is asymmetric on purpose. The rail clips (`overflow: hidden`) and its
 * ticks are end-aligned, so a zone centred on a 14px tick would hang 5px past the end
 * edge and be cut back to 19px. Growing it INWARD instead — the start edge only — keeps
 * all 24px inside the column, which is why the rail's own width now carries the hit size
 * as a floor.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (rel: string) => strip(readFileSync(resolve(STYLES, rel), 'utf8'));
const rule = (css: string, selector: string) => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};
const theme = read('theme.css');
const rail = read('components/scroll-rail.css');

describe('a scroll-rail tick is a target', () => {
    it('has one token for the size of the pressable zone', () => {
        expect(theme).toMatch(/--aparte-scroll-rail-hit-size:\s*24px/);
    });

    it('spaces the ticks so the zones tile instead of overlapping', () => {
        expect(theme).toMatch(
            /--aparte-scroll-rail-gap:\s*calc\(var\(--aparte-scroll-rail-hit-size\)\s*-\s*var\(--aparte-scroll-rail-tick-thickness\)\)/,
        );
    });

    it('draws the zone from the hit size, not from the gap or a spacing step', () => {
        const before = rule(rail, '.aparte-scroll-rail__tick::before');
        expect(before).toBeTruthy();
        expect(before).toContain('--aparte-scroll-rail-hit-size');
        expect(before).not.toContain('--aparte-scroll-rail-gap');
        expect(before).not.toContain('--aparte-space-2');
    });

    it('grows the zone inward, so the rail does not clip it', () => {
        const before = rule(rail, '.aparte-scroll-rail__tick::before');
        expect(before).toMatch(/inset-inline-end:\s*0/);
        expect(before).toMatch(
            /inset-inline-start:\s*calc\(var\(--aparte-scroll-rail-tick-size\)\s*-\s*var\(--aparte-scroll-rail-hit-size\)\)/,
        );
    });

    it('keeps the rail at least as wide as one zone', () => {
        expect(theme).toMatch(
            /--aparte-scroll-rail-width:\s*max\(var\(--aparte-scroll-rail-hit-size\),\s*calc\(var\(--aparte-scroll-rail-tick-size\)\s*\*\s*1\.6\)\)/,
        );
    });
});

/*
 * The block axis had the same clipping trap as the inline one, and the first pass only
 * carried the reasoning to one of them.
 *
 * `aparte-scroll-rail` clips (`overflow: hidden`) and had no padding, so the first tick's
 * top edge sat exactly on the rail's clip line. The zone grows symmetrically — 11px above
 * and below a 2px line — so the FIRST tick lost its upper 11px and the LAST tick its
 * lower 11px, to paint and to hit-testing alike: 13px tall, under the 24px bar, on the two
 * ticks a reader aims at most ("jump to the first message", "jump to the latest").
 *
 * The fix is the room, not a smaller zone: the rail pads its block axis by exactly the
 * half-growth the zone takes, so the clip line falls OUTSIDE every zone instead of
 * through the two end ones. `box-sizing: border-box` keeps `max-height` meaning the same
 * box it meant before.
 */
describe('the rail does not clip the first and last zone', () => {
    it('pads its block axis by the half-growth a zone takes', () => {
        const host = rule(rail, 'aparte-scroll-rail');
        expect(host).toBeTruthy();
        expect(host).toMatch(
            /padding-block:\s*calc\(\(var\(--aparte-scroll-rail-hit-size\)\s*-\s*var\(--aparte-scroll-rail-tick-thickness\)\)\s*\/\s*2\)/,
        );
    });

    it('keeps max-height measuring the same box once the padding is there', () => {
        const host = rule(rail, 'aparte-scroll-rail');
        expect(host).toMatch(/box-sizing:\s*border-box/);
        expect(host).toMatch(/max-height:/);
    });

    it('adds no padding the list would then have to un-do on the inline axis', () => {
        const host = rule(rail, 'aparte-scroll-rail');
        expect(host).not.toMatch(/padding-inline:/);
        expect(host).not.toMatch(/(^|;)\s*padding:/);
    });
});

/*
 * The rail is a LIST of ticks, not a minimap: it takes the height of its list, capped at a
 * share of the transcript, and sits centred on the transcript's span. Measured on the
 * market (2026-09-05): every per-turn rail that ships as a list caps itself (LobeChat at
 * 50vh) and every full-height strip is a proportional minimap with a viewport window —
 * a different component. A list stretched to the full transcript read as the second
 * while behaving as the first.
 */
describe('the rail is a capped list, centred on the transcript', () => {
    const host = rule(rail, 'aparte-scroll-rail');

    it('caps its height at a share of the transcript, from one token', () => {
        expect(theme).toMatch(/--aparte-scroll-rail-share:\s*\.6/);
        expect(host).toMatch(/max-height:\s*calc\(\(100% - var\(--aparte-scroll-rail-block-start, 0px\) - var\(--aparte-scroll-rail-block-end, 0px\)\) \* var\(--aparte-scroll-rail-share\)\)/);
    });

    it('centres on the transcript: its top is the middle of the published span, pulled back by half its own height', () => {
        expect(host).toMatch(/top:\s*calc\(var\(--aparte-scroll-rail-block-start, 0px\) \+ \(100% - var\(--aparte-scroll-rail-block-start, 0px\) - var\(--aparte-scroll-rail-block-end, 0px\)\) \/ 2\)/);
        expect(host).toMatch(/transform:\s*translateY\(-50%\)/);
        expect(host).not.toMatch(/(^|;)\s*bottom:/);
    });

    it('scrolls past the cap, with no bar of its own', () => {
        expect(host).toMatch(/overflow-y:\s*auto/);
        expect(host).toMatch(/scrollbar-width:\s*none/);
    });
});


/*
 * …and the indicator has to mark the same zone (the CSS/a11y audit, 2026-09-05 — M8).
 *
 * `outline` paints on the ELEMENT's border box, never on a pseudo-element's, and the
 * tick's element box is the 14×2 line it draws. Measured: the ring came out 16×4,
 * floating in the middle of the 24×24 zone the pointer uses — for the indicator a
 * keyboard user follows down the whole transcript, since the rail implements roving
 * focus. At 4.72:1 it satisfied SC 1.4.11 and SC 2.4.7; the shortfall was area, i.e.
 * AAA SC 2.4.13. Two lines either way, so it moved onto the `::before` that already
 * computes the zone.
 *
 * And the ring on that zone is INSET by its own width, because the zone IS the rail's
 * clip box: the rail is exactly `--aparte-scroll-rail-width` wide with no inline
 * padding, the zone is anchored to both of its inline edges, and `outline` paints
 * OUTSIDE the border box — so at the shared `0` offset both verticals landed 1px into
 * what `overflow-x: hidden` cuts, and the block edge of the first and last tick lost a
 * third side to the same clip. Measured on a page: two detached 16px hairlines, 24px
 * apart, on the one indicator a keyboard reader follows down the transcript; inset by
 * the ring's width the same tick paints all four sides. Same inset idiom as the
 * conversation row and the thumbnail, and for the same reason — a clip in the way.
 */
describe('the ring marks the zone, not the line', () => {
    it('draws nothing on the tick itself', () => {
        expect(rule(rail, '.aparte-scroll-rail__tick:focus-visible')).toMatch(/outline:\s*none/);
    });

    it('draws the kit’s ring on the pressable zone', () => {
        const ring = rule(rail, '.aparte-scroll-rail__tick:focus-visible::before');
        expect(ring, 'the ring is not on the ::before').toBeTruthy();
        expect(ring).toMatch(/outline:\s*var\(--aparte-focus-outline-width\)\s+solid\s+var\(--aparte-border-focus\)/);
        expect(ring, 'the ring has to be inset, the zone is the rail’s clip box').toMatch(
            /outline-offset:\s*calc\(-1 \* var\(--aparte-focus-outline-width\)\)/,
        );
        expect(ring, 'a square ring around a rounded zone').toMatch(/border-radius:/);
    });
});
