// @vitest-environment jsdom
/**
 * A list that has not arrived is not an empty list.
 *
 * Until the store answers, the sidebar showed nothing — the same screen as a person
 * with no conversation at all. The `loading` attribute draws rows of the kit's skeleton
 * where the rows will be, marks the list busy and names the wait; the real rows replace
 * them when the attribute goes. Reflected, so a site sets it by hand or a controller
 * does.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-conversation-list.js';
import type { AparteConversationListItem } from '../aparte-conversation-list.js';

type ListEl = HTMLElement & { conversations: AparteConversationListItem[]; loading: boolean };

async function mount(attrs: Record<string, string> = {}): Promise<ListEl> {
    const el = document.createElement('aparte-conversation-list') as ListEl;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    await vi.waitFor(() => expect(typeof el.loading).toBe('boolean'));
    return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-conversation-list — loading', () => {
    it('draws skeleton rows, busy and named, instead of the list', async () => {
        const el = await mount({ loading: '' });
        el.conversations = [{ id: 'c1', title: 'One', updatedAt: Date.now() }];
        expect(el.querySelectorAll('.aparte-skeleton').length).toBeGreaterThanOrEqual(4);
        expect(el.querySelector('[data-conv-id]')).toBeNull();
        expect(el.getAttribute('aria-busy')).toBe('true');
        // A frame later: the live region is inserted empty and named after, or a screen
        // reader has a new node instead of a change to announce. See
        // `loading-is-a-presence-property.test.ts`.
        await vi.waitFor(() => expect(el.querySelector('.aparte-conv-list-loading-status')?.textContent?.trim()).not.toBe(''));
    });

    it('shows the rows the moment the attribute goes', async () => {
        const el = await mount({ loading: '' });
        el.conversations = [{ id: 'c1', title: 'One', updatedAt: Date.now() }];
        el.loading = false;
        expect(el.hasAttribute('loading')).toBe(false);
        expect(el.getAttribute('aria-busy')).toBe('false');
        expect(el.querySelectorAll('[data-conv-id]')).toHaveLength(1);
        expect(el.querySelector('.aparte-skeleton')).toBeNull();
    });
});
