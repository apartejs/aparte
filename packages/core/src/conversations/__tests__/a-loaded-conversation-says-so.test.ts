// @vitest-environment jsdom
/**
 * A loaded conversation says so.
 *
 * `aparte-conversation-loaded` fires on the chat's host once a conversation's messages
 * are on screen — the moment to resume a turn a server loop paused, to scroll, to
 * measure. Nothing said it before: a page had to guess from `setMessages`. It does not
 * fire for a load that failed, nor for one the user left before it came back.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import type { AparteConversation, AparteConversationMeta, AparteStorageAdapter } from '../types.js';
import type { AparteMessage } from '../../types/index.js';

const msg = (id: string, content: string): AparteMessage => ({ id, role: 'user', content, timestamp: 1 });
const conv = (id: string, ...messages: AparteMessage[]): AparteConversation => ({ id, title: id, createdAt: 1, updatedAt: 1, messages });
const meta = ({ messages: _m, ...rest }: AparteConversation): AparteConversationMeta => rest;

function binding() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let messages: AparteMessage[] = [];
    const loaded: { targetId: string; conversationId: string }[] = [];
    host.addEventListener('aparte-conversation-loaded', (e) => loaded.push((e as CustomEvent).detail));
    const b: AparteChatBinding = {
        hostId: 'host', host,
        setMessages: (m) => { messages = m; },
        appendMessage: (m) => { messages.push(m); },
        getMessages: () => messages,
        clearMessages: () => { messages = []; },
        setLoading: () => {},
    };
    return { b, loaded };
}

function deferredAdapter(rows: AparteConversation[]) {
    const waits = new Map<string, (c: AparteConversation | null) => void>();
    const adapter: AparteStorageAdapter = {
        loadAll: async () => rows,
        loadMeta: async () => rows.map(meta),
        loadFull: vi.fn((id: string) => new Promise<AparteConversation | null>((resolve) => { waits.set(id, resolve); })),
        save: async () => {},
        delete: async () => {},
    };
    return { adapter, answer: (id: string, found = true) => waits.get(id)!(found ? rows.find((c) => c.id === id)! : null) };
}

describe('aparte-conversation-loaded', () => {
    it('fires on the host once the messages are set, with the chat and the conversation', async () => {
        const manager = new AparteConversationManager({ loadAll: async () => [conv('a', msg('a1', 'hi'))], save: async () => {}, delete: async () => {} });
        await manager.init();
        const { b, loaded } = binding();
        await new AparteConversationController(b, { manager }).setConversationId('a');
        expect(loaded).toEqual([{ targetId: 'host', conversationId: 'a' }]);
        expect(b.getMessages().map((m) => m.content)).toEqual(['hi']);
    });

    it('fires after a fetch, not before it', async () => {
        const { adapter, answer } = deferredAdapter([conv('a', msg('a1', 'hi'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const { b, loaded } = binding();
        const loading = new AparteConversationController(b, { manager }).setConversationId('a');
        await Promise.resolve();
        expect(loaded).toEqual([]);
        answer('a');
        await loading;
        expect(loaded).toEqual([{ targetId: 'host', conversationId: 'a' }]);
    });

    it('does not fire for a load that failed, nor for one the user left', async () => {
        const { adapter, answer } = deferredAdapter([conv('a', msg('a1', 'hi')), conv('b', msg('b1', 'yo'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const { b, loaded } = binding();
        const controller = new AparteConversationController(b, { manager });

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const failing = controller.setConversationId('a');
        await Promise.resolve();
        answer('a', false);
        await failing;
        expect(loaded).toEqual([]);

        const left = controller.setConversationId('b');
        const current = controller.setConversationId('a');
        await Promise.resolve();
        answer('a');
        answer('b');
        await Promise.all([left, current]);
        warn.mockRestore();
        expect(loaded.map((l) => l.conversationId)).toEqual(['a']);
    });
});
