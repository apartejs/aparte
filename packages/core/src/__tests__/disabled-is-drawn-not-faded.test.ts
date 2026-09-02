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
 *
 * The same mechanism in minor (LOT 26): a QUIET part was quiet by opacity too — the
 * tool row's disclosure chevron at 0.5 measured 3.00:1, exactly on the WCAG floor, and
 * it is the control that reveals the arguments of a `delete_file`; the code header's
 * language label was already muted and then multiplied by 0.7; the branch picker's
 * disabled arrow read at 1.74:1 — as absent, not as disabled. Quiet is a colour: the
 * muted ink, and the full ink on hover. Opacity on a container fades the glyph WITH
 * its ground and cannot be reasoned about against any background.
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

describe('a quiet part is inked, not faded', () => {
    const toolCall = read('segment/tool-call.css');
    const code = read('segment/code.css');
    const bubble = read('components/bubble.css');

    it('the tool row’s disclosure chevron: the muted ink at rest, the full ink on hover', () => {
        const rest = rule(toolCall, '.aparte-tool-toggle');
        expect(rest).not.toMatch(/opacity\s*:/);
        expect(rest).toMatch(/color:\s*var\(--aparte-text-muted\)/);
        const hover = rule(toolCall, '.aparte-tool-summary:hover .aparte-tool-toggle');
        expect(hover).not.toMatch(/opacity\s*:/);
        expect(hover).toMatch(/color:\s*var\(--aparte-text\)/);
    });

    it('the tool row’s part label and icon: a colour', () => {
        for (const selector of ['.aparte-tool-part-label', '.aparte-tool-icon']) {
            const r = rule(toolCall, selector);
            expect(r, selector).not.toMatch(/opacity\s*:/);
            expect(r, selector).toMatch(/color:\s*var\(--aparte-text-muted\)/);
        }
    });

    it('the code header’s language label is not muted twice', () => {
        expect(rule(code, '.aparte-code-language')).not.toMatch(/opacity\s*:/);
    });

    it('the branch picker’s disabled arrow is drawn by the button recipe, not faded over it', () => {
        expect(rule(bubble, '.aparte-branch-prev:disabled')).not.toMatch(/opacity\s*:/);
    });
});
