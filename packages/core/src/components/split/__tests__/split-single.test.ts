// @vitest-environment jsdom
/**
 * #54 — `single`: one pane on demand, whatever the width.
 *
 * `collapsed` folds the primary pane to `--aparte-split-min` (20rem by default) and
 * `pane` only acts under the breakpoint; the CSS route (`.aparte-split--only-start` /
 * `--only-end`) existed and was named in the layout guide, but nothing in the
 * element's own API said "show one pane" — which is where Paul looked. `single` is
 * that word: the attribute joins the stacked selectors byte for byte, the element
 * counts it as stacked (no tab stop on a seam that separates nothing), and `pane`
 * names which one stays.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../aparte-split.js';
import type { AparteSplit } from '../aparte-split.js';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';

beforeEach(() => {
    (globalThis as unknown as { matchMedia: unknown }).matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
    });
});

afterEach(() => { document.body.innerHTML = ''; });

async function mount(attrs: Record<string, string> = {}): Promise<AparteSplit> {
    const el = document.createElement('aparte-split') as AparteSplit;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.appendChild(Object.assign(document.createElement('div'), { textContent: 'start' }));
    el.appendChild(Object.assign(document.createElement('div'), { textContent: 'end' }));
    document.body.appendChild(el);
    await customElements.whenDefined('aparte-split');
    return el;
}

describe('#54 — <aparte-split single>', () => {
    it('is stacked: the seam has no tab stop, and the property reflects the attribute', async () => {
        const el = await mount({ single: '' });
        expect(el.stacked).toBe(true);
        expect(el.single).toBe(true);
        const handle = el.querySelector('.aparte-split__handle');
        expect(handle).not.toBeNull();
        expect(handle!.hasAttribute('tabindex')).toBe(false);
    });

    it('removing it restores the two panes and the seam\'s tab stop', async () => {
        const el = await mount({ single: '' });
        el.single = false;
        expect(el.hasAttribute('single')).toBe(false);
        expect(el.stacked).toBe(false);
        expect(el.querySelector('.aparte-split__handle')!.getAttribute('tabindex')).toBe('0');
    });

    it('setting it later takes the tab stop away without a breakpoint crossing', async () => {
        const el = await mount();
        expect(el.querySelector('.aparte-split__handle')!.getAttribute('tabindex')).toBe('0');
        el.single = true;
        expect(el.stacked).toBe(true);
        expect(el.querySelector('.aparte-split__handle')!.hasAttribute('tabindex')).toBe(false);
    });

    it('the stylesheet hides the seam and the other pane for [single], byte for byte with the breakpoint\'s state', () => {
        const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
        expect(css).toMatch(/aparte-split\[single\]\s*>\s*\.aparte-split__handle/);
        expect(css).toMatch(/aparte-split\[single\]:not\(\[pane='end'\]\)\s*>\s*:nth-child\(3\)/);
        expect(css).toMatch(/aparte-split\[single\]\[pane='end'\]\s*>\s*:nth-child\(1\)/);
    });
});
