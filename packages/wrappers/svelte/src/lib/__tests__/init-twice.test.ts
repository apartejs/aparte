/**
 * The conversation helper's `init()`, called a second time, replaces the manager. It used to
 * leave its subscription on the first one, whose notifications went on writing the helper's
 * lists and `activeId`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { AparteConfig, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import ConversationHost from './ConversationHost.svelte';
import type { createConversationManager } from '../stores/conversationManager';

afterEach(() => cleanup());

function memoryAdapter(): AparteStorageAdapter {
    const store = new Map<string, AparteConversation>();
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

describe('createConversationManager().init, called twice', () => {
    it('leaves no subscription on the manager it replaced', async () => {
        let cm!: ReturnType<typeof createConversationManager>;
        render(ConversationHost, { props: { onReady: (api: typeof cm) => { cm = api; } } });
        const config = new AparteConfig();
        await cm.init(memoryAdapter(), config);
        const firstManager = cm.manager!;
        await cm.init(memoryAdapter(), config);
        await firstManager.createNew('stale');
        expect(get(cm.conversations)).toHaveLength(0);
    });
});
