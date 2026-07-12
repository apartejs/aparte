import type { AparteMessage } from '../types/index.js';
import type { AparteConversation, AparteStorageAdapter } from './types.js';
import type { ExportedMessageRepository } from '../runtime/message-repository.js';
import { APARTE_CONVERSATION_SCHEMA_VERSION } from './types.js';

type Listener = (conversations: AparteConversation[]) => void;

export interface ConversationManagerOptions {
    /**
     * Opt-in history retention. When set, `updateMessages()` trims a persisted
     * conversation to at most `maxMessages` on the active path (dropping the
     * oldest history and the branches hanging off it) before writing to storage.
     * Omit for unbounded history (the default) — retention is a deliberate
     * consumer choice, never silent.
     */
    retention?: { maxMessages: number };
}

/**
 * Pure retention transform: keep at most `maxMessages` on the active path.
 *
 * Keeps the subtree rooted at the new-oldest kept message (so recent history AND
 * recent branches survive) and drops everything before it. Exported for testing.
 */
export function applyRetention(
    messages: AparteMessage[],
    tree: ExportedMessageRepository | undefined,
    maxMessages: number,
): { messages: AparteMessage[]; tree: ExportedMessageRepository | undefined } {
    if (maxMessages <= 0 || messages.length <= maxMessages) return { messages, tree };
    const trimmedFlat = messages.slice(messages.length - maxMessages);
    const cutoffId = trimmedFlat[0]?.id;
    if (!cutoffId || !tree) return { messages: trimmedFlat, tree };

    const treeIds = new Set(tree.messages.map((m) => m.message.id));
    if (!treeIds.has(cutoffId)) return { messages: trimmedFlat, tree }; // flat/tree mismatch → don't corrupt

    const childrenOf = new Map<string, string[]>();
    for (const { message, parentId } of tree.messages) {
        if (parentId != null) {
            const arr = childrenOf.get(parentId) ?? [];
            arr.push(message.id);
            childrenOf.set(parentId, arr);
        }
    }
    const keep = new Set<string>();
    const queue = [cutoffId];
    while (queue.length) {
        const id = queue.pop()!;
        if (keep.has(id)) continue;
        keep.add(id);
        for (const child of childrenOf.get(id) ?? []) queue.push(child);
    }
    const trimmedTree: ExportedMessageRepository = {
        headId: tree.headId,
        messages: tree.messages
            .filter((m) => keep.has(m.message.id))
            .map((m) => (m.message.id === cutoffId ? { message: m.message, parentId: null } : m)),
    };
    return { messages: trimmedFlat, tree: trimmedTree };
}

/**
 * Framework-agnostic conversation manager.
 *
 * Usage:
 * ```ts
 * const manager = new ConversationManager(myAdapter);
 * await manager.init();                    // load from storage
 * const conv = await manager.createNew(); // returns new AparteConversation
 * ```
 *
 * The manager emits synchronous notifications to registered listeners on every
 * mutation so framework wrappers (Angular signals, Vue reactive, etc.) can
 * react without polling.
 */
export class ConversationManager {
    private _adapter: AparteStorageAdapter;
    private _conversations: AparteConversation[] = [];
    private _activeId: string | null = null;
    private _listeners: Set<Listener> = new Set();
    private _initialized = false;
    private _retention: { maxMessages: number } | null = null;

    constructor(adapter: AparteStorageAdapter, options?: ConversationManagerOptions) {
        this._adapter = adapter;
        this._retention = options?.retention ?? null;
    }

    // ─── Initialisation ────────────────────────────────────────────────────

    /** Load all conversations from the adapter. Call once at app startup. */
    async init(): Promise<void> {
        this._conversations = await this._adapter.loadAll();
        this._initialized = true;
        this._notify();
    }

    /**
     * Whether `init()` has completed at least once. Consumers use this to
     * distinguish "manager still hydrating from storage" from "manager
     * hydrated, conversations is genuinely empty". The conversation-controller
     * relies on this to defer clearing the binding during the IndexedDB
     * hydration window (Angular APP_INITIALIZER race).
     */
    get initialized(): boolean {
        return this._initialized;
    }

    // ─── Read ───────────────────────────────────────────────────────────────

    get conversations(): AparteConversation[] {
        return this._conversations;
    }

    get activeId(): string | null {
        return this._activeId;
    }

    get active(): AparteConversation | null {
        if (!this._activeId) return null;
        return this._conversations.find(c => c.id === this._activeId) ?? null;
    }

