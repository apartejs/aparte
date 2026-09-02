/**
 * The tooltip is placed by the recipe, on the side you name (UI audit — a must-have
 * knob, Paul, 2026-09-02).
 *
 * The recipe drew the box and the arrow and left the placement to two inline styles in
 * the example — "position is the caller's job". That is a knob missing, not a division
 * of labour: a demo that needs inline styles to work is a recipe with a parameter it
 * forgot. `data-side="top | bottom | start | end"` now places the box against an
 * `.aparte-tooltip-anchor` (the trigger's wrapper) and turns the arrow to match, a gap
 * of `--aparte-tooltip-gap` away. Collision with the viewport stays out: flipping a
 * tooltip that would leave the screen needs script, and that is a positioning
 * library's job. Without `data-side` nothing is positioned, as before.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const raw = readFileSync(resolve(STYLES, 'surface/tooltip.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
const theme = readFileSync(resolve(STYLES, 'theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const rule = (selector: string) => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

describe('tooltip placement', () => {
    it('has an anchor recipe for the trigger', () => {
        expect(rule('.aparte-tooltip-anchor')).toMatch(/position:\s*relative/);
    });

    it('places the box on each of the four sides, a gap away', () => {
        expect(rule(".aparte-tooltip[data-side='top']")).toMatch(/inset-block-end:\s*calc\(100%\s*\+\s*var\(--aparte-tooltip-gap\)\)/);
        expect(rule(".aparte-tooltip[data-side='bottom']")).toMatch(/inset-block-start:\s*calc\(100%\s*\+\s*var\(--aparte-tooltip-gap\)\)/);
        expect(rule(".aparte-tooltip[data-side='start']")).toMatch(/inset-inline-end:\s*calc\(100%\s*\+\s*var\(--aparte-tooltip-gap\)\)/);
        expect(rule(".aparte-tooltip[data-side='end']")).toMatch(/inset-inline-start:\s*calc\(100%\s*\+\s*var\(--aparte-tooltip-gap\)\)/);
        expect(theme).toMatch(/^\s*--aparte-tooltip-gap\s*:/m);
    });

    it('turns the arrow for the two inline sides', () => {
        expect(rule(".aparte-tooltip[data-side='start'] .aparte-tooltip__arrow")).toMatch(/inset-inline-end:/);
        expect(rule(".aparte-tooltip[data-side='end'] .aparte-tooltip__arrow")).toMatch(/inset-inline-start:/);
    });

    it('the documented example needs no inline positioning', () => {
        const example = raw.slice(0, raw.indexOf('*/'));
        expect(example).toMatch(/data-side="/);
        expect(example).not.toMatch(/style="[^"]*position:\s*absolute/);
    });
});
