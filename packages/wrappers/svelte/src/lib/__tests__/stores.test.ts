import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { tick } from 'svelte';
import { AparteClient, AparteConfig, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import { createAparteChat } from '../stores/aparteChat';
import ClientHost from './ClientHost.svelte';
import ConversationHost from './ConversationHost.svelte';

/**
 * The store factories — the ergonomic layer of this wrapper — had no tests; the suite
 * only rendered `<AparteChat>`. `createAparteChat` is lifecycle-free so it is driven
 * directly; the other two register `onMount`/`onDestroy`, so they run inside probe
 * components (which is also how a consumer uses them).
 *
 * The contracts asserted here mirror React's and Vue's on purpose: safe delegates
 * before the component is connected, a client that stops with the component, and a
 * manager that refuses use before `init()`.
 */

class MemoryAdapter implements AparteStorageAdapter {
    store = new Map<string, AparteConversation>();
    async loadAll() { return [...this.store.values()].sort((a, b) => b.updatedAt - a.updatedAt); }
    async save(c: AparteConversation) { this.store.set(c.id, c); }
    async delete(id: string) { this.store.delete(id); }
    async archive(id: string) {
        const c = this.store.get(id);
        if (c) this.store.set(id, { ...c, archivedAt: Date.now() });
    }
    async unarchive(id: string) {
        const c = this.store.get(id);
        if (c) { const { archivedAt: _archivedAt, ...rest } = c; this.store.set(id, rest as AparteConversation); }
    }
}

beforeEach(() => { cleanup(); vi.clearAllMocks(); });
afterEach(() => { AparteConfig.setConversationManager(null as never); });

/** Render the probe and capture the store bundle it hands back. */
function renderConversationHost() {
    let api!: ReturnType<typeof import('../stores/conversationManager').createConversationManager>;
    const rendered = render(ConversationHost, { props: { onReady: (a: typeof api) => { api = a; } } });
    return { api, unmount: rendered.unmount };
}

describe('createAparteChat', () => {
    it('exposes a messages store seeded from its argument', () => {
        const chat = createAparteChat([{ id: 'm0', role: 'user', content: 'seed', timestamp: 1 }]);

        expect(get(chat.messages)).toHaveLength(1);
        chat.onMessagesChange([]);
        expect(get(chat.messages)).toEqual([]);
    });

    it('delegates are safe before connect()', async () => {
        const chat = createAparteChat();

        expect(() => chat.appendMessage({ id: 'x', role: 'user', content: 'a', timestamp: 1 })).not.toThrow();
        expect(chat.addBranch('x')).toBe(0);
        expect(chat.isStreaming()).toBe(false);
        await expect(chat.injectTokenStream('x', (async function* () {})())).resolves.toBeUndefined();
    });

    it('routes delegates to the connected component', () => {
        const chat = createAparteChat();
        const appendMessage = vi.fn();
        const isStreaming = vi.fn(() => true);

        // What `$: chat.connect(comp)` does with `bind:this`.
        chat.connect({ appendMessage, isStreaming } as never);

        chat.appendMessage({ id: 'y', role: 'user', content: 'b', timestamp: 1 });
        expect(appendMessage).toHaveBeenCalledOnce();
        expect(chat.isStreaming()).toBe(true);
    });
});

describe('createAparteClient', () => {
    // Scope note: this harness's `render` does NOT run `onMount` (documented in
    // AparteChat.test.ts and ledgered), so the `start()` half is out of reach here —
    // asserting it would only prove the mock. `onDestroy` DOES run, so the teardown
    // half — the one that leaks window listeners when it breaks — is covered.
    it('builds one client and exposes abort()', async () => {
        vi.spyOn(AparteClient.prototype, 'start').mockImplementation(() => undefined);
        vi.spyOn(AparteClient.prototype, 'stop').mockImplementation(() => undefined);
        const abort = vi.spyOn(AparteClient.prototype, 'abort').mockImplementation(() => undefined);

        let api!: { client: AparteClient; abort: () => void };
        render(ClientHost, {
            props: { options: { autoRegister: false }, onReady: (a: typeof api) => { api = a; } },
        });
        await tick();

        expect(api.client).toBeInstanceOf(AparteClient);
        api.abort();
        expect(abort).toHaveBeenCalledOnce();
    });

    it('stops the client when the component is destroyed', async () => {
        vi.spyOn(AparteClient.prototype, 'start').mockImplementation(() => undefined);
        const stop = vi.spyOn(AparteClient.prototype, 'stop').mockImplementation(() => undefined);

        const { unmount } = render(ClientHost, {
            props: { options: { autoRegister: false }, onReady: () => {} },
        });
        await tick();
        expect(stop).not.toHaveBeenCalled();

        unmount();
        expect(stop).toHaveBeenCalledOnce();
    });
});

describe('createConversationManager', () => {
    it('refuses every mutator until init(adapter) is called', () => {
        const api = renderConversationHost().api;

        expect(() => api.createNew()).toThrow(/Not initialised/);
        expect(() => api.delete('x')).toThrow(/Not initialised/);
        expect(get(api.conversations)).toEqual([]);
        expect(get(api.activeConversation)).toBeNull();
    });

    it('init() publishes the list and registers the manager globally', async () => {
        const api = renderConversationHost().api;

        await api.init(new MemoryAdapter());
        await api.createNew('First');

        expect(get(api.conversations)).toHaveLength(1);
        expect(get(api.activeConversation)?.title).toBe('First');
        expect(AparteConfig.getConversationManager()).not.toBeNull();
    });

    it('splits active from archived, newest first', async () => {
        const api = renderConversationHost().api;
        await api.init(new MemoryAdapter());

        const older = await api.createNew('Older');
        await api.createNew('Newer');
        await api.archive(older.id);

        expect(get(api.archivedConversations).map((c) => c.title)).toEqual(['Older']);
        expect(get(api.activeConversations).map((c) => c.title)).toEqual(['Newer']);
    });

    it('unsubscribes when the component is destroyed', async () => {
        const { api, unmount } = renderConversationHost();
        await api.init(new MemoryAdapter());

        const before = get(api.conversations).length;
        unmount();
        await api.createNew('After destroy');

        expect(get(api.conversations)).toHaveLength(before);
    });
});
