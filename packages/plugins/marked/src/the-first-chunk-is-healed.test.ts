/**
 * The first chunk of a streamed reply is completed by remend, like every chunk after it.
 *
 * Core drew a new text segment through the one-shot provider and handed it to the streaming
 * renderer only from its second chunk. With this entry the one-shot provider is marked
 * WITHOUT remend, so a reply whose first chunk was `Done: **Book ` showed the `**` until the
 * next chunk arrived. Found on a SvelteKit tutorial's scripted model by recording the DOM.
 * Both ways a segment reaches a bubble are covered: the vanilla viewport adds it, a framework
 * host redraws the bubble with the message. The stream parser's text carries no
 * `isStreaming` flag, and neither does any segment here. The bubble is core's own (its
 * source, through this package's test alias).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, populateBubbleFromMessage, type AparteMessage } from '@aparte/core';
import { setupMarkedStreamingProvider } from './streaming.js';

type Bubble = HTMLElement & {
    addSegment(segment: { id: string; type: 'text'; content: string }): void;
    updateSegment(id: string, updates: { content?: string; isStreaming?: boolean }): void;
    updateMessage(updates: Record<string, unknown>): void;
};

function mount(): Bubble {
    setupMarkedStreamingProvider();
    const bubble = document.createElement('aparte-chat-bubble') as Bubble;
    bubble.setAttribute('message-id', 'm1');
    bubble.setAttribute('data-role', 'assistant');
    document.body.appendChild(bubble);
    bubble.updateMessage({ status: 'streaming' });
    return bubble;
}

const contentOf = (bubble: Bubble): Element => bubble.querySelector('[data-segment-id="t1"] .aparte-segment-content')!;

describe('a reply streamed through marked is bold from its first chunk', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('when the segment is added to the bubble', () => {
        const bubble = mount();
        bubble.addSegment({ id: 't1', type: 'text', content: 'Done: **Book ' });
        expect(contentOf(bubble).querySelector('strong')?.textContent).toBe('Book');
        expect(contentOf(bubble).textContent).not.toContain('**');

        bubble.updateSegment('t1', { content: 'Done: **Book the dentist** is on your list.' });
        bubble.updateMessage({ status: 'completed' });
        expect(contentOf(bubble).querySelectorAll('strong')).toHaveLength(1);
        expect(contentOf(bubble).textContent?.trim()).toBe('Done: Book the dentist is on your list.');
    });

    it('when a framework host redraws the bubble with the message', () => {
        const bubble = mount();
        const message = (content: string, status = 'streaming'): AparteMessage =>
            ({ id: 'm1', role: 'assistant', status, content: '', segments: [{ id: 't1', type: 'text', content }] }) as AparteMessage;

        populateBubbleFromMessage(bubble, message('Done: **Book '));
        expect(contentOf(bubble).querySelector('strong')?.textContent).toBe('Book');
        expect(contentOf(bubble).textContent).not.toContain('**');

        populateBubbleFromMessage(bubble, message('Done: **Book the dentist** is on your list.'));
        populateBubbleFromMessage(bubble, message('Done: **Book the dentist** is on your list.', 'completed'));
        expect(contentOf(bubble).querySelectorAll('strong')).toHaveLength(1);
        expect(contentOf(bubble).textContent?.trim()).toBe('Done: Book the dentist is on your list.');
    });
});
