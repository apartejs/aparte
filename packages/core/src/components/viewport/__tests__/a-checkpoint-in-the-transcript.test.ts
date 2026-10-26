// @vitest-environment jsdom
/**
 * The separator in a transcript the viewport draws itself: where it comes from, what the
 * compaction events do to it, and Restore.
 *
 * - A checkpoint written onto a message that is NOT the last (which is where a compaction
 *   always writes it) reaches that message's bubble through `updateMessage`.
 * - The compaction's own events mark the bubble it is writing onto: pending while it runs,
 *   failed when it fails, cleared by the matching done. A skipped done, another message's
 *   id and another chat's events change nothing.
 * - Restore takes the checkpoint off EVERY message of the path, through the chat's own
 *   `updateMessage`, and says `aparte-compact-done { restored: true }`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';
import '../../bubble/aparte-chat-bubble.js';
import type { AparteContextSummary, AparteMessage } from '../../../types/models.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    setMessages(m: AparteMessage[]): void;
    updateMessage(id: string, updates: Partial<AparteMessage>): void;
    getMessages(): AparteMessage[];
    clearAll(): void;
};

const first: AparteContextSummary = { summary: 'The first summary.', count: 4, createdAt: 10 };
const second: AparteContextSummary = { summary: 'The second summary, over the first.', count: 9, createdAt: 20 };

const turn = (id: string, role: 'user' | 'assistant', extra: Partial<AparteMessage> = {}): AparteMessage => ({
    id, role, content: `${role} ${id}`, timestamp: 1, status: 'completed', ...extra,
});

function mount(chatId?: string): { viewport: Viewport; chat: HTMLElement } {
    const chat = document.createElement('div');
    chat.setAttribute('data-aparte-chat', '');
    if (chatId) chat.id = chatId;
    const viewport = document.createElement('aparte-chat-viewport') as Viewport;
    chat.appendChild(viewport);
    document.body.appendChild(chat);
    return { viewport, chat };
}

const bubbleOf = (el: HTMLElement, id: string): HTMLElement => el.querySelector<HTMLElement>(`aparte-chat-bubble[message-id="${id}"]`)!;
const separatorOf = (el: HTMLElement, id: string): HTMLElement | null => bubbleOf(el, id).querySelector<HTMLElement>(':scope > .aparte-checkpoint');
const emit = (name: string, detail: object): void => { window.dispatchEvent(new CustomEvent(name, { detail })); };

afterEach(() => { document.body.innerHTML = ''; });

describe('a checkpoint reaches a bubble that is not the last', () => {
    it('is drawn when a message is appended with one, or loaded with one', () => {
        const { viewport } = mount();
        viewport.appendMessage(turn('u1', 'user', { contextSummary: first }));
        viewport.appendMessage(turn('a1', 'assistant'));
        expect(separatorOf(viewport, 'u1')!.textContent).toContain('4 messages summarised for the model');
        expect(separatorOf(viewport, 'a1')).toBeNull();

        viewport.setMessages([turn('u1', 'user', { contextSummary: second }), turn('a1', 'assistant')]);
        expect(separatorOf(viewport, 'u1')!.textContent).toContain('9 messages');
    });

    it('is drawn by updateMessage on an earlier message, and removed by one that clears it', () => {
        const { viewport } = mount();
        viewport.setMessages([turn('u1', 'user'), turn('a1', 'assistant'), turn('u2', 'user'), turn('a2', 'assistant')]);
        expect(separatorOf(viewport, 'u2')).toBeNull();

        viewport.updateMessage('u2', { contextSummary: first });
        expect(separatorOf(viewport, 'u2')!.textContent).toContain('4 messages');
        expect(separatorOf(viewport, 'a2'), 'the last message did not get one').toBeNull();

        viewport.updateMessage('u2', { contextSummary: undefined });
        expect(separatorOf(viewport, 'u2')).toBeNull();
    });

    it('replaces a message an older compaction wrote with the separator', () => {
        const { viewport } = mount();
        viewport.setMessages([turn('s1', 'user', { compaction: true, content: '**Conversation summary**\n\nBefore.' }), turn('u2', 'user')]);
        expect(separatorOf(viewport, 's1')!.getAttribute('data-state')).toBe('legacy');
        expect(bubbleOf(viewport, 's1').querySelector('.aparte-message')!.hasAttribute('data-superseded')).toBe(true);
        expect(separatorOf(viewport, 'u2')).toBeNull();
    });
});

describe('what the compaction events do to the bubble', () => {
    const transcript = (viewport: Viewport): void =>
        viewport.setMessages([turn('u1', 'user'), turn('a1', 'assistant'), turn('u2', 'user'), turn('a2', 'assistant')]);

    it('marks the message pending on start, and clears it on a done for that message', () => {
        const { viewport } = mount();
        transcript(viewport);

        emit('aparte-compact-start', { messageId: 'u2' });
        expect(bubbleOf(viewport, 'u2').getAttribute('data-checkpoint')).toBe('pending');
        expect(separatorOf(viewport, 'u2')!.getAttribute('data-state')).toBe('pending');
        expect(bubbleOf(viewport, 'u1').hasAttribute('data-checkpoint')).toBe(false);

        viewport.updateMessage('u2', { contextSummary: first });
        emit('aparte-compact-done', { messageId: 'u2', count: 4, summary: 'The first summary.' });
        expect(bubbleOf(viewport, 'u2').hasAttribute('data-checkpoint')).toBe(false);
        expect(separatorOf(viewport, 'u2')!.getAttribute('data-state'), 'the checkpoint itself is left').toBe('done');
    });

    it('answers to its own id when it is a bare viewport with no named chat around it', () => {
        // The client names such a chat's events with the viewport's own id.
        const viewport = document.createElement('aparte-chat-viewport') as Viewport;
        viewport.id = 'solo';
        document.body.appendChild(viewport);
        transcript(viewport);

        emit('aparte-compact-start', { targetId: 'solo', messageId: 'u2' });
        expect(bubbleOf(viewport, 'u2').getAttribute('data-checkpoint')).toBe('pending');
        emit('aparte-compact-start', { targetId: 'another', messageId: 'u2' });
        expect(bubbleOf(viewport, 'u2').getAttribute('data-checkpoint'), "another chat's start changes nothing").toBe('pending');
    });

    it('clears the pending line on a cancelled compaction, and offers no Retry', () => {
        const { viewport } = mount();
        transcript(viewport);

        emit('aparte-compact-start', { messageId: 'u2' });
        emit('aparte-compact-error', { messageId: 'u2', error: 'Compaction aborted', aborted: true });
        expect(bubbleOf(viewport, 'u2').hasAttribute('data-checkpoint')).toBe(false);
        expect(separatorOf(viewport, 'u2')).toBeNull();
    });

    it('marks it failed, with the reason, on an error that names the message', () => {
        const { viewport } = mount();
        transcript(viewport);
        emit('aparte-compact-start', { messageId: 'u2' });
        emit('aparte-compact-error', { error: 'The provider refused', messageId: 'u2' });

        const bubble = bubbleOf(viewport, 'u2');
        expect(bubble.getAttribute('data-checkpoint')).toBe('failed');
        expect(bubble.getAttribute('data-checkpoint-reason')).toBe('The provider refused');
        expect(separatorOf(viewport, 'u2')!.querySelector('[data-checkpoint-action="retry"]')).not.toBeNull();
    });

    it('is not cleared by a skipped done, a done for another message, or another chat', () => {
        const { viewport } = mount('chat-1');
        transcript(viewport);
        emit('aparte-compact-start', { messageId: 'u2', targetId: 'chat-1' });
        const bubble = bubbleOf(viewport, 'u2');

        emit('aparte-compact-done', { skipped: true, reason: 'nothing-to-drop', messageId: 'u2', targetId: 'chat-1' });
        expect(bubble.getAttribute('data-checkpoint'), 'skipped').toBe('pending');
        emit('aparte-compact-done', { messageId: 'u1', targetId: 'chat-1' });
        expect(bubble.getAttribute('data-checkpoint'), 'another message').toBe('pending');
        emit('aparte-compact-done', { messageId: 'u2', targetId: 'chat-2' });
        expect(bubble.getAttribute('data-checkpoint'), 'another chat').toBe('pending');
        emit('aparte-compact-error', { error: 'x', messageId: 'u1', targetId: 'chat-2' });
        expect(bubble.getAttribute('data-checkpoint'), 'another chat\'s error').toBe('pending');
        expect(bubbleOf(viewport, 'u1').hasAttribute('data-checkpoint')).toBe(false);

        emit('aparte-compact-done', { messageId: 'u2', targetId: 'chat-1' });
        expect(bubble.hasAttribute('data-checkpoint'), 'the matching one').toBe(false);
    });

    it('is ignored for a start that names no message, and a later start moves the mark', () => {
        const { viewport } = mount();
        transcript(viewport);
        emit('aparte-compact-start', {});
        expect(viewport.querySelector('[data-checkpoint]')).toBeNull();

        emit('aparte-compact-start', { messageId: 'u1' });
        emit('aparte-compact-error', { error: 'x', messageId: 'u1' });
        expect(bubbleOf(viewport, 'u1').getAttribute('data-checkpoint')).toBe('failed');
        emit('aparte-compact-start', { messageId: 'u2' });
        expect(bubbleOf(viewport, 'u1').hasAttribute('data-checkpoint'), 'the failure is cleared by the next attempt').toBe(false);
        expect(bubbleOf(viewport, 'u1').hasAttribute('data-checkpoint-reason')).toBe(false);
        expect(bubbleOf(viewport, 'u2').getAttribute('data-checkpoint')).toBe('pending');
    });

    it('is cleared by a conversation switch', () => {
        const { viewport } = mount();
        transcript(viewport);
        emit('aparte-compact-start', { messageId: 'u2' });
        viewport.setMessages([turn('u9', 'user'), turn('a9', 'assistant')]);
        emit('aparte-compact-done', { messageId: 'u9' });
        expect(viewport.querySelector('[data-checkpoint]')).toBeNull();
        expect(viewport.querySelector('.aparte-checkpoint')).toBeNull();

        // And a later done for the old id finds nothing to clear and nothing to do.
        transcript(viewport);
        emit('aparte-compact-start', { messageId: 'u2' });
        viewport.clearAll();
        transcript(viewport);
        expect(viewport.querySelector('[data-checkpoint]'), 'the new transcript starts clean').toBeNull();
    });

    it('stops listening when the viewport leaves the page', () => {
        const { viewport, chat } = mount();
        transcript(viewport);
        const bubble = bubbleOf(viewport, 'u2');
        chat.remove();
        emit('aparte-compact-start', { messageId: 'u2' });
        expect(bubble.hasAttribute('data-checkpoint')).toBe(false);
    });
});

describe('Restore', () => {
    it('removes the checkpoint from every message of the path and says it was restored', () => {
        const { viewport } = mount('chat-1');
        viewport.setMessages([
            turn('u1', 'user', { contextSummary: first }), turn('a1', 'assistant'),
            turn('u2', 'user', { contextSummary: second }), turn('a2', 'assistant'),
            turn('u3', 'user'), turn('a3', 'assistant'),
        ]);
        expect(viewport.querySelectorAll('.aparte-checkpoint')).toHaveLength(2);
        const done = vi.fn();
        window.addEventListener('aparte-compact-done', done);

        // Pressed on the newer separator; the older one goes with it.
        bubbleOf(viewport, 'u2').querySelector<HTMLButtonElement>('[data-checkpoint-action="restore"]')!.click();
        expect(done, 'asking is not restoring').not.toHaveBeenCalled();
        bubbleOf(viewport, 'u2').querySelector<HTMLButtonElement>('[data-checkpoint-action="restore-confirm"]')!.click();

        expect(viewport.querySelectorAll('.aparte-checkpoint'), 'no separator is left').toHaveLength(0);
        expect(viewport.getMessages().filter((m) => m.contextSummary), 'and no message carries one').toHaveLength(0);
        expect(done).toHaveBeenCalledTimes(1);
        expect((done.mock.calls[0]![0] as CustomEvent).detail).toEqual({ restored: true, messageId: 'u2', targetId: 'chat-1' });
        window.removeEventListener('aparte-compact-done', done);
    });

    it('leaves the messages themselves on screen', () => {
        const { viewport } = mount();
        viewport.setMessages([turn('u1', 'user', { contextSummary: first }), turn('a1', 'assistant')]);
        bubbleOf(viewport, 'u1').querySelector<HTMLButtonElement>('[data-checkpoint-action="restore"]')!.click();
        bubbleOf(viewport, 'u1').querySelector<HTMLButtonElement>('[data-checkpoint-action="restore-confirm"]')!.click();
        expect(bubbleOf(viewport, 'u1').querySelector('.aparte-message')!.textContent).toContain('user u1');
        expect(viewport.getMessages().map((m) => m.id)).toEqual(['u1', 'a1']);
    });
});
