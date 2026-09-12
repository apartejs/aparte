import type { AparteMessage } from '../types/index.js';
import { APARTE_DERIVED_SEGMENTS } from '../types/models.js';
import type { AparteConversation, AparteStorageAdapter } from './types.js';
import type { ExportedMessageRepository } from '../runtime/message-repository.js';
import { APARTE_CONVERSATION_SCHEMA_VERSION } from './types.js';
import { uuid } from '../utils/uuid.js';

type Listener = (conversations: AparteConversation[]) => void;

/**
 * Titles a conversation from its first user message.
 *
 * Receives the message's text and the message itself, and returns the title —
 * synchronously or not. An empty answer, or a throw, leaves
 * the default title (the text as typed), so a titler that fails never loses the
 * message from the sidebar. Registered with `AparteConversationManager.setTitleProvider`;
 * `@aparte/plugin-titler` binds one to an aparte-titler model.
 */
export type AparteConversationTitleProvider = (text: string, message: AparteMessage) => string | Promise<string>;

export interface ConversationManagerOptions {
    /**
     * Titles a new conversation from its first user message, instead of the default
     * (the message's text). Same as calling `setTitleProvider` after construction.
     */
    titleProvider?: AparteConversationTitleProvider;
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
 * const manager = new AparteConversationManager(myAdapter);
 * await manager.init();                    // load from storage
 * const conv = await manager.createNew(); // returns new AparteConversation
 * ```
 *
 * The manager emits synchronous notifications to registered listeners on every
 * mutation so framework wrappers (Angular signals, Vue reactive, etc.) can
 * react without polling.
 */
/**
 * A message as the store would see it: without the `segments` a viewport derived from
 * its markdown on display (marked with the non-enumerable `APARTE_DERIVED_SEGMENTS`).
 * Comparing with them counted every opened conversation as changed, so it was re-saved
 * on leave and floated to the top of the list.
 */
function withoutDerived(message: AparteMessage): AparteMessage {
    if (!(message as unknown as Record<symbol, unknown>)[APARTE_DERIVED_SEGMENTS]) return message;
    const { segments: _derived, ...rest } = message;
    return rest;
}

function withoutDerivedSegments(messages: AparteMessage[]): AparteMessage[] {
    return messages.map(withoutDerived);
}

/**
 * The same, for the branch tree — the two halves of a record have to agree. Stripping
 * the flat messages alone left the tree carrying them, and a viewport imports the
 * TREE: its parser short-circuits on a message that already has segments, so they came
 * back UNMARKED, no longer strippable, and the next persist read them as a change. The
 * conversation was re-saved and re-grouped under "Today" for having been opened.
 */
function withoutDerivedTree(tree: ExportedMessageRepository): ExportedMessageRepository {
    return {
        ...tree,
        messages: tree.messages.map((entry) => ({ ...entry, message: withoutDerived(entry.message) })),
    };
}

export class AparteConversationManager {
    private _adapter: AparteStorageAdapter;
    private _conversations: AparteConversation[] = [];
    private _activeId: string | null = null;
    private _listeners: Set<Listener> = new Set();
    private _initialized = false;
    private _retention: { maxMessages: number } | null = null;
    private _titleProvider: AparteConversationTitleProvider | null = null;
    /** Ids whose messages are in memory. Every id, after a loadAll(); only fetched ones after loadMeta(). */
    private _loaded = new Set<string>();
    /** One fetch per id at a time: a second ensureFull(id) while the first is in flight joins it. */
    private _fetching = new Map<string, Promise<boolean>>();
    /** One append per id at a time: the next addMessage(id) reads what the previous one wrote. */
    private _appending = new Map<string, Promise<void>>();
    /** The list on its way: a conversation created meanwhile waits for it, or the list would replace it. */
    private _initPromise: Promise<void> | null = null;

    constructor(adapter: AparteStorageAdapter, options?: ConversationManagerOptions) {
        this._adapter = adapter;
        this._retention = options?.retention ?? null;
        this._titleProvider = options?.titleProvider ?? null;
    }

    // ─── Title provider ─────────────────────────────────────────────────────

    /**
     * Replace how a new conversation is titled from its first user message.
     * `null` restores the default (the message's text). The provider is consulted
     * once per conversation, on that first message; `updateTitle` is untouched.
     */
    setTitleProvider(provider: AparteConversationTitleProvider | null): void {
        this._titleProvider = provider;
    }

    /** The registered title provider, or `null` when the default applies. */
    getTitleProvider(): AparteConversationTitleProvider | null {
        return this._titleProvider;
    }

    // ─── Initialisation ────────────────────────────────────────────────────

    /**
     * Load all conversations from the adapter. Call once at app startup.
     *
     * A later call re-reads the list from the store: rows it no longer lists are
     * dropped, and a conversation whose messages are already in memory keeps them —
     * so the one on screen goes on being persisted.
     */
    async init(): Promise<void> {
        const load = (async () => {
            // The list first, the messages on demand — when the adapter can split the two.
            // loadMeta() and loadFull() were in the contract from the start and nothing
            // called them: every store loaded everything, and between a click and its
            // messages there was no moment at all (the chat-site review, 2026-09-05). An
            // adapter without loadMeta loads everything as before, and every
            // conversation counts as loaded.
            const split = !!(this._adapter.loadMeta && this._adapter.loadFull);
            if (this._adapter.loadMeta && !this._adapter.loadFull) {
                console.warn('[AparteConversationManager] the adapter lists through loadMeta() but has no loadFull(): everything is loaded through loadAll() instead.');
            }
            // A second init() reads the store again: the list is metadata, so a
            // conversation whose messages are already in memory keeps them and stays
            // loaded — the one on screen would otherwise come back with an empty
            // transcript that no write is allowed to touch, so nothing said and nothing
            // persisted for the rest of the session. A row the store no longer lists is
            // forgotten with its messages.
            const held = new Map(this._conversations.filter((c) => this._loaded.has(c.id)).map((c) => [c.id, c] as const));
            this._loaded.clear();
            const rows: AparteConversation[] = split
                ? (await this._adapter.loadMeta!()).map((m) => {
                    const kept = held.get(m.id);
                    return kept ? { ...m, messages: kept.messages, ...(kept.tree ? { tree: kept.tree } : {}) } : { ...m, messages: [] };
                })
                : (await this._adapter.loadAll()).map((c) => ({ ...c, messages: c.messages ?? [] }));
            // One row per id: a list that repeats one would make every later write, and
            // every delete, hit twins.
            const seen = new Set<string>();
            const unique = rows.filter((c) => !seen.has(c.id) && (seen.add(c.id), true));
            if (unique.length !== rows.length) {
                console.warn(`[AparteConversationManager] ${rows.length - unique.length} repeated id(s) in the list; the first row wins.`);
            }
            this._conversations = unique;
            for (const c of unique) if (!split || held.has(c.id)) this._loaded.add(c.id);
            this._initialized = true;
            this._notify();
        })();
        this._initPromise = load;
        try {
            await load;
        } finally {
            if (this._initPromise === load) this._initPromise = null;
        }
    }

    /** Whether a conversation's messages are in memory (always, without split storage). */
    isLoaded(id: string): boolean {
        return this._loaded.has(id);
    }

    /**
     * Fetch a conversation's messages through the adapter's loadFull(), the first time
     * they are needed; later calls resolve at once. The row keeps its place and its meta;
     * the messages (and the tree) come from the full record, and a message written to
     * the row while the fetch ran goes after them. Resolves `false` when the store has no
     * such record (or answers with another id) — the row is then NOT loaded, and says so,
     * rather than counting as an empty conversation.
     */
    async ensureFull(id: string): Promise<boolean> {
        if (this._loaded.has(id)) return true;
        if (!this._adapter.loadFull) return false;
        const inFlight = this._fetching.get(id);
        if (inFlight) return inFlight;
        const fetch = (async (): Promise<boolean> => {
            const full = await this._adapter.loadFull!(id);
            const row = this._find(id);
            if (!row || !full) return false;
            if (full.id !== id) {
                console.warn(`[AparteConversationManager] loadFull('${id}') answered with '${full.id}': ignored.`);
                return false;
            }
            // No write can have landed on the row meanwhile: every write to a
            // conversation whose messages are not in memory fetches them first (or, for
            // a wholesale replace, is refused), so the record is the store's plus nothing.
            this._replace({ ...row, ...full, id, messages: full.messages ?? [] });
            this._loaded.add(id);
            this._notify();
            return true;
        })().finally(() => this._fetching.delete(id));
        this._fetching.set(id, fetch);
        return fetch;
    }

    /**
     * The row with its messages in memory — fetched first when they are not, so a
     * metadata change never writes a row back without them. `null` when the id is
     * unknown or the store has no record to fetch.
     */
    private async _full(id: string): Promise<AparteConversation | null> {
        if (!this._loaded.has(id) && this._adapter.loadFull) {
            const loaded = await this.ensureFull(id);
            if (!loaded) return null;
        }
        return this._find(id) ?? null;
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

    /**
     * Create a new empty conversation, persist it, and make it active. Untitled by
     * default: the list shows its locale's `newChat` word for an empty title, so the
     * store never carries an English string a French UI would then display.
     */
    async createNew(title = ''): Promise<AparteConversation> {
        const now = Date.now();
        const conv: AparteConversation = {
            id: uuid(),
            title,
            createdAt: now,
            updatedAt: now,
            messages: [],
            schemaVersion: APARTE_CONVERSATION_SCHEMA_VERSION,
        };
        // Active SYNCHRONOUSLY, before any await: the controller reads `activeId` on a
        // send that overlaps the creation, to join it rather than create a second one.
        this._activeId = conv.id;
        this._loaded.add(conv.id); // born in memory: nothing to fetch
        // The list on its way replaces `_conversations` when it lands: a conversation
        // created meanwhile waits for it, or it would vanish from the list while staying
        // the active one.
        if (this._initPromise) await this._initPromise.catch(() => { /* init reports it */ });
        this._conversations = [conv, ...this._conversations];
        try {
            await this._adapter.save(conv);
        } catch (err) {
            // The conversation exists in memory and is active: the next write saves the
            // whole record again. Failing here used to leave the controller with no
            // active id for the rest of the session — nothing persisted after that.
            console.warn('[AparteConversationManager] save() failed for a new conversation; it stays in memory and the next write retries.', err);
        }
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

    /**
     * Append a message to a conversation. Auto-generates title from first user message.
     *
     * One append at a time per conversation: two sends that overlap (a suggestion and a
     * quick type, coalesced into one new conversation) both suspend before reading the
     * record — for the messages, then for the title provider — so both used to read a
     * conversation with no user message in it yet, and the second one's text became the
     * title.
     */
    async addMessage(convId: string, msg: AparteMessage): Promise<void> {
        const previous = this._appending.get(convId);
        const run = previous
            ? previous.then(() => this._append(convId, msg))
            : this._append(convId, msg);
        // The queue never carries a rejection: a failed append must not swallow the next
        // message. The caller still sees its own.
        const tail = run.catch(() => { /* the caller's promise reports it */ });
        this._appending.set(convId, tail);
        void tail.then(() => { if (this._appending.get(convId) === tail) this._appending.delete(convId); });
        return run;
    }

    private async _append(convId: string, msg: AparteMessage): Promise<void> {
        // The messages first, when they are not in memory: appending to the `[]` the
        // list came with, then saving, wrote that one message over the stored ones.
        const conv = await this._full(convId);
        if (!conv) return;

        const isFirstUserMsg =
            msg.role === 'user' &&
            conv.messages.every(m => m.role !== 'user');

        // The title provider may take its time (a model loads on the first send), and
        // the reply streams meanwhile: the record is read AGAIN after the await, or the
        // write would carry the snapshot from before it — the reply and the tree gone.
        const title = isFirstUserMsg ? await this._title(msg) : null;
        const fresh = this._find(convId);
        if (!fresh) return;
        const present = fresh.messages.some(m => m.id === msg.id);
        const updated: AparteConversation = {
            ...fresh,
            messages: present ? fresh.messages : [...fresh.messages, msg],
            updatedAt: Date.now(),
            title: title ?? fresh.title,
        };
        if (isFirstUserMsg) updated.autoTitle = true;
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
        // A conversation whose messages are not in memory cannot be replaced: the
        // binding that asks is showing an empty transcript while the fetch runs, and
        // writing that through would wipe the stored messages.
        if (!this._loaded.has(convId)) {
            console.warn(`[AparteConversationManager] updateMessages('${convId}') before its messages were loaded: ignored.`);
            return;
        }
        // The title follows the first user message the CALLER sent — read before
        // retention trims the list, or a later message becomes "the first".
        const firstUser = messages.find(m => m.role === 'user');
        // Opt-in history retention (bounds STORAGE, never the live session).
        if (this._retention) {
            ({ messages, tree } = applyRetention(messages, tree, this._retention.maxMessages));
        }
        // `updatedAt` drives the sidebar sort — bump it ONLY on a genuine
        // content change. `_persistActive()` also fires on plain navigation /
        // teardown (opening a conversation, switching away) ; without this
        // guard, merely viewing a conversation re-saves identical messages and
        // floats it to the top of the list. Segments a viewport DERIVED from a
        // message's markdown on display are not a change either.
        const storedMessages = withoutDerivedSegments(messages);
        const storedTree = tree === undefined ? undefined : withoutDerivedTree(tree);
        let contentChanged = true;
        let treeChanged = tree !== undefined;
        try {
            contentChanged = JSON.stringify(storedMessages) !== JSON.stringify(withoutDerivedSegments(conv.messages));
            if (storedTree !== undefined) treeChanged = JSON.stringify(storedTree) !== JSON.stringify(conv.tree);
        } catch { /* unserialisable payload → assume changed */ }
        // The title follows the first user message while it is the manager's decision:
        // editing that message re-titles, the way the first send titled. A title the
        // user typed (`updateTitle`) is not the manager's and stays.
        let title: string | undefined;
        if (conv.autoTitle) {
            const before = conv.messages.find(m => m.role === 'user');
            if (firstUser && (firstUser.content ?? '') !== (before?.content ?? '')) {
                title = await this._title(firstUser);
            }
        }
        // Nothing changed: nothing to write. A conversation opened and left keeps its
        // record byte for byte, and its place in the list.
        if (!contentChanged && !treeChanged && title === undefined) return;
        // Read again after the await above: a write that landed meanwhile is the record.
        const fresh = this._find(convId);
        if (!fresh) return;
        const updated: AparteConversation = {
            ...fresh,
            // What is stored is what the caller sent: segments a viewport DERIVED on
            // display are not the app's content. Stored, they would fill the record with
            // core-generated ids and freeze the parse as it stood the day it was saved —
            // a block grammar registered later would never apply to that message.
            messages: storedMessages,
            updatedAt: contentChanged ? Date.now() : fresh.updatedAt,
        };
        if (storedTree !== undefined) updated.tree = storedTree;
        if (title !== undefined) updated.title = title;
        this._replace(updated);
        await this._adapter.save(updated);
        this._notify();
    }

    /** Permanently delete a conversation. */
    async delete(id: string): Promise<void> {
        this._conversations = this._conversations.filter(c => c.id !== id);
        this._loaded.delete(id);
        if (this._activeId === id) this._activeId = null;
        await this._adapter.delete(id);
        this._notify();
    }

    /** Archive a conversation (soft-delete). */
    async archive(id: string): Promise<void> {
        // Archiving is a metadata change, not a content change — leave
        // `updatedAt` untouched so the conv keeps its real chronological slot.
        if (!await this._meta(id, (conv) => ({ ...conv, archivedAt: Date.now() }), this._adapter.archive)) return;
        if (this._activeId === id) this._activeId = null;
        this._notify();
    }

    /**
     * A metadata change, through the adapter's own hook when it has one (the row is
     * updated in memory, nothing else travels), else through `save()` — with the
     * messages fetched first, so a row the list came with (`messages: []`) is never
     * written back over the stored ones.
     */
    private async _meta(
        id: string,
        change: (conv: AparteConversation) => AparteConversation,
        hook: ((id: string) => Promise<void>) | undefined,
    ): Promise<boolean> {
        if (hook) {
            const conv = this._find(id);
            if (!conv) return false;
            this._replace(change(conv));
            await hook.call(this._adapter, id);
            return true;
        }
        const conv = await this._full(id);
        if (!conv) return false;
        const updated = change(conv);
        this._replace(updated);
        await this._adapter.save(updated);
        return true;
    }

    /** Restore an archived conversation. */
    async unarchive(id: string): Promise<void> {
        // Unarchiving is metadata-only — don't bump `updatedAt`, otherwise the
        // restored conv wrongly floats to the top instead of returning to its
        // real chronological position.
        if (!await this._meta(id, (conv) => ({ ...conv, archivedAt: undefined }), this._adapter.unarchive)) return;
        this._notify();
    }

    /**
     * Pin a conversation, which the list shows in its "Pinned" group first. Metadata
     * only, like archive: `updatedAt` keeps the conversation's real chronological slot
     * for the day it is unpinned. An adapter that has `pin()` gets the call; one that
     * does not gets the whole record through `save()`.
     */
    async pin(id: string): Promise<void> {
        if (!await this._meta(id, (conv) => ({ ...conv, pinnedAt: Date.now() }), this._adapter.pin)) return;
        this._notify();
    }

    /** Unpin a conversation. Metadata only — see `pin()`. */
    async unpin(id: string): Promise<void> {
        if (!await this._meta(id, (conv) => ({ ...conv, pinnedAt: undefined }), this._adapter.unpin)) return;
        this._notify();
    }

    /** Update the title manually. The full input is preserved — UI surfaces
     *  (sidebar list, topbar) are responsible for visual truncation via CSS
     *  (`min-w-0` + `truncate`). Auto-titles produced internally by
     *  `_autoTitle()` remain capped at a sensible length on input. */
    async updateTitle(id: string, title: string): Promise<void> {
        if (!this._find(id)) {
            console.warn(`[AparteConversationManager] updateTitle('${id}'): unknown conversation.`);
            return;
        }
        const next = title.trim();
        // A rename is metadata, like archive and pin: `updatedAt` keeps the
        // conversation's real chronological slot. It also has to — an adapter's
        // `rename()` hook carries the title alone, so a bump here would live in memory
        // only, re-group the row under "Today" and send it back to its old date on the
        // next reload.
        const done = await this._meta(
            id,
            (conv) => ({ ...conv, title: next, autoTitle: false }),
            this._adapter.rename ? (convId) => this._adapter.rename!(convId, next) : undefined,
        );
        if (done) this._notify();
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
                console.error('[AparteConversationManager] listener threw:', err);
            }
        });
    }

    /**
     * The title of a conversation, decided on its first user message — and again if
     * that message is edited while the title is still the manager's: the provider's
     * answer when one is registered and answers, else the default.
     */
    private async _title(msg: AparteMessage): Promise<string> {
        const fallback = this._autoTitle(msg);
        if (!this._titleProvider) return fallback;
        try {
            const title = (await this._titleProvider((msg.content ?? '').trim(), msg)).trim();
            return title || fallback;
        } catch (err) {
            console.warn('[AparteConversationManager] the title provider threw; the default title stands:', err);
            return fallback;
        }
    }

    private _autoTitle(msg: AparteMessage): string {
        // Auto-title from the first user message. Full content is preserved
        // (UI surfaces handle visual truncation via CSS). The user can rename
        // freely afterwards via updateTitle() — also untouched. No text, no
        // title: the list shows its locale's `newChat` word for an empty one.
        return (msg.content ?? '').trim();
    }
}
