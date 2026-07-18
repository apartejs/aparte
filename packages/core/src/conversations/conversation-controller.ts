import type { AparteMessage, AparteAttachment } from '../types/index.js';
import type { ConversationManager } from './conversation-manager.js';
import type { AparteConversation } from './types.js';
import type { ExportedMessageRepository } from '../runtime/message-repository.js';
import { resolveConfig } from '../config/config-context.js';

/**
 * Abstract binding between a chat UI and the conversation lifecycle.
 *
 * Each framework wrapper (Angular, React, Vue, Svelte) provides an
 * implementation that knows how to mutate its own message list. The
 * controller orchestrates loading, persistence and abort using only this
 * interface, keeping the conversation engine fully framework-agnostic.
 */
export interface AparteChatBinding {
    /** Stable id of the host element (used as `targetId` for scoped events). */
    readonly hostId: string;
    /** The element that emits/receives `aparte-send` and `aparte-path-changed`. */
    readonly host: HTMLElement;
    /** Replace the entire message list (used when switching conversations). */
    setMessages(messages: AparteMessage[]): void;
    /** Append a single message (used for the optimistic user-msg on send). */
    appendMessage(message: AparteMessage): void;
    /** Read the current message list. */
    getMessages(): AparteMessage[];
    /** Clear all messages (e.g. when starting a new conversation). */
    clearMessages(): void;
    /**
     * Export the full conversation tree for persistence.
     * Optional: only available when the binding wraps a `MessageRepository`
     * (e.g. the vanilla viewport). Returns `undefined` when not supported.
     */
    exportTree?(): ExportedMessageRepository | undefined;
    /**
     * Import a previously-persisted tree snapshot, restoring full branch
     * topology. Called by the controller after `setMessages` (which handles
     * cleanup) when the loaded conversation carries a `tree` field.
     * Optional: falls back to the flat `setMessages` load when absent.
     */
    importTree?(tree: ExportedMessageRepository): void;
}

export interface AparteConversationControllerOptions {
    /**
     * Conversation manager. If omitted, the controller resolves it from
     * `AparteConfig.getConversationManager()` when first needed.
     */
    manager?: ConversationManager;
    /**
     * Called whenever a new conversation is created lazily (on first user
     * message in an empty thread). Useful for the parent app to sync the URL.
     */
    onConversationCreated?: (id: string) => void;
}

/**
 * Connects an `AparteChatBinding` to a `ConversationManager`.
 *
 * Responsibilities:
 *   - Load messages when `setConversationId(id)` is called.
 *   - Lazily create a conversation on the first user `aparte-send` if none active.
 *   - Persist updates triggered by `aparte-path-changed` (branch nav, retry, edit).
 *   - Dispatch `aparte-abort` when the active conversation changes mid-stream.
 *
 * Usage:
 * ```ts
 * const controller = new AparteConversationController(binding);
 * const stop = controller.bind();
 * controller.setConversationId('abc-123');
 * // …
 * stop();
 * ```
 */
export class AparteConversationController {
    private _binding: AparteChatBinding;
    private _options: AparteConversationControllerOptions;
    private _activeId: string | null = null;
    private _isStreaming = false;
    private _isLoadingConversation = false;
    private _ensureInFlight: Promise<string> | null = null;

    private _onSendCapture: ((e: Event) => void) | null = null;
    private _onPathChanged: ((e: Event) => void) | null = null;
    private _onMessageStart: (() => void) | null = null;
    private _onMessageDone: (() => void) | null = null;
    private _onMessageError: (() => void) | null = null;
    private _onMessageAborted: (() => void) | null = null;
    private _onSelectConversation: ((e: Event) => void) | null = null;
    private _unsubscribeManager: (() => void) | null = null;

    constructor(binding: AparteChatBinding, options: AparteConversationControllerOptions = {}) {
        this._binding = binding;
        this._options = options;
    }

