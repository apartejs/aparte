import { describe, it, expect } from 'vitest';

/**
 * Streaming a segment must not count a chunk twice.
 *
 * `appendToSegment` writes twice on purpose: straight into the bubble so the text
 * appears now, and into the framework's message list coalesced once per frame. The
 * trap: the framework list and the bubble hold the **same segment objects** (the one
 * `addSegment` handed to both), so the immediate paint's `content += chunk` already
 * lands in the model — and the coalesced write then added the same chunk on top.
 * Every chunk came out doubled ("BonjourBonjour le le monde"), reported from a real
 * app as "the first word shows up twice".
 *
 * The existing host suite missed it because it mocks the viewport (`appendToSegment:
 * vi.fn()`): a paint that writes nothing cannot double-count. So this file drives the
 * REAL viewport and the REAL bubble, and asserts the two views agree.
 */

import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';
import { AparteChatHost } from '../aparte-chat-host.js';
import { registerDefaultRenderers } from '../../renderers/segment-renderers.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

registerDefaultRenderers();

/** A host bound the way a framework wrapper binds it: the list round-trips. */
function setup() {
    const host = document.createElement('div');
    const viewport = document.createElement('aparte-chat-viewport');
    host.appendChild(viewport);
    document.body.appendChild(host);

    let messages: AparteMessage[] = [];

    // The framework owns the DOM here (setFrameworkManagedDOM), so the bubbles are
    // rendered by the "framework" — this harness — exactly as a wrapper does on
    // re-render. Real <aparte-chat-bubble> elements, so the immediate paint has a
    // real target and the rendered text can be asserted.
    const renderBubbles = (): void => {
        const have = new Set<string>();
        viewport.querySelectorAll('aparte-chat-bubble').forEach((b) => have.add(b.getAttribute('message-id') ?? ''));
        for (const m of messages) {
            if (have.has(m.id)) continue;
            const bubble = document.createElement('aparte-chat-bubble');
            bubble.setAttribute('message-id', m.id);
            bubble.setAttribute('data-role', m.role);
            viewport.appendChild(bubble);
        }
    };

    const h = new AparteChatHost({
        hostId: `probe-${Math.random().toString(36).slice(2)}`,
        host,
        viewport,
        getMessages: () => messages,
        setMessages: (m) => {
            messages = m;
            // What every wrapper does on re-render: push the new list back down.
            (viewport as unknown as { setMessages?(m: AparteMessage[]): void }).setMessages?.(m);
            renderBubbles();
        },
        afterRender: (cb) => cb(),
    });
    h.bind();
    return { h, host, viewport, read: () => messages };
}

/** Let the coalesced flush run (rAF in a browser, macrotask in jsdom). */
const frame = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

const textOf = (m: AparteMessage | undefined): string =>
    ((m?.segments?.[0] as { content?: string } | undefined)?.content ?? '');

describe('coalesced stream sync vs the immediate paint', () => {
    it('a segment streamed one chunk per frame keeps its exact text', async () => {
        const { h, read } = setup();
        h.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1 });
        h.addSegment({ id: 's1', type: 'text', content: '' } as AparteSegment);

        for (const chunk of ['Bonjour', ' le', ' monde']) {
            h.appendToSegment('s1', chunk);
            await frame();
        }

        expect(textOf(read()[0])).toBe('Bonjour le monde');
    });

    it('a segment streamed three chunks inside ONE frame keeps its exact text', async () => {
        const { h, read } = setup();
        h.appendMessage({ id: 'a2', role: 'assistant', content: '', timestamp: 1 });
        h.addSegment({ id: 's1', type: 'text', content: '' } as AparteSegment);

        h.appendToSegment('s1', 'Bonjour');
        h.appendToSegment('s1', ' le');
        h.appendToSegment('s1', ' monde');
        await frame();

        expect(textOf(read()[0])).toBe('Bonjour le monde');
    });

    it('a segment that already carries text keeps it, and appends after it', async () => {
        const { h, read } = setup();
        h.appendMessage({ id: 'a3', role: 'assistant', content: '', timestamp: 1 });
        h.addSegment({ id: 's1', type: 'text', content: 'Bonjour' } as AparteSegment);

        h.appendToSegment('s1', ' le monde');
        await frame();

        expect(textOf(read()[0])).toBe('Bonjour le monde');
    });

    it('what the framework list holds is what the bubble shows', async () => {
        const { h, viewport, read } = setup();
        h.appendMessage({ id: 'a4', role: 'assistant', content: '', timestamp: 1 });
        h.addSegment({ id: 's1', type: 'text', content: '' } as AparteSegment);

        for (const chunk of ['Bon', 'jour ', 'le monde']) {
            h.appendToSegment('s1', chunk);
            await frame();
        }

        const bubble = viewport.querySelector('aparte-chat-bubble');
        const rendered = (bubble?.textContent ?? '').replace(/\s+/g, ' ').trim();
        expect(textOf(read()[0])).toBe('Bonjour le monde');
        // The rendered text may carry the name/timestamp around it; what matters is
        // that the streamed text appears once, not twice.
        expect(rendered).toContain('Bonjour le monde');
        expect(rendered).not.toContain('BonBon');
    });

    it('plain-text streaming stays exact too (the symmetric path)', async () => {
        const { h, read } = setup();
        h.appendMessage({ id: 'a5', role: 'assistant', content: '', timestamp: 1 });
        async function* src(): AsyncGenerator<string> { yield 'Bonjour'; yield ' le'; yield ' monde'; }

        await h.streamTokens('a5', src());
        await frame();

        expect(read()[0]?.content).toBe('Bonjour le monde');
    });
});
