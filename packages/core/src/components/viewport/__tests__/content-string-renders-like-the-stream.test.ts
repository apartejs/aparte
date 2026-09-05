/**
 * A message handed over as a markdown STRING renders like the same words streamed.
 *
 * Two paths existed for one grammar. The stream goes through `AparteStreamParser`: a
 * fence becomes a `code` segment (the card, the filename, the language, the copy
 * button), `<think>` becomes a reasoning block. A message that arrived with `content`
 * and no `segments` — `appendMessage` from a loop of your own, `setMessages` from a
 * store, `importTree` — went through the prose renderer instead, and the same fence
 * came out as a bare `<pre>`. The guide even told the consumer to call
 * `parseMarkdownToSegments` by hand before appending. Core knows the grammar; it applies
 * it on both paths.
 *
 * A user's message is not parsed: its text is its own, fences included. A plain reply
 * with nothing to split keeps the cheap content path.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';
import '../../bubble/aparte-chat-bubble.js';
import type { AparteMessage, AparteSegment } from '../../../types/index.js';

type ViewportEl = HTMLElement & {
    appendMessage(m: AparteMessage, o?: { historical?: boolean }): void;
    setMessages(m: AparteMessage[]): void;
    getMessages(): AparteMessage[];
};
type BubbleEl = HTMLElement & { getSegments(): AparteSegment[] };

const FENCED = 'Here is one:\n\n```ts\nconst a = 1;\n```\n\nThat is all.';
const THOUGHT = '<think>Weigh the two options.</think>\n\nThe second one.';

async function mount(): Promise<ViewportEl> {
    const vp = document.createElement('aparte-chat-viewport') as never as ViewportEl;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
    return vp;
}

const bubble = (vp: ViewportEl): BubbleEl => vp.querySelector('aparte-chat-bubble') as BubbleEl;
const message = (role: AparteMessage['role'], content: string): AparteMessage =>
    ({ id: `${role}-1`, role, content, timestamp: 1 });

describe('a content string renders like the stream', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('a fence in an assistant reply becomes a code segment, with its card', async () => {
        const vp = await mount();
        vp.appendMessage(message('assistant', FENCED));
        await vi.waitFor(() => expect(bubble(vp).getSegments().map((s) => s.type)).toEqual(['text', 'code', 'text']));
        expect(bubble(vp).querySelector('.aparte-segment-code .aparte-code-header')).not.toBeNull();
        expect(bubble(vp).querySelector('.aparte-code-copy')).not.toBeNull();
        const code = bubble(vp).getSegments()[1] as AparteSegment & { language?: string; content: string };
        expect(code.language).toBe('ts');
        expect(code.content).toBe('const a = 1;');
    });

    it('a <think> block in an assistant reply becomes a reasoning segment', async () => {
        const vp = await mount();
        vp.appendMessage(message('assistant', THOUGHT));
        await vi.waitFor(() => expect(bubble(vp).getSegments().map((s) => s.type)).toEqual(['thinking', 'text']));
        expect(bubble(vp).querySelector('.aparte-segment-thinking')).not.toBeNull();
    });

    it('a reply with nothing to split keeps the content path', async () => {
        const vp = await mount();
        vp.appendMessage(message('assistant', 'Just **prose**, with `inline` code.'));
        await vi.waitFor(() => expect(bubble(vp)).not.toBeNull());
        expect(bubble(vp).getSegments()).toEqual([]);
        expect(vp.getMessages()[0]?.segments).toBeUndefined();
    });

    it("a user's message is not parsed: its fences are its own", async () => {
        const vp = await mount();
        vp.appendMessage(message('user', FENCED));
        await vi.waitFor(() => expect(bubble(vp)).not.toBeNull());
        expect(bubble(vp).getSegments()).toEqual([]);
        expect(bubble(vp).querySelector('.aparte-segment-code')).toBeNull();
    });

    it('setMessages — a conversation from a store — takes the same path, as history', async () => {
        const vp = await mount();
        vp.setMessages([message('user', 'Show me.'), { ...message('assistant', FENCED), id: 'a-1' }]);
        await vi.waitFor(() => expect(vp.querySelectorAll('aparte-chat-bubble')).toHaveLength(2));
        const reply = vp.querySelectorAll('aparte-chat-bubble')[1] as BubbleEl;
        await vi.waitFor(() => expect(reply.getSegments().map((s) => s.type)).toEqual(['text', 'code', 'text']));
        const stored = vp.getMessages()[1];
        expect(stored?.segments?.map((s) => s.type)).toEqual(['text', 'code', 'text']);
        // History: nothing here is starting now, so no live stamp on the segments.
        expect(stored?.segments?.[1]?.meta?.aparte?.startedAt).toBeUndefined();
    });
});
