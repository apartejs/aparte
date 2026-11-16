// @vitest-environment jsdom
/**
 * A message the app appends while a reply streams does not take the reply's writes.
 *
 * `appendMessage` moves the head, and the 1-argument convention (`addSegment(segment)`)
 * resolved "the message being streamed" as the head — so the viewport refused every
 * write after an advisor's message or a notice arrived, and the reply lost its tail.
 * When exactly one turn is open and it is on the active path, the writes go to it. Two
 * open turns (a retry superseded one) are still refused: see
 * `a-superseded-turn-keeps-its-own-bubble.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';
import '../../bubble/aparte-chat-bubble.js';
import type { AparteMessage, AparteSegment } from '../../../types/index.js';

type ViewportEl = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    updateMessage(id: string, u: Partial<AparteMessage>): void;
    updateLastMessage(content: string, options?: { append?: boolean }): void;
    addSegment(s: AparteSegment): void;
    getMessage(id: string): AparteMessage | undefined;
};

const seg = (id: string, content: string): AparteSegment => ({ id, type: 'text', content } as AparteSegment);

async function mount(): Promise<ViewportEl> {
    const vp = document.createElement('aparte-chat-viewport') as never as ViewportEl;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
    return vp;
}

describe('a message appended while a reply streams, on the bare viewport', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it("keeps writing the reply into the reply", async () => {
        const vp = await mount();
        vp.appendMessage({ id: 'u1', role: 'user', content: 'q', timestamp: 1 });
        vp.appendMessage({ id: 'r1', role: 'assistant', content: '', timestamp: 2 });
        vp.updateMessage('r1', { status: 'streaming' });
        vp.addSegment(seg('s1', 'first'));

        vp.appendMessage({ id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'Hello', timestamp: 3 });
        vp.addSegment(seg('s2', 'from the AI'));

        expect((vp.getMessage('r1')?.segments ?? []).map((s) => s.id)).toEqual(['s1', 's2']);
        expect(vp.getMessage('h1')?.segments ?? []).toEqual([]);
    });

    it("sets the reply's content, not the last message's, while it streams", async () => {
        const vp = await mount();
        vp.appendMessage({ id: 'r1', role: 'assistant', content: '', timestamp: 1 });
        vp.updateMessage('r1', { status: 'streaming' });
        vp.appendMessage({ id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'Hello', timestamp: 2 });

        vp.updateLastMessage('tail', { append: true });

        expect(vp.getMessage('r1')?.content).toBe('tail');
        expect(vp.getMessage('h1')?.content).toBe('Hello');
    });
});
