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
import type { AparteConfig } from '../config/aparte-config.js';
import { resolveConfig, attachConfig, detachConfig } from '../config/config-context.js';
import { cssEscape } from '../utils/css-escape.js';
import { dispatchLifecycleEvent } from '../client/lifecycle-events.js';
import { gateGlide } from '../components/chat/glide-gate.js';
import {
    stampSegmentOnInsert,
    stampSegmentOnUpdate,
    adoptMessageSegments,
    mergeSegmentUpdate,
    renumberSegments,
    openSegmentIds,
    stampSegmentActivity,
    isTerminalStatus,
} from '../utils/segments.js';

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
    /** Direct, in-place segment write — the fast path behind `appendToSegment`. */
    appendToSegment?(messageId: string, segmentId: string, chunk: string): void;
    completeMessage?(messageId: string): void;
    addBranch?(messageId: string): number;
    addSiblingOf?(existingId: string, newMessage: AparteMessage): string | null;
    truncateFrom?(messageId: string): void;
    truncateResponsesAfter?(userMessageId: string): void;
    getMessage?(messageId: string): AparteMessage | undefined;
    appendMessage?(message: AparteMessage): void;
    /** Framework-managed DOM: record a message in the tree without painting a bubble. */
    addMessage?(message: AparteMessage): void;
    /** Replace the tree with a list — what opening a stored conversation does. */
    setMessages?(messages: AparteMessage[]): void;
    updateMessage?(messageId: string, updates: Partial<AparteMessage>): void;
    /** The transcript's read-only-while-streaming flag; in framework-managed mode the host is its one writer. */
    setTranscriptBusy?(busy: boolean): void;
    setLoading?(loading: boolean): void;
    exportTree?(): ExportedMessageRepository;
    importTree?(tree: ExportedMessageRepository): void;
    clearAll?(options?: { revokeAttachments?: boolean }): void;
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
    /**
     * The transcript is on its way (`true`) or has arrived (`false`): the controller's
     * wait, forwarded so a wrapper that draws its own DOM can draw the wait — the
     * skeleton, the empty state kept off, the composer disabled.
     *
     * Declaring it makes the wait YOURS, `aria-busy` included: the host stops writing the
     * viewport's `loading` attribute and leaves it to you, so two writers never disagree
     * about when the wait ends. A binding without this callback keeps the attribute
     * written for it.
     */
    onLoadingChange?(loading: boolean): void;
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
     * `aparteGlobalConfig` — the seam that lets several independently-configured chats
     * coexist on one page. Omit to keep the global-config behaviour.
     */
    config?: AparteConfig;
}

/**
 * Framework-agnostic chat-host orchestrator.
 *
 * Owns the streaming/branch/host-method layer shared by the framework wrappers:
 * it installs the imperative method surface `AparteClient`
 * calls onto the host element, tracks the streaming target id from
 * `apartemessage*` lifecycle events, guards writes against orphan streams (late
 * SSE after a conversation switch), handles `aparte-path-changed` branch
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
/**
 * How many render passes to wait for a sibling's bubble before giving up.
 *
 * The race needs ONE tick; six is slack for a slow commit. It is bounded because a
 * message that left the active path has no bubble and never will, and an unbounded
 * retry would hold a callback for the life of the page.
 */
const MAX_SIBLING_RETRIES = 6;

/** A message's fields the viewport's tree derives itself, which a framework's list never overwrites. */
const TREE_OWNED_FIELDS = new Set(['id', 'branches', 'activeBranchIndex', 'isStreaming']);

/**
 * The fields every message carries, which a framework's list never clears: its text, its
 * segments (which the viewport may derive from the text) and its status.
 */
const ALWAYS_PRESENT_FIELDS = new Set(['content', 'segments', 'status']);

export class AparteChatHost {
    private readonly binding: AparteChatHostBinding;
    private readonly options: AparteChatHostOptions;

