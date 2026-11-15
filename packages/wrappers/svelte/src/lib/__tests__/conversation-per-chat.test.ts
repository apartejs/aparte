/**
 * What the Svelte 4 `<AparteChat>` does with the conversation it is given, and with a `config`
 * that changes. React's suite of the same name says why.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import {
    AparteClient, AparteConfig, AparteConversationManager, registerAllComponents, resolveConfig,
    type AparteChatImperativeApi, type AparteConversation, type AparteMessage, type AparteStorageAdapter,
} from '@aparte/core';
import AparteChat from '../AparteChat.svelte';
import ConversationPerChatHost from './ConversationPerChatHost.svelte';

registerAllComponents();

/** What a bubble reads: the text, whether the message carries it in `content` or in text segments. */
const textOf = (m: AparteMessage): string =>
    m.content || (m.segments ?? []).map((s) => (s.type === 'text' ? (s as { content?: string }).content ?? '' : '')).join('');

function memoryAdapter(): AparteStorageAdapter {
    const store = new Map<string, AparteConversation>();
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

/** A manager that holds c1 loaded, as it does once a chat that had it open is gone. */
async function heldConversation(config: AparteConfig): Promise<AparteConversationManager> {
    const adapter = memoryAdapter();
    await adapter.save({
        id: 'c1', title: 'one', createdAt: 1, updatedAt: 1,
        messages: [
            { id: 'u1', role: 'user', content: 'hello', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: 'Hello', timestamp: 2 },
        ],
    });
    const manager = new AparteConversationManager(adapter);
    await manager.init();
    config.setConversationManager(manager);
    expect(manager.isLoaded('c1')).toBe(true);
    return manager;
}

function gatedClient(config: AparteConfig, chatId: string) {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const client = new AparteClient({
        config,
        autoRegister: false,
        scopeToTargetId: chatId,
        streamRunner: async (opts) => {
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'turn-start' });
            opts.emitter({ type: 'text-delta', delta: 'Hel' });
            await gate;
            opts.emitter({ type: 'text-delta', delta: 'lo' });
            opts.emitter({ type: 'text-flush' });
            opts.emitter({ type: 'run-done' });
            return undefined;
        },
    });
    client.start();
    return { client, release };
}

afterEach(() => cleanup());

describe.each(['created', 'activeId'] as const)('<AparteChat> given back the conversation it created (bound to %s)', (bound) => {
    it('keeps the first reply in its bubble and the person\'s message in place', async () => {
        const config = new AparteConfig();
        const { client, release } = gatedClient(config, 'chat-a');
        const seen: Array<string | null> = [];
        const { component, container } = render(ConversationPerChatHost, { props: { config, adapter: memoryAdapter(), bound, seen } });
        const api = () => (component as unknown as { api(): AparteChatImperativeApi | undefined }).api();
        await vi.waitFor(() => expect(api()).toBeTruthy());
        await tick();

        container.querySelector('aparte-composer')!.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content: 'hello', targetId: 'chat-a', timestamp: Date.now() }, bubbles: true, composed: true,
        }));
        await vi.waitFor(() => expect(seen.at(-1)).toBeTruthy());
        await vi.waitFor(() => expect(api()!.isStreaming()).toBe(true));
        release();
        await vi.waitFor(() => expect(api()!.isStreaming()).toBe(false));

        expect(api()!.getMessages().map((m) => [m.role, textOf(m)])).toEqual([['user', 'hello'], ['assistant', 'Hello']]);
        expect(api()!.getConversationId()).toBe(seen.at(-1));
        client.stop();
    });
});

describe('<AparteChat conversationId> on a conversation the manager holds', () => {
    it('draws it, without a setConversationId after mount', async () => {
        const config = new AparteConfig();
        await heldConversation(config);
        const { component, container } = render(AparteChat, { props: { id: 'chat-b', config, conversationId: 'c1' } });
        const chat = component as unknown as AparteChatImperativeApi;
        await vi.waitFor(() => expect(chat.getMessages().map((m) => [m.role, textOf(m)])).toEqual([['user', 'hello'], ['assistant', 'Hello']]));
        await new Promise((r) => setTimeout(r, 20));
        await tick();
        expect(chat.getConversationId()).toBe('c1');
        expect(chat.getMessages()).toHaveLength(2);
        expect(container.querySelectorAll('aparte-chat-bubble')).toHaveLength(2);
    });
});

describe('<AparteChat config>', () => {
    it('follows a new config, once the turn in flight has ended', async () => {
        const first = new AparteConfig();
        const second = new AparteConfig();
        const { component } = render(AparteChat, { props: { id: 'chat-c', config: first } });
        await tick();
        const chat = component as unknown as AparteChatImperativeApi & { $set: (p: object) => void };
        const root = chat.getElement()!;
        expect(resolveConfig(root)).toBe(first);

        chat.$set({ config: second });
        await tick();
        expect(resolveConfig(root)).toBe(second);

        root.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } }));
        chat.$set({ config: first });
        await tick();
        expect(resolveConfig(root)).toBe(second);
        root.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'r1' } }));
        expect(resolveConfig(root)).toBe(first);
    });
});
