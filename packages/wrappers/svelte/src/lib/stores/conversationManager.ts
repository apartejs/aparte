import { writable, derived } from 'svelte/store';
import { onDestroy } from 'svelte';
import {
    aparteGlobalConfig,
    type AparteConfig,
    AparteConversationManager,
    type AparteConversation,
    type AparteStorageAdapter,
} from '@aparte/core';
import type { AparteMessage } from '../types.js';

/**
 * Svelte-store wrapper around the core `AparteConversationManager`. The active
 * conversation is owned by the chat component's controller; switch by binding
 * `conversationId` on `<AparteChat>`. Call from a component's script. Svelte
 * equivalent of Angular's `ConversationManagerService`.
 */
export function createConversationManager() {
    let manager: AparteConversationManager | null = null;
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

    const assert = (): AparteConversationManager => {
        if (!manager) throw new Error('[createConversationManager] Not initialised. Call init(adapter) first.');
        return manager;
    };

    /**
     * Initialise with a storage adapter.
     *
     * `config` defaults to the global singleton. Pass the SAME config you gave
     * `<AparteChat config={…}>`: the controller resolves the config governing its
     * host element, so a manager registered on the global is invisible to a chat
     * with its own — persistence silently does nothing while the optimistic UI
     * keeps working.
     */
    async function init(adapter: AparteStorageAdapter, config: AparteConfig = aparteGlobalConfig): Promise<void> {
        const m = new AparteConversationManager(adapter);
        manager = m;
        unsub = m.subscribe((convs) => {
            conversations.set([...convs]);
            activeId.set(m.activeId);
        });
        await m.init();
        activeId.set(m.activeId);
        config.setConversationManager(m);
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
