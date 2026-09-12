// @vitest-environment jsdom
/**
 * A conversation restored from a TREE renders like the same words streamed.
 *
 * `appendMessage` runs the markdown a reply arrived as through the stream's own parser
 * — a fence becomes a `code` segment, `<think>` a reasoning block — and its docblock
 * names the three paths it covers: "a loop of your own, a store's `setMessages`, an
 * `importTree`". `importTree` was the one it did not do: it went straight to the
 * repository, raw. And the controller runs `setMessages` THEN `importTree`, so on every
 * conversation it had ever persisted a tree for, the raw snapshot won and the code card
 * came back as bare prose.
 *
 * The other half of the same seam: a message whose segments core DERIVED says so, with
 * the non-enumerable `APARTE_DERIVED_SEGMENTS` marker. Merely opening a conversation
 * must not make it look changed to the store (it re-saved and floated to the top of the
 * sidebar), and the marker is how the comparison tells a derived array from one the
 * host wrote.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';
import '../../bubble/aparte-chat-bubble.js';
import { APARTE_DERIVED_SEGMENTS } from '../../../types/models.js';
import type { AparteMessage, AparteSegment } from '../../../types/index.js';
import type { ExportedMessageRepository } from '../../../runtime/message-repository.js';

type ViewportEl = HTMLElement & {
    appendMessage(m: AparteMessage, o?: { historical?: boolean }): void;
    setMessages(m: AparteMessage[]): void;
    importTree(tree: ExportedMessageRepository): void;
    getMessage(id: string): AparteMessage | undefined;
    getMessages(): AparteMessage[];
};

const FENCED = 'Here is one:\n\n```ts\nconst a = 1;\n```\n\nThat is all.';

const reply = (id: string, content: string): AparteMessage =>
    ({ id, role: 'assistant', content, timestamp: 1 });

async function mount(): Promise<ViewportEl> {
    const vp = document.createElement('aparte-chat-viewport') as never as ViewportEl;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.importTree).toBe('function'));
    return vp;
}

const tree = (messages: AparteMessage[]): ExportedMessageRepository => ({
    headId: messages[messages.length - 1]!.id,
    messages: messages.map((message, i) => ({ message, parentId: i === 0 ? null : messages[i - 1]!.id })),
});

describe('a conversation restored from a tree', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('splits a markdown reply into segments, like setMessages does', async () => {
        const vp = await mount();
        const stored = [{ id: 'u1', role: 'user', content: 'show me', timestamp: 1 } as AparteMessage, reply('a1', FENCED)];
        // The controller's exact order: the flat list, then the branch topology.
        vp.setMessages(stored);
        vp.importTree(tree(stored));
        expect((vp.getMessage('a1')?.segments ?? []).map((s: AparteSegment) => s.type)).toEqual(['text', 'code', 'text']);
    });

    it('marks the messages whose segments it derived, and only those', async () => {
        const vp = await mount();
        const authored: AparteMessage = {
            id: 'a2', role: 'assistant', content: 'x', timestamp: 1,
            segments: [{ id: 's1', type: 'text', content: 'x' } as AparteSegment],
        };
        vp.setMessages([reply('a1', FENCED), authored]);
        const [derived, own] = vp.getMessages();
        expect((derived as unknown as Record<symbol, unknown>)[APARTE_DERIVED_SEGMENTS]).toBe(true);
        expect((own as unknown as Record<symbol, unknown>)[APARTE_DERIVED_SEGMENTS]).toBeUndefined();
    });

    it('keeps the marker off the wire: it survives neither a spread nor JSON', async () => {
        const vp = await mount();
        vp.setMessages([reply('a1', FENCED)]);
        const stored = vp.getMessages()[0]!;
        expect(({ ...stored } as Record<symbol, unknown>)[APARTE_DERIVED_SEGMENTS]).toBeUndefined();
        expect(Object.keys(JSON.parse(JSON.stringify(stored)))).not.toContain('aparte.derivedSegments');
    });

    it('marks them on the tree path too', async () => {
        const vp = await mount();
        vp.importTree(tree([reply('a1', FENCED)]));
        expect((vp.getMessage('a1') as unknown as Record<symbol, unknown>)[APARTE_DERIVED_SEGMENTS]).toBe(true);
    });
});