    /** Id of the assistant message currently streaming (null when idle). */
    private _streamingId: string | null = null;
    /** Message ids already reconciled onto a bubble (skip-rerender cache). */
    private readonly _renderedIds = new Set<string>();
    /** Sibling info from the last path-change, applied after the next render. */
    private _pendingSiblings?: AparteSiblingInfo[];
    /** How many render passes the sibling write has waited for — see `_applyPendingSiblings`. */
    private _siblingRetries = 0;
    /** Abort handle for an in-flight {@link streamTokens} loop. */
    private _streamAbort?: AbortController;
    /** Segment chunks written to the bubble, awaiting one coalesced state sync. */
    /**
     * Buffered segment text, per segment id, as `base + text` — an **absolute**
     * target, never a delta.
     *
     * Why absolute: the immediate paint (`appendToSegment` below) writes through the
     * viewport into the very segment object the framework list holds — they are the
     * same object, handed to both by `addSegment`. A delta added at flush time would
     * therefore land on content that already contains it, and every chunk came out
     * doubled. `base` is captured before the paint, so whoever mutates the shared
     * object in between cannot change the result.
     */
    private readonly _segmentBuffer = new Map<string, { base: string; text: string }>();
    /** {@link streamTokens} text written to the bubble, awaiting the same sync. */
    private _tokenBuffer: { messageId: string; text: string } | null = null;
    /** Handle of the scheduled coalesced sync, or null when none is pending. */
    private _flushHandle: number | null = null;

    /**
     * Lists reported through `onMessagesChange` that the parent has not handed back yet, oldest
     * first — what {@link takeEcho} recognises. Bounded: a parent that never hands a list back
     * (an uncontrolled chat) must not make it grow for the life of the page.
     */
    private readonly _pendingEchoes: AparteMessage[][] = [];

    private _conversationId: string | null = null;
    private _controller?: AparteConversationController;
    private _teardown: Array<() => void> = [];
    private _bound = false;

    constructor(binding: AparteChatHostBinding, options: AparteChatHostOptions = {}) {
        this.binding = binding;
        this.options = options;
        this._conversationId = options.conversationId ?? null;
    }

    /** Every report goes through here, so {@link takeEcho} knows what the parent may hand back. */
    private _report(next: AparteMessage[]): void {
        this._pendingEchoes.push(next);
        if (this._pendingEchoes.length > 64) this._pendingEchoes.shift();
        this.binding.onMessagesChange?.(next);
    }

