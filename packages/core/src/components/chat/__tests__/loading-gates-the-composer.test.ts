// @vitest-environment jsdom
/**
 * A transcript on its way cannot take a message.
 *
 * `loading` on the viewport gated the transcript and the empty state, and left the
 * composer alone: a reader could type and send while the conversation's messages were
 * still being fetched (Paul, on the chat site, 2026-09-05 — "je peux écrire et envoyer
 * pendant le loading"). The send then raced the fetch — the controller appended to a
 * history that `setMessages` overwrote a moment later. So `<aparte-chat>` disables its
 * composer while its viewport says `loading`, whatever else the chat is set to, and
 * gives it back exactly as it found it: a `disabled` the consumer set stays.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';
import '../../composer/aparte-composer.js';

async function mount(attrs: Record<string, string> = {}): Promise<{ chat: HTMLElement; viewport: HTMLElement; composer: HTMLElement }> {
    const chat = document.createElement('aparte-chat');
    for (const [k, v] of Object.entries(attrs)) chat.setAttribute(k, v);
    document.body.appendChild(chat);
    await vi.waitFor(() => expect(chat.querySelector('aparte-composer')).not.toBeNull());
    return { chat, viewport: chat.querySelector('aparte-chat-viewport')!, composer: chat.querySelector('aparte-composer')! };
}

describe('aparte-chat while its viewport is loading', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('disables the composer, and enables it again when the transcript has arrived', async () => {
        const { viewport, composer } = await mount();
        expect(composer.hasAttribute('disabled')).toBe(false);
        viewport.setAttribute('loading', '');
        await vi.waitFor(() => expect(composer.hasAttribute('disabled')).toBe(true));
        viewport.removeAttribute('loading');
        await vi.waitFor(() => expect(composer.hasAttribute('disabled')).toBe(false));
    });

    it('does not depend on center-empty', async () => {
        const { chat, viewport, composer } = await mount();
        expect(chat.hasAttribute('center-empty')).toBe(false);
        viewport.setAttribute('loading', '');
        await vi.waitFor(() => expect(composer.hasAttribute('disabled')).toBe(true));
    });

    it('keeps a disabled the consumer set, through and after the wait', async () => {
        const { chat, viewport, composer } = await mount({ disabled: '' });
        viewport.setAttribute('loading', '');
        await vi.waitFor(() => expect(composer.hasAttribute('disabled')).toBe(true));
        viewport.removeAttribute('loading');
        await new Promise((r) => setTimeout(r, 20));
        expect(composer.hasAttribute('disabled')).toBe(true);
        chat.removeAttribute('disabled');
        await vi.waitFor(() => expect(composer.hasAttribute('disabled')).toBe(false));
    });

    it('holds the gate if the consumer removes disabled during the wait', async () => {
        const { chat, viewport, composer } = await mount({ disabled: '' });
        viewport.setAttribute('loading', '');
        await vi.waitFor(() => expect(composer.hasAttribute('disabled')).toBe(true));
        chat.removeAttribute('disabled');
        await new Promise((r) => setTimeout(r, 20));
        expect(composer.hasAttribute('disabled')).toBe(true);
        viewport.removeAttribute('loading');
        await vi.waitFor(() => expect(composer.hasAttribute('disabled')).toBe(false));
    });
});
