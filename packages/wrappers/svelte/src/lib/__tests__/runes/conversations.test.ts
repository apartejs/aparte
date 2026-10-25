import { describe, it, expect } from 'vitest';
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
