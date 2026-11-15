// @vitest-environment jsdom
/**
 * The conversation a chat creates, handed back to it as its `conversationId`, changes nothing.
 *
 * The documented pattern keeps the open conversation in the app's state and gives it back to
 * the chat: `conversationId={id}` with `onConversationCreated={setId}`, or the prop bound to the
 * conversation manager's `activeId`. Either way the id the chat's first message created comes
 * back as a prop while the first reply streams. Taken as a new id to open, it reloaded the
 * conversation from the manager, which did not hold the reply yet: the transcript was replaced
 * under the stream, the reply's text landed in the person's bubble, the person's message was
 * gone, and Send stayed disabled.
 *
 * The bound-to-`activeId` case comes back EARLIER: the manager names the new conversation
 * before the creation resolves, so the prop arrives before the chat itself holds the id. One
 * suite on the host stands for the five wrappers, which all forward the prop to
 * `syncConversationId`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteClient } from '../../client/aparte-client.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteConversationManager } from '../../conversations/conversation-manager.js';
import '../../components/viewport/aparte-chat-viewport.js';
import type { AparteMessage } from '../../types/index.js';
import type { AparteConversation, AparteStorageAdapter } from '../../conversations/types.js';

type HandBack = 'onConversationCreated' | 'the manager\'s activeId';

/** What a bubble reads: the text, whether the message carries it in `content` or in text segments. */
const textOf = (m: AparteMessage): string =>
    m.content || (m.segments ?? []).map((s) => (s.type === 'text' ? (s as { content?: string }).content ?? '' : '')).join('');

async function setup(handBack: HandBack) {
    const rows: AparteConversation[] = [];
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
    let host: AparteChatHost | null = null;
    const handedBack: string[] = [];
    host = new AparteChatHost(binding, {
        config,
        // What a wrapper does with its prop: the app set it from the callback.
        onConversationCreated: (id) => {
            if (handBack !== 'onConversationCreated') return;
            handedBack.push(id);
            void host?.syncConversationId(id);
        },
    });
    // What a wrapper does with its prop when the app binds it to the manager's `activeId`:
    // the hook's state follows the manager's notifications.
    const stopWatching = manager.subscribe(() => {
        if (handBack !== 'the manager\'s activeId' || !manager.activeId) return;
        handedBack.push(manager.activeId);
        void host?.syncConversationId(manager.activeId);
    });
    const teardown = host.bind();

    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const client = new AparteClient({
        config,
        autoRegister: false,
        echoUserMessage: false,
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

    const send = (content: string) => root.dispatchEvent(new CustomEvent('aparte-send', {
        detail: { content, targetId: 'h1', timestamp: Date.now() }, bubbles: true, composed: true,
    }));
    return {
        host, manager, handedBack, send, release,
        messages: () => messages,
        stop: () => { client.stop(); stopWatching(); teardown(); },
    };
}

describe.each<HandBack>(['onConversationCreated', 'the manager\'s activeId'])('the created id handed back through %s', (handBack) => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('leaves the first reply streaming into its own bubble, and the person\'s message in place', async () => {
        const chat = await setup(handBack);
        chat.send('hello');
        // The id came back while the reply was still streaming.
        await vi.waitFor(() => expect(chat.handedBack.length).toBeGreaterThan(0));
        await vi.waitFor(() => expect(chat.host.isStreaming).toBe(true));
        chat.release();
        await vi.waitFor(() => expect(chat.host.isStreaming).toBe(false));

        const [user, reply, ...rest] = chat.messages();
        expect(rest).toEqual([]);
        expect([user!.role, textOf(user!)]).toEqual(['user', 'hello']);
        expect([reply!.role, textOf(reply!)]).toEqual(['assistant', 'Hello']);
        // The chat holds the conversation it created, and that is the one handed back.
        expect(chat.host.getConversationId()).toBe(chat.handedBack[0]);
        chat.stop();
    });

    it('saves the turn into the conversation it created', async () => {
        const chat = await setup(handBack);
        chat.send('hello');
        await vi.waitFor(() => expect(chat.host.isStreaming).toBe(true));
        chat.release();
        await vi.waitFor(() => expect(chat.host.isStreaming).toBe(false));
        await vi.waitFor(() => {
            const conv = chat.manager.conversations.find((c) => c.id === chat.host.getConversationId());
            expect(conv?.messages.map((m) => [m.role, textOf(m)])).toEqual([['user', 'hello'], ['assistant', 'Hello']]);
        });
        expect(chat.manager.conversations).toHaveLength(1);
        chat.stop();
    });
});

describe('syncConversationId', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('opens an id the chat does not hold, as setConversationId does', async () => {
        const chat = await setup('onConversationCreated');
        const first = await chat.manager.createNew('first');
        await chat.host.syncConversationId(first.id);
        expect(chat.host.getConversationId()).toBe(first.id);
        await chat.host.syncConversationId(null);
        expect(chat.host.getConversationId()).toBeNull();
        chat.stop();
    });
});