    /** Active conversations (not archived), newest first. */
    get activeConversations(): AparteConversation[] {
        return this._conversations
            .filter(c => !c.archivedAt)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /** Archived conversations, newest first. */
    get archivedConversations(): AparteConversation[] {
        return this._conversations
            .filter(c => !!c.archivedAt)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    // ─── Mutations ──────────────────────────────────────────────────────────

    /** Create a new empty conversation, persist it, and make it active. */
    async createNew(title = 'New Chat'): Promise<AparteConversation> {
        const now = Date.now();
        const conv: AparteConversation = {
            id: crypto.randomUUID(),
            title,
            createdAt: now,
            updatedAt: now,
            messages: [],
            schemaVersion: APARTE_CONVERSATION_SCHEMA_VERSION,
        };
        this._conversations = [conv, ...this._conversations];
        this._activeId = conv.id;
        await this._adapter.save(conv);
        this._notify();
        return conv;
    }

    /** Switch active conversation without touching storage. */
    select(id: string): void {
        if (!this._conversations.find(c => c.id === id)) return;
        this._activeId = id;
        this._notify();
    }

    /** Deselect the active conversation (no conv selected). */
    clearActive(): void {
        this._activeId = null;
        this._notify();
    }

    /** Append a message to a conversation. Auto-generates title from first user message. */
    async addMessage(convId: string, msg: AparteMessage): Promise<void> {
        const conv = this._find(convId);
        if (!conv) return;

        const isFirstUserMsg =
            msg.role === 'user' &&
            conv.messages.every(m => m.role !== 'user');

        const updated: AparteConversation = {
            ...conv,
            messages: [...conv.messages, msg],
            updatedAt: Date.now(),
            title: isFirstUserMsg ? this._autoTitle(msg) : conv.title,
        };
        this._replace(updated);
        await this._adapter.save(updated);
        this._notify();
    }

    /**
     * Replace the flat active-path messages and optionally the full branch tree.
     * `messages` is always written (active path, for sidebar/title/compat).
     * `tree` is written when provided — it carries the full branching topology.
     */
    async updateMessages(convId: string, messages: AparteMessage[], tree?: ExportedMessageRepository): Promise<void> {
        const conv = this._find(convId);
        if (!conv) return;
        // Opt-in history retention (bounds STORAGE, never the live session).
        if (this._retention) {
            ({ messages, tree } = applyRetention(messages, tree, this._retention.maxMessages));
        }
        // `updatedAt` drives the sidebar sort — bump it ONLY on a genuine
        // content change. `_persistActive()` also fires on plain navigation /
        // teardown (opening a conversation, switching away) ; without this
        // guard, merely viewing a conversation re-saves identical messages and
        // floats it to the top of the list.
        let contentChanged = true;
        try {
            contentChanged = JSON.stringify(messages) !== JSON.stringify(conv.messages);
        } catch { /* unserialisable payload → assume changed */ }
        const updated: AparteConversation = {
            ...conv,
            messages,
            updatedAt: contentChanged ? Date.now() : conv.updatedAt,
        };
        if (tree !== undefined) updated.tree = tree;
        this._replace(updated);
        await this._adapter.save(updated);
        this._notify();
    }

    /** Permanently delete a conversation. */
    async delete(id: string): Promise<void> {
        this._conversations = this._conversations.filter(c => c.id !== id);
        if (this._activeId === id) this._activeId = null;
        await this._adapter.delete(id);
        this._notify();
    }

    /** Archive a conversation (soft-delete). */
    async archive(id: string): Promise<void> {
        const conv = this._find(id);
        if (!conv) return;
        // Archiving is a metadata change, not a content change — leave
        // `updatedAt` untouched so the conv keeps its real chronological slot.
        const updated: AparteConversation = { ...conv, archivedAt: Date.now() };
        this._replace(updated);
        if (this._adapter.archive) {
            await this._adapter.archive(id);
        } else {
            await this._adapter.save(updated);
        }
        if (this._activeId === id) this._activeId = null;
        this._notify();
    }

    /** Restore an archived conversation. */
    async unarchive(id: string): Promise<void> {
        const conv = this._find(id);
        if (!conv) return;
        // Unarchiving is metadata-only — don't bump `updatedAt`, otherwise the
        // restored conv wrongly floats to the top instead of returning to its
        // real chronological position.
        const updated: AparteConversation = { ...conv, archivedAt: undefined };
        this._replace(updated);
        if (this._adapter.unarchive) {
            await this._adapter.unarchive(id);
        } else {
            await this._adapter.save(updated);
        }
        this._notify();
    }

    /** Update the title manually. The full input is preserved — UI surfaces
     *  (sidebar list, topbar) are responsible for visual truncation via CSS
     *  (`min-w-0` + `truncate`). Auto-titles produced internally by
     *  `_autoTitle()` remain capped at a sensible length on input. */
    async updateTitle(id: string, title: string): Promise<void> {
        const conv = this._find(id);
        if (!conv) return;
        const updated: AparteConversation = { ...conv, title: title.trim(), updatedAt: Date.now() };
        this._replace(updated);
        await this._adapter.save(updated);
        this._notify();
    }

    // ─── Observer ───────────────────────────────────────────────────────────

    subscribe(listener: Listener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    // ─── Private ────────────────────────────────────────────────────────────

    private _find(id: string): AparteConversation | undefined {
        return this._conversations.find(c => c.id === id);
    }

    private _replace(updated: AparteConversation): void {
        this._conversations = this._conversations.map(c =>
            c.id === updated.id ? updated : c
        );
    }

    private _notify(): void {
        const snapshot = [...this._conversations];
        // Each listener is isolated: a throwing/slow listener must not break
        // the notification chain for the others. Errors are surfaced via
        // console.error so they remain debuggable in dev tools.
        this._listeners.forEach(l => {
            try {
                l(snapshot);
            } catch (err) {
                // eslint-disable-next-line no-console
                console.error('[ConversationManager] listener threw:', err);
            }
        });
    }

    private _autoTitle(msg: AparteMessage): string {
        const raw = msg.content;
        const text = typeof raw === 'string' ? raw : (raw ?? '').toString();
        // Auto-title from the first user message. Full content is preserved
        // (UI surfaces handle visual truncation via CSS). The user can rename
        // freely afterwards via updateTitle() — also untouched.
        return text.trim() || 'New Chat';
    }
}
