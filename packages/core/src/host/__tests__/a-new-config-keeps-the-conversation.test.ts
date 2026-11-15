// @vitest-environment jsdom
/**
 * A chat given another config keeps what it shows and keeps saving it.
 *
 * The controller resolves its conversation manager from the config on the host, so a new
 * config can bring another manager, or none. Read blindly, the next manager's first emit did
 * not list the open conversation and emptied the transcript, and a config without a manager
 * saved nothing from then on. Now the open conversation is opened again from the new manager
 * when that manager holds it; otherwise the chat keeps the manager it had for it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteConversationManager } from '../../conversations/conversation-manager.js';
import type { AparteMessage } from '../../types/index.js';
import type { AparteConversation, AparteStorageAdapter } from '../../conversations/types.js';

function store(seed: AparteConversation[] = []) {
    const rows = seed.map((c) => ({ ...c }));
    const adapter: AparteStorageAdapter = {
        async loadAll() { return rows.map((c) => ({ ...c })); },
        async save(conv: AparteConversation) {
            const i = rows.findIndex((c) => c.id === conv.id);
            if (i >= 0) rows[i] = conv; else rows.push(conv);
        },
        async delete(id: string) { const i = rows.findIndex((c) => c.id === id); if (i >= 0) rows.splice(i, 1); },
    };
    return { rows, adapter };
}

const said = (id: string, content: string): AparteMessage => ({ id, role: 'user', content, timestamp: 1 });
const conversation = (content: string): AparteConversation =>
    ({ id: 'c1', title: 'One', messages: [said('u1', content)], createdAt: 1, updatedAt: 1 } as AparteConversation);

async function configWith(seed?: AparteConversation[]) {
    const config = new AparteConfig();
    if (!seed) return { config, manager: null, rows: [] as AparteConversation[] };
    const { rows, adapter } = store(seed);
    const manager = new AparteConversationManager(adapter);
    config.setConversationManager(manager);
    await manager.init();
    return { config, manager, rows };
}

async function chat(config: AparteConfig) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    let messages: AparteMessage[] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h-keep', host: root, viewport: null,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        afterRender: (cb) => cb(),
    };
    const host = new AparteChatHost(binding, { config, conversationId: 'c1' });
    const stop = host.bind();
    await vi.waitFor(() => expect(messages.map((m) => m.content)).toEqual(['first']));
    /** Something new said in the chat, then saved the way a branch change saves. */
    const say = async (content: string) => {
        messages = [...messages, said(`u${messages.length + 1}`, content)];
        root.dispatchEvent(new CustomEvent('aparte-path-changed'));
        await new Promise((r) => setTimeout(r, 0));
    };
    return { host, root, stop, say, messages: () => messages.map((m) => m.content) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { document.body.innerHTML = ''; });

describe('AparteChatHost.setConfig and the conversation manager', () => {
    it('opens the conversation again from a new manager that holds it, and saves there', async () => {
        const a = await configWith([conversation('first')]);
        const b = await configWith([conversation('first, as the other store has it')]);
        const c = await chat(a.config);

        c.host.setConfig(b.config);
        await vi.waitFor(() => expect(c.messages()).toEqual(['first, as the other store has it']));
        await c.say('second');
        expect(b.rows[0]!.messages.map((m) => m.content)).toEqual(['first, as the other store has it', 'second']);
        expect(a.rows[0]!.messages.map((m) => m.content)).toEqual(['first']);
        c.stop();
    });

    it('waits for a new manager still loading its list before it asks it', async () => {
        const a = await configWith([conversation('first')]);
        const { adapter } = store([conversation('first, from the store still loading')]);
        const late = new AparteConversationManager(adapter);
        const b = new AparteConfig();
        b.setConversationManager(late);
        const c = await chat(a.config);

        c.host.setConfig(b);
        await settle();
        expect(c.messages()).toEqual(['first']);
        await late.init();
        await vi.waitFor(() => expect(c.messages()).toEqual(['first, from the store still loading']));
        c.stop();
    });

    it('keeps the transcript, and saves to the manager it had, when the new one does not hold the conversation', async () => {
        const a = await configWith([conversation('first')]);
        const b = await configWith([]);
        const c = await chat(a.config);

        c.host.setConfig(b.config);
        await settle();
        // The new manager speaks: its list does not name the open conversation.
        await b.manager!.createNew('elsewhere');
        await settle();
        expect(c.messages()).toEqual(['first']);
        await c.say('second');
        expect(a.rows[0]!.messages.map((m) => m.content)).toEqual(['first', 'second']);
        expect(b.rows.some((r) => r.id === 'c1')).toBe(false);
        c.stop();
    });

    it('keeps saving to the manager it had when the new config has none', async () => {
        const a = await configWith([conversation('first')]);
        const b = await configWith();
        const c = await chat(a.config);

        c.host.setConfig(b.config);
        await settle();
        expect(c.messages()).toEqual(['first']);
        await c.say('second');
        expect(a.rows[0]!.messages.map((m) => m.content)).toEqual(['first', 'second']);
        c.stop();
    });

    it('opens the next conversation from the new manager once the kept one is left', async () => {
        const a = await configWith([conversation('first')]);
        const other = { ...conversation('other'), id: 'c2' } as AparteConversation;
        const b = await configWith([other]);
        const c = await chat(a.config);

        c.host.setConfig(b.config);
        await settle();
        await c.host.setConversationId('c2');
        expect(c.messages()).toEqual(['other']);
        c.stop();
    });

    it('attaches nothing again for the config it already has', async () => {
        const a = await configWith([conversation('first')]);
        const c = await chat(a.config);
        const heard = vi.fn();
        window.addEventListener('aparte-config-change', heard);
        c.host.setConfig(a.config);
        window.removeEventListener('aparte-config-change', heard);
        expect(heard).not.toHaveBeenCalled();
        expect(c.messages()).toEqual(['first']);
        c.stop();
    });
});
