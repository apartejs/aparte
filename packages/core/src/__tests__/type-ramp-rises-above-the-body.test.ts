/**
 * The type ramp has steps above the body, and its names are in order (UI audit — T12,
 * taken by Paul).
 *
 * `--aparte-font-size-lg` was 0.875rem — SMALLER than `base` (0.9375rem), the body — and
 * there was nothing above it. Measured: a welcome title and a placeholder at the same
 * size, a card's title smaller than its body (14.17 vs 14.49px), a full-screen dialog's
 * title at 14px, and the text a person types the smallest in the chat (15.1 against
 * 16.2 in the transcript). A scale whose name lies is worse than a short one: `lg` is
 * above `base` now, `xl` and `2xl` exist, and every reader of the old `lg` was moved to
 * the step it meant — the typed text to the body's size, titles above it, a control's
 * label to the control step.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(process.cwd(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (rel: string) => strip(readFileSync(resolve(STYLES, rel), 'utf8'));
const theme = read('theme.css');
const rem = (step: string): number => {
    const m = theme.match(new RegExp(`--aparte-font-size-${step}:\\s*calc\\(([\\d.]+)rem\\s*\\*\\s*var\\(--aparte-font-scale\\)\\)`));
    return m ? Number(m[1]) : NaN;
};

describe('the type ramp', () => {
    it('rises in the order of its names', () => {
        const steps = ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl'].map(rem);
        expect(steps.every((v) => !Number.isNaN(v)), 'every step is declared in rem on the font scale').toBe(true);
        for (let i = 1; i < steps.length; i++) expect(steps[i]!, `step ${i}`).toBeGreaterThan(steps[i - 1]!);
    });

    it('the body keeps its size, and lg sits above it', () => {
        expect(rem('base')).toBe(0.9375);
        expect(rem('lg')).toBe(1.0625);
        expect(rem('xl')).toBe(1.25);
        expect(rem('2xl')).toBe(1.5);
    });
});

describe('the readers of the old lg landed on the step they meant', () => {
    it('what a person types is the body size', () => {
        expect(theme).toMatch(/--aparte-input-font-size:\s*var\(--aparte-font-size-base\)/);
    });
    it('a sender name sits one step under the prose', () => {
        expect(theme).toMatch(/--aparte-name-font-size:\s*var\(--aparte-font-size-md\)/);
    });
    it('a card title is above its body', () => {
        expect(theme).toMatch(/--aparte-card-header-font-size:\s*var\(--aparte-font-size-base\)/);
    });
    it('an elicitation question is larger than its options', () => {
        expect(theme).toMatch(/--aparte-elic-message-size:\s*var\(--aparte-font-size-base\)/);
        expect(theme).toMatch(/--aparte-elic-option-title-size:\s*var\(--aparte-font-size-md\)/);
    });
    it('a dialog title takes the new lg', () => {
        expect(read('surface/dialog.css')).toMatch(/\.aparte-dialog__title\s*\{[^}]*font-size:\s*var\(--aparte-font-size-lg\)/);
    });
    it('the large field and the large buttons speak at the body size', () => {
        expect(read('field.css')).toMatch(/\.aparte-field--lg\s*\{[^}]*font-size:\s*var\(--aparte-font-size-base\)/);
        expect(read('button.css')).toMatch(/\.aparte-btn--lg\s*\{[^}]*font-size:\s*var\(--aparte-font-size-base\)/);
    });
});
