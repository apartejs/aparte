// @vitest-environment jsdom
/**
 * A chat created with `conversationId` draws that conversation, also when the conversation
 * manager already holds it loaded.
 *
 * Several chats share one manager. Chat A creates a conversation with its first message and is
 * destroyed; a new chat is created on that conversation. The manager has its messages in memory
 * (A had it open), so the controller takes the path that fetches nothing and writes the messages
 * at once, during `bind()`. The host-level half of the contract: the binding holds them, and the
 * transcript is not emptied afterwards. Each wrapper pins its own mount path on top of this.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteClient } from '../../client/aparte-client.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteConversationManager } from '../../conversations/conversation-manager.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteMessage } from '../../types/index.js';
import type { AparteConversation, AparteStorageAdapter } from '../../conversations/types.js';

const textOf = (m: AparteMessage): string =>
    m.content || (m.segments ?? []).map((s) => (s.type === 'text' ? (s as { content?: string }).content ?? '' : '')).join('');

async function mountChat(id: string, config: AparteConfig, conversationId: string | null) {
    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = id;
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { exportTree?: unknown }).exportTree).toBe('function'));
    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: id, host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, { config, conversationId });
    const teardown = host.bind();
    return { root, host, messages: () => messages, destroy: () => { teardown(); root.remove(); } };
}

describe('a chat created on a conversation the manager holds', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('draws its messages, as a chat created on a fetched one does', async () => {
        const rows: AparteConversation[] = [];
        const adapter: AparteStorageAdapter = {
            async loadAll() { return rows; },
            async save(conv) { const i = rows.findIndex((c) => c.id === conv.id); if (i >= 0) rows[i] = conv; else rows.push(conv); },
            async delete(id) { const i = rows.findIndex((c) => c.id === id); if (i >= 0) rows.splice(i, 1); },
        };
        const config = new AparteConfig();
        const manager = new AparteConversationManager(adapter);
        config.setConversationManager(manager);
        await manager.init();
        const client = new AparteClient({
            config, autoRegister: false, echoUserMessage: false,
            streamRunner: async (opts) => {
                opts.emitter({ type: 'run-start' });
                opts.emitter({ type: 'turn-start' });
                opts.emitter({ type: 'text-delta', delta: 'Hello' });
                opts.emitter({ type: 'text-flush' });
                opts.emitter({ type: 'run-done' });
                return undefined;
            },
        });
        client.start();

        // Chat A creates c1 with its first message, then goes away.
        const a = await mountChat('a', config, null);
        a.root.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hi', targetId: 'a', timestamp: Date.now() }, bubbles: true, composed: true,
        }));
        await vi.waitFor(() => expect(a.host.isStreaming).toBe(false));
        await vi.waitFor(() => expect(manager.conversations[0]?.messages).toHaveLength(2));
        const c1 = a.host.getConversationId()!;
        expect(manager.isLoaded(c1)).toBe(true);
        a.destroy();

        // A new chat on c1: the manager holds it, nothing is fetched.
        const b = await mountChat('b', config, c1);
        expect(b.host.getConversationId()).toBe(c1);
        await vi.waitFor(() => expect(b.messages().map((m) => [m.role, textOf(m)])).toEqual([['user', 'hi'], ['assistant', 'Hello']]));
        // Nothing empties it on the way, and the stored record is untouched.
        await new Promise((r) => setTimeout(r, 20));
        expect(b.messages()).toHaveLength(2);
        expect(rows.find((c) => c.id === c1)?.messages).toHaveLength(2);
        b.destroy();
        client.stop();
    });
});
