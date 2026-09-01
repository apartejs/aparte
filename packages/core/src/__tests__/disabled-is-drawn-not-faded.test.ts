/**
 * A disabled control is drawn, not faded (UI audit — T15, taken by Paul).
 *
 * The disabled state was `opacity` on the whole control: the glyph faded together with
 * its ground and read at 2.03:1 on the send button in four previews. "Inactive" and
 * "disappearing" are not the same message. A disabled button, field or select keeps a
 * legible ink — the muted text colour — on a neutral ground; the composer's gated
 * state no longer fades the whole composer as a group, each control says it itself.
 * Rows and chips that were not measured (menu items, option rows, a tag's ✕) keep the
 * opacity for now.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(process.cwd(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (rel: string) => strip(readFileSync(resolve(STYLES, rel), 'utf8'));
const rule = (css: string, selector: string) => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};
const button = read('button.css');
const field = read('field.css');
const select = read('primitives/select.css');
const composer = read('components/composer.css');

describe('a disabled control', () => {
    it('button: a neutral ground and a muted ink, no opacity', () => {
        const disabled = rule(button, '.aparte-btn:disabled');
        expect(disabled).not.toMatch(/opacity\s*:/);
        expect(disabled).toMatch(/background:\s*var\(--aparte-surface-2\)/);
        expect(disabled).toMatch(/color:\s*var\(--aparte-text-muted\)/);
    });

    it('send button: the same, on the composer’s primary control', () => {
        const disabled = rule(composer, '.aparte-send-button:disabled');
        expect(disabled).not.toMatch(/opacity\s*:/);
        expect(disabled).toMatch(/color:\s*var\(--aparte-text-muted\)/);
    });

    it('field: a muted ink on the quieter ground, no opacity', () => {
        const disabled = rule(field, '.aparte-field:disabled');
        expect(disabled).not.toMatch(/opacity\s*:/);
        expect(disabled).toMatch(/color:\s*var\(--aparte-text-muted\)/);
    });

    it('select trigger: the same', () => {
        const disabled = rule(select, 'aparte-select[disabled] .aparte-select-trigger');
        expect(disabled).not.toMatch(/opacity\s*:/);
        expect(disabled).toMatch(/color:\s*var\(--aparte-text-muted\)/);
    });

    it('the gated composer does not fade as a group', () => {
        expect(rule(composer, 'aparte-composer[data-model-gated]')).not.toMatch(/opacity\s*:/);
    });
});
