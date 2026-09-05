/**
 * `aparte-btn` on an `<a>` is a button, not a link with padding.
 *
 * The recipe is documented as classes you put on your own elements, and a settings
 * page reached by a link is the first thing a site puts it on. The UA stylesheet
 * underlines an anchor, and no rule of the recipe said otherwise — so the vanilla
 * example's Settings button rendered as underlined text next to an icon button.
 * The reset belongs to the recipe: a consumer should not have to know which UA
 * defaults a button class forgot.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet';

const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');

function declarationsOf(selector: string): string {
    const out: string[] = [];
    for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        const selectors = m[1]!.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
        if (selectors.includes(selector)) out.push(m[2]!);
    }
    return out.join('\n');
}

describe('the button recipe on an anchor', () => {
    it('read the corpus', () => {
        expect(declarationsOf('.aparte-btn').length).toBeGreaterThan(100);
    });

    it('.aparte-btn resets the underline the UA gives an <a>', () => {
        expect(declarationsOf('.aparte-btn')).toMatch(/text-decoration\s*:\s*none/);
    });
});
