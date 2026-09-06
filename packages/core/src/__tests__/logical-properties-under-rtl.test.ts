/**
 * The five rules that still spoke left and right (the CSS/a11y audit, 2026-09-05 — m12).
 *
 * Decision #4 commits to logical properties in writing — "a name that a right-to-left
 * locale contradicts is a name that will lie" — and the sheets had almost finished the
 * move: `inset-inline-*`, `margin-inline`, `text-align: start`, and conversation.css
 * even carries a `:dir(rtl)` rule. Six declarations were the residue, and they were
 * unreachable while core wrote `dir="ltr"` onto its own DOM (M3). Fixing that default
 * made them reachable, so they were measured under a forced `dir="rtl"`:
 *
 *   prose ul / ol   padding-left 24.3px AND the UA's padding-inline-start 40px on the
 *                   other side — the list indented on BOTH edges
 *   blockquote      the rail on the trailing edge, no leading gutter
 *   thinking        the reasoning rail on the same wrong edge
 *   status dot      the gap stayed on the left of the label
 *   thumb ✕         stayed visually right, over the picture's start edge
 *
 * This suite reads the sheets rather than a browser: jsdom resolves neither `dir` nor
 * `var()`, so what a unit test can hold is the SHAPE — that these five sites name a
 * logical edge. `display/thumbnail.css` (`left: 0; right: 0`) and `components/shell.css`'s
 * `left: 50%` + `translateX(-50%)` are symmetric or centring and stay as they are.
 *
 * The sixth site was found later, and by looking at the wrong list: this docblock cleared
 * `components/shell.css` after reading its `left: 50%` and stopping there, while
 * `aparte-chat-viewport { text-align: left }` sat eight lines below it. `text-align` is
 * inherited, so that one declaration reached every message, segment and paragraph in the
 * transcript — measured under `dir="rtl"`, an Arabic assistant line hugged the LEFT edge
 * of a right-to-left transcript whose lists and blockquote rail had correctly flipped.
 * Hence the sweep at the end: `text-align: left|right` is physical wherever it appears,
 * and it is read across the whole corpus rather than the four sheets named above, because
 * naming the sheets is how this one was missed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot, readAparteStylesheet } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const read = (rel: string) => readFileSync(resolve(STYLES, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

const prose = read('prose.css');
const thinking = read('segment/thinking.css');
const composer = read('components/composer.css');
const select = read('primitives/select.css');

describe('prose speaks logical edges', () => {
    it('indents a list on the start edge, not the left one', () => {
        expect(prose).not.toMatch(/padding-left:\s*var\(--aparte-prose-list-indent\)/);
        const starts = [...prose.matchAll(/padding-inline-start:\s*var\(--aparte-prose-list-indent\)/g)];
        expect(starts.length, 'one for ul, one for ol').toBe(2);
    });

    it('draws the blockquote rail and its gutter on the start edge', () => {
        expect(prose).toMatch(/border-inline-start:\s*var\(--aparte-prose-blockquote-border-width\)/);
        expect(prose).toMatch(/padding-inline-start:\s*var\(--aparte-prose-blockquote-indent\)/);
        expect(prose).not.toMatch(/border-left:\s*var\(--aparte-prose-blockquote/);
        expect(prose).not.toMatch(/padding-left:\s*var\(--aparte-prose-blockquote/);
    });
});

describe('the other three sites', () => {
    it('puts the reasoning rail on the start edge', () => {
        expect(thinking).toMatch(/border-inline-start:\s*var\(--aparte-thinking-rail-width\)/);
        expect(thinking).not.toMatch(/border-left:\s*var\(--aparte-thinking-rail-width\)/);
    });

    it("puts the pending attachment's ✕ on the end edge", () => {
        expect(composer).toMatch(/inset-inline-end:\s*var\(--aparte-thumb-remove-inset\)/);
        expect(composer).not.toMatch(/(^|[\s;{])right:\s*var\(--aparte-thumb-remove-inset\)/);
    });

    it('puts the status dot’s gap on the start edge', () => {
        expect(select).toMatch(/margin-inline-start:\s*var\(--aparte-space-4\)/);
        expect(select).not.toMatch(/margin-left:\s*var\(--aparte-space-4\)/);
    });
});

describe('no sheet aligns text to a physical edge', () => {
    const corpus = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');

    it('reads the whole corpus, and it aligns text with start or end', () => {
        // `center` is symmetric; only left and right lie under RTL.
        expect(corpus).toMatch(/text-align:\s*start/);
        expect([...corpus.matchAll(/text-align:\s*(left|right)/g)].map((m) => m[0])).toEqual([]);
    });
});
