// @vitest-environment jsdom
/**
 * A compaction summary is a notice, not a reply: the viewport stamps the bubble
 * `data-kind="compaction"` from `message.compaction`, and the stylesheet does the rest
 * (centred, no avatar, no actions). The role stays `user` on the message — that is the
 * wire's business — so the stamp is the ONLY thing that tells the two apart.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-viewport.js';
import '../../bubble/aparte-chat-bubble.js';
import type { AparteMessage } from '../../../types/models.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    setMessages(m: AparteMessage[]): void;
};

function mount(): Viewport {
    const el = document.createElement('aparte-chat-viewport') as Viewport;
    document.body.appendChild(el);
    return el;
}

const bubbleOf = (el: HTMLElement, id: string): HTMLElement | null =>
    el.querySelector<HTMLElement>(`aparte-chat-bubble[message-id="${id}"]`);

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-chat-viewport — the compaction notice', () => {
    it('stamps data-kind="compaction" on an appended summary, and nothing on an ordinary user turn', () => {
        const el = mount();
        el.appendMessage({ id: 'u1', role: 'user', content: 'hello', timestamp: 1, status: 'completed' });
        el.appendMessage({ id: 's1', role: 'user', compaction: true, content: '**Summary**\n\nWhat came before.', timestamp: 2, status: 'completed' });

        expect(bubbleOf(el, 'u1')?.hasAttribute('data-kind')).toBe(false);
        expect(bubbleOf(el, 's1')?.getAttribute('data-kind')).toBe('compaction');
        expect(bubbleOf(el, 's1')?.getAttribute('data-role'), 'the role is the wire\'s').toBe('user');
    });

    it('keeps the stamp through a full re-render from the messages', () => {
        const el = mount();
        el.setMessages([
            { id: 's1', role: 'user', compaction: true, content: 'Summary.', timestamp: 1, status: 'completed' },
            { id: 'u2', role: 'user', content: 'and then', timestamp: 2, status: 'completed' },
        ]);
        expect(bubbleOf(el, 's1')?.getAttribute('data-kind')).toBe('compaction');
        expect(bubbleOf(el, 'u2')?.hasAttribute('data-kind')).toBe(false);
    });
});
