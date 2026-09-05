// @vitest-environment jsdom
/**
 * A streamed segment is written to the bubble of the message it belongs to — or to no
 * bubble at all, never to the one next to it.
 *
 * The host wrote through `_lastBubble()`: the last `<aparte-chat-bubble>` in the DOM.
 * Under a framework the DOM is a render behind the list — `appendMessage` adds the new
 * reply to React's state and React paints it on its own schedule — so the first chunk of
 * a follow-up arrived while the last bubble on the page was still the PREVIOUS reply. It
 * went in there, and when the framework then rendered the new one, `syncBubbles` put the
 * same segment on it too: one `data-segment-id`, two bubbles.
 *
 * Skipping the write costs nothing: the message list is updated either way, and
 * `syncBubbles` — which the framework calls after every render, and which always re-syncs
 * the last message — paints it the moment the bubble exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

type BubbleEl = HTMLElement & { getSegments(): AparteSegment[] };

const message = (id: string, role: AparteMessage['role'], content = ''): AparteMessage =>
    ({ id, role, content, timestamp: 1 });

async function setup() {
    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = 'h1';
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { addMessage?: unknown }).addMessage).toBe('function'));

    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h1', host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, {});
    const teardown = host.bind();

    /** What a framework does on its own schedule: paint the bubbles its list asks for. */
    const render = (): void => {
        for (const m of messages) {
            if (viewport.querySelector(`aparte-chat-bubble[message-id="${m.id}"]`)) continue;
            const bubble = document.createElement('aparte-chat-bubble');
            bubble.setAttribute('message-id', m.id);
            bubble.setAttribute('data-role', m.role);
            viewport.appendChild(bubble);
        }
        host.syncBubbles();
    };
    const bubble = (id: string): BubbleEl =>
        viewport.querySelector(`aparte-chat-bubble[message-id="${id}"]`) as BubbleEl;
    return { host, teardown, render, bubble };
}

describe('a segment streamed before its bubble exists', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('never lands in the previous reply', async () => {
        const { host, teardown, render, bubble } = await setup();
        host.appendMessage(message('u1', 'user', 'first'));
        host.appendMessage(message('a1', 'assistant', 'the first answer'));
        render();

        // The follow-up: the list has it, the framework has not painted it yet.
        host.appendMessage(message('a2', 'assistant'));
        host.addSegment({ id: 's1', type: 'text', content: 'the new answer' } as AparteSegment);

        expect(bubble('a1').getSegments(), 'the finished reply is untouched').toEqual([]);

        render();
        expect(bubble('a2').getSegments().map((s) => s.id), 'and the new one gets it on paint').toEqual(['s1']);
        expect(bubble('a1').getSegments(), 'still untouched').toEqual([]);
        expect(
            document.querySelectorAll('[data-segment-id="s1"]').length,
            'one segment, one bubble',
        ).toBeLessThanOrEqual(1);
        teardown();
    });

    it('reaches the bubble directly once it is on the page', async () => {
        const { host, teardown, render, bubble } = await setup();
        host.appendMessage(message('u1', 'user', 'first'));
        host.appendMessage(message('a1', 'assistant'));
        render();

        host.addSegment({ id: 's1', type: 'text', content: 'writing' } as AparteSegment);
        expect(bubble('a1').getSegments().map((s) => s.id)).toEqual(['s1']);

        host.updateSegment('s1', { content: 'writing more' });
        expect((bubble('a1').getSegments()[0] as { content?: string })?.content).toBe('writing more');

        host.removeSegment('s1');
        expect(bubble('a1').getSegments()).toEqual([]);
        teardown();
    });
});
