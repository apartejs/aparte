/**
 * The library's indicators share one vocabulary (UI audit — LOT 27).
 *
 * Two spinners with nothing in common but their size: the CSS ring stroked at 2px, the
 * SVG progress spinner at 2.5 viewBox units — 1.67px on a 13.7px diameter in a 16px box,
 * antialiased everywhere, and 50 % heavier or lighter than its sibling depending on the
 * size. Its track sat at 15 % of the ink, so a determinate 62 % was the percentage of a
 * circle nobody could see. And the one pulse every dot shares moved in SCALE as well as
 * opacity, so the waiting row changed width in a loop and the status dot spent half its
 * 1.2s cycle at 1.55:1.
 *
 * Decided: one stroke token for both rings, drawn in screen pixels (`vector-effect:
 * non-scaling-stroke`) so the SVG's weight is the CSS ring's whatever the box; a track
 * in the control-edge colour; a pulse in opacity alone, with a named floor above the
 * perception threshold.
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
const base = read('base.css');
const spinner = read('primitives/progress-spinner.css');

describe('the two rings', () => {
    it('stroke at the same token, in screen pixels', () => {
        for (const part of ['.aparte-spinner-track', '.aparte-spinner-fill']) {
            const r = rule(spinner, part);
            expect(r, part).toMatch(/stroke-width:\s*var\(--aparte-spinner-thickness\)/);
            expect(r, part).toMatch(/vector-effect:\s*non-scaling-stroke/);
        }
        expect(spinner).not.toMatch(/--aparte-spinner-stroke\b/);
    });

    it('the track is a visible reference, in the control-edge colour', () => {
        expect(rule(spinner, '.aparte-spinner-track')).toMatch(/stroke:\s*var\(--aparte-spinner-track,\s*var\(--aparte-border-control\)\)/);
    });

    it('the context gauge’s ring is as heavy as its bar, in screen pixels', () => {
        const ring = rule(read('components/context.css'), '.aparte-context__track');
        expect(ring).toMatch(/stroke-width:\s*var\(--aparte-progress-height\)/);
        expect(ring).toMatch(/vector-effect:\s*non-scaling-stroke/);
        expect(theme).not.toMatch(/--aparte-context-ring-stroke\s*:/);
    });
});

describe('the pulse', () => {
    const keyframes = base.match(/@keyframes aparte-pulse\s*\{([\s\S]*?)\}\s*\}/)?.[1] ?? '';

    it('moves in opacity alone, so a row of dots keeps its width', () => {
        expect(keyframes).not.toBe('');
        expect(keyframes).not.toMatch(/scale\(/);
        expect(keyframes).not.toMatch(/transform\s*:/);
    });

    it('has a named floor above the perception threshold', () => {
        expect(keyframes).toMatch(/opacity:\s*var\(--aparte-pulse-floor\)/);
        const floor = Number(theme.match(/--aparte-pulse-floor:\s*([\d.]+)/)?.[1]);
        expect(floor).toBeGreaterThanOrEqual(0.5);
    });
});
