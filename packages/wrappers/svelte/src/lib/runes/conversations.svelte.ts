import { onDestroy } from 'svelte';
import {
    aparteGlobalConfig,
    type AparteConfig,
    AparteConversationManager,
    type AparteConversation,
    type AparteStorageAdapter,
    type ConversationManagerOptions,
} from '@aparte/core';
import type { AparteMessage } from '../types.js';


/**
 * Saved conversations as reactive state, for Svelte 5: read `conversations`,
 * `activeConversations`, `activeId`… straight in a template — no stores, no `$` prefix.
 *
 * `init(adapter)` creates the `AparteConversationManager` on your storage adapter and
 * registers it on the config (the global one unless you pass the chat's own), which is what
 * lets `<AparteChat conversationId>` load and save through it. The methods are the manager's.
 * Create it with {@link createConversations} inside a component to have it disposed with the
 * component, or construct it yourself and call `dispose()`.
 */
export class AparteConversations {
    /** Every conversation, as the manager reports them. */
    conversations = $state.raw<AparteConversation[]>([]);
    /** The active conversation's id, or null. */
    activeId = $state<string | null>(null);
    // In the manager's own order (`orderBy`), most recent change first without one. Read when
    // the lists are, so the manager it names is the current one.
    #byOrder = (a: AparteConversation, b: AparteConversation): number =>
        this.#manager?.compare(a, b) ?? b.updatedAt - a.updatedAt;
    /** The ones not archived, in the manager's order (`orderBy`): most recent change first by default. */
    readonly activeConversations = $derived(this.conversations.filter((c) => !c.archivedAt).sort(this.#byOrder));
    /** The archived ones, in the manager's order (`orderBy`): most recent change first by default. */
    readonly archivedConversations = $derived(this.conversations.filter((c) => !!c.archivedAt).sort(this.#byOrder));
    /** The active conversation, or null. */
    readonly activeConversation = $derived(this.activeId ? this.conversations.find((c) => c.id === this.activeId) ?? null : null);

    #manager: AparteConversationManager | null = null;
    #unsubscribe: (() => void) | null = null;

    /** The manager, once `init` has run. */
    get manager(): AparteConversationManager | null { return this.#manager; }

    async init(adapter: AparteStorageAdapter, config: AparteConfig = aparteGlobalConfig, options?: ConversationManagerOptions): Promise<void> {
        const manager = new AparteConversationManager(adapter, options);
        this.#manager = manager;
        this.#unsubscribe?.();
        this.#unsubscribe = manager.subscribe((all) => {
            this.conversations = [...all];
            this.activeId = manager.activeId;
        });
        await manager.init();
        // Overtaken by a newer init while its store loaded: that one is the manager now, and this
        // one registered last on the config, so the chat persisted into the store just left.
        if (this.#manager !== manager) return;
        this.activeId = manager.activeId;
        config.setConversationManager(manager);
    }

    /** Stop following the manager. */
    dispose(): void {
        this.#unsubscribe?.();
        this.#unsubscribe = null;
    }

    #assert(): AparteConversationManager {
        if (!this.#manager) throw new Error('[AparteConversations] Not initialised. Call init(adapter) first.');
        return this.#manager;
    }

    createNew(title?: string) { return this.#assert().createNew(title); }
    addMessage(convId: string, message: AparteMessage) { return this.#assert().addMessage(convId, message); }
    updateMessages(convId: string, messages: AparteMessage[]) { return this.#assert().updateMessages(convId, messages); }
    delete(id: string) { return this.#assert().delete(id); }
    archive(id: string) { return this.#assert().archive(id); }
    unarchive(id: string) { return this.#assert().unarchive(id); }
    pin(id: string) { return this.#assert().pin(id); }
    unpin(id: string) { return this.#assert().unpin(id); }
    updateTitle(id: string, title: string) { return this.#assert().updateTitle(id, title); }
}

/** An {@link AparteConversations} disposed with the component that creates it. Call from a component's script. */
export function createConversations(): AparteConversations {
    const conversations = new AparteConversations();
    onDestroy(() => conversations.dispose());
    return conversations;
}
