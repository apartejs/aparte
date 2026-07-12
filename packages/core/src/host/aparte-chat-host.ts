import type {
    AparteMessage,
    AparteSegment,
    AparteUsage,
    AparteSiblingInfo,
    ApartePathChangedEventDetail,
} from '../types/index.js';
import type { SyncableBubble } from '../components/bubble/bubble-sync.js';
import { populateBubbleFromMessage } from '../components/bubble/bubble-sync.js';
import type { ExportedMessageRepository } from '../runtime/message-repository.js';
import {
    AparteConversationController,
    type AparteChatBinding,
} from '../conversations/conversation-controller.js';
import type { AparteConfigClass } from '../config/aparte-config.js';
import { attachConfig, detachConfig } from '../config/config-context.js';

/**
 * Imperative slice of `<aparte-chat-bubble>` the host mutates directly during
 * streaming (segment add/update/remove + status). Loosely typed so any element
 * exposing the surface works (custom element, test double).
 */
interface StreamingBubble extends SyncableBubble {
    addSegment?(segment: AparteSegment): void;
    removeSegment?(segmentId: string): void;
    updateMessage?(updates: { status?: string }): void;
}

/**
 * Imperative slice of `<aparte-chat-viewport>` the host forwards to. Every method
 * is optional so the host degrades gracefully if a consumer passes a stripped
 * element; the real viewport implements them all.
 */
interface ViewportApi {
    appendToken?(messageId: string, chunk: string): void;
    completeMessage?(messageId: string): void;
    addBranch?(messageId: string): number;
    addSiblingOf?(existingId: string, newMessage: AparteMessage): string | null;
    truncateFrom?(messageId: string): void;
    truncateResponsesAfter?(userMessageId: string): void;
    getMessage?(messageId: string): AparteMessage | undefined;
    appendMessage?(message: AparteMessage): void;
    updateMessage?(messageId: string, updates: Partial<AparteMessage>): void;
    exportTree?(): ExportedMessageRepository;
    importTree?(tree: ExportedMessageRepository): void;
    clearAll?(): void;
    resetSpacer?(): void;
    configure?(config: { layoutTransitionMs?: number }): void;
    setAutoScroll?(enabled: boolean): void;
    setFrameworkManagedDOM?(managed: boolean): void;
    requestSmoothScroll?(): void;
}

/**
 * Everything `AparteChatHost` needs from the framework, expressed without any
 * framework types. Each wrapper (Angular signals, React state, Vue refs, Svelte
 * stores) implements these ~10 closures over its own reactive message list.
 */
export interface AparteChatHostBinding {
    /** Stable id for the host element (used as `targetId` for scoped events). */
    readonly hostId: string;
    /** The element `AparteClient` drives + that emits lifecycle/path events. */
    readonly host: HTMLElement;
    /** The `<aparte-chat-viewport>` element (branch ops, token append, bubbles). */
    readonly viewport: HTMLElement | null;

    /** Read the current message list (a snapshot). */
    getMessages(): AparteMessage[];
    /** Replace the framework's message list (triggers its re-render). */
    setMessages(messages: AparteMessage[]): void;

    /** Notify the consumer that messages changed (drives `messagesChange`). */
    onMessagesChange?(messages: AparteMessage[]): void;
    /** Notify the consumer a message was appended (drives `messageAppended`). */
    onMessageAppended?(message: AparteMessage): void;
    /** Flip the typing/“thinking” indicator. */
    onTypingChange?(isTyping: boolean): void;
    /** Streaming target id changed (drives `isStreaming`). */
    onStreamingChange?(streamingId: string | null): void;
    /** Run a callback after the framework has applied the latest render. */
    afterRender(cb: () => void): void;
    /** Reset the composer (clear text/attachments) on conversation swap. */
    resetComposer?(): void;
}

export interface AparteChatHostOptions {
    /** Forwarded to `viewport.configure({ layoutTransitionMs })` when > 0. */
    layoutTransitionMs?: number;
    /** Initial conversation id to load when the controller is created. */
    conversationId?: string | null;
    /** Called when the controller lazily creates a conversation on first send. */
    onConversationCreated?: (id: string) => void;
    /**
     * Instance config for this chat. When provided, {@link bind} marks the host
     * element as a `[data-aparte-host]` boundary so every Aparte component inside it
     * (bubbles, composer, renderers) resolves THIS config instead of the global
     * `AparteConfig` — the seam that lets several independently-configured chats
     * coexist on one page. Omit to keep the global-config behaviour.
     */
    config?: AparteConfigClass;
}

