import { writable, derived } from 'svelte/store';
import { onDestroy } from 'svelte';
import {
    AparteConfig,
    ConversationManager,
    type AparteConversation,
    type AparteStorageAdapter,
} from '@aparte/core';
import type { AparteMessage } from '../types.js';

/**
 * Svelte-store wrapper around the core `ConversationManager`. The active
 * conversation is owned by the chat component's controller; switch by binding
 * `conversationId` on `<AparteChat>`. Call from a component's script. Svelte
 * equivalent of Angular's `ConversationManagerService`.
 */
export function createConversationManager() {
    let manager: ConversationManager | null = null;
    let unsub: (() => void) | null = null;

    const conversations = writable<AparteConversation[]>([]);
    const activeId = writable<string | null>(null);
    const activeConversations = derived(conversations, ($c) =>
        $c.filter((c) => !c.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt),
    );
    const archivedConversations = derived(conversations, ($c) =>
        $c.filter((c) => !!c.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt),
    );
    const activeConversation = derived([conversations, activeId], ([$c, $id]) =>
        $id ? $c.find((c) => c.id === $id) ?? null : null,
    );

    onDestroy(() => unsub?.());

    const assert = (): ConversationManager => {
        if (!manager) throw new Error('[createConversationManager] Not initialised. Call init(adapter) first.');
        return manager;
    };

    async function init(adapter: AparteStorageAdapter): Promise<void> {
        const m = new ConversationManager(adapter);
        manager = m;
        unsub = m.subscribe((convs) => {
            conversations.set([...convs]);
            activeId.set(m.activeId);
        });
        await m.init();
        activeId.set(m.activeId);
        AparteConfig.setConversationManager(m);
    }

    return {
        conversations,
        activeConversations,
        archivedConversations,
        activeId,
        activeConversation,
        init,
        createNew: (title?: string) => assert().createNew(title),
        addMessage: (convId: string, message: AparteMessage) => assert().addMessage(convId, message),
        updateMessages: (convId: string, messages: AparteMessage[]) => assert().updateMessages(convId, messages),
        delete: (id: string) => assert().delete(id),
        archive: (id: string) => assert().archive(id),
        unarchive: (id: string) => assert().unarchive(id),
    };
}
