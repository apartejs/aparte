import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    AparteConfig,
    ConversationManager,
    type AparteConversation,
    type AparteStorageAdapter,
} from '@aparte/core';
import type { AparteMessage } from '../types.js';

export interface UseConversationManager {
    conversations: AparteConversation[];
    /** Active conversations, newest first. */
    activeConversations: AparteConversation[];
    /** Archived conversations, newest first. */
    archivedConversations: AparteConversation[];
    activeId: string | null;
    activeConversation: AparteConversation | null;
    /** Initialise with a storage adapter (call once). */
    init: (adapter: AparteStorageAdapter) => Promise<void>;
    createNew: (title?: string) => Promise<AparteConversation>;
    addMessage: (convId: string, message: AparteMessage) => Promise<void>;
    updateMessages: (convId: string, messages: AparteMessage[]) => Promise<void>;
    delete: (id: string) => Promise<void>;
    archive: (id: string) => Promise<void>;
    unarchive: (id: string) => Promise<void>;
}

/**
 * React-state wrapper around the core `ConversationManager`. The active
 * conversation is owned by the chat component's controller; switch by binding
 * `conversationId` on `<AparteChat>`. React equivalent of Angular's
 * `ConversationManagerService`.
 */
export function useConversationManager(): UseConversationManager {
    const managerRef = useRef<ConversationManager | null>(null);
    const unsubRef = useRef<(() => void) | null>(null);
    const [conversations, setConversations] = useState<AparteConversation[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => () => unsubRef.current?.(), []);

    const init = useCallback(async (adapter: AparteStorageAdapter) => {
        const m = new ConversationManager(adapter);
        managerRef.current = m;
        unsubRef.current = m.subscribe((convs) => {
            setConversations([...convs]);
            setActiveId(m.activeId);
        });
        await m.init();
        setActiveId(m.activeId);
        AparteConfig.setConversationManager(m);
    }, []);

    const assert = (): ConversationManager => {
        if (!managerRef.current) {
            throw new Error('[useConversationManager] Not initialised. Call init(adapter) first.');
        }
        return managerRef.current;
    };

    const activeConversations = useMemo(
        () => conversations.filter((c) => !c.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt),
        [conversations],
    );
    const archivedConversations = useMemo(
        () => conversations.filter((c) => !!c.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt),
        [conversations],
    );
    const activeConversation = useMemo(
        () => (activeId ? conversations.find((c) => c.id === activeId) ?? null : null),
        [conversations, activeId],
    );

    return {
        conversations,
        activeConversations,
        archivedConversations,
        activeId,
        activeConversation,
        init,
        createNew: (title) => assert().createNew(title),
        addMessage: (convId, message) => assert().addMessage(convId, message),
        updateMessages: (convId, messages) => assert().updateMessages(convId, messages),
        delete: (id) => assert().delete(id),
        archive: (id) => assert().archive(id),
        unarchive: (id) => assert().unarchive(id),
    };
}
