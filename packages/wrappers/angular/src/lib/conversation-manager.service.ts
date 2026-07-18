import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { AparteConfig, ConversationManager, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import type { AparteMessage } from '@aparte/core';

/**
 * Angular 19 Signal-based wrapper around ConversationManager.
 *
 * Register a storage adapter before calling init():
 * ```ts
 * // app.config.ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     {
 *       provide: CONVERSATION_ADAPTER,
 *       useValue: new IndexedDBAdapter('my-app-convs'),
 *     },
 *   ],
 * };
 * ```
 *
 * Then inject ConversationManagerService in any component or service.
 */
@Injectable({ providedIn: 'root' })
export class ConversationManagerService implements OnDestroy {
    private _manager: ConversationManager | null = null;
    private _unsubscribe: (() => void) | null = null;

    // ─── Signals ─────────────────────────────────────────────────────────────

    /** All conversations (active + archived). */
    readonly conversations = signal<AparteConversation[]>([]);

    /** Active conversations only, newest first. */
    readonly activeConversations = computed(() =>
        this.conversations()
            .filter(c => !c.archivedAt)
            .sort((a, b) => b.updatedAt - a.updatedAt)
    );

    /** Archived conversations, newest first. */
    readonly archivedConversations = computed(() =>
        this.conversations()
            .filter(c => !!c.archivedAt)
            .sort((a, b) => b.updatedAt - a.updatedAt)
    );

    /** Currently active conversation id. */
    readonly activeId = signal<string | null>(null);

    /** The active conversation object (null when no conv is selected). */
    readonly activeConversation = computed(() => {
        const id = this.activeId();
        if (!id) return null;
        return this.conversations().find(c => c.id === id) ?? null;
    });

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    /**
     * Initialise the service with a storage adapter.
     * Call once in your root component or app initialiser.
     */
    async init(adapter: AparteStorageAdapter): Promise<void> {
        this._manager = new ConversationManager(adapter);
        this._unsubscribe = this._manager.subscribe(convs => {
            this.conversations.set([...convs]);
            this.activeId.set(this._manager!.activeId);
        });
        await this._manager.init();
        // Sync activeId after load (manager may have no active conv yet)
        this.activeId.set(this._manager.activeId);
        // Register globally so AparteConversationController (used by aparte-chat)
        // can resolve it without explicit DI plumbing.
        AparteConfig.setConversationManager(this._manager);
    }

    ngOnDestroy(): void {
        this._unsubscribe?.();
    }

    // ─── Actions ─────────────────────────────────────────────────────────────

    /** Create a new empty conversation, make it active, return it. */
    async createNew(title?: string): Promise<AparteConversation> {
        this._assertInit();
        return this._manager!.createNew(title);
    }

    // Note: there is no `select()` / `clearActive()` here on purpose.
    // The active conversation is owned exclusively by AparteConversationController
    // (inside <aparte-chat>). To switch conversations, either bind
    // `[conversationId]` on <aparte-chat> or dispatch a window event:
    //   window.dispatchEvent(new CustomEvent('aparte-select-conversation', {
    //     detail: { id, targetId? },
    //   }));
    // The `activeId` signal here is read-only and stays in sync via subscribe().

    /** Append a message to a conversation and persist. */
    async addMessage(convId: string, msg: AparteMessage): Promise<void> {
        this._assertInit();
        return this._manager!.addMessage(convId, msg);
    }

    /**
     * Replace all messages for a conversation.
     * Call after branch navigation or AI response completion.
     */
    async updateMessages(convId: string, messages: AparteMessage[]): Promise<void> {
        this._assertInit();
        return this._manager!.updateMessages(convId, messages);
    }

    /** Permanently delete a conversation. */
    async delete(id: string): Promise<void> {
        this._assertInit();
        return this._manager!.delete(id);
    }

    /** Archive a conversation. */
    async archive(id: string): Promise<void> {
        this._assertInit();
        return this._manager!.archive(id);
    }

    /** Restore an archived conversation. */
    async unarchive(id: string): Promise<void> {
        this._assertInit();
        return this._manager!.unarchive(id);
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private _assertInit(): void {
        if (!this._manager) {
            throw new Error(
                '[ConversationManagerService] Not initialised. Call init(adapter) before using the service.'
            );
        }
    }
}
