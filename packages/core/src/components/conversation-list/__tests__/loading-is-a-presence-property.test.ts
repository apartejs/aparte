// @vitest-environment jsdom
/**
 * `loading` obeys core's own presence convention, and its live region is announced.
 *
 * (a) A presence property takes `''` for ON — what React stringifies for `loading=""`,
 * what Svelte 5 assigns to the property, and what the generated attribute types promise.
 * `toggleAttribute(name, '')` reads an empty string as falsy and REMOVED the attribute,
 * so the documented spelling turned the wait off. Every other boolean in core goes
 * through `presenceOn`.
 *
 * (b) A `role="status"` region has to be in the document before its text changes: built
 * with the text already inside, several screen readers announce nothing at all.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-conversation-list.js';

type ListEl = HTMLElement & { loading: boolean };

function mount(): ListEl {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    document.body.appendChild(el);
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('the list’s loading property', () => {
    it("takes '' as ON, the way every other presence property in core does", () => {
        const el = mount();
        (el as unknown as { loading: unknown }).loading = '';
        expect(el.hasAttribute('loading')).toBe(true);
    });

    it('still takes true and false', () => {
        const el = mount();
        el.loading = true;
        expect(el.hasAttribute('loading')).toBe(true);
        el.loading = false;
        expect(el.hasAttribute('loading')).toBe(false);
    });

    it('inserts the status region empty, then names the wait in it', async () => {
        const el = mount();
        el.loading = true;
        const status = el.querySelector('.aparte-conv-list-loading-status');
        expect(status, 'the region exists as soon as the wait starts').not.toBeNull();
        expect(status!.getAttribute('role')).toBe('status');
        expect(status!.textContent, 'and it is empty when it is inserted').toBe('');
        await vi.waitFor(() => expect(status!.textContent?.trim()).not.toBe(''));
    });
});