    /** The current active conversation id (null when none selected). */
    get activeId(): string | null {
        return this._activeId;
    }

    /**
     * Lazily resolve the conversation manager. Returns `undefined` if none is
     * registered — the controller then runs in degraded mode: optimistic UI
     * still works (user message is appended) but no persistence happens. This
     * keeps backward compatibility with hosts that haven't opted into the
     * conversation lifecycle yet.
     */
    private _manager(): ConversationManager | undefined {
        // Explicit option first, then the config governing the host element
        // (instance config under a [data-aparte-host] boundary, else the global).
        return this._options.manager ?? resolveConfig(this._binding.host).getConversationManager();
    }

    /**
     * Attach event listeners to the binding host. Returns an unbind function.
     */
    bind(): () => void {
        const host = this._binding.host;

        // Capture-phase aparte-send so we can ensure a conversation exists and
        // append the user message BEFORE AparteClient (window-bubble listener)
        // sees the event. Without capture, AparteClient would race with us.
        this._onSendCapture = (e: Event) => {
            const evt = e as CustomEvent<{ content?: string; targetId?: string; files?: File[]; timestamp?: number }>;
            // Only handle events targeting this binding
            const targetId = evt.detail?.targetId;
            if (targetId && targetId !== this._binding.hostId) return;

            const content = evt.detail?.content ?? '';
            const files = evt.detail?.files;
            const attachments: AparteAttachment[] | undefined = files?.length
                ? files.map(f => ({
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
                    name: f.name,
                    type: f.type || 'application/octet-stream',
                    url: URL.createObjectURL(f),
                    size: f.size,
                    // Carry the raw File so the storage adapter can persist it
                    // to its attachments table; reload reconstructs `url`.
                    blob: f,
                }))
                : undefined;
            const userMsg: AparteMessage = {
                id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
                role: 'user',
                content,
                timestamp: evt.detail?.timestamp ?? Date.now(),
                ...(attachments ? { attachments } : {}),
            };

            // 1. Optimistic UI: append the user message immediately so it
            //    appears before any AI streaming begins.
            this._binding.appendMessage(userMsg);

            // 2. Ensure a conversation exists (lazy create on first send) and
            //    persist the user message. Done async; AparteClient continues.
            void this._ensureConversationAndPersist(userMsg);
        };
        host.addEventListener('aparte-send', this._onSendCapture, { capture: true });

        // Persist after every path change (branch nav, edit, retry).
        // Note: streaming completion does NOT dispatch aparte-path-changed;
        // see _onMessageDone/Error/Aborted below for that case.
        // Guard: skip during setConversationId() — importTree() triggers
        // aparte-path-changed synchronously when restoring branch topology,
        // and persisting there would touch updatedAt causing the conv to
        // float to the top of the history list without any real modification.
        this._onPathChanged = () => {
            if (!this._isLoadingConversation) {
                this._persistActive();
            }
        };
        host.addEventListener('aparte-path-changed', this._onPathChanged);

        // Track streaming state so setConversationId can abort cleanly, AND
        // persist freshly-completed assistant turns to storage. Without this,
        // assistant messages would only ever live in the in-memory binding
        // because aparte-path-changed is reserved for branch operations.
        this._onMessageStart = () => { this._isStreaming = true; };
        this._onMessageDone = () => {
            this._isStreaming = false;
            // Defer one microtask so any synchronous listener that finalises
            // the message in the binding (e.g. viewport state flush) runs
            // before we snapshot getMessages().
            queueMicrotask(() => this._persistActive());
        };
        this._onMessageError = () => {
            this._isStreaming = false;
            queueMicrotask(() => this._persistActive());
        };
        this._onMessageAborted = () => {
            this._isStreaming = false;
            queueMicrotask(() => this._persistActive());
        };
        host.addEventListener('aparte-message-start', this._onMessageStart);
        host.addEventListener('aparte-message-done', this._onMessageDone);
        host.addEventListener('aparte-message-error', this._onMessageError);
        host.addEventListener('aparte-message-aborted', this._onMessageAborted);

        // App-level selection bus. Lets sidebars / nav menus drive the
        // active conversation without going through Angular @Input bindings,
        // and works even when the user clicks the conversation that's
        // already active (where route params don't re-emit).
        // Detail shape: { id: string | null, targetId?: string }.
        // When `targetId` is set, only the matching binding handles it
        // (multi-chat hosts). When omitted, every bound controller listens.
        this._onSelectConversation = (e: Event) => {
            const evt = e as CustomEvent<{ id: string | null; targetId?: string }>;
            const targetId = evt.detail?.targetId;
            if (targetId && targetId !== this._binding.hostId) return;
            void this.setConversationId(evt.detail?.id ?? null);
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('aparte-select-conversation', this._onSelectConversation);
        }

        // Subscribe to manager so we can react to external mutations
        // (e.g. another component deleting/archiving the active conv).
        // Without this the binding would keep showing a phantom history
        // for an id the manager no longer knows about.
        const manager = this._manager();
        if (manager) {
            this._unsubscribeManager = manager.subscribe((convs) => {
                if (!this._activeId) return;
                const stillExists = convs.some((c) => c.id === this._activeId && !c.archivedAt);
                if (!stillExists) {
                    // If a stream is in flight, kill it before clearing the binding.
                    // Without this, deleting the active conv leaves the orchestrator
                    // and AI provider running until they finish naturally.
                    if (this._isStreaming) {
                        try {
                            window.dispatchEvent(new CustomEvent('aparte-abort', {
                                detail: { targetId: this._binding.hostId },
                            }));
                        } catch {
                            /* environments without window */
                        }
                        this._isStreaming = false;
                    }
                    this._activeId = null;
                    this._binding.clearMessages();
                }
            });
        }

        return () => this.unbind();
    }

