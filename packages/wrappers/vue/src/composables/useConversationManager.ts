import { ref, computed, onBeforeUnmount, type Ref } from 'vue';
import {
    AparteConfig,
    ConversationManager,
    type AparteConversation,
    type AparteStorageAdapter,
} from '@aparte/core';
import type { AparteMessage } from '../types.js';

/**
 * Vue-reactive wrapper around the core `ConversationManager`. The active
 * conversation is owned by the chat component's controller; switch by binding
 * `conversationId` on `<AparteChat>`. Vue equivalent of Angular's
 * `ConversationManagerService`.
 */
export function useConversationManager() {
    let manager: ConversationManager | null = null;
    let unsub: (() => void) | null = null;

    const conversations = ref<AparteConversation[]>([]) as Ref<AparteConversation[]>;
    const activeId = ref<string | null>(null);

    const activeConversations = computed(() =>
        conversations.value.filter((c) => !c.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt),
    );
    const archivedConversations = computed(() =>
        conversations.value.filter((c) => !!c.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt),
    );
    const activeConversation = computed(() =>
        activeId.value ? conversations.value.find((c) => c.id === activeId.value) ?? null : null,
    );

    onBeforeUnmount(() => unsub?.());

    const assert = (): ConversationManager => {
        if (!manager) throw new Error('[useConversationManager] Not initialised. Call init(adapter) first.');
        return manager;
    };

    const init = async (adapter: AparteStorageAdapter): Promise<void> => {
        const m = new ConversationManager(adapter);
        manager = m;
        unsub = m.subscribe((convs) => {
            conversations.value = [...convs];
            activeId.value = m.activeId;
        });
        await m.init();
        activeId.value = m.activeId;
        AparteConfig.setConversationManager(m);
    };

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