/**
 * Framework-agnostic chat-host orchestrator.
 *
 * Owns the streaming/branch/host-method layer that previously lived inline in
 * the Angular wrapper: it installs the imperative method surface `AparteClient`
 * calls onto the host element, tracks the streaming target id from
 * `apartemessage*` lifecycle events, guards writes against orphan streams (late
 * SSE after a conversation switch), handles `aparte:path-changed` branch
 * navigation, keeps the viewport's repo in sync before branch ops, and
 * reconciles bubbles via `populateBubbleFromMessage`.
 *
 * It composes — does not replace — `AparteConversationController` (persistence /
 * load / lazy-create) which it instantiates internally from the same binding.
 *
 * Each framework provides an {@link AparteChatHostBinding} over its reactive
 * message list and calls {@link bind} after the view mounts; the framework is
 * responsible for rendering `<aparte-chat-bubble message-id="…">` elements inside
 * the viewport and calling {@link syncBubbles} whenever its message list
 * changes (its idiomatic reactive hook: Angular effect, React effect, Vue
 * watch, Svelte afterUpdate).
 */
export class AparteChatHost {
    private readonly binding: AparteChatHostBinding;
    private readonly options: AparteChatHostOptions;

    /** Id of the assistant message currently streaming (null when idle). */
    private _streamingId: string | null = null;
    /** Message ids already reconciled onto a bubble (skip-rerender cache). */
    private readonly _renderedIds = new Set<string>();
    /** Sibling info from the last path-change, applied after the next render. */
    private _pendingSiblings?: AparteSiblingInfo[];
    /** Abort handle for an in-flight {@link streamTokens} loop. */
    private _streamAbort?: AbortController;

    private _conversationId: string | null = null;
    private _controller?: AparteConversationController;
    private _teardown: Array<() => void> = [];
    private _bound = false;

    constructor(binding: AparteChatHostBinding, options: AparteChatHostOptions = {}) {
        this.binding = binding;
        this.options = options;
        this._conversationId = options.conversationId ?? null;
    }

    // ── lifecycle ──────────────────────────────────────────────────────────

    /**
     * Install the host-method surface + event listeners and create the
     * conversation controller. Returns a teardown function; call once after the
     * view (viewport + composer) has mounted.
     */
    bind(): () => void {
        if (this._bound) return () => this.unbind();
        this._bound = true;

        const host = this.binding.host as HTMLElement & Record<string, unknown>;
        if (!host.id) host.id = this.binding.hostId;

        // Mark this host as an instance-config boundary FIRST, so everything
        // below (and every component inside, which resolves live) reads the
        // instance config rather than the global singleton.
        if (this.options.config) attachConfig(this.binding.host, this.options.config);

        const vp = this._vp();
        vp?.setFrameworkManagedDOM?.(true);
        if (this.options.layoutTransitionMs && this.options.layoutTransitionMs > 0) {
            vp?.configure?.({ layoutTransitionMs: this.options.layoutTransitionMs });
        }

        this._installHostMethods(host);
        this._installLifecycleListeners(host);
        this._installViewportListeners();
        this._createController(host);

        return () => this.unbind();
    }

    unbind(): void {
        if (!this._bound) return;
        this._bound = false;
        this.stopTokenStream();
        for (const off of this._teardown.splice(0)) {
            try { off(); } catch { /* ignore */ }
        }
        this._unbindController?.();
        this._unbindController = undefined;
        this._controller = undefined;
        if (this.options.config) detachConfig(this.binding.host);
    }

    // ── streaming state ────────────────────────────────────────────────────

    get streamingId(): string | null { return this._streamingId; }
    get isStreaming(): boolean { return this._streamingId !== null; }

    /** The internally-managed conversation controller (created in {@link bind}). */
    get conversationController(): AparteConversationController | undefined {
        return this._controller;
    }