    /** Detach event listeners. */
    unbind(): void {
        // Persist current state before tearing down. This covers the case where
        // the host component is destroyed mid-stream (e.g. "New Chat" navigates
        // to a new route instance): _persistActive() would never be called
        // otherwise, losing the partially-written assistant message.
        // _persistActive() is a no-op when _activeId is null, so this is safe
        // for new instances that were never given a conversation id.
        this._persistActive();
        const host = this._binding.host;
        if (this._onSendCapture) {
            host.removeEventListener('aparte-send', this._onSendCapture, { capture: true } as EventListenerOptions);
            this._onSendCapture = null;
        }
        if (this._onPathChanged) {
            host.removeEventListener('aparte-path-changed', this._onPathChanged);
            this._onPathChanged = null;
        }
        if (this._onMessageStart) {
            host.removeEventListener('aparte-message-start', this._onMessageStart);
            this._onMessageStart = null;
        }
        if (this._onMessageDone) {
            host.removeEventListener('aparte-message-done', this._onMessageDone);
            this._onMessageDone = null;
        }
        if (this._onMessageError) {
            host.removeEventListener('aparte-message-error', this._onMessageError);
            this._onMessageError = null;
        }
        if (this._onMessageAborted) {
            host.removeEventListener('aparte-message-aborted', this._onMessageAborted);
            this._onMessageAborted = null;
        }
        if (this._onSelectConversation && typeof window !== 'undefined') {
            window.removeEventListener('aparte-select-conversation', this._onSelectConversation);
            this._onSelectConversation = null;
        }
        if (this._unsubscribeManager) {
            this._unsubscribeManager();
            this._unsubscribeManager = null;
        }
    }

