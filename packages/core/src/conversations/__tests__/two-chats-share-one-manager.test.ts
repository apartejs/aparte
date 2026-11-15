// @vitest-environment jsdom
/**
 * Several chats live on one page, and one conversation manager lists their conversations.
 *
 * The manager has ONE `activeId`, which every chat's controller writes when it opens or
 * creates a conversation: it says which chat moved last, not which conversation a given chat
 * shows. A chat's first message used to fall back on it — to save the message, to say which
 * conversation the turn belongs to, to mark the list's row — so with two chats it could join
 * the conversation the OTHER chat had open, or the one the other chat was creating at the
 * same moment. A chat reads its own conversation only: the one it opened, or the one its
 * first message is creating.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import { AparteConversationManager } from '../conversation-manager.js';
import { openConversationOf } from '../open-conversation.js';
import type { AparteConversation, AparteStorageAdapter } from '../types.js';
import type { AparteMessage } from '../../types/index.js';

class MemoryAdapter implements AparteStorageAdapter {
    store = new Map<string, AparteConversation>();
    async loadAll() { return [...this.store.values()]; }
    async save(c: AparteConversation) { this.store.set(c.id, structuredClone(c)); }
    async delete(id: string) { this.store.delete(id); }
}

function chat(id: string) {
    const host = document.createElement('div');
    host.id = id;
    document.body.appendChild(host);
    let messages: AparteMessage[] = [];
    const binding: AparteChatBinding = {
        hostId: id,
        host,
        setMessages: (m) => { messages = [...m]; },
        appendMessage: (m) => { messages = [...messages, m]; },
        getMessages: () => messages,
        clearMessages: () => { messages = []; },
    };
    return { host, binding, messages: () => messages };
}

const send = (host: HTMLElement, content: string) => host.dispatchEvent(new CustomEvent('aparte-send', {
    detail: { content, targetId: host.id, timestamp: Date.now() }, bubbles: true, composed: true,
}));

const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('two chats on one conversation manager', () => {
    let adapter: MemoryAdapter;
    let manager: AparteConversationManager;
    const unbinds: Array<() => void> = [];

    beforeEach(async () => {
        document.body.innerHTML = '';
        adapter = new MemoryAdapter();
        await adapter.save({ id: 'c1', title: 'one', createdAt: 1, updatedAt: 1, messages: [] });
        manager = new AparteConversationManager(adapter);
        await manager.init();
    });
    afterEach(() => { for (const u of unbinds.splice(0)) u(); });

    function controller(c: ReturnType<typeof chat>) {
        const ctl = new AparteConversationController(c.binding, { manager });
        unbinds.push(ctl.bind());
        return ctl;
    }

    it('a first message does not join the conversation the other chat has open', async () => {
        const a = chat('a');
        const b = chat('b');
        const ctlA = controller(a);
        const ctlB = controller(b);
        await ctlB.setConversationId(null);
        await ctlA.setConversationId('c1');
        expect(manager.activeId).toBe('c1');

        send(b.host, 'hello from b');
        await settle();

        expect(ctlA.activeId).toBe('c1');
        expect(ctlB.activeId).not.toBeNull();
        expect(ctlB.activeId).not.toBe('c1');
        // c1 holds nothing of b's, and b's message is in b's own conversation.
        expect(manager.conversations.find((c) => c.id === 'c1')?.messages ?? []).toHaveLength(0);
        const own = manager.conversations.find((c) => c.id === ctlB.activeId);
        expect(own?.messages.map((m) => m.content)).toEqual(['hello from b']);
    });

    it('two first messages sent together make two conversations, one each', async () => {
        const a = chat('a');
        const b = chat('b');
        const ctlA = controller(a);
        const ctlB = controller(b);

        send(a.host, 'from a');
        send(b.host, 'from b');
        await settle();

        expect(ctlA.activeId).not.toBeNull();
        expect(ctlB.activeId).not.toBeNull();
        expect(ctlA.activeId).not.toBe(ctlB.activeId);
        expect(manager.conversations.find((c) => c.id === ctlA.activeId)?.messages.map((m) => m.content)).toEqual(['from a']);
        expect(manager.conversations.find((c) => c.id === ctlB.activeId)?.messages.map((m) => m.content)).toEqual(['from b']);
    });

    it('while its first message creates the conversation, a chat says it is that one, not the other chat\'s', async () => {
        const a = chat('a');
        const b = chat('b');
        controller(a);
        const ctlB = controller(b);

        send(a.host, 'from a');
        // Read where the client reads it, right after the send, before anything resolves.
        const aOpen = openConversationOf(a.host);
        send(b.host, 'from b');
        const bOpen = openConversationOf(b.host);
        expect(aOpen).not.toBeNull();
        expect(bOpen).not.toBeNull();
        expect(bOpen).not.toBe(aOpen);
        expect(ctlB.pendingId).toBe(bOpen);
        // The first message the second chat sent did not make it read the first chat's one.
        expect(openConversationOf(a.host)).toBe(aOpen);
        await settle();
        expect(ctlB.activeId).toBe(bOpen);
        expect(ctlB.pendingId).toBeNull();
    });

    it('a turn that starts with the first message marks its own chat\'s row', async () => {
        const a = chat('a');
        const b = chat('b');
        const ctlA = controller(a);
        controller(b);
        await ctlA.setConversationId('c1');
        const marked: Array<string | null> = [];
        const onStatus = (e: Event) => {
            const d = (e as CustomEvent<{ id: string; status: string | null }>).detail;
            if (d.status === 'running') marked.push(d.id);
        };
        window.addEventListener('aparte-conversation-status', onStatus);
        try {
            send(b.host, 'from b');
            b.host.dispatchEvent(new CustomEvent('aparte-message-start', { detail: { messageId: 'r1' } }));
            await settle();
        } finally {
            window.removeEventListener('aparte-conversation-status', onStatus);
        }
        expect(marked).toHaveLength(1);
        expect(marked[0]).not.toBe('c1');
    });

    it('a chat that came and went leaves the other the only one on the manager', async () => {
        const a = chat('a');
        const b = chat('b');
        controller(a);
        const gone = new AparteConversationController(b.binding, { manager });
        gone.bind()();
        const created = await manager.createNew('');
        send(a.host, 'hello');
        await settle();
        expect(manager.conversations.find((c) => c.id === created.id)?.messages.map((m) => m.content)).toEqual(['hello']);
    });
});

describe('one chat on a conversation manager', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('a first message joins the empty conversation the app created on the manager itself', async () => {
        const adapter = new MemoryAdapter();
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const a = chat('a');
        const ctl = new AparteConversationController(a.binding, { manager });
        const unbind = ctl.bind();
        const created = await manager.createNew('');

        send(a.host, 'hello');
        await settle();
        expect(ctl.activeId).toBe(created.id);
        expect(manager.conversations).toHaveLength(1);
        expect(manager.conversations[0]!.messages.map((m) => m.content)).toEqual(['hello']);
        expect(openConversationOf(a.host)).toBe(created.id);
        unbind();
    });

    it('a first message does not join a conversation that already holds messages', async () => {
        const adapter = new MemoryAdapter();
        await adapter.save({ id: 'kept', title: 'kept', createdAt: 1, updatedAt: 1, messages: [{ id: 'm', role: 'user', content: 'old', timestamp: 1 }] });
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        manager.select('kept');
        const a = chat('a');
        const ctl = new AparteConversationController(a.binding, { manager });
        const unbind = ctl.bind();

        send(a.host, 'hello');
        await settle();
        expect(ctl.activeId).not.toBe('kept');
        expect(manager.conversations.find((c) => c.id === 'kept')!.messages.map((m) => m.content)).toEqual(['old']);
        unbind();
    });
});
