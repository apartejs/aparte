// @vitest-environment jsdom
/**
 * A framework wrapper draws the wait itself, so the host has to TELL it: the
 * controller's `setLoading` reaches the binding as `onLoadingChange(on)`, beside the
 * viewport's attribute. Without it a React/Vue/Svelte/Angular chat had no skeleton, an
 * empty state that showed over a loading conversation, and a composer that took a
 * message the arriving transcript then overwrote.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteConversationManager } from '../../conversations/conversation-manager.js';
import type { AparteMessage } from '../../types/index.js';
// From the module that defines them: the types barrel carries the element/segment
// surface, not the storage contract.
import type { AparteConversation, AparteStorageAdapter } from '../../conversations/types.js';

const conv: AparteConversation = {
    id: 'c1', title: 'One', createdAt: 1, updatedAt: 1,
    messages: [{ id: 'm1', role: 'user', timestamp: 1, content: 'hi' } as AparteMessage],
};

describe('the host binding while a conversation is on its way', () => {
    it('hears onLoadingChange(true) before the fetch and (false) after the messages are set', async () => {
        let release: () => void = () => {};
        const adapter: AparteStorageAdapter = {
            async loadAll() { return [conv]; },
            async loadMeta() { const { messages: _m, ...meta } = conv; return [meta]; },
            async loadFull() { await new Promise<void>((r) => { release = r; }); return conv; },
            async save() {}, async delete() {},
        };
        const config = new AparteConfig();
        const manager = new AparteConversationManager(adapter);
        config.setConversationManager(manager);
        await manager.init();

        const host = document.createElement('aparte-chat');
        document.body.appendChild(host);
        let messages: AparteMessage[] = [];
        const events: Array<[string, unknown]> = [];
        const binding: AparteChatHostBinding = {
            hostId: 'h1', host, viewport: null,
            getMessages: () => messages,
            setMessages: (m) => { messages = m as AparteMessage[]; events.push(['messages', m.length]); },
            onMessagesChange: () => {}, onMessageAppended: () => {}, onTypingChange: () => {}, onStreamingChange: () => {},
            afterRender: (cb) => cb(), resetComposer: vi.fn(),
            onLoadingChange: (on) => events.push(['loading', on]),
        };
        const chat = new AparteChatHost(binding, { config });
        const teardown = chat.bind();

        window.dispatchEvent(new CustomEvent('aparte-conversation-select', { detail: { id: 'c1' } }));
        await vi.waitFor(() => expect(events).toContainEqual(['loading', true]));
        release();
        await vi.waitFor(() => expect(events).toContainEqual(['loading', false]));
        expect(events.map(([k, v]) => `${k}:${v}`)).toEqual(['loading:true', 'messages:0', 'messages:1', 'loading:false']);
        teardown();
    });
});
