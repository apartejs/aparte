/**
 * The built-in glyphs share one grid and one stroke (UI audit, visual half — LOT 17).
 *
 * Two of the 28 were drawn on a 16-unit grid (`download`, `stop`) among siblings on 24,
 * so the same `stroke-width="2"` painted 50 % heavier on them — visible in a row of
 * buttons. And two glyphs the documented shell markup needs — the hamburger (`menu`) and
 * the alert's triangle — lived only in the extended set, behind `@aparte/core/icons`, so
 * `<aparte-icon name="menu">` in core's own app-header example drew a 16px hole. The
 * rule from the house doc: `glyphs.ts` is the set core draws; core's documented markup
 * is core's drawing.
 */
import { describe, it, expect } from 'vitest';
import { APARTE_ICON_GLYPHS } from '../glyphs.js';
import { APARTE_EXTENDED_ICON_GLYPHS } from '../extended.js';

const entries = Object.entries(APARTE_ICON_GLYPHS) as Array<[string, string]>;

describe('the built-in glyph set', () => {
    it('is the set core draws — and that includes what its documented shell markup asks for', () => {
        expect(Object.keys(APARTE_ICON_GLYPHS)).toEqual(expect.arrayContaining(['menu', 'alertTriangle']));
        expect(Object.keys(APARTE_EXTENDED_ICON_GLYPHS)).not.toContain('menu');
        expect(Object.keys(APARTE_EXTENDED_ICON_GLYPHS)).not.toContain('alertTriangle');
    });

    it.each(entries)('%s is drawn on the 24-unit grid', (_name, svg) => {
        expect(svg).toContain('viewBox="0 0 24 24"');
    });

    it.each(entries.filter(([, svg]) => /stroke="currentColor"/.test(svg)))('%s strokes at 2 units', (_name, svg) => {
        expect(svg).toContain('stroke-width="2"');
    });

    it.each(entries)('%s carries no size of its own', (_name, svg) => {
        // The <svg> opening tag only — a <rect> inside legitimately has a width.
        const open = svg.match(/^<svg[^>]*>/)?.[0] ?? '';
        expect(open).not.toMatch(/\swidth=/);
        expect(open).not.toMatch(/\sheight=/);
    });
});
