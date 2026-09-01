/**
 * Four calibration decisions from the image audit, taken by Paul (T13, T14, T17, T20).
 *
 * - T13 — the bubble's corner was a 14px literal off the 3/6/9/12/18 scale, the most
 *   visible corner of the transcript; it is the theme's `--aparte-radius-bubble` (12).
 * - T14 — `--aparte-border` did two jobs: separating two regions (1.1:1 is enough) and
 *   bounding a control someone can touch (it needs to be seen). A field, a select, a
 *   checkbox drew their edge in the region colour and six previews showed a control
 *   without an edge. `--aparte-border-control` is the second job, derived from the
 *   theme's own ink and ground so both schemes follow; the value is a first setting.
 * - T17 — the icon's loose default was 14px while its documentation said 16, and the
 *   icon scale was the one scale in the theme pinned in px while every type size
 *   follows `--aparte-font-scale`: a glyph beside text shrank optically the moment a
 *   reader enlarged the text. The scale is in rem, times the same factor.
 * - T20 — the elicitation rows' radius was 8px (`--aparte-radius-lg` at the time of the
 *   measure), off the scale and not the panel's; it is `--aparte-radius-md`, the family
 *   of pressable rows (field, tool row, conversation item).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(process.cwd(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (rel: string) => strip(readFileSync(resolve(STYLES, rel), 'utf8'));
const theme = read('theme.css');
const field = read('field.css');
const select = read('primitives/select.css');

describe('T13 — the bubble corner is on the scale', () => {
    it('reads the theme’s bubble radius', () => {
        expect(theme).toMatch(/--aparte-message-content-radius:\s*var\(--aparte-radius-bubble\)/);
        expect(theme).not.toMatch(/--aparte-message-content-radius:\s*14px/);
    });
});

describe('T14 — a control’s edge has its own token', () => {
    it('is declared, derived from the ink and the ground', () => {
        expect(theme).toMatch(/--aparte-border-control:\s*color-mix\(/);
    });
    it('the text field, the choice controls and the select trigger draw their edge with it', () => {
        expect(field).toMatch(/\.aparte-field\s*\{[^}]*border:\s*var\(--aparte-border-width\)\s+solid\s+var\(--aparte-border-control\)/);
        expect(field).toMatch(/\.aparte-checkbox[^{]*\{[^}]*var\(--aparte-border-control\)/);
        expect(select).toMatch(/\.aparte-select-trigger\s*\{[^}]*var\(--aparte-select-border,\s*var\(--aparte-border-control\)\)/);
    });
});

describe('T17 — icons follow the type scale', () => {
    it('the loose default is 1rem on the font scale, and every step is on it', () => {
        expect(theme).toMatch(/--aparte-icon-size:\s*calc\(1rem\s*\*\s*var\(--aparte-font-scale\)\)/);
        expect(theme).toMatch(/--aparte-icon-size-sm:\s*calc\(0\.75rem\s*\*\s*var\(--aparte-font-scale\)\)/);
        expect(theme).toMatch(/--aparte-icon-size-lg:\s*calc\(1\.125rem\s*\*\s*var\(--aparte-font-scale\)\)/);
        expect(theme).toMatch(/--aparte-icon-size-xl:\s*calc\(1\.25rem\s*\*\s*var\(--aparte-font-scale\)\)/);
        expect(theme).not.toMatch(/--aparte-icon-size(?:-sm|-lg|-xl)?:\s*\d+px/);
    });
});

describe('T20 — elicitation rows join the pressable-row radius', () => {
    it('is the md step', () => {
        expect(theme).toMatch(/--aparte-elic-option-radius:\s*var\(--aparte-radius-md\)/);
    });
});
