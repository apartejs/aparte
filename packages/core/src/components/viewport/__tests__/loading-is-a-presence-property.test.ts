// @vitest-environment jsdom
/**
 * `loading` obeys core's own presence convention, and its live region is announced.
 *
 * Two rules the newest boolean property broke.
 *
 * (a) A presence property takes `''` for ON — that is what React stringifies for
 * `loading=""`, what Svelte 5 assigns to the PROPERTY when the element has one, and
 * what the generated attribute types promise. `toggleAttribute(name, '')` reads an
 * empty string as falsy and REMOVED the attribute, so the documented spelling turned
 * the wait off. Every other boolean in core goes through `presenceOn`; these two did
 * not.
 *
 * (b) A `role="status"` region has to be in the document BEFORE its text changes:
 * created with the text already inside, several screen readers skip it entirely — and
 * `aria-busy`, as the code's own comment says, is not enough on its own.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';

type ViewportEl = HTMLElement & { loading: boolean; setLoading(on: boolean): void };

async function mount(): Promise<ViewportEl> {
    const vp = document.createElement('aparte-chat-viewport') as never as ViewportEl;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.setLoading).toBe('function'));
    return vp;
}

describe('the viewport’s loading property', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it("takes '' as ON, the way every other presence property in core does", async () => {
        const vp = await mount();
        (vp as unknown as { loading: unknown }).loading = '';
        expect(vp.hasAttribute('loading')).toBe(true);
    });

    it('still takes true and false', async () => {
        const vp = await mount();
        vp.loading = true;
        expect(vp.hasAttribute('loading')).toBe(true);
        vp.loading = false;
        expect(vp.hasAttribute('loading')).toBe(false);
    });

    it('inserts the status region empty, then names the wait in it', async () => {
        const vp = await mount();
        vp.setLoading(true);
        const status = vp.querySelector('.aparte-viewport-loading-status');
        expect(status, 'the region exists as soon as the wait starts').not.toBeNull();
        expect(status!.getAttribute('role')).toBe('status');
        expect(status!.textContent, 'and it is empty when it is inserted').toBe('');
        await vi.waitFor(() => expect(status!.textContent?.trim()).not.toBe(''));
    });
});
