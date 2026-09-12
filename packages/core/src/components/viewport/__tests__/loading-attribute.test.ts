// @vitest-environment jsdom
/**
 * A transcript can be on its way — and say so itself.
 *
 * Between a click on a conversation and its messages there was nothing: an empty
 * viewport, which reads as "no messages" (and centres the composer under
 * `center-empty`). The `loading` attribute is that moment: the element draws two turns
 * of the kit's skeleton, marks its scroll surface busy, and names the wait for a screen
 * reader. Reflected, so a loop of your own sets it by hand.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';

type ViewportEl = HTMLElement & { loading: boolean; setLoading(on: boolean): void };

async function mount(attrs: Record<string, string> = {}): Promise<ViewportEl> {
    const vp = document.createElement('aparte-chat-viewport') as never as ViewportEl;
    for (const [k, v] of Object.entries(attrs)) vp.setAttribute(k, v);
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.setLoading).toBe('function'));
    return vp;
}

describe('aparte-chat-viewport — loading', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('draws skeleton turns, marks the surface busy, and names the wait', async () => {
        const vp = await mount({ loading: '' });
        const skeleton = vp.querySelector('.aparte-viewport-loading');
        expect(skeleton).not.toBeNull();
        expect(skeleton!.querySelectorAll('.aparte-skeleton').length).toBeGreaterThanOrEqual(4);
        expect(skeleton!.getAttribute('aria-hidden')).toBe('true');
        expect(vp.querySelector('.aparte-viewport-container')?.getAttribute('aria-busy')).toBe('true');
        // A frame later: the live region is inserted empty and named after, or a screen
        // reader has a new node instead of a change to announce. See
        // `loading-is-a-presence-property.test.ts`.
        await vi.waitFor(() => expect(vp.querySelector('.aparte-viewport-loading-status')?.textContent?.trim()).not.toBe(''));
    });

    it('removes them and clears busy when the attribute goes', async () => {
        const vp = await mount({ loading: '' });
        vp.removeAttribute('loading');
        expect(vp.querySelector('.aparte-viewport-loading')).toBeNull();
        expect(vp.querySelector('.aparte-viewport-container')?.getAttribute('aria-busy')).toBe('false');
    });

    it('setLoading(on) reflects the attribute, and the property reads it', async () => {
        const vp = await mount();
        expect(vp.loading).toBe(false);
        vp.setLoading(true);
        expect(vp.hasAttribute('loading')).toBe(true);
        expect(vp.loading).toBe(true);
        vp.loading = false;
        expect(vp.hasAttribute('loading')).toBe(false);
    });
});