    /**
     * Whether a list the parent hands back is this host's own report coming back — the echo of
     * `onMessagesChange` through a two-way binding (`bind:messages`, `v-model:messages`,
     * `[(messages)]`, a controlled React prop). A wrapper asks before applying the list it is
     * given, because applying an echo rolls back what the host did since without reporting (an
     * optimistic append).
     *
     * True for a list reported and not handed back yet, however late it lands — a parent whose
     * render comes after the host's next write hands back an EARLIER report — and that list and
     * every older one are taken. False for any other list, the parent's own word, which clears
     * them: a list the parent restores later (a reopened conversation, an undo) is applied,
     * where remembering every list ever reported swallowed it.
     */
    takeEcho(list: AparteMessage[]): boolean {
        const i = this._pendingEchoes.indexOf(list);
        if (i < 0) {
            this._pendingEchoes.length = 0;
            return false;
        }
        this._pendingEchoes.splice(0, i + 1);
        return true;
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
        // `centerWhenEmpty` slides only once a person is in the page (see glide-gate.ts).
        this._teardown.push(gateGlide(host));
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
        // The transcript's read-only-while-streaming flag has one writer per mode. In
        // framework-managed mode the repository is not written during a turn, so the
        // viewport could never derive it — retry, edit and the branch arrows stayed
        // live on every other message while a reply streamed, under all four wrappers.
        // This host already knows the truth for every wrapper: it says it.
        this._vp()?.setTranscriptBusy?.(id !== null);
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
            // Controller-driven flushes mirror AparteConversationManager state, not
            // user intent — deliberately NOT emitted as `messagesChange` to
            // avoid a feedback loop with hosts using a two-way `messages` input.
            // Adopted here rather than passed through: this is the conversation
            // controller handing back a stored list, and it goes STRAIGHT to the
            // framework's own reactive setter — so in every wrapper it never met the
            // stamping seam at all, tree or no tree.
            setMessages: (msgs) => {
                this._beginConversationSwap();
                this._vp()?.resetSpacer?.();
                const adopted = msgs.map(adoptMessageSegments);
                this.binding.setMessages(adopted);
                // …and into the viewport's TREE, which is what `exportTree` serialises and
                // what every branch operation reads. This handed the list to the framework
                // alone, so a stored conversation was invisible to the repository: the next
                // message became the root of a fresh tree, and `syncRepoFromMessages` then
                // appended the history it could not find at the head — after the new turn.
                // The saved tree read [new turn, old history], and the next open restored
                // it. The vanilla binding has always gone through this method; so does this
                // one now.
                this._vp()?.setMessages?.(adopted);
            },
            appendMessage: (msg) => this.appendMessage(msg),
            getMessages: () => this.binding.getMessages(),
            clearMessages: (options) => {
                this._beginConversationSwap();
                this.binding.setMessages([]);
                this._vp()?.clearAll?.(options);
            },
            exportTree: () => {
                this.syncRepoFromMessages();
                return this._vp()?.exportTree?.();
            },
            importTree: (tree) => { this._vp()?.importTree?.(tree); },
            // The framework's list arrives at its render, so a save that must see a write
            // the app made to its own store (a compaction through `resolveTarget`) waits for it.
            afterRender: (cb) => this.binding.afterRender(cb),
            // One writer for the wait. A wrapper that hears `onLoadingChange` draws the
            // wait itself and writes the viewport's attribute from its own
            // `loading || hostLoading` — so the host writing it too meant that, with the
            // consumer's own prop on, a `setLoading(false)` here removed the attribute
            // (and `aria-busy`) while the wrapper still drew the skeleton and still held
            // the composer shut. A binding that cannot hear it has no other way to know,
            // and there the attribute stays the host's to write.
            setLoading: (on) => {
                if (this.binding.onLoadingChange) this.binding.onLoadingChange(on);
                else this._vp()?.setLoading?.(on);
            },
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
        // Drop pending stream chunks: they belong to the conversation being left,
        // and its bubbles already show them.
        this._segmentBuffer.clear();
        this._tokenBuffer = null;
        this._flushStreamState();
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
    appendMessage(message: AparteMessage, options?: { historical?: boolean }): void {
        this._flushStreamState(); // the previous message's chunks land first
        if (message.role === 'user') this._vp()?.setAutoScroll?.(true);
        // This did NOT stamp its segments — at all — while the viewport method of the
        // same name did. Two owners of one invariant, diverging in silence, which is
        // why a framework-managed chat and a native one disagreed about the very same
        // stored conversation. Same provenance parameter as the viewport's, same
        // default (live), so no existing caller changes behaviour.
        const stored = options?.historical
            ? adoptMessageSegments(message)
            : message.segments?.length
                ? {
                    ...message,
                    segments: message.segments.reduce<AparteSegment[]>((acc, segment) => {
                        acc.push(stampSegmentOnInsert(
                            acc, segment, message.id,
                            resolveConfig(this.binding.host).getSegmentDefaults(segment.type),
                        ));
                        return acc;
                    }, []),
                }
                : message;
        // Recorded in the viewport's tree by the same act that builds the list. It was
        // not: a manual token stream (`streamTokens`, `appendToSegment`) then wrote to
        // a message the repository did not know, the viewport invented it under the
        // empty root, and the next branch operation re-parented the whole transcript
        // under that phantom — the path came out reversed.
        this._vp()?.addMessage?.(stored);
        this.binding.setMessages([...this.binding.getMessages(), stored]);
        this.binding.onMessageAppended?.(stored);
    }

    /** Atomic partial update of a message by id. */
    updateMessage(messageId: string, updates: Partial<AparteMessage>): void {
        this._flushStreamState();
        const msgs = this.binding.getMessages();
        const index = msgs.findIndex((m) => m.id === messageId);
        if (index === -1) return;
        const next = [...msgs];
        const merged = { ...next[index]!, ...updates };
        next[index] = merged;
        this.binding.setMessages(next);
        this._report(next);
        // Immediate visual feedback for a status change (e.g. streaming class).
        if (updates.status) {
            this._bubbleById(messageId)?.updateMessage?.({ status: updates.status });
        }
        // A finished turn closes its segments — same rule and same helper as the
        // viewport, because this is the method both agent loops call to report the
        // end. Routed through `updateSegment` for the same reason: the bubble has to
        // hear about it, not just the list.
        if (isTerminalStatus(merged.status) && merged.segments) {
            for (const id of openSegmentIds(merged.segments)) {
                this.updateSegment(id, { isStreaming: false });
            }
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
        this._report(next);
    }

    /** Add a segment to the last message (immediate bubble + state sync). */
    addSegment(segment: AparteSegment): void {
        this._flushStreamState(); // buffered chunks belong before a new segment
        const before = this.binding.getMessages();
        const target = before[before.length - 1];
        if (target && this._isOrphan(target.id)) return;
        this.binding.onTypingChange?.(false);
        const msgs = before;
        const last = target;

        // Stamped before the bubble is told, because the bubble is told FIRST here
        // (that ordering is deliberate — the paint must not wait on a list rebuild).
        // Stamping after it would render an unstamped segment and store a stamped
        // one. Second of exactly two owners; see `utils/segments.ts`.
        const stamped = last
            ? stampSegmentOnInsert(
                last.segments || [], segment, last.id,
                // The host attaches its config to `binding.host`, so resolving from
                // that element is what gives a framework-managed chat its OWN
                // defaults rather than the page's.
                resolveConfig(this.binding.host).getSegmentDefaults(segment.type),
            )
            : segment;
        this._streamBubble(last?.id)?.addSegment?.(stamped);
        if (!last) return;
        const segments = [...(last.segments || []), stamped];
        const next = [...msgs.slice(0, -1), { ...last, segments }];
        this.binding.setMessages(next);
        this._report(next);
    }

    /** Update a segment in the last message in place. */
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void {
        this._flushStreamState(); // an update must not overwrite buffered text
        const msgs = this.binding.getMessages();
        const last = msgs[msgs.length - 1];
        if (last && this._isOrphan(last.id)) return;
        const current = last?.segments?.find((s) => s.id === segmentId);
        // Same ordering trap as `addSegment`: the bubble is written first, so the
        // `endedAt` has to be computed before that write, not after it.
        const stamped = current ? stampSegmentOnUpdate(current, updates) : updates;
        this._streamBubble(last?.id)?.updateSegment?.(segmentId, stamped);
        if (!last || !last.segments) return;
        const segments = last.segments.map((s) =>
            s.id === segmentId ? mergeSegmentUpdate(s, stamped) : s,
        );
        const next = [...msgs.slice(0, -1), { ...last, segments }];
        this.binding.setMessages(next);
        this._report(next);
    }

    /** Remove a transient segment (a status row the host added itself). */
    removeSegment(segmentId: string): void {
        this._flushStreamState();
        this._streamBubble(this.binding.getMessages().at(-1)?.id)?.removeSegment?.(segmentId);
        const msgs = this.binding.getMessages();
        const last = msgs[msgs.length - 1];
        if (!last?.segments) return;
        const segments = last.segments.filter((s) => s.id !== segmentId);
        if (segments.length === last.segments.length) return;
        // `index` is a position: a removal has to close the gap it left.
        renumberSegments(segments);
        const next = [...msgs.slice(0, -1), { ...last, segments }];
        this.binding.setMessages(next);
        this._report(next);
    }

    /**
     * Append text to a segment's content in the last message — the streaming path
     * for thinking blocks, tool pills and any segment that grows token by token.
     *
     * Two writes, deliberately asymmetric:
     *  1. straight into the bubble, every chunk, so the text appears immediately —
     *     the same direct path `appendToken` uses;
     *  2. into the framework's message list, **coalesced to once per frame**.
     *
     * Coalescing (2) avoids a full list rebuild plus `setMessages` +
     * `onMessagesChange`, i.e. one complete framework render, for every chunk.
     *
     * Any structural change flushes the buffer first (see
     * {@link _flushStreamState}), so ordering is never observable.
     */
    appendToSegment(segmentId: string, content: string): void {
        const msgs = this.binding.getMessages();
        const last = msgs[msgs.length - 1];
        if (!last || !last.segments) return;
        if (this._isOrphan(last.id)) return;

        // (2a) Record where this batch starts — BEFORE the paint below, which writes
        // into the segment object the list shares. See {@link _segmentBuffer}.
        let buffered = this._segmentBuffer.get(segmentId);
        if (!buffered) {
            const segment = last.segments.find((s) => s.id === segmentId);
            const base = segment && 'content' in segment ? (segment as { content?: string }).content ?? '' : '';
            buffered = { base, text: '' };
            this._segmentBuffer.set(segmentId, buffered);
        }
        buffered.text += content;

        // (1) Immediate, per-chunk: the viewport writes into the bubble in place.
        this._vp()?.appendToSegment?.(last.id, segmentId, content);

        // (2b) Deferred, coalesced: one state sync per frame.
        this._scheduleStreamFlush();
    }

    /** Schedule the coalesced segment-state sync (idempotent within a frame). */
    private _scheduleStreamFlush(): void {
        if (this._flushHandle !== null) return;
        const run = () => {
            this._flushHandle = null;
            this._flushStreamState();
        };
        // rAF paces the sync with rendering; without it (SSR, jsdom without the
        // polyfill) fall back to a macrotask so the batching still happens.
        this._flushHandle = typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(run)
            : (setTimeout(run, 0) as unknown as number);
    }

    /**
     * Write every buffered stream chunk — segment chunks and {@link streamTokens}
     * text alike — into the framework's message list in **one** update. Called by
     * the scheduled frame, and eagerly by any mutation that would otherwise observe
     * a stale list (a new segment, a new message, a conversation swap): flushing
     * first keeps the emitted order identical to the call order.
     */
    private _flushStreamState(): void {
        if (this._flushHandle !== null) {
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._flushHandle);
            else clearTimeout(this._flushHandle);
            this._flushHandle = null;
        }
        const tokens = this._tokenBuffer;
        const pending = this._segmentBuffer.size > 0 ? new Map(this._segmentBuffer) : null;
        if (!tokens && !pending) return;
        this._tokenBuffer = null;
        this._segmentBuffer.clear();

        // Both channels fold into a single list, so a frame that carried tokens AND
        // segment chunks still costs the framework exactly one render.
        let msgs = this.binding.getMessages();
        let changed = false;

        if (tokens) {
            // By id, not "the last message": a manual stream keeps writing to its
            // own message even if something was appended after it.
            const index = msgs.findIndex((m) => m.id === tokens.messageId);
            if (index !== -1) {
                const next = [...msgs];
                next[index] = { ...next[index]!, content: (next[index]!.content ?? '') + tokens.text };
                msgs = next;
                changed = true;
            }
        }

        if (pending) {
            const last = msgs[msgs.length - 1];
            if (last?.segments) {
                const segments = last.segments.map((s) => {
                    const buffered = pending.get(s.id);
                    // Absolute, not `s.content + chunk`: `s` may be the object the
                    // paint already appended to (they are shared), so adding the
                    // chunk again is what doubled every chunk.
                    if (buffered === undefined || !('content' in s)) return s;
                    // Content arriving IS the segment's activity, so this is what
                    // `endedAt` measures — same rule as the viewport's append. The
                    // resolution is one frame here rather than one chunk, which is
                    // finer than any duration a person reads.
                    return {
                        ...s,
                        content: buffered.base + buffered.text,
                        ...stampSegmentActivity(s),
                    } as AparteSegment;
                });
                msgs = [...msgs.slice(0, -1), { ...last, segments }];
                changed = true;
            }
        }

        if (!changed) return;
        this.binding.setMessages(msgs);
        this._report(msgs);
    }

    /** Read the current message list. */
    getMessages(): AparteMessage[] { return this.binding.getMessages(); }

    /**
     * Clear all messages + reset viewport state. The option travels to the viewport
     * untouched: a compaction passes `{ revokeAttachments: false }` because it re-appends
     * the turns it keeps and revokes the dropped ones' object URLs itself.
     */
    clearMessages(options?: { revokeAttachments?: boolean }): void {
        this._beginConversationSwap();
        this.binding.setMessages([]);
        this._vp()?.clearAll?.(options);
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
        this._report(next);
    }

    /** Keep up to and including a user message, drop later responses (retry). */
    truncateResponsesAfter(userMessageId: string): void {
        this._vp()?.truncateResponsesAfter?.(userMessageId);
        const msgs = this.binding.getMessages();
        const idx = msgs.findIndex((m) => m.id === userMessageId);
        const next = idx >= 0 ? msgs.slice(0, idx + 1) : msgs;
        this.binding.setMessages(next);
        this._report(next);
    }

    // ── manual token streaming (agnostic core of injectTokenStream) ─────────

    /**
     * Drive a manual token stream into the viewport. Sets the streaming guard,
     * appends each token, completes the message at the end. Per-framework
     * wrappers adapt their native stream type (RxJS Observable, AsyncIterable,
     * ReadableStream) into this.
     *
     * Each token reaches the bubble immediately and the framework's message list
     * is synced **once per frame** (same discipline as {@link appendToSegment}),
     * with a guaranteed flush before completion and on abort, so the framework list
     * and the DOM agree and a custom bubble (which renders from that state) shows the
     * reply.
     */
    async streamTokens(messageId: string, tokens: AsyncIterable<string>): Promise<void> {
        this.stopTokenStream();
        this._setStreamingId(messageId);
        const ac = new AbortController();
        this._streamAbort = ac;
        const iterator = tokens[Symbol.asyncIterator]();
        // Resolve as soon as the stream is aborted, so an IDLE source (e.g. the
        // Angular Observable→AsyncIterable adapter parked on a pending next())
        // still unwinds promptly: racing next() against this lets the loop break
        // and call iterator.return() — which unsubscribes — instead of leaving a
        // zombie subscription parked on a next() that never resolves.
        const aborted = new Promise<'aborted'>((resolve) => {
            if (ac.signal.aborted) { resolve('aborted'); return; }
            ac.signal.addEventListener('abort', () => resolve('aborted'), { once: true });
        });
        // Announced only now, past the setup that can throw (the source's iterator), so a
        // start always meets the `finally` that ends it. The turn announces itself the way `AparteClient` does, so what listens for a turn
        // works here too: the composer shows Stop, the conversation controller saves at the
        // end. And the composer's Stop (`aparte-abort` for this chat, or for every chat when
        // it names none) stops this stream.
        const { host, hostId } = this.binding;
        const onAbort = (e: Event): void => {
            const target = ((e as CustomEvent).detail as { targetId?: string } | undefined)?.targetId;
            if ((!target || target === hostId) && this._streamAbort === ac) this.stopTokenStream();
        };
        window.addEventListener('aparte-abort', onAbort);
        const replaced = (): boolean => this._streamAbort !== undefined && this._streamAbort !== ac;
        dispatchLifecycleEvent(host, 'aparte-message-start', { messageId, role: 'assistant' }, hostId);
        try {
            for (;;) {
                const res = await Promise.race([iterator.next(), aborted]);
                if (res === 'aborted' || ac.signal.aborted || res.done) break;
                this._vp()?.appendToken?.(messageId, res.value);
                this._bufferToken(messageId, res.value);
            }
            // The state must carry the text BEFORE the message is marked complete —
            // completion is a structural change, and a consumer reacting to it would
            // otherwise read a message that is finished and empty.
            this._flushStreamState();
            // Aborted or not: the message is FINISHED. It used to be completed only on
            // a clean end, so a stopped stream left a message the viewport still held
            // as streaming — and everything read-only that hangs off that (the branch
            // arrows, retry, edit of every message) stayed disabled for good.
            this._vp()?.completeMessage?.(messageId);
            // Replaced by a newer stream (which stopped this one, then took the slot): the
            // turn in flight is the newer one. Clearing the streaming id, or ending a turn
            // the listeners now follow, would be this loop speaking for it.
            if (!replaced()) {
                this._setStreamingId(null);
                dispatchLifecycleEvent(
                    host,
                    ac.signal.aborted ? 'aparte-message-aborted' : 'aparte-message-done',
                    ac.signal.aborted ? { messageId } : { messageId, role: 'assistant' },
                    hostId,
                );
            }
        } catch (err) {
            this._flushStreamState();
            if (!replaced()) {
                this._setStreamingId(null);
                dispatchLifecycleEvent(host, 'aparte-message-error', { messageId, error: err }, hostId);
            }
            throw err;
        } finally {
            window.removeEventListener('aparte-abort', onAbort);
            // On abort the source may still be mid-flight; return() triggers its
            // cleanup (generator finally / subscription teardown).
            if (ac.signal.aborted) { try { await iterator.return?.(); } catch { /* ignore */ } }
            if (this._streamAbort === ac) this._streamAbort = undefined;
        }
    }

    /**
     * Buffer a streamed token for the coalesced state sync. A different message id
     * (a second stream started without stopping the first) flushes the previous
     * one, so text never migrates between messages.
     */
    private _bufferToken(messageId: string, chunk: string): void {
        if (this._tokenBuffer && this._tokenBuffer.messageId !== messageId) this._flushStreamState();
        this._tokenBuffer = this._tokenBuffer
            ? { messageId, text: this._tokenBuffer.text + chunk }
            : { messageId, text: chunk };
        this._scheduleStreamFlush();
    }

    /** Abort an in-flight {@link streamTokens} loop. */
    stopTokenStream(): void {
        if (this._streamAbort) {
            this._streamAbort.abort();
            this._streamAbort = undefined;
            // Keep whatever was already streamed: the bubble shows it, so the state
            // must agree — an aborted turn is truncated, not erased.
            this._flushStreamState();
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
                // What the turn ran on: a pause resumed after a reload reads it from the saved tree.
                if (msg.model !== undefined) updates.model = msg.model;
                if (Object.keys(updates).length > 0) vp.updateMessage?.(msg.id, updates);
                // Every other field the app wrote (metadata, attachments, a name…) reaches the
                // tree too — the saved conversation and what a reopen loads — without a redraw:
                // the framework draws from its own list. The tree's own fields stay its own.
                const stored = vp.getMessage?.(msg.id) as Record<string, unknown> | undefined;
                if (stored) {
                    for (const [key, value] of Object.entries(msg)) {
                        if (value !== undefined && !(key in updates) && !TREE_OWNED_FIELDS.has(key)) stored[key] = value;
                    }
                    // And a field the app cleared — set to `undefined`, or left out of the
                    // message — leaves the tree too: the framework's list is the message, and
                    // a reopen loads the tree, which brought an un-pinned message back pinned.
                    const own = msg as unknown as Record<string, unknown>;
                    for (const key of Object.keys(stored)) {
                        if (!TREE_OWNED_FIELDS.has(key) && !ALWAYS_PRESENT_FIELDS.has(key) && own[key] === undefined) delete stored[key];
                    }
                }
            }
        }
    }

