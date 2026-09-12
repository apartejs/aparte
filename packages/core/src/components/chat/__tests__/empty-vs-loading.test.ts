// @vitest-environment jsdom
/**
 * "Empty" and "on its way" are two states, not one.
 *
 * `aparte-chat[center-empty]` decided it was empty by looking at the DOM: no bubble in
 * the viewport, so `data-empty`, so the composer in the middle of the page. A
 * transcript whose messages had not arrived yet has no bubble either, and the welcome
 * screen showed while a conversation was loading (the chat-site review, 2026-09-05).
 * A viewport that says `loading` is not empty, whatever it holds.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';

async function mount(): Promise<{ chat: HTMLElement; viewport: HTMLElement }> {
    const chat = document.createElement('aparte-chat');
    chat.setAttribute('center-empty', '');
    const viewport = document.createElement('aparte-chat-viewport');
    chat.appendChild(viewport);
    document.body.appendChild(chat);
    await vi.waitFor(() => expect(chat.hasAttribute('data-empty')).toBe(true));
    return { chat, viewport };
}

describe('aparte-chat[center-empty] — empty against loading', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('is not empty while the viewport is loading, and empty again once it is not', async () => {
        const { chat, viewport } = await mount();
        viewport.setAttribute('loading', '');
        await vi.waitFor(() => expect(chat.hasAttribute('data-empty')).toBe(false));
        viewport.removeAttribute('loading');
        await vi.waitFor(() => expect(chat.hasAttribute('data-empty')).toBe(true));
    });
});
