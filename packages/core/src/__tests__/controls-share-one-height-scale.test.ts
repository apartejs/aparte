/**
 * Every control has a height, and every height is a step of one scale (UI audit —
 * LOT 10, with T2, T3 and T4).
 *
 * Measured across the previews: 18 of 59 showed two controls side by side at different
 * heights, and the number that kept coming back was 23px — the TEXT button, which had
 * no height at all (padding + line-height + border), beside 24 (`--sm`), 29-30 (the
 * field), 32 (the icon button), 36 (send, scroll) and 44 (touch). The kit declared a
 * scale of 24 / 32 / 40 that only `--icon` and `--circle` read, and a 36px family
 * (send, the input's action button, the scroll button) that lived off it as literals.
 *
 * Decided: the scale is sm 24 · md 32 · lg 36 · xl 40, every button has a
 * `min-block-size` from it, the field rests at 36 (`--aparte-field-size`, the `lg`
 * step, with `--sm`/`--lg` at md/xl), a button inside a field group takes the field's
 * height, the select trigger is a field, and the 36px family reads the named step.
 * Control text is the `md` step (14px), the origin of the "poor" look was one step
 * below it.
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
const button = read('button.css');
const field = read('field.css');
const select = read('primitives/select.css');

describe('the height scale', () => {
    it('has four named steps', () => {
        expect(theme).toMatch(/--aparte-btn-size-sm:\s*24px/);
        expect(theme).toMatch(/--aparte-btn-size-md:\s*32px/);
        expect(theme).toMatch(/--aparte-btn-size-lg:\s*36px/);
        expect(theme).toMatch(/--aparte-btn-size-xl:\s*40px/);
    });

    it('the 36px family reads the lg step instead of a literal', () => {
        for (const knob of ['--aparte-send-btn-size', '--aparte-input-action-btn-size', '--aparte-scroll-btn-size']) {
            expect(theme, knob).toMatch(new RegExp(`${knob}:\\s*var\\(--aparte-btn-size-lg\\)`));
        }
    });

    it('the field rests on the lg step, with sm and lg one step either side', () => {
        expect(theme).toMatch(/--aparte-field-size:\s*var\(--aparte-btn-size-lg\)/);
        expect(theme).toMatch(/--aparte-field-size-sm:\s*var\(--aparte-btn-size-md\)/);
        expect(theme).toMatch(/--aparte-field-size-lg:\s*var\(--aparte-btn-size-xl\)/);
    });
});

describe('every control has a height', () => {
    it('a text button is as tall as an icon button of the same step', () => {
        const base = rule(button, '.aparte-btn');
        expect(base).toMatch(/--aparte-btn-size:\s*var\(--aparte-btn-size-md\)/);
        expect(base).toMatch(/min-block-size:\s*var\(--aparte-btn-size\)/);
        expect(rule(button, '.aparte-btn--xl')).toMatch(/--aparte-btn-size:\s*var\(--aparte-btn-size-xl\)/);
    });

    it('the field has a resting height, and its size modifiers move it', () => {
        expect(rule(field, '.aparte-field')).toMatch(/min-block-size:\s*var\(--aparte-field-size\)/);
        expect(rule(field, '.aparte-field--sm')).toMatch(/--aparte-field-size:\s*var\(--aparte-field-size-sm\)/);
        expect(rule(field, '.aparte-field--lg')).toMatch(/--aparte-field-size:\s*var\(--aparte-field-size-lg\)/);
    });

    it('a button in a field group takes the field’s height', () => {
        expect(rule(field, '.aparte-field-group > .aparte-btn')).toMatch(/--aparte-btn-size:\s*var\(--aparte-field-size\)/);
    });

    it('the select trigger is a field', () => {
        expect(rule(select, '.aparte-select-trigger')).toMatch(/min-block-size:\s*var\(--aparte-field-size\)/);
    });
});

describe('control text is the md step', () => {
    it('on the button and the field', () => {
        expect(theme).toMatch(/--aparte-btn-font-size:\s*var\(--aparte-font-size-md\)/);
        expect(rule(field, '.aparte-field')).toMatch(/font-size:\s*var\(--aparte-font-size-md\)/);
    });
});
