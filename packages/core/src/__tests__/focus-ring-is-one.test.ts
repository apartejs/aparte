/**
 * One focus ring (UI audit — LOT 2, with T10).
 *
 * The kit drew keyboard focus two ways: seventeen rules with a solid 2px outline and
 * five with a soft box-shadow wash (`--aparte-focus-ring`, 30 % of the accent, measured
 * at 1.39:1 against the page — an indicator that was not weak but absent), and its
 * outline offset was −2px, INSIDE the box, so on the elicitation's recommended row the
 * ring sat 2px from a tinted border as a second concentric line and the next row painted
 * over its bottom edge. Decided (T10): one geometry — a 2px outline in the focus colour,
 * offset OUTSIDE the box by one spacing step — for every control; the soft ring and the
 * two per-recipe offsets are gone. Three documented exceptions: the search field at the
 * top of the select's scrolling panel draws its ring inside (an outset one would be
 * clipped), the image thumbnail that is a preview control draws its ring inside for the
 * same reason (its tile clips), and a field inside a field group draws none — the group
 * draws it.
 *
 * Revised on the chat-site review (2026-09-05): the ring is 1px and FLUSH with the box —
 * the 2px offset ring on every control read as a frame gallery — so the offset token is
 * 0px. The select's search field, flush at the top of an opened menu, draws none: it is
 * the caret's, and a rectangle inside a rounded panel was the wrong shape.
 *
 * Revised again (the CSS/a11y audit, 2026-09-05). Two rules MOVE their ring rather than
 * drop it, and both are the same shape as the thumbnail's:
 *
 *   - A conversation row. The ring used to be dropped outright, on the reading that the
 *     row's hover lift said enough. Measured, the lift is `--aparte-surface-3`, a 6%
 *     tint: 1.12:1 against a neighbouring row in light and 1.18:1 in dark, where SC
 *     1.4.11 asks 3:1 of the state that says which row Enter opens. So the ring is back
 *     — on the ROW (the ⋯ inside it, not across it), inset by its own width so the
 *     list's `overflow-x: hidden` cannot cut it. The BUTTON still draws none: dropping
 *     its `outline: none` gives two rings, the UA's black `auto 1px` on a box 34px
 *     narrower than the row, measured in Chromium.
 *   - A scroll-rail tick. `outline` paints on the element's border box and the tick is a
 *     14×2 line, so the indicator for its 24×24 pressable zone came out 16×4. The ring
 *     moved onto the `::before` that already draws the zone.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet';

interface Rule { selectors: string[]; ancestors: string[]; body: string }

function parseRules(css: string): Rule[] {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const rules: Rule[] = [];
    const stack: { header: string; bodyStart: number; hasChild: boolean }[] = [];
    let headerStart = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') {
            const header = text.slice(headerStart, i).trim();
            const parent = stack[stack.length - 1];
            if (parent) parent.hasChild = true;
            stack.push({ header, bodyStart: i + 1, hasChild: false });
            headerStart = i + 1;
        } else if (ch === '}') {
            const frame = stack.pop();
            if (frame && !frame.hasChild) {
                rules.push({ selectors: frame.header.split(',').map((s) => s.trim()).filter(Boolean), ancestors: stack.map((f) => f.header), body: text.slice(frame.bodyStart, i) });
            }
            headerStart = i + 1;
        } else if (ch === ';') {
            headerStart = i + 1;
        }
    }
    return rules;
}

const css = readAparteStylesheet();
const theme = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const rules = parseRules(css);
const isFocusRule = (r: Rule) => r.selectors.some((s) => /:focus(-visible|-within)?(?![\w-])/.test(s));
const underForcedColors = (r: Rule) => r.ancestors.some((a) => /forced-colors/.test(a));
const focusRules = rules.filter((r) => isFocusRule(r) && !underForcedColors(r));

// The third exception (audit F23): the image thumbnail's ring. The tile clips its picture
// (`overflow: hidden`), so an outward ring is cropped away entirely; the image draws it
// inside, pulled in by the ring's own width, and stays whole.
const INSET_ALLOWED = new Set([
    '.aparte-select-search:focus-visible',
    ".aparte-thumbnail__image[role='button']:focus-visible",
    // The list clips horizontally; a ring outside the row was cut on both edges.
    '.aparte-conv-item:has(.aparte-conv-item__select:focus-visible)',
]);
/** One shape for every inset ring: pulled in by exactly the ring's own width. */
const INSET_OFFSET = 'calc(-1 * var(--aparte-focus-outline-width))';
const NO_RING_ALLOWED = new Set([
    '.aparte-field-group > .aparte-field:focus-visible',
    // Not "no indicator": the ring is drawn one level up, on the row, so it wraps the ⋯ too.
    '.aparte-conv-item__select:focus-visible',
    // Same move, onto the `::before` that already draws the 24×24 pressable zone.
    '.aparte-scroll-rail__tick:focus-visible',
    '.aparte-select-search',
]);

describe('the tokens', () => {
    it('the ring is 1px, flush with the box; the soft ring and the private offsets are gone', () => {
        expect(theme).toMatch(/--aparte-focus-outline-offset:\s*0px/);
        expect(theme).toMatch(/--aparte-focus-outline-width:\s*1px/);
        expect(theme).not.toMatch(/--aparte-focus-ring\s*:/);
        expect(theme).not.toMatch(/--aparte-field-error-ring\s*:/);
        expect(theme).not.toMatch(/--aparte-btn-focus-offset\s*:/);
    });
});

describe('every focus rule', () => {
    it('read the corpus', () => {
        expect(focusRules.length).toBeGreaterThan(15);
    });

    it('draws no box-shadow ring', () => {
        const shadowed = focusRules.filter((r) => /box-shadow\s*:\s*(?!none)/.test(r.body)).map((r) => r.selectors.join(', '));
        expect(shadowed).toEqual([]);
    });

    it('that draws an outline draws THE outline: the width token, the focus colour, the shared offset', () => {
        const off: string[] = [];
        for (const r of focusRules) {
            const outline = r.body.match(/(?:^|;)\s*outline\s*:\s*([^;]+);/);
            if (!outline) continue;
            const value = outline[1]!.trim();
            const key = r.selectors.join(', ');
            if (value === 'none') {
                if (!r.selectors.every((s) => NO_RING_ALLOWED.has(s))) off.push(`${key} → outline: none with nothing in its place`);
                continue;
            }
            if (!/^var\(--aparte-focus-outline-width\)\s+solid\s+var\(--aparte-border-focus\)$/.test(value)) off.push(`${key} → ${value}`);
            const offset = r.body.match(/outline-offset\s*:\s*([^;]+);/)?.[1]?.trim();
            const inset = r.selectors.every((s) => INSET_ALLOWED.has(s));
            const want = inset ? INSET_OFFSET : 'var(--aparte-focus-outline-offset)';
            if (offset !== want) off.push(`${key} → outline-offset: ${offset ?? '(missing)'}, wanted ${want}`);
        }
        expect(off).toEqual([]);
    });
});
