/**
 * The "Legacy composer input utility classes" block is gone, and so are the tokens
 * only it read (the CSS/a11y audit, 2026-09-05 — M5, M6, m14).
 *
 * 201 lines of `components/composer.css` styled eight class families no source in the
 * repo emitted: `.aparte-input-wrapper`, `.aparte-input-container`, `.aparte-editor`,
 * `.aparte-has-content`, `.aparte-input-upper`, `.aparte-input-footer`,
 * `.aparte-provider-select`, `.aparte-model-select`. Measured on the running example:
 * all nine count zero in the rendered DOM; the only hits across the tracked files were
 * CHANGELOG history. `styles/base.css` carried the same shape in two rules,
 * `.aparte-actions-left` / `-right` — the positional names decision #4 retired.
 *
 * Dead CSS in this repo is not inert. `apps/docs/scripts/gen-css-classes.mjs` generates
 * `reference/classes.mdx` FROM these sheets, so the whole set was published as classes
 * `components/composer.css` styles; and the block was where the abandoned Tailwind ramp
 * survived, two data-URI chevrons carrying `stroke='%236b7280'` and `stroke='%2394a3b8'`
 * against a palette that had long since moved to `#a89bb6`. It also held the last three
 * `slot[name="footer-left|center|right"]` rules, the retired positional slots, and a
 * `text-align: left` under a decision that commits to logical properties.
 *
 * Seven declarations in `theme.css` had that block as their ONE reader. `check:derived-vars`
 * asks "does a stylesheet read this token", which an ORPHANED reader still satisfies —
 * so all seven were published in `reference/css-variables.md` as knobs that moved
 * nothing. They go with the rules that read them.
 *
 * Two live rules sat inside the deleted range and stay: `.aparte-send-button` (the
 * composer row's own button) and the `aparte-model-selector, .aparte-model-selector`
 * pair with its `[hidden]` override (a real element, and the class an app lays out
 * itself).
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Classes the block styled, none of which any source emits. */
const DEAD_CLASSES = [
    'aparte-input-wrapper',
    'aparte-input-container',
    'aparte-editor',
    'aparte-has-content',
    'aparte-input-upper',
    'aparte-input-footer',
    'aparte-provider-select',
    'aparte-model-select',
    'aparte-actions-left',
    'aparte-actions-right',
];

/** Tokens whose only reader was a rule in that block. */
const DEAD_TOKENS = [
    '--aparte-input-gap',
    '--aparte-input-container-min-height',
    '--aparte-input-editor-max-height',
    '--aparte-input-editor-font-size',
    '--aparte-input-text',
    '--aparte-model-select-chevron-room',
    '--aparte-model-select-min-width',
];

describe('the dead composer block', () => {
    it('read the corpus', () => {
        expect(css.length).toBeGreaterThan(50_000);
    });

    it('styles none of the classes nothing emitted', () => {
        const alive = DEAD_CLASSES.filter((c) => new RegExp('\\.' + c + '(?![\\w-])').test(css));
        expect(alive).toEqual([]);
    });

    it('declares none of the seven tokens only it read', () => {
        const alive = DEAD_TOKENS.filter((t) => css.includes(t));
        expect(alive).toEqual([]);
    });

    it('takes the abandoned ramp with it: no Tailwind grey survives in a data URI', () => {
        expect(css).not.toContain('%236b7280');
        expect(css).not.toContain('%2394a3b8');
    });

    it('takes the retired positional slots with it', () => {
        expect(css).not.toMatch(/slot\[name="footer-(left|center|right)"\]/);
    });

    it('leaves the two live rules that sat inside the range', () => {
        expect(css).toMatch(/\.aparte-send-button\s*\{/);
        expect(css).toMatch(/aparte-model-selector,\s*\.aparte-model-selector\s*\{/);
        expect(css).toMatch(/aparte-model-selector\[hidden\],\s*\.aparte-model-selector\[hidden\]/);
    });
});
