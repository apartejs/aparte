// @vitest-environment jsdom
/**
 * A notice is a line; a note sits under a message.
 *
 * `kind: 'notice'` ("Marie joined the conversation") is drawn as a line across the
 * transcript — no header, no avatar, no actions — and read as a note. `note` ("Read by
 * Marie") is a short line under a message, in the flow after its content, outside the
 * footer (which hides while a reply streams and floats out of the flow on older messages).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import '../../viewport/aparte-chat-viewport.js';
import type { AparteMessage } from '../../../types/index.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    updateMessage(id: string, u: Partial<AparteMessage>): void;
};

async function viewport(): Promise<Viewport> {
    const vp = document.createElement('aparte-chat-viewport') as unknown as Viewport;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
    return vp;
}
const bubbleOf = (vp: HTMLElement, id: string) => vp.querySelector(`aparte-chat-bubble[message-id="${id}"]`) as HTMLElement;
const joined: AparteMessage = { id: 'n1', role: 'assistant', kind: 'notice', content: 'Marie joined the conversation', timestamp: 1 };

afterEach(() => { document.body.innerHTML = ''; });

describe('a notice', () => {
    it('is drawn as a line, read as a note, with no header, avatar or actions', async () => {
        const vp = await viewport();
        vp.appendMessage(joined);
        const bubble = bubbleOf(vp, 'n1');
        expect(bubble.getAttribute('data-kind')).toBe('notice');
        expect(bubble.getAttribute('role')).toBe('note');
        expect(bubble.querySelector('.aparte-notice')?.textContent).toBe('Marie joined the conversation');
        expect(bubble.querySelector('.aparte-message, .aparte-header, .aparte-avatar, .aparte-action-bar')).toBeNull();
    });

    it('says a new text in place', async () => {
        const vp = await viewport();
        vp.appendMessage(joined);
        vp.updateMessage('n1', { content: 'Marie left the conversation' });
        expect(bubbleOf(vp, 'n1').querySelector('.aparte-notice')?.textContent).toBe('Marie left the conversation');
    });

    it('is drawn again when the kind changes after the bubble connected', async () => {
        const bubble = document.createElement('aparte-chat-bubble');
        bubble.setAttribute('data-role', 'assistant');
        bubble.setAttribute('content', 'Marie joined the conversation');
        document.body.appendChild(bubble);
        expect(bubble.querySelector('.aparte-message')).not.toBeNull();

        bubble.setAttribute('data-kind', 'notice');
        expect(bubble.querySelector('.aparte-message')).toBeNull();
        expect(bubble.querySelector('.aparte-notice')?.textContent).toBe('Marie joined the conversation');

        bubble.removeAttribute('data-kind');
        expect(bubble.querySelector('.aparte-notice')).toBeNull();
        expect(bubble.querySelector('.aparte-message')).not.toBeNull();
        expect(bubble.getAttribute('role')).toBe('article');
    });
});

describe('a note', () => {
    const asked: AparteMessage = { id: 'u1', role: 'user', content: 'Where is my order?', note: 'Read by Marie', timestamp: 1 };

    it('sits after the content, outside the footer', async () => {
        const vp = await viewport();
        vp.appendMessage(asked);
        const note = bubbleOf(vp, 'u1').querySelector('.aparte-message-note') as HTMLElement | null;
        expect(note?.textContent).toBe('Read by Marie');
        expect(note?.previousElementSibling?.classList.contains('aparte-message-content')).toBe(true);
        expect(note?.closest('.aparte-footer')).toBeNull();
    });

    it('changes in place, and goes when it is taken back', async () => {
        const vp = await viewport();
        vp.appendMessage(asked);
        const first = bubbleOf(vp, 'u1').querySelector('.aparte-message-note');
        vp.updateMessage('u1', { note: 'Seen at 14:05' });
        const again = bubbleOf(vp, 'u1').querySelector('.aparte-message-note');
        expect(again).toBe(first);
        expect(again?.textContent).toBe('Seen at 14:05');

        vp.updateMessage('u1', { note: undefined });
        expect(bubbleOf(vp, 'u1').querySelector('.aparte-message-note')).toBeNull();
    });
});
