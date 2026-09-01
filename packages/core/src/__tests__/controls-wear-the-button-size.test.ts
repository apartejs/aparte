/**
 * The bubble's and the row's small controls wear the button recipe's size (UI audit —
 * LOT 8, with the sizes decided in T1 and T5).
 *
 * Three controls redrew their own box over the recipe: the branch arrows set
 * `width`/`height` to a 20px token while the element also carried `--sm` (24) — two
 * sources for one measure, the override winning; the conversation row's `⋯` did the
 * same at 20; and the action bar fed the recipe a 28px token of its own with a 24px
 * exception for the last user turn. Measured: three control heights in one 14px row.
 *
 * Decided: the action bar is 24 (= `--aparte-btn-size-sm`, so the exception dies), the
 * branch arrows and the `⋯` are 24 (the WCAG 2.5.8 floor). A component feeds the
 * recipe's token or wears its modifier; it does not redraw the box.
 *
 * And the select's trigger, the one control that declared no `font-size` at all, took
 * the host page's — every integrator saw a different select. It reads the control step.
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
const bubble = read('components/bubble.css');
const conversation = read('components/conversation.css');
const select = read('primitives/select.css');
const theme = read('theme.css');

describe('the branch arrows', () => {
    it('do not redraw their box — the recipe (--sm) sizes them', () => {
        const arrows = rule(bubble, '.aparte-branch-prev');
        expect(arrows).not.toMatch(/(?:^|[^-])width\s*:/);
        expect(arrows).not.toMatch(/(?:^|[^-])height\s*:/);
        expect(arrows).not.toMatch(/font-size\s*:/);
        expect(theme).not.toMatch(/--aparte-branch-picker-btn-size\s*:/);
        expect(theme).not.toMatch(/--aparte-branch-picker-btn-icon-size\s*:/);
    });
});

describe('the action bar', () => {
    it('is 24px, the small step, with no exception for the last user turn', () => {
        expect(theme).toMatch(/--aparte-action-bar-btn-size:\s*var\(--aparte-btn-size-sm\)/);
        expect(bubble.match(/--aparte-action-bar-btn-size\s*:/g) ?? []).toHaveLength(0);
    });
});

describe('the conversation row’s ⋯', () => {
    it('feeds the recipe its size rather than redrawing the box, at 24px', () => {
        const more = rule(conversation, '.aparte-conv-item__more');
        expect(more).toMatch(/--aparte-btn-size:\s*var\(--aparte-conv-action-btn-size\)/);
        expect(more).not.toMatch(/(?:^|[^-])width\s*:/);
        expect(more).not.toMatch(/(?:^|[^-])height\s*:/);
        expect(theme).toMatch(/--aparte-conv-action-btn-size:\s*var\(--aparte-btn-size-sm\)/);
    });
});

describe('the select trigger', () => {
    const trigger = rule(select, '.aparte-select-trigger');
    it('declares its own font-size, from the control step', () => {
        expect(trigger).toMatch(/font-size:\s*var\(--aparte-font-size-md\)/);
    });
    it('reads the theme’s select radius, not a private duplicate', () => {
        expect(trigger).toMatch(/border-radius:\s*var\(--aparte-radius-select\)/);
        expect(select).not.toMatch(/--aparte-select-radius/);
    });
});
