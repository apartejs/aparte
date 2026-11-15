/**
 * What `<AparteChat>` does with the conversation it is given, and with a `config` that changes.
 *
 * - The documented pattern hands the conversation a first message created back to the chat
 *   (`conversationId={id}` + `onConversationCreated={setId}`) while the first reply streams.
 *   It used to reload the conversation then, and the reply landed in the person's bubble.
 * - `getConversationId()` says which conversation this chat shows, which the manager's one
 *   `activeId` cannot say once there are two chats.
 * - A new `config` is honoured, and waits for a turn in flight to end.
 */
import React, { useState } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import {
    AparteClient, AparteConfig, AparteConversationManager, registerAllComponents, resolveConfig,
    type AparteChatImperativeApi, type AparteConversation, type AparteMessage, type AparteStorageAdapter,
} from '@aparte/core';
import { AparteChat } from '../components/AparteChat';

registerAllComponents();

/** What a bubble reads: the text, whether the message carries it in `content` or in text segments. */
const textOf = (m: AparteMessage): string =>
    m.content || (m.segments ?? []).map((s) => (s.type === 'text' ? (s as { content?: string }).content ?? '' : '')).join('');

async function configWithManager(): Promise<{ config: AparteConfig; manager: AparteConversationManager }> {
    const store = new Map<string, AparteConversation>();
    const adapter: AparteStorageAdapter = {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
    const manager = new AparteConversationManager(adapter);
    await manager.init();
    const config = new AparteConfig();
    config.setConversationManager(manager);
    return { config, manager };
}

/** A client whose reply stops half-way until `release()`. */
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

function send(container: HTMLElement, chatId: string, content: string) {
    container.querySelector('aparte-composer')!.dispatchEvent(new CustomEvent('aparte-send', {
        detail: { content, targetId: chatId, timestamp: Date.now() }, bubbles: true, composed: true,
    }));
}

afterEach(() => cleanup());

describe('<AparteChat> given back the conversation it created', () => {
    it('keeps the first reply in its bubble and the person\'s message in place', async () => {
        const { config } = await configWithManager();
        const { client, release } = gatedClient(config, 'chat-a');
        const ref = React.createRef<AparteChatImperativeApi>();
        const seen: Array<string | null> = [];
        function Page() {
            const [id, setId] = useState<string | null>(null);
            seen.push(id);
            return <AparteChat ref={ref} id="chat-a" config={config} conversationId={id} onConversationCreated={setId} />;
        }
        const { container } = render(<Page />);

        act(() => send(container, 'chat-a', 'hello'));
        // The id comes back, through the app's state, while the reply streams.
        await waitFor(() => expect(seen.at(-1)).not.toBeNull());
        expect(ref.current!.isStreaming()).toBe(true);
        await act(async () => release());
        await waitFor(() => expect(ref.current!.isStreaming()).toBe(false));

        expect(ref.current!.getMessages().map((m) => [m.role, textOf(m)])).toEqual([['user', 'hello'], ['assistant', 'Hello']]);
        expect(ref.current!.getConversationId()).toBe(seen.at(-1));
        client.stop();
    });

    it('says which conversation it shows, each chat its own', async () => {
        const { config, manager } = await configWithManager();
        const a = gatedClient(config, 'chat-a');
        const b = gatedClient(config, 'chat-b');
        const refA = React.createRef<AparteChatImperativeApi>();
        const refB = React.createRef<AparteChatImperativeApi>();
        const { container } = render(<>
            <div id="wrap-a"><AparteChat ref={refA} id="chat-a" config={config} /></div>
            <div id="wrap-b"><AparteChat ref={refB} id="chat-b" config={config} /></div>
        </>);
        act(() => {
            send(container.querySelector('#wrap-a') as HTMLElement, 'chat-a', 'from a');
            send(container.querySelector('#wrap-b') as HTMLElement, 'chat-b', 'from b');
        });
        await act(async () => { a.release(); b.release(); });
        await waitFor(() => expect(manager.conversations).toHaveLength(2));
        await waitFor(() => expect(refA.current!.isStreaming() || refB.current!.isStreaming()).toBe(false));
        const idA = refA.current!.getConversationId();
        const idB = refB.current!.getConversationId();
        expect(idA).not.toBeNull();
        expect(idB).not.toBeNull();
        expect(idA).not.toBe(idB);
        a.client.stop();
        b.client.stop();
    });
});

describe('<AparteChat conversationId> on a conversation the manager holds', () => {
    // Chat A creates c1 and is unmounted; a new chat is mounted on c1. The manager holds it
    // loaded, so the host writes its messages during the mount effect — and the mount-time run
    // of the `messages` effect took the initial `[]` prop for a push from the parent and emptied
    // the transcript, while `getConversationId()` said c1.
    it('draws it, without a setConversationId after mount', async () => {
        const { config, manager } = await configWithManager();
        const { client, release } = gatedClient(config, 'chat-a');
        const refA = React.createRef<AparteChatImperativeApi>();
        const first = render(<AparteChat ref={refA} id="chat-a" config={config} />);
        act(() => send(first.container, 'chat-a', 'hello'));
        await act(async () => release());
        await waitFor(() => expect(refA.current!.isStreaming()).toBe(false));
        await waitFor(() => expect(manager.conversations[0]?.messages).toHaveLength(2));
        const c1 = refA.current!.getConversationId()!;
        expect(manager.isLoaded(c1)).toBe(true);
        first.unmount();
        client.stop();

        const refB = React.createRef<AparteChatImperativeApi>();
        const { container } = render(<AparteChat ref={refB} id="chat-b" config={config} conversationId={c1} />);
        expect(refB.current!.getConversationId()).toBe(c1);
        await waitFor(() => expect(refB.current!.getMessages().map((m) => [m.role, textOf(m)])).toEqual([['user', 'hello'], ['assistant', 'Hello']]));
        expect(container.querySelectorAll('aparte-chat-bubble')).toHaveLength(2);
        expect(manager.conversations.find((c) => c.id === c1)?.messages).toHaveLength(2);
    });
});

describe('<AparteChat config>', () => {
    it('follows a new config, once the turn in flight has ended', async () => {
        const first = new AparteConfig();
        const second = new AparteConfig();
        const ref = React.createRef<AparteChatImperativeApi>();
        const { rerender } = render(<AparteChat ref={ref} id="chat-c" config={first} />);
        const root = ref.current!.getElement()!;
        expect(resolveConfig(root)).toBe(first);

        rerender(<AparteChat ref={ref} id="chat-c" config={second} />);
        expect(resolveConfig(root)).toBe(second);

        // A turn starts: a config given now waits for its end.
        act(() => { root.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } })); });
        rerender(<AparteChat ref={ref} id="chat-c" config={first} />);
        expect(resolveConfig(root)).toBe(second);
        act(() => { root.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId: 'r1' } })); });
        expect(resolveConfig(root)).toBe(first);
    });
});