    /** Clear the bubble-render cache (e.g. when the host clears messages externally). */
    clearRenderCache(): void {
        this._renderedIds.clear();
    }

    private _setStreamingId(id: string | null): void {
        if (this._streamingId === id) return;
        this._streamingId = id;
        this.binding.onStreamingChange?.(id);
    }

    // ── conversation ───────────────────────────────────────────────────────

    /** Load / switch the active conversation via the controller. */
    setConversationId(id: string | null): Promise<void> {
        this._conversationId = id;
        return this._controller?.setConversationId(id) ?? Promise.resolve();
    }

    private _unbindController?: () => void;

    private _createController(host: HTMLElement): void {
        const convBinding: AparteChatBinding = {
            hostId: this.binding.hostId,
            host,
            // Controller-driven flushes mirror ConversationManager state, not
            // user intent — deliberately NOT emitted as `messagesChange` to
            // avoid a feedback loop with hosts using a two-way `messages` input.
            setMessages: (msgs) => {
                this._beginConversationSwap();
                this._vp()?.resetSpacer?.();
                this.binding.setMessages([...msgs]);
            },
            appendMessage: (msg) => this.appendMessage(msg),
            getMessages: () => this.binding.getMessages(),
            clearMessages: () => {
                this._beginConversationSwap();
                this.binding.setMessages([]);
                this._vp()?.clearAll?.();
            },
            exportTree: () => {
                this.syncRepoFromMessages();
                return this._vp()?.exportTree?.();
            },
            importTree: (tree) => { this._vp()?.importTree?.(tree); },
        };

        this._controller = new AparteConversationController(convBinding, {
            onConversationCreated: (id) => {
                this._conversationId = id;
                this.options.onConversationCreated?.(id);
            },
        });
        this._unbindController = this._controller.bind();
        void this._controller.setConversationId(this._conversationId);
    }

    /** Drop transient streaming state so a new conversation starts clean. */
    private _beginConversationSwap(): void {
        this.stopTokenStream();
        this._setStreamingId(null);
        this.binding.onTypingChange?.(false);
        this._renderedIds.clear();
        this.binding.resetComposer?.();
    }

    // ── host method surface (also installed on the host element) ───────────

    /**
     * Append a message optimistically (streaming writes target the new last).
     *
     * Deliberately does NOT call `onMessagesChange` (unlike the other mutations):
     * `setMessages` updates the wrapper's OWN render list, but `onMessagesChange`
     * is the OUTBOUND "the user changed the list" notification. During an
     * optimistic append the wrapper's local list can lag a controlled parent's
     * (the parent added a user message that hasn't propagated back yet), so
     * echoing the local list to the parent would overwrite the parent's
     * authoritative list and drop that message — a real race the Angular wrapper
     * spec guards ("optimistic-append + parent-push race"). `onMessageAppended`
     * is the append-specific signal instead.
     */
    appendMessage(message: AparteMessage): void {
        if (message.role === 'user') this._vp()?.setAutoScroll?.(true);
        this.binding.setMessages([...this.binding.getMessages(), message]);
        this.binding.onMessageAppended?.(message);
    }

    /** Atomic partial update of a message by id. */
    updateMessage(messageId: string, updates: Partial<AparteMessage>): void {
        const msgs = this.binding.getMessages();
        const index = msgs.findIndex((m) => m.id === messageId);
        if (index === -1) return;
        const next = [...msgs];
        next[index] = { ...next[index]!, ...updates };
        this.binding.setMessages(next);
        this.binding.onMessagesChange?.(next);
        // Immediate visual feedback for a status change (e.g. streaming class).
        if (updates.status) {
            this._bubbleById(messageId)?.updateMessage?.({ status: updates.status });
        }
    }

    /** Append/replace the last message content (streaming text). */
    updateLastMessage(content: string, options?: { append?: boolean }): void {
        if (options?.append) this.binding.onTypingChange?.(false);
        const msgs = this.binding.getMessages();
        const last = msgs[msgs.length - 1];
        if (!last) return;
        if (this._isOrphan(last.id)) return;
        const newContent = options?.append ? (last.content || '') + content : content;
        const next = [...msgs.slice(0, -1), { ...last, content: newContent }];
        this.binding.setMessages(next);
        this.binding.onMessagesChange?.(next);
    }

