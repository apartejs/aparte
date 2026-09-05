// @vitest-environment jsdom
/**
 * The composer gate is installed whenever the viewport arrives, not only if it was
 * already there.
 *
 * `_syncLoadingWatch()` (and the empty watch beside it) ran once, from
 * `connectedCallback`, and returned immediately when no `<aparte-chat-viewport>` child
 * existed yet. That is the normal shape under a framework: `<aparte-chat
 * framework-managed>` is Angular's own host element, upgraded on insert and filled by
 * the template afterwards — and hand-written markup upgrades before its children are
 * parsed. Neither ever got the observer, so "every chat gates" was inert exactly where
 * the transcript is fetched: a send during the wait appended to a history that the
 * arriving conversation then overwrote.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';
import '../../composer/aparte-composer.js';

async function chatWithLateChildren(attrs: Record<string, string>): Promise<HTMLElement> {
    const chat = document.createElement('aparte-chat');
    for (const [k, v] of Object.entries(attrs)) chat.setAttribute(k, v);
    document.body.appendChild(chat);
    await vi.waitFor(() => expect(chat.matches(':defined')).toBe(true));
    // What a framework does: the host element first, its children on the next render.
    chat.appendChild(document.createElement('aparte-chat-viewport'));
    chat.appendChild(document.createElement('aparte-composer'));
    await vi.waitFor(() => expect(chat.querySelector('aparte-composer')?.matches(':defined')).toBe(true));
    return chat;
}

const viewportOf = (chat: HTMLElement): HTMLElement => chat.querySelector('aparte-chat-viewport')!;
const composerOf = (chat: HTMLElement): HTMLElement => chat.querySelector('aparte-composer')!;

describe('a chat whose viewport arrives after it connects', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('gates the composer while the transcript is on its way', async () => {
        const chat = await chatWithLateChildren({ 'framework-managed': '' });
        viewportOf(chat).setAttribute('loading', '');
        await vi.waitFor(() => expect(composerOf(chat).hasAttribute('disabled')).toBe(true));

        viewportOf(chat).removeAttribute('loading');
        await vi.waitFor(() => expect(composerOf(chat).hasAttribute('disabled')).toBe(false));
    });

    it('centres the empty state, and stops calling a loading transcript empty', async () => {
        const chat = await chatWithLateChildren({ 'framework-managed': '', 'center-empty': '' });
        await vi.waitFor(() => expect(chat.hasAttribute('data-empty')).toBe(true));

        viewportOf(chat).setAttribute('loading', '');
        await vi.waitFor(() => expect(chat.hasAttribute('data-empty')).toBe(false));
    });
});
