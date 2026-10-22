// @vitest-environment jsdom
/**
 * A conversation a script restores on load does not slide the composer down.
 *
 * `center-empty` (and the wrappers' `centerWhenEmpty`) slid the composer from the welcome state
 * to the bottom whatever moved the chat out of its empty state. A page that restores the last
 * conversation right after the upgrade painted the welcome, then slid it away under a reader who
 * had done nothing: a layout shift (CLS 0.14 on a phone). The slide now waits for a person —
 * the first key or pointer in the page, or a send — which the chat says with `data-glide`, the
 * attribute the stylesheet's transition is keyed on (composer-glides-both-ways.test.ts).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';
import { AparteChatHost, type AparteChatHostBinding } from '../../../host/aparte-chat-host.js';

afterEach(() => { document.body.innerHTML = ''; });

function chat(): HTMLElement {
    const el = document.createElement('aparte-chat');
    el.setAttribute('center-empty', '');
    document.body.appendChild(el);
    return el;
}

describe('<aparte-chat center-empty>', () => {
    it('does not glide before a person is in the page', () => {
        expect(chat().hasAttribute('data-glide')).toBe(false);
    });

    it('glides from the first key or pointer anywhere in the page', () => {
        const a = chat();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect(a.hasAttribute('data-glide')).toBe(true);

        document.body.innerHTML = '';
        const b = chat();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(b.hasAttribute('data-glide')).toBe(true);
    });

    it('glides from a send', () => {
        const el = chat();
        el.dispatchEvent(new CustomEvent('aparte-send', { bubbles: true, detail: { content: 'hi' } }));
        expect(el.hasAttribute('data-glide')).toBe(true);
    });

    it('stops listening once removed', () => {
        const el = chat();
        el.remove();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect(el.hasAttribute('data-glide')).toBe(false);
    });
});

describe("a framework host's root", () => {
    async function bound(): Promise<{ root: HTMLElement; teardown: () => void }> {
        const root = document.createElement('div');
        root.setAttribute('data-aparte-chat', '');
        root.id = 'h1';
        const viewport = document.createElement('aparte-chat-viewport');
        viewport.setAttribute('framework-managed', '');
        root.appendChild(viewport);
        document.body.appendChild(root);
        await vi.waitFor(() => expect(typeof (viewport as unknown as { addMessage?: unknown }).addMessage).toBe('function'));
        const binding: AparteChatHostBinding = {
            hostId: 'h1', host: root, viewport,
            getMessages: () => [],
            setMessages: () => {},
            afterRender: (cb) => cb(),
        };
        return { root, teardown: new AparteChatHost(binding, {}).bind() };
    }

    it('glides from the first key, and not before', async () => {
        const { root, teardown } = await bound();
        expect(root.hasAttribute('data-glide')).toBe(false);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect(root.hasAttribute('data-glide')).toBe(true);
        teardown();
    });

    it('stops listening when unbound', async () => {
        const { root, teardown } = await bound();
        teardown();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
        expect(root.hasAttribute('data-glide')).toBe(false);
    });
});