    /** Add a segment to the last message (immediate bubble + state sync). */
    addSegment(segment: AparteSegment): void {
        const msgs = this.binding.getMessages();
        const last = msgs[msgs.length - 1];
        if (last && this._isOrphan(last.id)) return;
        this.binding.onTypingChange?.(false);
        this._lastBubble()?.addSegment?.(segment);
        if (!last) return;
        const segments = [...(last.segments || []), segment];
        const next = [...msgs.slice(0, -1), { ...last, segments }];
        this.binding.setMessages(next);
        this.binding.onMessagesChange?.(next);
    }

    /** Update a segment in the last message in place. */
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void {
        const msgs = this.binding.getMessages();
        const last = msgs[msgs.length - 1];
        if (last && this._isOrphan(last.id)) return;
        this._lastBubble()?.updateSegment?.(segmentId, updates);
        if (!last || !last.segments) return;
        const segments = last.segments.map((s) =>
            s.id === segmentId ? ({ ...s, ...updates } as AparteSegment) : s,
        );
        const next = [...msgs.slice(0, -1), { ...last, segments }];
        this.binding.setMessages(next);
        this.binding.onMessagesChange?.(next);
    }

    /** Remove a transient segment (e.g. pipeline-waiting indicator). */
    removeSegment(segmentId: string): void {
        this._lastBubble()?.removeSegment?.(segmentId);
        const msgs = this.binding.getMessages();
        const last = msgs[msgs.length - 1];
        if (!last?.segments) return;
        const segments = last.segments.filter((s) => s.id !== segmentId);
        if (segments.length === last.segments.length) return;
        const next = [...msgs.slice(0, -1), { ...last, segments }];
        this.binding.setMessages(next);
        this.binding.onMessagesChange?.(next);
    }

    /** Append text to a segment's content in the last message. */
    appendToSegment(segmentId: string, content: string): void {
        const msgs = this.binding.getMessages();
        const last = msgs[msgs.length - 1];
        if (!last || !last.segments) return;
        if (this._isOrphan(last.id)) return;
        const segments = last.segments.map((s) =>
            s.id === segmentId && 'content' in s
                ? ({ ...s, content: (s as { content: string }).content + content } as AparteSegment)
                : s,
        );
        const next = [...msgs.slice(0, -1), { ...last, segments }];
        this.binding.setMessages(next);
        this.binding.onMessagesChange?.(next);
    }

    /** Read the current message list. */
    getMessages(): AparteMessage[] { return this.binding.getMessages(); }

    /** Clear all messages + reset viewport state. */
    clearMessages(): void {
        this._beginConversationSwap();
        this.binding.setMessages([]);
        this._vp()?.clearAll?.();
    }

    /** Create a new branch from a message (returns the new sibling index). */
    addBranch(messageId: string): number {
        this.syncRepoFromMessages();
        return this._vp()?.addBranch?.(messageId) ?? 0;
    }

    /** Add a sibling of an existing message (returns the new id). */
    addSiblingOf(existingId: string, newMessage: AparteMessage): string | null {
        this.syncRepoFromMessages();
        return this._vp()?.addSiblingOf?.(existingId, newMessage) ?? null;
    }

    /** Remove a message and all descendants (edit flow). */
    truncateFrom(messageId: string): void {
        this._vp()?.truncateFrom?.(messageId);
        const msgs = this.binding.getMessages();
        const idx = msgs.findIndex((m) => m.id === messageId);
        const next = idx >= 0 ? msgs.slice(0, idx) : msgs;
        this.binding.setMessages(next);
        this.binding.onMessagesChange?.(next);
    }

    /** Keep up to and including a user message, drop later responses (retry). */
    truncateResponsesAfter(userMessageId: string): void {
        this._vp()?.truncateResponsesAfter?.(userMessageId);
        const msgs = this.binding.getMessages();
        const idx = msgs.findIndex((m) => m.id === userMessageId);
        const next = idx >= 0 ? msgs.slice(0, idx + 1) : msgs;
        this.binding.setMessages(next);
        this.binding.onMessagesChange?.(next);
    }

    // ── manual token streaming (agnostic core of injectTokenStream) ─────────