    /**
     * Switch to (or clear) the active conversation.
     *  - `null`: clears the binding and deselects in the manager.
     *  - any id: loads the conversation's messages into the binding.
     *
     * Idempotent: calling with the current id forces a re-snapshot from the
     * manager (handy when external mutations could have desynchronised the
     * binding, or when a user re-selects the already-active conv from a
     * sidebar). Streams are only aborted on an actual id change so a same-id
     * reload never kills an in-flight response.
     */
    async setConversationId(id: string | null): Promise<void> {
        const isSwitch = id !== this._activeId;
        const manager = this._manager();
        // Abort any in-flight stream tied to this binding only when actually
        // switching to a different conversation.
        if (isSwitch && this._isStreaming) {
            // Persist the current state (user message + partial assistant reply)
            // BEFORE aborting. The abort event fires asynchronously; if we
            // persist after it, the binding may already be cleared/replaced.
            this._persistActive();
            try {
                window.dispatchEvent(new CustomEvent('aparte-abort', {
                    detail: { targetId: this._binding.hostId },
                }));
            } catch {
                /* environments without window */
            }
            this._isStreaming = false;
        }

        if (id === null) {
            // Always sync the manager to null so external observers (e.g. sidebar
            // active-id highlight) reflect the cleared state — even when this
            // controller instance already has _activeId = null (new mount on root).
            if (isSwitch) this._persistActive();
            // Abort any in-flight stream when navigating away to home (null),
            // mirroring the same guard that exists for non-null switches above.
            if (isSwitch && this._isStreaming) {
                try {
                    window.dispatchEvent(new CustomEvent('aparte-abort', {
                        detail: { targetId: this._binding.hostId },
                    }));
                } catch {
                    /* environments without window */
                }
                this._isStreaming = false;
            }
            this._activeId = null;
            manager?.clearActive();
            if (isSwitch) this._binding.clearMessages();
            return;
        }

        const conv = manager?.conversations.find((c: AparteConversation) => c.id === id);
        if (!manager || !conv) {
            // Race-condition guard. When the host (Angular APP_INITIALIZER, route
            // resolver, or any other async init) hands us a conversationId BEFORE
            // the manager has finished hydrating from IndexedDB, the id is
            // legitimately not in `manager.conversations` yet — but it WILL be
            // there shortly after `manager.init()` resolves. Clearing the binding
            // here would wipe the persisted tree from the UI (and break the
            // history that the LLM relies on for multi-turn coherence).
            //
            // Signal: when the manager exists but `initialized` is still false
            // (i.e. `init()` has not yet completed), treat this as "hydrating"
            // and defer the decision. Subscribe once; when the manager next
            // emits with the id NOW present, re-run setConversationId(id) to
            // load the tree. If the id is still missing after the emit, we
            // fall back to the clear path below (truly unknown id case).
            //
            // We deliberately do NOT use `conversations.length === 0` here —
            // that conflates "still hydrating" with "hydrated but empty"
            // (first-time user, no convs yet), which would defer forever.
            if (manager && !manager.initialized) {
                const stop = manager.subscribe(() => {
                    stop();
                    // Only retry if the id has become known. Otherwise let the
                    // next emit (or a later setConversationId call) handle it.
                    if (manager.conversations.some((c: AparteConversation) => c.id === id)) {
                        void this.setConversationId(id);
                    } else if (this._activeId === null) {
                        // Hydration finished without the id — that id is truly
                        // unknown (deleted conv, stale URL). Clear now.
                        console.warn('[ConversationController] id still unknown after hydration — clearing. id:', id);
                        manager.clearActive();
                        this._binding.clearMessages();
                    }
                });
                return;
            }
            console.warn('[ConversationController] unknown id or no manager — clearing. manager:', !!manager, 'conv:', !!conv);
            // Unknown id (or no manager) — treat as clear to keep state consistent.
            this._activeId = null;
            manager?.clearActive();
            this._binding.clearMessages();
            return;
        }

        this._activeId = id;
        // The controller is the sole writer of `manager._activeId`. Other
        // components must dispatch `aparte-select-conversation` rather than
        // calling `manager.select()` directly.
        manager.select(id);
        // setMessages always runs first: it handles cleanup (stop streaming,
        // clear rendered ids, reset spacer) and sets the flat active-path signal.
        // importTree (below) may dispatch aparte-path-changed synchronously — flag
        // the load to prevent _onPathChanged from calling _persistActive() and
        // touching updatedAt (which would cause the conv to float to the top).
        this._isLoadingConversation = true;
        try {
            this._binding.setMessages([...conv.messages]);
            // If the conversation has a full tree snapshot and the binding supports
            // importing it, restore the branch topology on top. This is a no-op
            // for bindings that don't implement importTree.
            if (conv.tree && this._binding.importTree) {
                this._binding.importTree(conv.tree);
            }
        } finally {
            this._isLoadingConversation = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Snapshot the binding's current messages and push them to the manager.
     * No-op when there is no active conversation or no manager registered.
     * Idempotent: safe to call multiple times in a row.
     *
     * Any message whose status is 'streaming' or 'pending' at persist-time is
     * normalised to 'completed' so that reloading the conversation does not
     * re-enter streaming UI (caret, spinner, no action buttons) for content
     * that was partially written before a switch or component destruction.
     */
    private _persistActive(): void {
        if (!this._activeId) return;
        const manager = this._manager();
        if (!manager) return;
        const msgs = this._binding.getMessages().map(m =>
            (m.status === 'streaming' || m.status === 'pending')
                ? { ...m, status: 'completed' as const }
                : m
        );
        // Export the full branch tree when the binding supports it.
        // Normalize streaming/pending nodes so reloading never re-enters
        // streaming UI for content that was only partially written.
        let tree = this._binding.exportTree?.();
        if (tree) {
            tree = {
                headId: tree.headId,
                messages: tree.messages.map(({ message, parentId }) => ({
                    message: (message.status === 'streaming' || message.status === 'pending')
                        ? { ...message, status: 'completed' as const }
                        : message,
                    parentId,
                })),
            };
        }
        void manager.updateMessages(this._activeId, msgs, tree);
    }

    private async _ensureConversationAndPersist(userMsg: AparteMessage): Promise<void> {
        const manager = this._manager();
        if (!manager) {
            // No persistence layer wired — optimistic UI was already applied by
            // the send-handler; we have nothing more to do.
            return;
        }

        // Capture the active id at send-time. If the user switches
        // conversations while createNew()/addMessage() are in flight we
        // must not clobber the new active id.
        const wasActiveId = this._activeId;
        let convId = wasActiveId ?? manager.activeId;

        if (!convId) {
            // Coalesce concurrent sends (e.g. suggestion + quick type) into one
            // conversation creation.
            if (!this._ensureInFlight) {
                // Title kept full-length; UI surfaces handle visual truncation
                // via CSS (`min-w-0` + `truncate`). See conversation-manager
                // updateTitle() / _autoTitle() comments.
                const text = (userMsg.content ?? '').toString().trim() || 'New Chat';
                this._ensureInFlight = manager.createNew(text).then(conv => conv.id);
            }
            convId = await this._ensureInFlight;
            this._ensureInFlight = null;

            // Race guard: if the user switched away while createNew() was
            // resolving, the optimistic user message was already replaced
            // in the binding by setConversationId(). The freshly-created
            // conversation is an orphan; drop it and bail rather than
            // persisting a ghost message into a conv the user can't see.
            if (this._activeId !== wasActiveId) {
                void manager.delete(convId).catch(() => { /* best effort */ });
                return;
            }

            this._activeId = convId;
            this._options.onConversationCreated?.(convId);
        } else if (this._activeId !== null && this._activeId !== convId) {
            // Existing-conv path but the user switched between the optimistic
            // append and now. The message was visually shown in the old conv;
            // persist it there and stop — do not mutate the new active conv.
            await manager.addMessage(convId, userMsg).catch(() => { /* best effort */ });
            return;
        }

        await manager.addMessage(convId, userMsg);
    }
}
