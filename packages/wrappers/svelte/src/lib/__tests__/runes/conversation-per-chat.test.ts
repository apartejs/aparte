/**
 * What the Svelte 5 `<AparteChat>` does with the conversation it is given, and with a `config`
 * that changes. React's suite of the same name says why.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick } from 'svelte';
import {
    AparteClient, AparteConfig, registerAllComponents, resolveConfig,
    type AparteChatImperativeApi, type AparteConversation, type AparteMessage, type AparteStorageAdapter,
} from '@aparte/core';
import ConversationPerChatHost from './ConversationPerChatHost.svelte';
import ConfigHost from './ConfigHost.svelte';

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

describe('<AparteChat config>', () => {
    it('follows a new config, once the turn in flight has ended', async () => {
        const first = new AparteConfig();
        const second = new AparteConfig();
        const { component, rerender } = render(ConfigHost, { props: { config: first } });
        await tick();
        const root = (component as unknown as { api(): AparteChatImperativeApi }).api().getElement()!;
        expect(resolveConfig(root)).toBe(first);

        await rerender({ config: second });
        expect(resolveConfig(root)).toBe(second);

        root.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } }));
        await rerender({ config: first });
        expect(resolveConfig(root)).toBe(second);
        root.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'r1' } }));
        expect(resolveConfig(root)).toBe(first);
    });
});