    /**
     * Drive a manual token stream into the viewport. Sets the streaming guard,
     * appends each token, completes the message at the end. Per-framework
     * wrappers adapt their native stream type (RxJS Observable, AsyncIterable,
     * ReadableStream) into this.
     */
    async streamTokens(messageId: string, tokens: AsyncIterable<string>): Promise<void> {
        this.stopTokenStream();
        this._setStreamingId(messageId);
        const ac = new AbortController();
        this._streamAbort = ac;
        try {
            for await (const chunk of tokens) {
                if (ac.signal.aborted) return;
                this._vp()?.appendToken?.(messageId, chunk);
            }
            if (!ac.signal.aborted) this._vp()?.completeMessage?.(messageId);
            this._setStreamingId(null);
        } catch (err) {
            this._setStreamingId(null);
            throw err;
        } finally {
            if (this._streamAbort === ac) this._streamAbort = undefined;
        }
    }

    /** Abort an in-flight {@link streamTokens} loop. */
    stopTokenStream(): void {
        if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = undefined;
            this._setStreamingId(null);
        }
    }

    // ── reconciliation ─────────────────────────────────────────────────────

    /**
     * Reconcile rendered bubbles with the current message list. The framework
     * calls this from its reactive message-change hook after rendering; the
     * last message is always re-synced (streaming), others only once.
     */
    syncBubbles(): void {
        const msgs = this.binding.getMessages();
        msgs.forEach((message, index) => {
            const isLast = index === msgs.length - 1;
            if (this._renderedIds.has(message.id) && !isLast) return;
            const bubble = this._bubbleById(message.id);
            if (!bubble) return;
            populateBubbleFromMessage(bubble, message);
            this._renderedIds.add(message.id);
        });
    }

    /**
     * Rebuild the viewport's internal repo from the message list before branch
     * operations (streaming fills the framework state but not the repo).
     */
    syncRepoFromMessages(): void {
        const vp = this._vp();
        if (!vp) return;
        for (const msg of this.binding.getMessages()) {
            if (!vp.getMessage?.(msg.id)) {
                vp.appendMessage?.(msg);
            } else {
                const updates: Partial<AparteMessage> = {};
                if (msg.content !== undefined) updates.content = msg.content;
                if (msg.segments !== undefined) updates.segments = msg.segments;
                if (msg.status !== undefined) updates.status = msg.status;
                if (msg.usage !== undefined) updates.usage = msg.usage;
                if (Object.keys(updates).length > 0) vp.updateMessage?.(msg.id, updates);
            }
        }
    }

    private _applyPendingSiblings(): void {
        if (!this._pendingSiblings) return;
        const msgs = this.binding.getMessages();
        for (const sib of this._pendingSiblings) {
            if (sib.count <= 1) continue;
            const bubble = this._bubbleById(sib.id);
            if (!bubble) continue;
            const message = msgs.find((m) => m.id === sib.id);
            if (message) populateBubbleFromMessage(bubble, message, sib);
        }
        this._pendingSiblings = undefined;
    }

    // ── internals ──────────────────────────────────────────────────────────

    /** Orphan-stream guard: a stream is in flight but the last msg isn't it. */
    private _isOrphan(lastId: string): boolean {
        return this._streamingId !== null && lastId !== this._streamingId;
    }

    private _vp(): ViewportApi | null {
        return (this.binding.viewport as unknown as ViewportApi | null) ?? null;
    }

    private _bubbleById(id: string): StreamingBubble | null {
        const vp = this.binding.viewport;
        if (!vp) return null;
        return vp.querySelector(
            `aparte-chat-bubble[message-id="${id}"]`,
        ) as unknown as StreamingBubble | null;
    }

    private _lastBubble(): StreamingBubble | null {
        const vp = this.binding.viewport;
        if (!vp) return null;
        const all = vp.querySelectorAll('aparte-chat-bubble');
        return (all.length ? all[all.length - 1] : null) as unknown as StreamingBubble | null;
    }

    private _installHostMethods(host: Record<string, unknown>): void {
        // Bracket notation: these come from the index signature, and consumers
        // compiled with `noPropertyAccessFromIndexSignature` reject dot access.
        host['appendMessage'] = (m: AparteMessage) => this.appendMessage(m);
        host['updateMessage'] = (id: string, u: Partial<AparteMessage>) => this.updateMessage(id, u);
        host['updateLastMessage'] = (c: string, o?: { append?: boolean }) => this.updateLastMessage(c, o);
        host['addSegment'] = (s: AparteSegment) => this.addSegment(s);
        host['updateSegment'] = (id: string, u: Partial<AparteSegment>) => this.updateSegment(id, u);
        host['removeSegment'] = (id: string) => this.removeSegment(id);
        host['appendToSegment'] = (id: string, c: string) => this.appendToSegment(id, c);
        host['getMessages'] = () => this.getMessages();
        host['addBranch'] = (id: string) => this.addBranch(id);
        host['addSiblingOf'] = (id: string, m: AparteMessage) => this.addSiblingOf(id, m);
        host['truncateFrom'] = (id: string) => this.truncateFrom(id);
        host['truncateResponsesAfter'] = (id: string) => this.truncateResponsesAfter(id);
    }

    private _installLifecycleListeners(host: HTMLElement): void {
        const onStart = (e: Event) => {
            const d = (e as CustomEvent)?.detail as { messageId?: string } | undefined;
            if (d?.messageId) this._setStreamingId(d.messageId);
        };
        const onDone = (e: Event) => {
            this.binding.onTypingChange?.(false);
            this._setStreamingId(null);
            const d = (e as CustomEvent)?.detail as
                | { messageId?: string; usage?: AparteUsage }
                | undefined;
            if (!d?.messageId || !d.usage) return;
            const next = this.binding.getMessages().map((m) =>
                m.id === d.messageId ? { ...m, usage: d.usage } : m,
            );
            this.binding.setMessages(next);
            this.binding.onMessagesChange?.(next);
            this._bubbleById(d.messageId)?.setUsage?.(d.usage);
        };
        const onEnd = () => {
            this.binding.onTypingChange?.(false);
            this._setStreamingId(null);
        };
        host.addEventListener('apartemessagestart', onStart);
        host.addEventListener('apartemessagedone', onDone);
        host.addEventListener('apartemessageerror', onEnd);
        host.addEventListener('apartemessageaborted', onEnd);
        this._teardown.push(() => {
            host.removeEventListener('apartemessagestart', onStart);
            host.removeEventListener('apartemessagedone', onDone);
            host.removeEventListener('apartemessageerror', onEnd);
            host.removeEventListener('apartemessageaborted', onEnd);
        });
    }

    private _installViewportListeners(): void {
        const vp = this.binding.viewport;
        if (!vp) return;

        const onPathChanged = (e: Event) => {
            const evt = e as CustomEvent<ApartePathChangedEventDetail>;
            const incoming = evt.detail.messages as AparteMessage[];
            // New bubbles created by the framework's diff are empty; force a
            // full re-sync so segments/content land on the right elements.
            this._renderedIds.clear();
            // `usage` lives on the framework state (written by `apartemessagedone`)
            // and may not have reached the rebuilt path — carry it forward by id
            // so the stats popover survives every branch / retry / edit.
            const prev = this.binding.getMessages();
            const merged = incoming.map((m) => {
                if (m.usage !== undefined) return m;
                const old = prev.find((p) => p.id === m.id);
                return old?.usage !== undefined ? { ...m, usage: old.usage } : m;
            });
            this.binding.setMessages(merged);
            this.binding.onMessagesChange?.(merged);
            if (evt.detail.siblings.some((s) => s.count > 1)) {
                this._pendingSiblings = evt.detail.siblings;
                this.binding.afterRender(() => this._applyPendingSiblings());
            }
        };
        // capture=true fires before the viewport's own bubbling handler so the
        // repo is fresh when the navigate op reads it.
        const onBranchNavigate = () => this.syncRepoFromMessages();

        vp.addEventListener('aparte:path-changed', onPathChanged);
        vp.addEventListener('aparte:branch-navigate', onBranchNavigate, { capture: true });
        this._teardown.push(() => {
            vp.removeEventListener('aparte:path-changed', onPathChanged);
            vp.removeEventListener('aparte:branch-navigate', onBranchNavigate, { capture: true });
        });
    }
}
