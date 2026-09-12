// @vitest-environment jsdom
/**
 * A store takes its time, and the chain says so.
 *
 * `AparteStorageAdapter` declared `loadMeta()` and `loadFull(id)` from the start — the
 * list without its messages, one conversation on demand — and nothing called them:
 * `init()` did `loadAll()`, `setConversationId` read the conversation from memory in
 * the same tick. So between a click and its messages there was no moment at all, and a
 * page wired to a real store had to invent one: a store of its own, a race guard, a
 * skeleton over the components (the chat-site review, 2026-09-05).
 *
 * Now the manager reads the list through `loadMeta()` when the adapter has it and
 * fetches a conversation's messages through `ensureFull(id)` the first time they are
 * needed; the controller tells its binding it is loading, waits, and drops a reply that
 * comes back for a conversation the user has already left.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConversationManager } from '../conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversation-controller.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteConversation, AparteConversationMeta, AparteStorageAdapter } from '../types.js';
import type { AparteMessage } from '../../types/index.js';

const msg = (id: string, content: string): AparteMessage => ({ id, role: 'user', content, timestamp: 1 });
const conv = (id: string, ...messages: AparteMessage[]): AparteConversation =>
    ({ id, title: id, createdAt: 1, updatedAt: 1, messages });
const meta = ({ messages: _m, ...rest }: AparteConversation): AparteConversationMeta => rest;

/** A promise the test resolves by hand, so a load can be left in flight. */
function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

/** An adapter with split storage: the list is cheap, a conversation is fetched on demand. */
function splitAdapter(rows: AparteConversation[]) {
    const pending = new Map<string, ReturnType<typeof deferred<AparteConversation | null>>>();
    const adapter: AparteStorageAdapter & { loadFull: ReturnType<typeof vi.fn>; loadMeta: ReturnType<typeof vi.fn> } = {
        loadAll: vi.fn(async () => rows),
        loadMeta: vi.fn(async () => rows.map(meta)),
        loadFull: vi.fn((id: string) => {
            const d = deferred<AparteConversation | null>();
            pending.set(id, d);
            return d.promise;
        }),
        save: async () => {},
        delete: async () => {},
    };
    const answer = (id: string) => pending.get(id)!.resolve(rows.find((c) => c.id === id) ?? null);
    return { adapter, answer };
}

describe('AparteConversationManager — reads the list first, a conversation on demand', () => {
    it('init() takes the metas when the adapter has loadMeta, and lists them without messages', async () => {
        const { adapter } = splitAdapter([conv('a', msg('a1', 'hello')), conv('b')]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        expect(adapter.loadMeta).toHaveBeenCalledTimes(1);
        expect(adapter.loadAll).not.toHaveBeenCalled();
        expect(manager.conversations.map((c) => c.id)).toEqual(['a', 'b']);
        expect(manager.conversations[0]!.messages).toEqual([]);
        expect(manager.isLoaded('a')).toBe(false);
    });

    it('ensureFull(id) fetches the messages once, keeps them, and marks the conversation loaded', async () => {
        const { adapter, answer } = splitAdapter([conv('a', msg('a1', 'hello'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        const first = manager.ensureFull('a');
        answer('a');
        await first;
        expect(manager.isLoaded('a')).toBe(true);
        expect(manager.conversations[0]!.messages.map((m) => m.content)).toEqual(['hello']);
        await manager.ensureFull('a');
        expect(adapter.loadFull).toHaveBeenCalledTimes(1);
    });

    it('an adapter without loadMeta loads everything as before, and every conversation is loaded', async () => {
        const adapter: AparteStorageAdapter = { loadAll: async () => [conv('a', msg('a1', 'hi'))], save: async () => {}, delete: async () => {} };
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        expect(manager.conversations[0]!.messages).toHaveLength(1);
        expect(manager.isLoaded('a')).toBe(true);
        await manager.ensureFull('a');
        expect(manager.conversations[0]!.messages).toHaveLength(1);
    });
});

function makeBinding() {
    const calls: string[] = [];
    let messages: AparteMessage[] = [];
    const binding: AparteChatBinding & { calls: string[]; loading: boolean } = {
        hostId: 'host',
        host: document.createElement('div'),
        loading: false,
        calls,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; calls.push(`set:${m.map((x) => x.content).join(',')}`); },
        appendMessage: (m) => { messages = [...messages, m]; },
        clearMessages: () => { messages = []; calls.push('clear'); },
        setLoading: (on: boolean) => { binding.loading = on; calls.push(`loading:${on}`); },
    };
    return binding;
}

describe('AparteConversationController — waits for a conversation, and drops a stale one', () => {
    it('tells the binding it is loading, then hands over the messages and stops', async () => {
        const { adapter, answer } = splitAdapter([conv('a', msg('a1', 'hello'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        aparteGlobalConfig.setConversationManager(manager);
        const binding = makeBinding();
        const controller = new AparteConversationController(binding);
        const unbind = controller.bind();

        const switching = controller.setConversationId('a');
        expect(binding.loading).toBe(true);
        expect(binding.calls).toContain('loading:true');
        answer('a');
        await switching;
        expect(binding.loading).toBe(false);
        expect(binding.calls.at(-1)).toBe('loading:false');
        expect(binding.getMessages().map((m) => m.content)).toEqual(['hello']);
        unbind();
    });

    it('a click on B while A is still on its way: A never lands, B does', async () => {
        const { adapter, answer } = splitAdapter([conv('a', msg('a1', 'A')), conv('b', msg('b1', 'B'))]);
        const manager = new AparteConversationManager(adapter);
        await manager.init();
        aparteGlobalConfig.setConversationManager(manager);
        const binding = makeBinding();
        const controller = new AparteConversationController(binding);
        const unbind = controller.bind();

        const first = controller.setConversationId('a');
        const second = controller.setConversationId('b');
        answer('b');
        await second;
        expect(binding.getMessages().map((m) => m.content)).toEqual(['B']);
        answer('a');
        await first;
        expect(binding.getMessages().map((m) => m.content), 'the stale reply must not overwrite B').toEqual(['B']);
        expect(binding.calls.filter((c) => c.startsWith('set:'))).toEqual(['set:B']);
        expect(binding.loading).toBe(false);
        unbind();
    });
});
