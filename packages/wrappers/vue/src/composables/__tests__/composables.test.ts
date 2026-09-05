import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { AparteClient, aparteGlobalConfig, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import { useAparteChat } from '../useAparteChat';
import { useAparteClient } from '../useAparteClient';
import { useConversationManager } from '../useConversationManager';

/**
 * The composables — the ergonomic layer every docs snippet opens with — had no tests;
 * the suite only mounted `<AparteChat>`. Two of the three own lifecycle hooks
 * (`onMounted`/`onBeforeUnmount`), so they are exercised through a probe component,
 * which is also how a consumer really uses them.
 *
 * The asserted contracts mirror React's on purpose: safe delegates before mount, a
 * client that stops with the component, and a manager that refuses use before init.
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

/** Mount a probe exposing whatever the composable returns. */
function mountComposable<T>(setup: () => T) {
    let api!: T;
    const wrapper = mount(defineComponent({
        setup() { api = setup(); return () => h('div'); },
    }));
    return { api, wrapper };
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { aparteGlobalConfig.setConversationManager(null as never); });

describe('useAparteChat', () => {
    it('starts empty and takes new messages', () => {
        const { api } = mountComposable(() => useAparteChat());

        expect(api.messages.value).toEqual([]);
        api.messages.value = [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }];
        expect(api.messages.value).toHaveLength(1);
    });

    it('delegates are safe before the component is bound', async () => {
        const { api } = mountComposable(() => useAparteChat());

        expect(() => api.appendMessage({ id: 'x', role: 'user', content: 'a', timestamp: 1 })).not.toThrow();
        expect(api.addBranch('x')).toBe(0);
        expect(api.isStreaming()).toBe(false);
        await expect(api.injectTokenStream('x', (async function* () {})())).resolves.toBeUndefined();
        expect(api.getMessages()).toEqual([]);
        expect(api.getViewport()).toBeNull();
        expect(() => { api.scrollToBottom(); api.focusInput(); }).not.toThrow();
    });

    // The composable is the documented entry point, so it must not narrow the
    // contract: it used to expose 17 of the 20 imperative members, and the four
    // missing ones were exactly the reads (`getMessages`, `getViewport`) and the two
    // view acts (`scrollToBottom`, `focusInput`) a consumer reaches for after a send.
    it('exposes the same 20 members as the component instance', () => {
        const { api } = mountComposable(() => useAparteChat());
        const getMessages = vi.fn(() => [{ id: 'live', role: 'user', content: 'ahead', timestamp: 1 }]);
        const scrollToBottom = vi.fn();
        const focusInput = vi.fn();
        const viewport = document.createElement('aparte-chat-viewport');
        const getViewport = vi.fn(() => viewport);

        (api.chatRef as { value: unknown }).value = { getMessages, scrollToBottom, focusInput, getViewport };

        // Not the same thing as the `messages` ref: the host's list is the authority
        // and, mid-stream, is a frame ahead of what Vue has rendered.
        expect(api.getMessages()).toEqual([{ id: 'live', role: 'user', content: 'ahead', timestamp: 1 }]);
        api.scrollToBottom();
        api.focusInput();
        expect(scrollToBottom).toHaveBeenCalledOnce();
        expect(focusInput).toHaveBeenCalledOnce();
        expect(api.getViewport()).toBe(viewport);
    });

    it('routes delegates to the bound instance', () => {
        const { api } = mountComposable(() => useAparteChat());
        const appendMessage = vi.fn();

        // What `<AparteChat ref="chatRef">` does once mounted.
        (api.chatRef as { value: unknown }).value = { appendMessage };
        api.appendMessage({ id: 'y', role: 'user', content: 'b', timestamp: 1 });

        expect(appendMessage).toHaveBeenCalledOnce();
    });
});

describe('useAparteClient', () => {
    it('starts on mount and stops on unmount', () => {
        const start = vi.spyOn(AparteClient.prototype, 'start').mockImplementation(() => undefined);
        const stop = vi.spyOn(AparteClient.prototype, 'stop').mockImplementation(() => undefined);

        const { wrapper } = mountComposable(() => useAparteClient({ autoRegister: false }));
        expect(start).toHaveBeenCalledOnce();
        expect(stop).not.toHaveBeenCalled();

        wrapper.unmount();
        expect(stop).toHaveBeenCalledOnce();
    });

    it('exposes abort()', () => {
        vi.spyOn(AparteClient.prototype, 'start').mockImplementation(() => undefined);
        vi.spyOn(AparteClient.prototype, 'stop').mockImplementation(() => undefined);
        const abort = vi.spyOn(AparteClient.prototype, 'abort').mockImplementation(() => undefined);

        const { api } = mountComposable(() => useAparteClient({ autoRegister: false }));
        api.abort();

        expect(abort).toHaveBeenCalledOnce();
    });
});

describe('useConversationManager', () => {
    it('refuses every mutator until init(adapter) is called', () => {
        const { api } = mountComposable(() => useConversationManager());

        expect(() => api.createNew()).toThrow(/Not initialised/);
        expect(() => api.delete('x')).toThrow(/Not initialised/);
        expect(api.conversations.value).toEqual([]);
        expect(api.activeConversation.value).toBeNull();
    });

    it('init() publishes the list and registers the manager globally', async () => {
        const { api } = mountComposable(() => useConversationManager());

        await api.init(new MemoryAdapter());
        await api.createNew('First');

        expect(api.conversations.value).toHaveLength(1);
        expect(api.activeConversation.value?.title).toBe('First');
        expect(aparteGlobalConfig.getConversationManager()).not.toBeNull();
    });

    it('splits active from archived, newest first', async () => {
        const { api } = mountComposable(() => useConversationManager());
        await api.init(new MemoryAdapter());

        const older = await api.createNew('Older');
        await api.createNew('Newer');
        await api.archive(older.id);

        expect(api.archivedConversations.value.map((c) => c.title)).toEqual(['Older']);
        expect(api.activeConversations.value.map((c) => c.title)).toEqual(['Newer']);
    });

    it('unsubscribes on unmount', async () => {
        const { api, wrapper } = mountComposable(() => useConversationManager());
        await api.init(new MemoryAdapter());

        const before = api.conversations.value.length;
        wrapper.unmount();
        await api.createNew('After unmount');

        expect(api.conversations.value).toHaveLength(before);
    });
});
