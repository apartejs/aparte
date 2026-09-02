/**
 * The sidebar's four regions share one inline inset (UI audit — LOT 23).
 *
 * Measured on the built previews: the brand and the avatar started at x=44, the search
 * field and the body at x=42 — the header and footer padded 16, the search margin and
 * the body padding 12 — so a 260px column showed its content on two vertical axes 2px
 * apart, four left edges on the app-shell demo (44 / 42 / 50 / 52). Three insets,
 * three sources. One token, `--aparte-sidebar-inset`, read by all four regions, is the
 * fix: a consumer moves the whole column's content with one line, and nothing can drift.
 *
 * And the selected row's mark: a 2px bar drawn square against a row rounded at 9px,
 * so a sliver of the page's ground showed between the two at both start corners. The
 * bar is now painted inside a pseudo the size of the row that inherits its radius, so
 * it follows the curve — no `overflow: hidden` on the row, which would clip the title
 * button's focus ring.
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
const sidebar = read('shell/sidebar.css');
const theme = read('theme.css');
const conversation = read('components/conversation.css');

describe('the sidebar inset', () => {
    it('is one token, declared by the theme', () => {
        expect(theme).toMatch(/--aparte-sidebar-inset:\s*var\(--aparte-space-\d\)/);
    });

    it('is what the header, the search, the body and the footer indent by', () => {
        const inset = 'var(--aparte-sidebar-inset)';
        const header = rule(sidebar, '.aparte-sidebar__header');
        const search = rule(sidebar, '.aparte-sidebar__search');
        const body = rule(sidebar, '.aparte-sidebar__body');
        const footer = rule(sidebar, '.aparte-sidebar__footer');
        // Three-value padding: block-start, inline, block-end.
        expect(header).toMatch(new RegExp(`padding:\\s*var\\(--aparte-space-\\d\\)\\s+${inset.replace(/[()]/g, '\\$&')}\\s+var\\(--aparte-space-\\d\\)`));
        expect(search).toMatch(new RegExp(`margin:\\s*var\\(--aparte-space-\\d\\)\\s+${inset.replace(/[()]/g, '\\$&')}`));
        expect(search, 'the search keeps the column’s width minus its own margins').toMatch(/min-width:\s*calc\(var\(--aparte-sidebar-width\)\s*-\s*2\s*\*\s*var\(--aparte-sidebar-inset\)\)/);
        expect(body).toMatch(new RegExp(`padding:\\s*var\\(--aparte-space-\\d\\)\\s+${inset.replace(/[()]/g, '\\$&')}`));
        expect(footer).toMatch(new RegExp(`padding:\\s*var\\(--aparte-space-\\d\\)\\s+${inset.replace(/[()]/g, '\\$&')}`));
    });
});

describe('the selected row’s mark', () => {
    it('follows the row’s radius instead of standing square in its corner', () => {
        const mark = rule(conversation, '.aparte-conv-item--active::before');
        expect(mark).toMatch(/inset:\s*0/);
        expect(mark).toMatch(/border-radius:\s*inherit/);
        expect(mark, 'the bar is the painted part of a row-sized pseudo').toMatch(/linear-gradient\([\s\S]*?var\(--aparte-mark-bar\)/);
        expect(mark).not.toMatch(/(?:^|[^-])width:/);
    });
});
