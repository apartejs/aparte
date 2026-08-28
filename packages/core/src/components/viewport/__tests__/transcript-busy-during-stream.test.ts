// @vitest-environment jsdom
/**
 * While a reply streams, the transcript is read-only except for Stop.
 *
 * Only the streaming message's own footer used to be hidden; every other message kept
 * its branch picker and its retry/edit buttons live. Swapping a branch mid-stream
 * re-rendered the active path under the reply being written, and a retry cut it off to
 * start another — seen on the landing page. The viewport carries `data-busy` while it
 * streams, pushes it to its bubbles, and `navigateBranch()` refuses meanwhile.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig } from '../../../config/index.js';
import type { AparteMessage } from '../../../types/index.js';

class NoopObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }

type Vp = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    updateMessage(id: string, updates: Partial<AparteMessage>): void;
    addSiblingOf(existingId: string, m: AparteMessage): string | null;
    navigateBranch(id: string, direction: 'prev' | 'next'): void;
    getMessages(): AparteMessage[];
};

let vp: Vp;

const button = (messageId: string, selector: string): HTMLButtonElement | null =>
    vp.querySelector(`aparte-chat-bubble[message-id="${messageId}"] ${selector}`);

beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', NoopObserver);
    await import('../aparte-chat-viewport.js');
    await import('../../bubble/aparte-chat-bubble.js');
    await customElements.whenDefined('aparte-chat-viewport');
    aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
    document.body.innerHTML = '';
    vp = document.createElement('aparte-chat-viewport') as unknown as Vp;
    document.body.appendChild(vp);
    vp.appendMessage({ id: 'u1', role: 'user', content: 'hi', timestamp: 1, status: 'completed' });
    vp.appendMessage({ id: 'a1', role: 'assistant', content: 'first answer', timestamp: 2, status: 'completed' });
});

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); vi.unstubAllGlobals(); });

describe('the transcript while a reply streams', () => {
    it('flags the viewport and disables retry/edit on every message, then restores them', () => {
        expect(vp.hasAttribute('data-busy')).toBe(false);
        expect(button('u1', '[data-action="edit"]')?.disabled).toBe(false);
        expect(button('a1', '[data-action="retry"]')?.disabled).toBe(false);

        vp.appendMessage({ id: 'a2', role: 'assistant', content: '', timestamp: 3, status: 'streaming' });
        expect(vp.hasAttribute('data-busy')).toBe(true);
        expect(button('u1', '[data-action="edit"]')?.disabled, 'the older user message').toBe(true);
        expect(button('a1', '[data-action="retry"]')?.disabled, 'the older reply').toBe(true);

        vp.updateMessage('a2', { status: 'completed' });
        expect(vp.hasAttribute('data-busy')).toBe(false);
        expect(button('u1', '[data-action="edit"]')?.disabled).toBe(false);
        expect(button('a1', '[data-action="retry"]')?.disabled).toBe(false);
    });

    it('disables the branch arrows and refuses navigateBranch() until the reply lands', () => {
        // A second version of the reply, which becomes the active one and streams.
        const newId = vp.addSiblingOf('a1', { id: 'a1b', role: 'assistant', content: '', timestamp: 3, status: 'streaming' });
        expect(newId).toBe('a1b');
        expect(vp.getMessages().map((m) => m.id)).toEqual(['u1', 'a1b']);
        expect(vp.hasAttribute('data-busy')).toBe(true);
        expect(button('a1b', '.aparte-branch-prev')?.disabled, 'the arrow that would swap under the stream').toBe(true);

        vp.navigateBranch('a1b', 'prev');
        expect(vp.getMessages().map((m) => m.id), 'no swap while streaming').toEqual(['u1', 'a1b']);

        vp.updateMessage('a1b', { status: 'completed' });
        expect(button('a1b', '.aparte-branch-prev')?.disabled).toBe(false);
        vp.navigateBranch('a1b', 'prev');
        expect(vp.getMessages().map((m) => m.id), 'the swap works again once the reply landed').toEqual(['u1', 'a1']);
    });

    it('a bubble mounted while the flag is up starts disabled', () => {
        vp.appendMessage({ id: 'a2', role: 'assistant', content: '', timestamp: 3, status: 'streaming' });
        const late = document.createElement('aparte-chat-bubble');
        late.setAttribute('message-id', 'late');
        late.setAttribute('data-role', 'assistant');
        late.setAttribute('content', 'mounted by a framework');
        vp.querySelector('.aparte-messages-wrapper')!.appendChild(late);
        expect(late.querySelector<HTMLButtonElement>('[data-action="retry"]')?.disabled).toBe(true);
    });
});
