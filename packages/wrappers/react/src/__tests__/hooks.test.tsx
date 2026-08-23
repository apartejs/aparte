import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { AparteClient, aparteGlobalConfig, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import { useAparteChat } from '../hooks/useAparteChat';
import { useAparteClient } from '../hooks/useAparteClient';
import { useConversationManager } from '../hooks/useConversationManager';

/**
 * The wrapper's ergonomic layer — the hooks every docs snippet opens with — had no
 * tests at all: the suite only ever mounted `<AparteChat>`. These pin the three
 * contracts a consumer actually depends on: safe delegates before the component is
 * mounted, a client that starts and (crucially) stops with the component, and a
 * conversation manager that refuses to be used before `init()`.
 */

/** Same in-memory adapter shape as core's own conversation tests. */
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
afterEach(() => { aparteGlobalConfig.setConversationManager(null as never); });

describe('useAparteChat', () => {
    it('starts with an empty, settable message list', () => {
        const { result } = renderHook(() => useAparteChat());

        expect(result.current.messages).toEqual([]);
        act(() => result.current.setMessages([{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }]));
        expect(result.current.messages).toHaveLength(1);
    });

    it('delegates are safe to call before the component mounts', async () => {
        // The ref is null until <AparteChat ref={chat.ref}> renders; a consumer
        // wiring an early effect must not crash on it.
        const { result } = renderHook(() => useAparteChat());

        expect(() => result.current.appendMessage({ id: 'x', role: 'user', content: 'a', timestamp: 1 })).not.toThrow();
        expect(result.current.addBranch('x')).toBe(0);
        expect(result.current.addSiblingOf('x', { id: 'z', role: 'user', content: '', timestamp: 1 })).toBeNull();
        expect(result.current.isStreaming()).toBe(false);
        await expect(result.current.injectTokenStream('x', (async function* () {})())).resolves.toBeUndefined();
        // `getMessages`/`getViewport` are deliberately NOT on the hook: the state
        // `messages` and `ref.current` already serve them.
        expect(result.current.ref.current).toBeNull();
    });

    it('routes delegates to the component once the ref is connected', () => {
        const { result } = renderHook(() => useAparteChat());
        const appendMessage = vi.fn();
        const addBranch = vi.fn(() => 2);

        act(() => {
            // What <AparteChat ref={chat.ref}> does on mount.
            (result.current.ref as { current: unknown }).current = { appendMessage, addBranch };
        });

        result.current.appendMessage({ id: 'y', role: 'user', content: 'b', timestamp: 1 });
        expect(appendMessage).toHaveBeenCalledOnce();
        expect(result.current.addBranch('y')).toBe(2);
    });
});

describe('useAparteClient', () => {
    it('starts the client on mount and stops it on unmount', () => {
        const start = vi.spyOn(AparteClient.prototype, 'start').mockImplementation(() => undefined);
        const stop = vi.spyOn(AparteClient.prototype, 'stop').mockImplementation(() => undefined);

        const { unmount } = renderHook(() => useAparteClient({ autoRegister: false }));
        expect(start).toHaveBeenCalledOnce();
        expect(stop).not.toHaveBeenCalled();

        // The half that matters: leaving the page must remove the window listeners.
        unmount();
        expect(stop).toHaveBeenCalledOnce();
    });

    it('keeps the same client instance across re-renders', () => {
        vi.spyOn(AparteClient.prototype, 'start').mockImplementation(() => undefined);
        vi.spyOn(AparteClient.prototype, 'stop').mockImplementation(() => undefined);

        const { result, rerender } = renderHook(() => useAparteClient({ autoRegister: false }));
        const first = result.current.client;
        rerender();

        expect(result.current.client).toBe(first);
    });

    it('exposes abort()', () => {
        vi.spyOn(AparteClient.prototype, 'start').mockImplementation(() => undefined);
        vi.spyOn(AparteClient.prototype, 'stop').mockImplementation(() => undefined);
        const abort = vi.spyOn(AparteClient.prototype, 'abort').mockImplementation(() => undefined);

        const { result } = renderHook(() => useAparteClient({ autoRegister: false }));
        result.current.abort();

        expect(abort).toHaveBeenCalledOnce();
    });
});

describe('useConversationManager', () => {
    it('refuses every mutator until init(adapter) is called', () => {
        const { result } = renderHook(() => useConversationManager());

        expect(() => result.current.createNew()).toThrow(/Not initialised/);
        expect(() => result.current.delete('x')).toThrow(/Not initialised/);
        expect(result.current.conversations).toEqual([]);
        expect(result.current.activeConversation).toBeNull();
    });

    it('init() publishes the conversation list and registers the manager globally', async () => {
        const { result } = renderHook(() => useConversationManager());

        await act(async () => { await result.current.init(new MemoryAdapter()); });
        await act(async () => { await result.current.createNew('First'); });

        expect(result.current.conversations).toHaveLength(1);
        expect(result.current.activeConversations).toHaveLength(1);
        expect(result.current.activeConversation?.title).toBe('First');
        // The chat component reads the manager off the global config.
        expect(aparteGlobalConfig.getConversationManager()).not.toBeNull();
    });

    it('splits active from archived, newest first', async () => {
        const { result } = renderHook(() => useConversationManager());
        await act(async () => { await result.current.init(new MemoryAdapter()); });

        let older: AparteConversation | undefined;
        await act(async () => { older = await result.current.createNew('Older'); });
        await act(async () => { await result.current.createNew('Newer'); });
        await act(async () => { await result.current.archive(older!.id); });

        expect(result.current.archivedConversations.map((c) => c.title)).toEqual(['Older']);
        expect(result.current.activeConversations.map((c) => c.title)).toEqual(['Newer']);
    });

    it('unsubscribes from the manager on unmount', async () => {
        const { result, unmount } = renderHook(() => useConversationManager());
        await act(async () => { await result.current.init(new MemoryAdapter()); });

        const before = result.current.conversations.length;
        unmount();
        // After unmount the subscription is gone; mutating through the still-held
        // manager must not push state into an unmounted tree (React would warn).
        await act(async () => { await result.current.createNew('After unmount'); });
        expect(result.current.conversations).toHaveLength(before);
    });
});
