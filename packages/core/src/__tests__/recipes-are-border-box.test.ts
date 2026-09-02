/**
 * A recipe that sets a size and paints a border means the same box for both (UI audit,
 * visual half — LOT 16).
 *
 * Core ships no global reset on purpose, so a rule that declares `width` or `height`
 * and a `border` paints LARGER than its token under the browser's default
 * `content-box`: the spinner painted 16/20/28 for tokens of 12/16/24, the popover
 * 342px for a documented cap of 320, and `<aparte-chat style="height: 320px">` rendered
 * 336px because its bottom gap sat outside the box. The same markup painted the token's
 * value on a host with a border-box reset — two geometries for one component, decided
 * by the page. Each such recipe now says `box-sizing: border-box` itself, which is the
 * only form that makes the rendering independent of the host.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet';

const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Leaf rules: selector list → declarations (at-rule prelude frames are skipped). */
function rules(): Array<{ selector: string; body: string }> {
    const out: Array<{ selector: string; body: string }> = [];
    for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        out.push({ selector: m[1]!.trim().replace(/\s+/g, ' '), body: m[2]! });
    }
    return out;
}

/**
 * Named, not swept: a rule-by-rule sweep cannot see inheritance (a `--sm` modifier
 * inherits the base rule's `box-sizing`), so it flagged 28 rules of which most were
 * fine. These are the recipes whose outer size is a token or an author's value and
 * whose padding or border sits in the same rule, with no base rule saying border-box.
 */
describe('recipes that set a size and paint a border or a padding are border-box', () => {
    it('read the corpus', () => {
        expect(rules().length).toBeGreaterThan(300);
    });

    it.each([
        ['.aparte-spinner'],
        ['.aparte-spinner-small'],
        ['.aparte-popover'],
        ['.aparte-menu'],
        ['.aparte-tooltip'],
        ['aparte-chat, [data-aparte-chat]'],
    ])('%s is border-box', (selector) => {
        const rule = rules().find((r) => r.selector === selector);
        expect(rule, `${selector} rule not found`).toBeTruthy();
        expect(rule!.body).toMatch(/box-sizing\s*:\s*border-box/);
    });
});
