import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    aparteGlobalConfig,
    type AparteConfig,
    AparteConversationManager,
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
    /**
     * Initialise with a storage adapter (call once). `config` is the one you gave
     * `<AparteChat config={…}>`; it defaults to the global — the implementation always
     * took it, the interface hid it, so the documented two-argument call did not type.
     */
    init: (adapter: AparteStorageAdapter, config?: AparteConfig) => Promise<void>;
    createNew: (title?: string) => Promise<AparteConversation>;
    addMessage: (convId: string, message: AparteMessage) => Promise<void>;
    updateMessages: (convId: string, messages: AparteMessage[]) => Promise<void>;
    delete: (id: string) => Promise<void>;
    archive: (id: string) => Promise<void>;
    unarchive: (id: string) => Promise<void>;
    pin: (id: string) => Promise<void>;
    unpin: (id: string) => Promise<void>;
    updateTitle: (id: string, title: string) => Promise<void>;
}

/**
 * React-state wrapper around the core `AparteConversationManager`. The active
 * conversation is owned by the chat component's controller; switch by binding
 * `conversationId` on `<AparteChat>`. React equivalent of Angular's
 * `ConversationManagerService`.
 */
export function useConversationManager(): UseConversationManager {
    const managerRef = useRef<AparteConversationManager | null>(null);
    const unsubRef = useRef<(() => void) | null>(null);
    const [conversations, setConversations] = useState<AparteConversation[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => () => unsubRef.current?.(), []);

    /**
     * Initialise with a storage adapter.
     *
     * `config` defaults to the global singleton. Pass the SAME config you gave
     * `<AparteChat config={…}>`: the controller resolves the config governing its
     * host element, so a manager registered on the global is invisible to a chat
     * with its own — persistence silently does nothing while the optimistic UI
     * keeps working.
     */
    const init = useCallback(async (adapter: AparteStorageAdapter, config: AparteConfig = aparteGlobalConfig) => {
        const m = new AparteConversationManager(adapter);
        managerRef.current = m;
        unsubRef.current = m.subscribe((convs) => {
            setConversations([...convs]);
            setActiveId(m.activeId);
        });
        await m.init();
        setActiveId(m.activeId);
        config.setConversationManager(m);
    }, []);

    const assert = (): AparteConversationManager => {
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
        pin: (id) => assert().pin(id),
        unpin: (id) => assert().unpin(id),
        updateTitle: (id, title) => assert().updateTitle(id, title),
    };
}
