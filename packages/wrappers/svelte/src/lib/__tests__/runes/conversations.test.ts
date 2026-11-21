import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ConversationsHost from './ConversationsHost.svelte';
import { flushSync } from 'svelte';
import { AparteConfig, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import { AparteConversations } from '../../runes/conversations.svelte.js';

function memoryAdapter(): AparteStorageAdapter {
    const store = new Map<string, AparteConversation>();
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

describe('createConversations (Svelte 5)', () => {
    it('is disposed with the component that created it', async () => {
        let created: AparteConversations | undefined;
        const { unmount } = render(ConversationsHost, { props: { onCreated: (c: AparteConversations) => { created = c; } } });
        const config = new AparteConfig();
        await created!.init(memoryAdapter(), config);
        expect(config.getConversationManager()).toBe(created!.manager);
        const dispose = vi.spyOn(created!, 'dispose');
        unmount();
        expect(dispose).toHaveBeenCalledTimes(1);
    });
});

describe('AparteConversations (Svelte 5)', () => {
    it('exposes reactive conversations after init, and registers the manager on the config', async () => {
        const config = new AparteConfig();
        const conversations = new AparteConversations();
        await conversations.init(memoryAdapter(), config);
        expect(config.getConversationManager()).toBe(conversations.manager);

        const created = await conversations.createNew('First');
        flushSync();
        expect(conversations.conversations.map((c) => c.id)).toContain(created.id);
        expect(conversations.activeConversations.map((c) => c.title)).toContain('First');

        await conversations.archive(created.id);
        flushSync();
        expect(conversations.archivedConversations.map((c) => c.id)).toEqual([created.id]);
        conversations.dispose();
    });

    it('throws a clear error before init', () => {
        expect(() => new AparteConversations().createNew()).toThrow(/init\(adapter\)/);
    });
});

function slowAdapter(): { adapter: AparteStorageAdapter; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    return { adapter: { async loadAll() { await gate; return []; }, async save() {}, async delete() {} }, release };
}

describe('AparteConversations.init, overtaken by a newer one', () => {
    it('registers nothing when it resolves after the newer init', async () => {
        const conversations = new AparteConversations();
        const config = new AparteConfig();
        const slow = slowAdapter();
        const first = conversations.init(slow.adapter, config);
        await conversations.init(memoryAdapter(), config);
        const newer = conversations.manager;
        // An active conversation in the newer store: the stale init must not write its own over it.
        await newer!.createNew('fresh');
        slow.release();
        await first;
        expect(config.getConversationManager()).toBe(newer);
        expect(conversations.manager).toBe(newer);
        expect(conversations.activeId).not.toBeNull();
        expect(conversations.activeId).toBe(newer!.activeId);
    });
});