    /**
     * Write the branch counts onto their bubbles — and RESCHEDULE for the ones that are
     * not on the page yet, instead of dropping them.
     *
     * Frameworks render LATE: a binding's `afterRender` can run before its commit, so a
     * bubble may not exist yet when its count arrives. A count that was dropped would
     * leave the bubble at one sibling, the picker hidden and the other version
     * unreachable. The retry lives here rather than in a wrapper, so it covers all four.
     *
     * Bounded, because a sibling can legitimately never arrive — a message that left the
     * path has no bubble and never will, and an unbounded retry would hold a callback for
     * the page's lifetime. Six passes is far more than the one tick the race needs.
     */
    private _applyPendingSiblings(): void {
        if (!this._pendingSiblings) return;
        const msgs = this.binding.getMessages();
        const unresolved: AparteSiblingInfo[] = [];
        for (const sib of this._pendingSiblings) {
            if (sib.count <= 1) continue;
            const bubble = this._bubbleById(sib.id);
            if (!bubble) { unresolved.push(sib); continue; }
            const message = msgs.find((m) => m.id === sib.id);
            if (message) populateBubbleFromMessage(bubble, message, sib);
        }
        this._pendingSiblings = undefined;
        if (unresolved.length && this._siblingRetries < MAX_SIBLING_RETRIES) {
            this._siblingRetries += 1;
            this._pendingSiblings = unresolved;
            this.binding.afterRender(() => this._applyPendingSiblings());
            return;
        }
        this._siblingRetries = 0;
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
            `aparte-chat-bubble[message-id="${cssEscape(id)}"]`,
        ) as unknown as StreamingBubble | null;
    }

    /**
     * The bubble the streaming writes below belong to: the one carrying that message's
     * id, and NOTHING when it is not on the page yet.
     *
     * It is not "the last bubble in the viewport", which is a different message
     * whenever the DOM is a render behind the list — which is every framework here.
     * `appendMessage` puts the new reply in the framework's state and the framework
     * paints it on its own schedule, so a first chunk arriving in between would go into
     * the PREVIOUS reply's bubble.
     *
     * Skipping the paint is safe because it is only ever a paint: the message list is
     * written either way, and `syncBubbles` — called by the framework after each render,
     * always re-syncing the last message — puts it on screen as soon as the bubble
     * exists. Without an id there is nothing to resolve, so the last bubble stands: that
     * is a host writing into a transcript it has not appended to.
     */
    private _streamBubble(messageId: string | undefined): StreamingBubble | null {
        if (messageId) return this._bubbleById(messageId);
        return this._lastBubble();
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
        // Installed since 0.16.0 for `@aparte/plugin-compaction`, which replaces a
        // transcript through the element it resolves by id — under a wrapper, this root.
        // Without it the host had `getMessages` and `appendMessage` but no way to empty
        // itself, and the plugin could not tell it from a stray `[data-aparte-chat]`.
        host['clearAll'] = (options?: { revokeAttachments?: boolean }) => this.clearMessages(options);
    }

    private _installLifecycleListeners(host: HTMLElement): void {
        const onStart = (e: Event) => {
            const d = (e as CustomEvent)?.detail as { messageId?: string } | undefined;
            if (d?.messageId) this._setStreamingId(d.messageId);
        };
        /**
         * Whether a terminal event ends the turn THIS host is following.
         *
         * A retry supersedes the reply being written: the client aborts it, and the
         * engine's `run-aborted` reaches this host as an `aparte-message-aborted`
         * carrying the superseded message's id, which must not end the turn still
         * streaming. An event with no id still ends the turn: that is a host or a loop
         * of its own saying "done".
         */
        const endsThisTurn = (e: Event): boolean => {
            const id = ((e as CustomEvent)?.detail as { messageId?: string } | undefined)?.messageId;
            return !id || this._streamingId === null || id === this._streamingId;
        };
        const onDone = (e: Event) => {
            if (endsThisTurn(e)) {
                this.binding.onTypingChange?.(false);
                this._setStreamingId(null);
            }
            const d = (e as CustomEvent)?.detail as
                | { messageId?: string; usage?: AparteUsage }
                | undefined;
            // The usage is recorded whoever reported it: it belongs to the message the
            // event names, not to the turn in flight.
            if (!d?.messageId || !d.usage) return;
            const next = this.binding.getMessages().map((m) =>
                m.id === d.messageId ? { ...m, usage: d.usage } : m,
            );
            this.binding.setMessages(next);
            this._report(next);
            this._bubbleById(d.messageId)?.setUsage?.(d.usage);
        };
        const onEnd = (e: Event) => {
            if (!endsThisTurn(e)) return;
            this.binding.onTypingChange?.(false);
            this._setStreamingId(null);
        };
        host.addEventListener('aparte-message-start', onStart);
        host.addEventListener('aparte-message-done', onDone);
        host.addEventListener('aparte-message-error', onEnd);
        host.addEventListener('aparte-message-aborted', onEnd);
        this._teardown.push(() => {
            host.removeEventListener('aparte-message-start', onStart);
            host.removeEventListener('aparte-message-done', onDone);
            host.removeEventListener('aparte-message-error', onEnd);
            host.removeEventListener('aparte-message-aborted', onEnd);
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
            // `usage` lives on the framework state (written by `aparte-message-done`)
            // and may not have reached the rebuilt path — carry it forward by id
            // so the stats popover survives every branch / retry / edit.
            const prev = this.binding.getMessages();
            const merged = incoming.map((m) => {
                if (m.usage !== undefined) return m;
                const old = prev.find((p) => p.id === m.id);
                return old?.usage !== undefined ? { ...m, usage: old.usage } : m;
            });
            this.binding.setMessages(merged);
            this._report(merged);
            if (evt.detail.siblings.some((s) => s.count > 1)) {
                this._pendingSiblings = evt.detail.siblings;
                this.binding.afterRender(() => this._applyPendingSiblings());
            }
        };
        // capture=true fires before the viewport's own bubbling handler so the
        // repo is fresh when the navigate op reads it.
        const onBranchNavigate = () => this.syncRepoFromMessages();

        vp.addEventListener('aparte-path-changed', onPathChanged);
        vp.addEventListener('aparte-branch-navigate', onBranchNavigate, { capture: true });
        this._teardown.push(() => {
            vp.removeEventListener('aparte-path-changed', onPathChanged);
            vp.removeEventListener('aparte-branch-navigate', onBranchNavigate, { capture: true });
        });
    }
}
