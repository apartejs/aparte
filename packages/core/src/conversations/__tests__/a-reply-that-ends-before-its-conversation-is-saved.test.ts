// @vitest-environment jsdom
/**
 * A reply that ends before its conversation exists is saved with it.
 *
 * The first send creates the conversation, and the creation waits for the list to load:
 * a store that answers in its own time (a server, IndexedDB, the examples' adapter) can
 * still be loading it. A fast reply — a scripted one, a cached one, a short answer — then
 * ends while there is no active conversation to save it into, and the save at the end of
 * the turn did nothing. The conversation, created a moment later, held the question
 * alone: left and opened again, the answer was gone. The browser suites caught it as a
 * flake (the reopened transcript held only "what is the weather?"); it is a lost reply.
 */
import { describe, it, expect } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import type { AparteConversation } from '../types.js';
import type { AparteMessage } from '../../types/index.js';

function chatHost() {
    const host = document.createElement('div');
    host.id = 'host';
    document.body.appendChild(host);
    let messages: AparteMessage[] = [];
    const binding: AparteChatBinding = {
        hostId: 'host', host,
        setMessages: (m) => { messages = structuredClone(m); },
        appendMessage: (m) => { messages.push(m); },
        getMessages: () => messages,
        clearMessages: () => { messages = []; },
        setLoading: () => {},
    };
    return { host, binding, push: (m: AparteMessage) => messages.push(m) };
}

describe('a reply that ends before its conversation is created', () => {
    it('is saved with the question once the conversation exists', async () => {
        const saved = new Map<string, AparteConversation>();
        // The list is still loading when the person sends.
        let listLoaded!: () => void;
        const loading = new Promise<void>((resolve) => { listLoaded = resolve; });
        const manager = new AparteConversationManager({
            loadAll: async () => { await loading; return []; },
            save: async (c) => { saved.set(c.id, structuredClone(c)); },
            delete: async () => {},
        });
        void manager.init();
        const { host, binding, push } = chatHost();
        const controller = new AparteConversationController(binding, { manager });
        controller.bind();

        host.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'what is the weather?', targetId: 'host' }, bubbles: true }));
        // The whole turn, before the conversation exists.
        host.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } }));
        push({ id: 'r1', role: 'assistant', content: 'Sunny, 21°C.', timestamp: 2, status: 'completed' });
        host.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'r1' } }));
        await Promise.resolve();

        listLoaded();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));

        const [record] = [...saved.values()];
        expect(record?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
        expect(record?.messages[1]?.content).toBe('Sunny, 21°C.');
    });

    it('leaves a reply still streaming to the end of its turn', async () => {
        const saved = new Map<string, AparteConversation>();
        const writes: string[][] = [];
        const manager = new AparteConversationManager({
            loadAll: async () => [],
            save: async (c) => { saved.set(c.id, structuredClone(c)); writes.push(c.messages.map((m) => m.status ?? 'completed')); },
            delete: async () => {},
        });
        await manager.init();
        const { host, binding, push } = chatHost();
        const controller = new AparteConversationController(binding, { manager });
        controller.bind();

        host.dispatchEvent(new CustomEvent('aparte-send', { detail: { content: 'hello', targetId: 'host' }, bubbles: true }));
        host.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } }));
        push({ id: 'r1', role: 'assistant', content: 'Hel', timestamp: 2, status: 'streaming' });
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Created while the reply streams: the question alone, the reply waits for its end.
        const [record] = [...saved.values()];
        expect(record?.messages.map((m) => m.role)).toEqual(['user']);
    });
});
