/**
 * A busy button carries its spinner the way it carries an icon (apartejs/aparte#206).
 *
 * `.aparte-btn[aria-busy="true"]` only set `cursor: progress`. The spinner an app puts in
 * the button while its action runs was drawn by the spinner's own recipe: 16px, or the
 * guessed `--sm`'s 12, against a button icon of 18 — and in `--aparte-text-muted`, a
 * grey ring on the brass of a solid primary button. The app could not fix either from
 * outside without out-specifying the recipe.
 *
 * So the button context declares what the spinner reads, on the spinner: its own size
 * token, fed from the button's icon size (the way the button already feeds an
 * `<aparte-icon>`), and the button's ink instead of the spinner's own colour. It is a
 * rule about a direct child of a BUSY button; nothing else in the kit moves.
 *
 * What this suite can prove is the source shape (see read-stylesheet.ts): the rule is
 * there, scoped to the child, declares the token rather than a width, and leaves the
 * loop alone. The rendered half — the measured size at each button size, the ring's
 * colour on each fill, the reduced-motion stop — belongs to a browser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (rel: string) => strip(readFileSync(resolve(STYLES, rel), 'utf8'));
const button = read('button.css');
const spinner = read('display/spinner.css');

/** A selector with its spacing and its quotes made alike, so `[aria-busy="true"]` finds `[aria-busy='true']`. */
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/"/g, "'");

/** The first rule whose selector list names `selector`: where it starts and what it declares. */
function find(css: string, selector: string): { at: number; body: string } | undefined {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map(norm).includes(norm(selector))) return { at: m.index!, body: m[2]! };
    }
    return undefined;
}

/**
 * The middle column of a selector's specificity: classes, attributes, pseudo-classes. Enough
 * for the selectors here, none of which carries an id, a `:where()` or a `:not()`.
 */
const weight = (selector: string) => (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;

const BUSY_SPINNER = `.aparte-btn[aria-busy='true'] > .aparte-spinner`;
const BUSY = `.aparte-btn[aria-busy='true']`;

/** The spinner rule's declarations. A missing rule fails HERE, so the `.not.toMatch` below cannot pass on an empty string. */
function spinnerRule(): string {
    const found = find(button, BUSY_SPINNER);
    expect(found, `button.css has no rule for ${BUSY_SPINNER}`).toBeDefined();
    return found!.body;
}

describe('the spinner of a busy button', () => {
    it('is styled by a rule on a direct child of the busy button, not on any descendant', () => {
        expect(spinnerRule()).not.toBe('');
        // A descendant selector would reach a spinner in a popover mounted inside the button —
        // the leak `.aparte-composer-row button` had, for the same reason (CLAUDE.md, "a component
        // wears the recipe").
        expect(find(button, `.aparte-btn[aria-busy='true'] .aparte-spinner`)).toBeUndefined();
    });

    it('takes the size of the button’s icon, by declaring the spinner’s own token', () => {
        const body = spinnerRule();
        expect(body).toMatch(/--aparte-spinner-size\s*:\s*var\(--aparte-btn-icon-size\)/);
        // The recipe draws the box from that token; the button context does not redraw it.
        expect(body).not.toMatch(/(?:^|[^-])(?:width|height|inline-size|block-size)\s*:/);
    });

    it('takes the ink of the button, not the spinner’s own muted colour', () => {
        // `.aparte-spinner` sets `color: var(--aparte-text-muted)` on itself, and its ring is
        // stroked in `currentColor`: without this the ring is grey on a solid fill.
        expect(spinnerRule()).toMatch(/(?:^|[;\s])color\s*:\s*(?:inherit|currentcolor)\s*(?:;|$)/i);
    });

    it('outranks --sm and --lg by its selector, whatever order the sheets load in', () => {
        const winner = weight(BUSY_SPINNER);
        spinnerRule();
        for (const modifier of ['.aparte-spinner--sm', '.aparte-spinner--lg']) {
            // Prove the modifier declares the very token the button context must win over…
            expect(find(spinner, modifier)?.body, modifier).toMatch(/--aparte-spinner-size\s*:/);
            // …then that the button context outweighs it.
            expect(winner, `${BUSY_SPINNER} must outweigh ${modifier}`).toBeGreaterThan(weight(modifier));
        }
    });

    it('never takes the pointer, like an icon in a button', () => {
        // The click belongs to the button; a span target would make `event.target` lie to a
        // delegated listener — the reason `.aparte-btn > svg` has the same line.
        expect(spinnerRule()).toMatch(/pointer-events\s*:\s*none/);
    });

    it('leaves the turning to the spinner recipe, which stops under reduced motion', () => {
        expect(spinnerRule()).not.toMatch(/animation/);
        expect(spinner).toMatch(
            /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^{}]*\.aparte-spinner\s*\{[^{}]*animation\s*:\s*none/,
        );
    });
});

describe('a busy button', () => {
    it('keeps cursor: progress, and still shows it when it is also disabled', () => {
        const busy = find(button, BUSY);
        const disabled = find(button, '.aparte-btn:disabled');
        expect(busy?.body).toMatch(/cursor\s*:\s*progress/);
        expect(disabled?.body).toMatch(/cursor\s*:\s*not-allowed/);
        // Same specificity, so the later rule wins: `disabled aria-busy` (the issue's own
        // case) must read "working", not "forbidden".
        expect(busy!.at).toBeGreaterThan(disabled!.at);
    });

    it('is not drawn as disabled unless it is: no fade, no ground of its own', () => {
        const busy = find(button, BUSY)?.body;
        expect(busy, `button.css has no rule for ${BUSY}`).toBeDefined();
        expect(busy).not.toMatch(/opacity\s*:/);
        expect(busy).not.toMatch(/background\s*:/);
    });
});
