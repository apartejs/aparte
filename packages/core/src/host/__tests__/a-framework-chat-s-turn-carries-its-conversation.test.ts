// @vitest-environment jsdom
/**
 * Under a framework, a turn carries the conversation open in the chat.
 *
 * The four wrappers share one host (`AparteChatHost`), which owns the conversation
 * controller and takes the chat's `conversationId` prop; the client reads which
 * conversation is open from that controller at the moment the person sends. One suite on
 * the host stands for all four — and for what the person does that no prop says: opening
 * a conversation from the list, which moves the chat without the app's state hearing of it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteClient } from '../../client/aparte-client.js';
import type { AparteStreamRunOptions } from '../../client/stream-adapter.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteConversationManager } from '../../conversations/conversation-manager.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteMessage } from '../../types/index.js';
import type { AparteConversation, AparteStorageAdapter } from '../../conversations/types.js';

const stored = (id: string): AparteConversation => ({ id, title: id, createdAt: 1, updatedAt: 1, messages: [] });

async function setup() {
    const rows = [stored('c1'), stored('c2')];
    const adapter: AparteStorageAdapter = {
        async loadAll() { return rows; },
        async save(conv: AparteConversation) {
            const i = rows.findIndex((c) => c.id === conv.id);
            if (i >= 0) rows[i] = conv; else rows.push(conv);
        },
        async delete(id: string) { const i = rows.findIndex((c) => c.id === id); if (i >= 0) rows.splice(i, 1); },
    };
    const config = new AparteConfig();
    const manager = new AparteConversationManager(adapter);
    config.setConversationManager(manager);
    await manager.init();

    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = 'h1';
    const viewport = document.createElement('aparte-chat-viewport');
    viewport.setAttribute('framework-managed', '');
    root.appendChild(viewport);
    document.body.appendChild(root);
    await vi.waitFor(() => expect(typeof (viewport as unknown as { exportTree?: unknown }).exportTree).toBe('function'));

    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h1', host: root, viewport,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const created: string[] = [];
    const host = new AparteChatHost(binding, { config, onConversationCreated: (id) => created.push(id) });
    const teardown = host.bind();

    const seen: AparteStreamRunOptions[] = [];
    const client = new AparteClient({
        config,
        autoRegister: false,
        // What the wrappers pass: the host appends the user's message, the client does not.
        echoUserMessage: false,
        streamRunner: async (opts) => {
            seen.push(opts);
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: 'ok' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done' });
            return undefined;
        },
    });
    client.start();

    const send = (content: string) => root.dispatchEvent(new CustomEvent('aparte-send', {
        detail: { content, targetId: 'h1', timestamp: Date.now() }, bubbles: true, composed: true,
    }));
    return { host, manager, created, seen, send, ids: () => messages.map((m) => m.id), stop: () => { client.stop(); teardown(); } };
}

const select = (id: string | null): void => {
    window.dispatchEvent(new CustomEvent('aparte-conversation-select', { detail: { id } }));
};

describe('a turn under a framework', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('carries the conversation the chat was given', async () => {
        const chat = await setup();
        await chat.host.setConversationId('c1');
        chat.send('hello');
        await vi.waitFor(() => expect(chat.seen).toHaveLength(1));
        expect(chat.seen[0]!.conversationId).toBe('c1');
        chat.stop();
    });

    it('carries the conversation the person opened from the list, whatever the app\'s state says', async () => {
        const chat = await setup();
        await chat.host.setConversationId('c1');
        // The list dispatches this and the controller loads it; no prop moved.
        select('c2');
        await vi.waitFor(() => expect(chat.manager.activeId).toBe('c2'));
        chat.send('hello');
        await vi.waitFor(() => expect(chat.seen).toHaveLength(1));
        expect(chat.seen[0]!.conversationId).toBe('c2');
        chat.stop();
    });

    it('carries the conversation a first message creates, which the callback names too', async () => {
        const chat = await setup();
        chat.send('the first message of a new chat');
        await vi.waitFor(() => expect(chat.seen).toHaveLength(1));
        await vi.waitFor(() => expect(chat.created).toHaveLength(1));
        expect(chat.seen[0]!.conversationId).toBe(chat.created[0]);
        chat.stop();
    });

    it('carries the new conversation, not the one left, after the person starts a new chat', async () => {
        const chat = await setup();
        await chat.host.setConversationId('c1');
        await chat.host.setConversationId(null);
        // A new chat is not a conversation yet: the id on the turn is the one the send creates.
        chat.send('a new chat');
        await vi.waitFor(() => expect(chat.seen).toHaveLength(1));
        await vi.waitFor(() => expect(chat.created).toHaveLength(1));
        expect(chat.seen[0]!.conversationId).not.toBe('c1');
        expect(chat.seen[0]!.conversationId).toBe(chat.created[0]);
        chat.stop();
    });
});
