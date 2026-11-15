// @vitest-environment jsdom
/**
 * `aparte-segment-update` fires once per streamed chunk, the hottest dispatch in core. It names
 * the chat it came from (`targetId`), which takes a climb up the DOM; the viewport climbs once
 * per connection, not once per chunk, and climbs again when it is moved to another chat.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-viewport.js';
import type { AparteMessage } from '../../../types/index.js';

interface ViewportEl extends HTMLElement {
    appendMessage(m: AparteMessage): void;
    appendToSegment(messageId: string, segmentId: string, chunk: string): void;
}

function chatWith(id: string): HTMLElement {
    const chat = document.createElement('div');
    chat.id = id;
    chat.setAttribute('data-aparte-chat', '');
    document.body.append(chat);
    return chat;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('aparte-segment-update', () => {
    it('names its chat on every chunk, after one climb per connection', () => {
        const chat = chatWith('chat-a');
        const vp = document.createElement('aparte-chat-viewport') as ViewportEl;
        chat.append(vp);
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1, segments: [{ id: 's1', type: 'text', content: '' }] });
        const named: Array<string | undefined> = [];
        vp.addEventListener('aparte-segment-update', (e) => named.push((e as CustomEvent<{ targetId?: string }>).detail.targetId));
        let climbs = 0;
        const own = vp.getAttribute.bind(vp);
        vp.getAttribute = (name: string) => {
            if (name === 'target') climbs++;
            return own(name);
        };

        for (const chunk of ['a', 'b', 'c', 'd']) vp.appendToSegment('m1', 's1', chunk);
        expect(named).toEqual(['chat-a', 'chat-a', 'chat-a', 'chat-a']);
        expect(climbs).toBeLessThanOrEqual(1);

        chatWith('chat-b').append(vp);
        vp.appendToSegment('m1', 's1', 'e');
        expect(named.at(-1)).toBe('chat-b');
    });
});
