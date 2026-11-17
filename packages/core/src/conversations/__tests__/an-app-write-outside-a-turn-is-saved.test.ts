// @vitest-environment jsdom
/**
 * What the app writes outside a turn is saved.
 *
 * The controller saved on a send, the end of a turn, a path change and a compaction.
 * During a human takeover no turn runs: an advisor's replies, a "Marie joined" notice and
 * a "Read by Marie" note were lost on reload. The host and the viewport now say
 * `aparte-transcript-change` when the app writes outside a turn, and the controller saves.
 * And a message for a conversation that is not open goes into its stored tree, which is
 * what a reopened conversation reads, not only into its flat list.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import type { AparteConversation } from '../types.js';
import type { AparteMessage } from '../../types/index.js';
import '../../components/viewport/aparte-chat-viewport.js';

const u1: AparteMessage = { id: 'u1', role: 'user', content: 'hi', timestamp: 1 };
const a1: AparteMessage = { id: 'a1', role: 'assistant', content: 'hello', status: 'completed', timestamp: 2 };
const h1: AparteMessage = { id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'Marie here.', timestamp: 3 };
const conv = (messages: AparteMessage[], extra: Partial<AparteConversation> = {}): AparteConversation =>
    ({ id: 'c', title: 'c', createdAt: 1, updatedAt: 1, messages, ...extra });

describe('the controller', () => {
    it('saves when the transcript changes outside a turn', async () => {
        const saved: AparteConversation[] = [];
        const manager = new AparteConversationManager({ loadAll: async () => [conv([u1, a1])], save: async (c) => { saved.push(structuredClone(c)); }, delete: async () => {} });
        await manager.init();
        const host = document.createElement('div');
        document.body.appendChild(host);
        let messages: AparteMessage[] = [];
        const b: AparteChatBinding = {
            hostId: 'host', host,
            setMessages: (m) => { messages = m; }, appendMessage: (m) => { messages.push(m); },
            getMessages: () => messages, clearMessages: () => { messages = []; }, setLoading: () => {},
        };
        const controller = new AparteConversationController(b, { manager });
        controller.bind();
        await controller.setConversationId('c');

        b.appendMessage(h1);
        host.dispatchEvent(new CustomEvent('aparte-transcript-change', { detail: { messageId: 'h1', change: 'append' }, bubbles: true }));

        await vi.waitFor(() => expect(saved.at(-1)?.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'h1']));
        controller.unbind();
        host.remove();
    });
});

describe('the bare viewport', () => {
    it('says once that the transcript changed, for each write outside a turn', async () => {
        const vp = document.createElement('aparte-chat-viewport') as HTMLElement & {
            appendMessage(m: AparteMessage): void; updateMessage(id: string, u: Partial<AparteMessage>): void;
        };
        document.body.appendChild(vp);
        await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
        const changes: unknown[] = [];
        document.body.addEventListener('aparte-transcript-change', (e) => changes.push((e as CustomEvent).detail));

        vp.appendMessage(h1);
        vp.updateMessage('h1', { note: 'Read by Marie' });
        expect(changes).toMatchObject([{ messageId: 'h1', change: 'append' }, { messageId: 'h1', change: 'update' }]);

        // Not for the AI's empty shell, nor while a turn streams.
        vp.appendMessage({ id: 'r1', role: 'assistant', content: '', timestamp: 4 });
        vp.updateMessage('r1', { status: 'streaming' });
        vp.appendMessage({ id: 'h2', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'And this.', timestamp: 5 });
        expect(changes).toHaveLength(2);
        vp.remove();
    });
});

describe('a conversation that is not open', () => {
    it('gets a message into its stored tree, which a reopened conversation reads', async () => {
        const saved: AparteConversation[] = [];
        const tree = { headId: 'a1', messages: [{ message: u1, parentId: null }, { message: a1, parentId: 'u1' }] };
        const manager = new AparteConversationManager({ loadAll: async () => [conv([u1, a1], { tree })], save: async (c) => { saved.push(structuredClone(c)); }, delete: async () => {} });
        await manager.init();

        await manager.addMessage('c', h1);

        const stored = saved.at(-1)!;
        expect(stored.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'h1']);
        expect(stored.tree?.headId).toBe('h1');
        expect(stored.tree?.messages.find((n) => n.message.id === 'h1')?.parentId).toBe('a1');
    });
});
