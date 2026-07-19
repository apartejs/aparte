import type {
    AparteMessage,
    AparteViewportConfig,
    AparteSegment,
    AparteSegmentUpdateEvent,
    ApartePathChangedEventDetail,
    AparteSiblingInfo,
    AparteUsage,
} from '../../types/index.js';
import { resolveConfig } from '../../config/index.js';
import { MessageRepository } from '../../runtime/message-repository.js';
import type { ExportedMessageRepository } from '../../runtime/message-repository.js';
import { populateBubbleFromMessage, type SyncableBubble } from '../bubble/bubble-sync.js';
import { cssEscape } from '../../utils/css-escape.js';

/**
 * AparteChatViewport - The Core
 * 
 * Container component with smart scroll, streaming, and segment support.
 * Uses Light DOM for global CSS styling.
 * 
 * @element aparte-chat-viewport
 * 
 * Features:
 * - Smart Scroll: Sticks to bottom when user is at bottom, stops on manual scroll up
 * - appendToken(): For simple content streaming
 * - appendToSegment(): For segment-aware streaming (thinking, code, etc.)
 * - Internal message registry for memory management
 */
export class AparteChatViewport extends HTMLElement {
    // The scroll surface: an internal `.aparte-viewport-container` div (core mode)
    // or the host element itself (framework-managed mode). HTMLElement covers both.
    private _container: HTMLElement | null = null;
    private _scrollBtn: HTMLButtonElement | null = null;
    private _bottomSpacer: HTMLDivElement | null = null;
    /**
     * In framework-managed mode there is no spacer ELEMENT (an extra child would
     * collide with the framework's own DOM reconciliation). The spacer is an
     * additive `padding-bottom` on the host, tracked here so `_recalculateSpacer`
     * can read the current value without measuring an element.
     */
    private _fwSpacerHeight = 0;
    private _spacerRafId: number | null = null;
    private _spacerFrozenUntil: number = 0;
    private _layoutTransitionMs: number = 0;
    private _repo = new MessageRepository();
    private _isAutoScrollEnabled: boolean = true;
    private _scrollThreshold: number = 50;
    /** When true, the next _autoScroll() call uses smooth instead of instant, then resets. */
    private _smoothScrollOnce: boolean = false;
    /**
     * DOM render cap: the max number of `<aparte-chat-bubble>` elements kept in the
     * DOM at once (a perf ceiling for very long conversations). This NEVER evicts
     * messages from the repository — the full conversation tree and its persistence
     * snapshot stay intact; only the oldest rendered bubbles are dropped from view.
     */
    private _maxRenderedBubbles: number = 1000;
    /** One-time guard for the deprecated `maxMessages` warning. */
    private _warnedMaxMessagesDeprecation = false;
    private _resizeObserver: ResizeObserver | null = null;
    private _mutationObserver: MutationObserver | null = null;
    private _boundResetHandler: (() => void) | null = null;
    /**
     * When true, _reRenderActivePath() only dispatches aparte-path-changed without
     * touching the DOM. Set via setFrameworkManagedDOM(true) when a framework
     * (e.g. Angular) owns the bubble elements.
     */
    private _frameworkManagedDOM = false;

    static get observedAttributes(): string[] {
        return ['scroll-threshold', 'max-rendered-bubbles', 'max-messages'];
    }

    constructor() {
        super();
        this._handleScroll = this._handleScroll.bind(this);
    }

    connectedCallback(): void {
        // Framework wrappers set `framework-managed` DECLARATIVELY so the flag is
        // known BEFORE _render() builds the DOM. Otherwise _render()'s child
        // relocation runs at connect — before the host's setFrameworkManagedDOM()
        // call — moving the framework's bubbles into an internal wrapper and
        // breaking its reconciliation (insertBefore NotFoundError on the next
        // append). See _setupFrameworkDOM().
        if (this.hasAttribute('framework-managed')) this._frameworkManagedDOM = true;
        this._render();
        this._setupEventListeners();
        this._setupObservers();
        this._boundResetHandler = () => this.clearAll();
        window.addEventListener('aparte-reset', this._boundResetHandler);
    }

    disconnectedCallback(): void {
        if (this._boundResetHandler) {
            window.removeEventListener('aparte-reset', this._boundResetHandler);
            this._boundResetHandler = null;
        }
        this._cleanup();
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue) return;

        switch (name) {
            case 'scroll-threshold':
                this._scrollThreshold = parseInt(newValue || '50', 10);
                break;
            case 'max-rendered-bubbles':
                this._maxRenderedBubbles = parseInt(newValue || '1000', 10);
                this._pruneRenderedBubbles();
                break;
            case 'max-messages':
                // Deprecated alias. It used to evict messages from the tree
                // (destructive, silent data loss); it now only caps rendered
                // bubbles in the DOM. Use `max-rendered-bubbles` instead.
                this._warnMaxMessagesDeprecated();
                this._maxRenderedBubbles = parseInt(newValue || '1000', 10);
                this._pruneRenderedBubbles();
                break;
        }
    }

    /**
     * Configure viewport with options
     */
    configure(config: AparteViewportConfig): void {
        if (config.scrollThreshold !== undefined) {
            this._scrollThreshold = config.scrollThreshold;
        }
        if (config.maxRenderedBubbles !== undefined) {
            this._maxRenderedBubbles = config.maxRenderedBubbles;
            this._pruneRenderedBubbles();
        }
        if (config.maxMessages !== undefined) {
            // Deprecated alias (see attributeChangedCallback).
            this._warnMaxMessagesDeprecated();
            this._maxRenderedBubbles = config.maxMessages;
            this._pruneRenderedBubbles();
        }
        if (config.layoutTransitionMs !== undefined) {
            this._layoutTransitionMs = config.layoutTransitionMs;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Simple Content Streaming
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Append a token chunk to a message's content (simple text streaming)
     * @param messageId - Unique identifier for the message
     * @param chunk - Token chunk to append
     */
    appendToken(messageId: string, chunk: string): void {
        const message = this._getOrCreateMessage(messageId);

        // Append to simple content
        message.content = (message.content || '') + chunk;

        // Notify bubble
        this._notifyBubble(messageId, 'appendToken', chunk);
        this._autoScroll();
        this._scheduleSpacerUpdate();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Segment-Aware Streaming
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Append content to a specific segment within a message
     * @param messageId - Message containing the segment
     * @param segmentId - Target segment ID
     * @param chunk - Content to append
     */
    appendToSegment(messageId: string, segmentId: string, chunk: string): void {
        const message = this._getOrCreateMessage(messageId);

        // Find or create segment
        if (!message.segments) {
            message.segments = [];
        }

        const segment = message.segments.find(s => s.id === segmentId);
        if (segment && 'content' in segment) {
            (segment as { content: string }).content += chunk;
        }

        // Dispatch segment update event
        this.dispatchEvent(new CustomEvent<AparteSegmentUpdateEvent>('aparte-segment-update', {
            bubbles: true,
            composed: true,
            detail: { messageId, segmentId, content: chunk, append: true }
        }));

        // Notify bubble
        this._notifyBubble(messageId, 'appendToSegment', chunk, segmentId);
        this._autoScroll();
    }

    /**
     * The active (head) message id — the target of `AparteClient`'s 1-argument
     * streaming convention (`addSegment(segment)`, `updateSegment(segmentId,
     * updates)`, …) which operates on "the current message". Lets a bare
     * `<aparte-chat-viewport>` be a valid `AparteClient` target, exactly like a
     * framework wrapper's host element.
     */
    private _activeMessageId(): string | null {
        return this._repo.headId;
    }

    /**
     * Add a new segment. Two calling conventions are accepted:
     * - `addSegment(segment)` — AparteClient's 1-arg "operate on the current
     *   (head) message" convention (also what a wrapper host installs);
     * - `addSegment(messageId, segment)` — explicit standalone form.
     * The first argument's type disambiguates (string = messageId, object =
     * segment), so a raw viewport driven by `AparteClient` no longer drops text
     * (the args used to bind one position short, creating a phantom message).
     */
    addSegment(segment: AparteSegment): void;
    addSegment(messageId: string, segment: AparteSegment): void;
    addSegment(messageIdOrSegment: string | AparteSegment, maybeSegment?: AparteSegment): void {
        const messageId = typeof messageIdOrSegment === 'string' ? messageIdOrSegment : this._activeMessageId();
        const segment = typeof messageIdOrSegment === 'string' ? maybeSegment : messageIdOrSegment;
        if (!messageId || !segment) return;

        const message = this._getOrCreateMessage(messageId);
        if (!message.segments) {
            message.segments = [];
        }
        message.segments.push(segment);

        // Notify bubble to render the new segment
        this._notifyBubble(messageId, 'addSegment', segment);
        this._autoScroll();
    }

    /**
     * Update a segment. `updateSegment(segmentId, updates)` (1-arg client
     * convention → current message) or `updateSegment(messageId, segmentId,
     * updates)` (explicit). Disambiguated by arity: the 3rd arg is absent and
     * the 2nd is the `updates` object in the 1-arg form.
     */
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void;
    updateSegment(messageId: string, segmentId: string, updates: Partial<AparteSegment>): void;
    updateSegment(a: string, b: string | Partial<AparteSegment>, c?: Partial<AparteSegment>): void {
        const clientForm = c === undefined && typeof b === 'object';
        const messageId = clientForm ? this._activeMessageId() : a;
        const segmentId = clientForm ? a : (b as string);
        const updates = clientForm ? (b as Partial<AparteSegment>) : (c as Partial<AparteSegment>);
        if (!messageId) return;

        const message = this._repo.getMessageById(messageId);
        if (!message?.segments) return;

        const segmentIndex = message.segments.findIndex(s => s.id === segmentId);
        if (segmentIndex !== -1) {
            message.segments[segmentIndex] = {
                ...message.segments[segmentIndex],
                ...updates
            } as AparteSegment;

            this._notifyBubble(messageId, 'updateSegment', { segmentId, updates });
        }
    }

    /**
     * Remove a segment. `removeSegment(segmentId)` (1-arg client convention →
     * current message) or `removeSegment(messageId, segmentId)` (explicit).
     */
    removeSegment(segmentId: string): void;
    removeSegment(messageId: string, segmentId: string): void;
    removeSegment(a: string, b?: string): void {
        const clientForm = b === undefined;
        const messageId = clientForm ? this._activeMessageId() : a;
        const segmentId = clientForm ? a : b;
        if (!messageId || !segmentId) return;

        const message = this._repo.getMessageById(messageId);
        if (message?.segments) {
            const idx = message.segments.findIndex(s => s.id === segmentId);
            if (idx !== -1) message.segments.splice(idx, 1);
        }
        this._notifyBubble(messageId, 'removeSegment', segmentId);
    }

    /**
     * Start a new streaming segment (e.g., thinking or code block)
     * Creates the segment and marks it as streaming
     */
    startSegment(messageId: string, segment: AparteSegment): void {
        const streamingSegment = { ...segment, isStreaming: true };
        this.addSegment(messageId, streamingSegment);
    }

    /**
     * Complete a streaming segment
     */
    completeSegment(messageId: string, segmentId: string): void {
        this.updateSegment(messageId, segmentId, { isStreaming: false });
    }

    /**
     * Persist token usage on a message and propagate to the live bubble so the
     * perf chip (tokens/sec) renders in the action bar.
     */
    setUsage(messageId: string, usage: AparteUsage): void {
        const message = this._repo.getMessageById(messageId);
        if (message) message.usage = usage;
        this._notifyBubble(messageId, 'setUsage', usage);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Message Management
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Mark a message as finished streaming
     */
    completeMessage(messageId: string): void {
        const message = this._repo.getMessageById(messageId);
        if (message) {
            message.isStreaming = false;
            message.status = 'completed';

            // Mark all segments as complete
            message.segments?.forEach(s => {
                (s as { isStreaming?: boolean }).isStreaming = false;
            });

            this._notifyBubble(messageId, 'complete', { status: 'completed' });
            this._recalculateSpacer();
        }
    }

    /**
     * Atomic update for a message by ID
     * Supports updating content, status, segments, and other metadata
     */
    updateMessage(messageId: string, updates: Partial<AparteMessage>): void {
        const message = this._repo.getMessageById(messageId);
        if (!message) return;

        // Apply updates to internal state
        Object.assign(message, updates);

        // Map AparteStatus to isStreaming for legacy bubble support
        if (updates.status) {
            message.isStreaming = updates.status === 'streaming' || updates.status === 'pending';
        }

        // Notify bubble
        this._notifyBubble(messageId, 'update', updates);
        this._autoScroll();
    }

    /**
     * Add a complete message to the message registry.
     *
     * @remarks
     * **Framework-managed DOM only.** Records the message in the tree but does NOT
     * paint a bubble on its own (a framework wrapper reconciles the DOM from the
     * list). For standalone / vanilla usage call {@link appendMessage} instead,
     * which both records the message and creates its bubble element.
     */
    addMessage(message: AparteMessage): void {
        this._repo.addOrUpdateMessage(this._repo.headId, { ...message });
        this._pruneRenderedBubbles();
        this._autoScroll();
    }

    /**
     * Append a new message and create its bubble in the DOM.
     * Implements the same contract as the Angular wrapper's appendMessage(),
     * making aparte-chat-viewport a fully standalone target for aparte-client.
     * When `_frameworkManagedDOM` is true, only the internal repo is updated —
     * the framework owns the DOM and will create the bubble element itself.
     */
    appendMessage(message: AparteMessage): void {
        this._repo.addOrUpdateMessage(this._repo.headId, { ...message });
        if (!this._frameworkManagedDOM) {
            const wrapper = this.querySelector('.aparte-messages-wrapper');
            if (wrapper) {
                const bubble = document.createElement('aparte-chat-bubble') as HTMLElement;
                bubble.setAttribute('message-id', message.id);
                bubble.setAttribute('role', message.role);
                if (message.timestamp) bubble.setAttribute('timestamp', String(message.timestamp));
                if (message.content) bubble.setAttribute('content', message.content);
                if (message.status === 'streaming' || message.status === 'pending') {
                    bubble.setAttribute('streaming', '');
                }
                // Insert before spacer so spacer stays last
                if (this._bottomSpacer && this._bottomSpacer.parentNode === wrapper) {
                    wrapper.insertBefore(bubble, this._bottomSpacer);
                } else {
                    wrapper.appendChild(bubble);
                }
            }
        }
        this._pruneRenderedBubbles();
        this._recalculateSpacer();
        // User sending always anchors to bottom regardless of scroll position.
        if (message.role === 'user') {
            this._isAutoScrollEnabled = true;
            // Smooth scroll for user-initiated sends. Streaming auto-scroll stays
            // instant (via _autoScroll) so it can keep up with rapid token bursts.
            requestAnimationFrame(() => this._smoothScrollToBottom());
        } else {
            this._autoScroll();
        }
    }

    /**
     * Update the last message content, optionally appending.
     * Implements the same contract as the Angular wrapper's updateLastMessage(),'
     * making aparte-chat-viewport a fully standalone streaming target for aparte-client.
     */
    updateLastMessage(content: string, options?: { append?: boolean }): void {
        const lastId = this._repo.headId;
        if (!lastId) return;
        if (options?.append) {
            this.appendToken(lastId, content);
        } else {
            const message = this._repo.getMessageById(lastId);
            if (message) message.content = content;
            this._notifyBubble(lastId, 'appendToken', content);
        }
    }

    /**
     * Add a new sibling branch to an assistant message (retry flow).
     * Creates a new empty assistant message as a sibling of `messageId`
     * under the same parent, switches the active branch to it, and
     * re-renders the active path.
     * @returns The index of the new branch in the siblings array, or 0 on failure.
     */
    addBranch(messageId: string): number {
        const meta = this._repo.getMessage(messageId);
        if (!meta) return 0;

        const newMsg: AparteMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            status: 'pending',
            timestamp: Date.now(),
        };
        this._repo.addOrUpdateMessage(meta.parentId, newMsg);
        this._repo.switchToBranch(newMsg.id);
        this._reRenderActivePath();

        const siblings = this._repo.getBranches(newMsg.id);
        return siblings.indexOf(newMsg.id);
    }

    /**
     * Add a new message relative to `existingId`, switch to it, and re-render.
     *
     * Role-aware semantics:
     *  - existingId is an **assistant** message → create a sibling (same parent),
     *    so the active path replaces the old response with the new one.
     *  - existingId is a **user** message → create a child of that message,
     *    so the user message stays on the active path and the new response follows it.
     *
     * Returns the new message's ID, or null if `existingId` is not found.
     */
    addSiblingOf(existingId: string, newMessage: AparteMessage): string | null {
        const meta = this._repo.getMessage(existingId);
        if (!meta) return null;

        // User messages: new response is a child (keep user on active path).
        // Assistant messages: new response is a sibling (replace old response).
        const parentId = meta.message.role === 'user'
            ? existingId
            : meta.parentId;
        this._repo.addOrUpdateMessage(parentId, { ...newMessage });
        this._repo.switchToBranch(newMessage.id);
        this._reRenderActivePath();
        return newMessage.id;
    }

    /**
     * Navigate to the previous or next sibling branch of a message.
     * Triggers a full re-render of the active path.
     */
    navigateBranch(messageId: string, direction: 'prev' | 'next'): void {
        const siblings = this._repo.getBranches(messageId);
        const currentIdx = siblings.indexOf(messageId);
        if (currentIdx === -1) return;

        const targetIdx = direction === 'prev' ? currentIdx - 1 : currentIdx + 1;
        if (targetIdx < 0 || targetIdx >= siblings.length) return;

        // Branch navigation is a deliberate user action — do not scroll to the
        // bottom. Disable auto-scroll so neither the spacer recalculation nor
        // the MutationObserver callback fires _scrollToBottom() after the DOM
        // rebuilds. The user can re-enable auto-scroll by scrolling to the bottom.
        this._isAutoScrollEnabled = false;
        this._updateScrollButton();

        this._repo.switchToBranch(siblings[targetIdx]!);
        this._reRenderActivePath();
    }

    /**
     * Remove ALL responses to a user message (every child branch) and set head
     * back to `userMessageId`. Cleaner than `truncateFrom` for edit flows: it
     * discards stale sibling branches so the regenerated response starts alone.
     */
    truncateResponsesAfter(userMessageId: string): void {
        const prevMessages = this._repo.getMessages();
        this._repo.clearChildren(userMessageId);

        // In framework-managed mode the host (Angular @for, React, etc.) owns
        // the bubble DOM. Removing nodes from under it triggers
        // `NotFoundError: Failed to execute 'insertBefore'` on the next change
        // detection cycle because the framework's view tree no longer matches
        // the actual DOM. Skip the manual cleanup and let the framework
        // reconcile when the consumer updates its message array.
        if (!this._frameworkManagedDOM) {
            const wrapper = this.querySelector('.aparte-messages-wrapper');
            if (wrapper) {
                const startIdx = prevMessages.findIndex(m => m.id === userMessageId);
                const toRemove = startIdx >= 0 ? prevMessages.slice(startIdx + 1) : [];
                for (const m of toRemove) {
                    wrapper.querySelector(`aparte-chat-bubble[message-id="${cssEscape(m.id)}"]`)?.remove();
                }
            }
        }
    }

    /**
     * Remove all messages from `messageId` onwards (inclusive) from state and DOM.
     * Used by edit to truncate history before re-generating.
     */
    truncateFrom(messageId: string): void {
        const allMsgs = this._repo.getMessages();
        const startIdx = allMsgs.findIndex(m => m.id === messageId);
        if (startIdx === -1) return;

        const toRemove = allMsgs.slice(startIdx).map(m => m.id);
        this._repo.resetHead(messageId);

        // See the note in truncateResponsesAfter: skip DOM ops when a framework
        // owns the bubble elements.
        if (!this._frameworkManagedDOM) {
            const wrapper = this.querySelector('.aparte-messages-wrapper');
            for (const id of toRemove) {
                wrapper?.querySelector(`aparte-chat-bubble[message-id="${cssEscape(id)}"]`)?.remove();
            }
        }
    }

    /**
     * Get a message by ID
     */
    getMessage(messageId: string): AparteMessage | undefined {
        return this._repo.getMessageById(messageId);
    }

    getMessages(): AparteMessage[] {
        return this._repo.getMessages();
    }

    /**
     * Export the full conversation tree (all branches, not just the active path).
     * The returned snapshot can be persisted and restored via `importTree()`.
     */
    exportTree(): ExportedMessageRepository {
        return this._repo.export();
    }

    /**
     * Import a previously-exported tree snapshot, restoring the full branch
     * topology and the active head. Replaces any existing repo content.
     *
     * Always calls `_reRenderActivePath()`:
     * - In native DOM mode: rebuilds bubble elements.
     * - In framework-managed mode: skips DOM manipulation but dispatches
     *   `aparte-path-changed` with sibling metadata so the wrapper can update
     *   branch arrows on already-rendered bubbles.
     */
    importTree(tree: ExportedMessageRepository): void {
        this.clearAll();
        this._repo.import(tree);
        this._reRenderActivePath();
    }

    /**
     * Clear all messages and remove all bubble elements from the DOM.
     * Also dispatches a aparte-reset-done event.
     *
     * In framework-managed mode the DOM is owned by the host framework
     * (Angular @for, React, etc.) and we must not clear `innerHTML` — doing
     * so desynchronises the framework's view tree from the live DOM and the
     * next change-detection pass throws `NotFoundError` on insertBefore.
     */
    clearAll(): void {
        this._repo.clear();
        if (!this._frameworkManagedDOM) {
            const wrapper = this.querySelector('.aparte-messages-wrapper');
            if (wrapper) {
                // Remove bubbles individually so the spacer div is preserved.
                Array.from(wrapper.querySelectorAll('aparte-chat-bubble')).forEach(b => b.remove());
            }
        }
        // Reset spacer and scroll button regardless of mode
        this._setSpacerHeight(0);
        this._isAutoScrollEnabled = true;
        this._updateScrollButton();
        this.dispatchEvent(new CustomEvent('aparte-reset-done', { bubbles: true, composed: true }));
    }

    /**
     * Clear all messages
     * @deprecated Use clearAll() to also remove DOM bubbles
     */
    clearMessages(): void {
        this._repo.clear();
    }

    /**
     * Replace the entire message list in one shot. Used when switching
     * conversations: clears existing repo + DOM, then appends each message.
     *
     * In framework-managed mode the framework re-renders the bubble DOM
     * itself; we only update the internal repo (used by aparte-client to
     * build chat history).
     */
    setMessages(messages: AparteMessage[]): void {
        this.clearAll();
        for (const m of messages) {
            this.appendMessage(m);
        }
    }

    /**
     * Scroll to bottom of viewport
     */
    scrollToBottom(): void {
        this._scrollToBottom();
    }

    /**
     * Reset the bottom spacer to 0 height immediately and freeze it for
     * 350 ms so the host-app layout transition (e.g. flex: 0→1 animation)
     * does not trigger a premature recalculation with mid-animation geometry.
     * Call before a full messages swap.
     */
    resetSpacer(): void {
        this._setSpacerHeight(0);
        // Freeze spacer recalculation for the duration of any host layout
        // transition (configured via `layoutTransitionMs`). Without this,
        // ResizeObserver fires on every animation frame while the container
        // is still growing, producing incorrect spacer values.
        if (this._layoutTransitionMs > 0) {
            this._spacerFrozenUntil = Date.now() + this._layoutTransitionMs;
        }
    }

    /**
     * Enable or disable auto-scroll
     */
    setAutoScroll(enabled: boolean): void {
        this._isAutoScrollEnabled = enabled;
    }

    /**
     * Signal that a framework (e.g. Angular) manages the bubble DOM.
     * When true, branch navigation dispatches `aparte-path-changed` without
     * clearing/rebuilding the messages wrapper — the framework re-renders instead.
     */
    setFrameworkManagedDOM(managed: boolean): void {
        this._frameworkManagedDOM = managed;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private _getOrCreateMessage(messageId: string): AparteMessage {
        const existing = this._repo.getMessageById(messageId);
        if (existing) return existing;

        const message: AparteMessage = {
            id: messageId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            isStreaming: true,
            status: 'streaming'
        };
        this._repo.addOrUpdateMessage(this._repo.headId, message);
        return message;
    }

    private _notifyBubble(messageId: string, action: string, payload?: unknown, segmentId?: string): void {
        // Find the bubble element — the native `<aparte-chat-bubble>` OR a custom
        // element opting into live streaming via `data-aparte-bubble` (so a raw-core
        // consumer can replace the bubble tag and still receive token/segment
        // pushes, not just a CSS restyle).
        const bubble = this.querySelector(
            `aparte-chat-bubble[message-id="${messageId}"], [data-aparte-bubble][message-id="${messageId}"]`,
        ) as HTMLElement & {
            appendToken?: (chunk: string) => void;
            appendToSegment?: (segmentId: string, chunk: string) => void;
            addSegment?: (segment: AparteSegment) => void;
            updateSegment?: (segmentId: string, updates: Partial<AparteSegment>) => void;
            removeSegment?: (segmentId: string) => void;
            setUsage?: (usage: AparteUsage) => void;
            updateMessage?: (updates: Partial<AparteMessage>) => void;
        };

        if (!bubble) return;

        switch (action) {
            case 'appendToken':
                bubble.appendToken?.(payload as string);
                break;
            case 'appendToSegment':
                bubble.appendToSegment?.(segmentId!, payload as string);
                break;
            case 'addSegment':
                bubble.addSegment?.(payload as AparteSegment);
                break;
            case 'updateSegment': {
                const { segmentId: sid, updates: segUpdates } = payload as { segmentId: string; updates: Partial<AparteSegment> };
                bubble.updateSegment?.(sid, segUpdates);
                break;
            }
            case 'removeSegment':
                bubble.removeSegment?.(payload as string);
                break;
            case 'setUsage':
                bubble.setUsage?.(payload as AparteUsage);
                break;
            case 'update':
                // New atomic update for bubble
                if ('status' in (payload as Record<string, unknown>) || 'segments' in (payload as Record<string, unknown>)) {
                    bubble.updateMessage?.(payload as Partial<AparteMessage>);
                }
                break;
            case 'complete':
                bubble.updateMessage?.(payload as Partial<AparteMessage>);
                break;
        }
    }

    /**
     * Re-render the active path: clears the messages wrapper and rebuilds bubbles
     * for every message on the current active branch path (root → head).
     * Calls `setSiblings(count, index)` on each bubble that has siblings, and
     * dispatches `aparte-path-changed` so Angular wrapper can sync its signal.
     *
     * When `_frameworkManagedDOM` is true (set via setFrameworkManagedDOM), the DOM
     * manipulation is skipped — only `aparte-path-changed` is dispatched so the
     * framework can re-render from updated signal state.
     */
    private _reRenderActivePath(): void {
        const activeMessages = this._repo.getMessages();

        // Compute sibling metadata once and reuse — keeps the event payload
        // identical between framework-managed and default DOM modes.
        const siblingsInfo: AparteSiblingInfo[] = activeMessages.map(m => {
            const sibs = this._repo.getBranches(m.id);
            return { id: m.id, count: sibs.length, index: sibs.indexOf(m.id) };
        });

        if (this._frameworkManagedDOM) {
            this._dispatchPathChanged(activeMessages, siblingsInfo);
            return;
        }

        const wrapper = this.querySelector('.aparte-messages-wrapper');
        if (!wrapper) return;
        wrapper.innerHTML = '';

        // Only materialise the last N messages of the active path (DOM render cap).
        // The repository keeps the full path; this is a perf ceiling, not eviction.
        const startIdx = Math.max(0, activeMessages.length - this._maxRenderedBubbles);
        for (let i = startIdx; i < activeMessages.length; i++) {
            const message = activeMessages[i]!;
            const sibInfo = siblingsInfo[i];

            const bubble = document.createElement('aparte-chat-bubble');
            bubble.setAttribute('message-id', message.id);
            bubble.setAttribute('role', message.role);
            if (message.timestamp) bubble.setAttribute('timestamp', String(message.timestamp));
            if (message.status === 'streaming' || message.status === 'pending') {
                bubble.setAttribute('streaming', '');
            }
            wrapper.appendChild(bubble);

            // Reconcile content / segments / attachments / sibling-picker via
            // the shared helper — same code path the framework wrappers use,
            // so the contract stays in lockstep.
            populateBubbleFromMessage(bubble as unknown as SyncableBubble, message, sibInfo);
        }

        this._dispatchPathChanged(activeMessages, siblingsInfo);
        this._recalculateSpacer();

        // The path swap rebuilt the DOM without firing a `scroll` event, so the
        // auto-scroll flag (and the scroll-to-bottom button that mirrors it) can
        // be stale — e.g. navigating from a long branch to one that fits entirely
        // would leave the button showing with nothing to scroll. Re-derive both
        // from the real post-layout geometry.
        requestAnimationFrame(() => this._handleScroll());
    }

    private _dispatchPathChanged(messages: AparteMessage[], siblings: AparteSiblingInfo[]): void {
        const detail: ApartePathChangedEventDetail = { messages, siblings };
        this.dispatchEvent(new CustomEvent<ApartePathChangedEventDetail>('aparte-path-changed', {
            bubbles: true,
            composed: true,
            detail,
        }));
    }

    private _autoScroll(): void {
        if (this._isAutoScrollEnabled) {
            if (this._smoothScrollOnce) {
                this._smoothScrollOnce = false;
                requestAnimationFrame(() => this._smoothScrollToBottom());
            } else {
                requestAnimationFrame(() => this._scrollToBottom());
            }
        }
        this._pruneRenderedBubbles();
    }

    /**
     * Request that the next auto-scroll triggered by a DOM mutation uses
     * smooth behaviour instead of instant. Call this just before adding a
     * user message bubble so the viewport animates down rather than jumping.
     * Resets automatically after the first auto-scroll fires.
     */
    requestSmoothScroll(): void {
        this._smoothScrollOnce = true;
    }

    private _render(): void {
        // Framework-managed: the framework owns the bubble children directly.
        // Do NOT build the internal container/wrapper or relocate children.
        if (this._frameworkManagedDOM) {
            this._setupFrameworkDOM();
            return;
        }
        // Light DOM rendering
        // Preserving existing children in render allows framework composition
        if (!this.querySelector('.aparte-viewport-container')) {
            const container = document.createElement('div');
            container.className = 'aparte-viewport-container';

            // Set direction based on current locale
            const locale = resolveConfig(this).getLocale();
            if (locale.direction) {
                container.setAttribute('dir', locale.direction);
            }

            container.setAttribute('role', 'log');
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'false');
            container.setAttribute('aria-relevant', 'additions');

            const wrapper = document.createElement('div');
            wrapper.className = 'aparte-messages-wrapper';

            // Move existing children (bubbles) into wrapper
            while (this.firstChild) {
                wrapper.appendChild(this.firstChild);
            }

            // Bottom spacer — always last in wrapper, height driven by _recalculateSpacer()
            this._bottomSpacer = document.createElement('div');
            this._bottomSpacer.className = 'aparte-bottom-spacer';
            this._bottomSpacer.setAttribute('aria-hidden', 'true');
            wrapper.appendChild(this._bottomSpacer);

            container.appendChild(wrapper);
            this.appendChild(container);

            this._container = container;

            // Scroll-to-bottom button — absolutely positioned over the viewport
            this._scrollBtn = document.createElement('button');
            this._scrollBtn.className = 'aparte-scroll-btn aparte-scroll-btn--hidden';
            this._scrollBtn.setAttribute('type', 'button');
            this._scrollBtn.setAttribute('aria-label', 'Scroll to bottom');
            const scrollIcon = resolveConfig(this).getIcon('scrollDown');
            this._scrollBtn.innerHTML = scrollIcon
                || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
            this.appendChild(this._scrollBtn);
        } else {
            this._container = this.querySelector('.aparte-viewport-container');
            this._scrollBtn = this.querySelector('.aparte-scroll-btn');
            this._bottomSpacer = this.querySelector('.aparte-bottom-spacer');
        }
    }

    /**
     * DOM setup for framework-managed mode. The framework (React/Vue/Svelte/
     * Angular) renders the bubble elements as DIRECT children of the host, so we
     * must NOT relocate them into an internal wrapper — that desyncs the
     * framework's virtual DOM from the real DOM and throws NotFoundError on the
     * next append. Instead the HOST itself is the scroll surface, the spacer is
     * additive `padding-bottom` (no element), and the scroll button is a
     * `position: sticky` TRAILING foreign child (kept last by the framework
     * MutationObserver). A present foreign node is still a valid `insertBefore`
     * reference for the framework — the crash came from a RELOCATED node, not a
     * foreign one.
     */
    private _setupFrameworkDOM(): void {
        this._container = this;
        this._bottomSpacer = null;
        if (this.classList.contains('aparte-viewport--framework')) {
            this._scrollBtn = this.querySelector(':scope > .aparte-scroll-btn') as HTMLButtonElement | null;
            return; // already set up (re-entrant _render)
        }
        this.classList.add('aparte-viewport--framework');

        const scrollBtn = document.createElement('button');
        scrollBtn.className = 'aparte-scroll-btn aparte-scroll-btn--hidden';
        scrollBtn.setAttribute('type', 'button');
        scrollBtn.setAttribute('aria-label', 'Scroll to bottom');
        const scrollIcon = resolveConfig(this).getIcon('scrollDown');
        scrollBtn.innerHTML = scrollIcon
            || `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
        this.appendChild(scrollBtn);
        this._scrollBtn = scrollBtn;
    }

    /**
     * Keep the sticky scroll button as the last child in framework-managed mode.
     * The framework usually inserts bubbles before its own trailing nodes (so the
     * button stays last), but a plain `appendChild` at the very end (e.g. some
     * Angular @for paths) can land a bubble after it — move it back. Idempotent:
     * a no-op when already last, so it never loops the MutationObserver.
     */
    private _keepScrollButtonLast(): void {
        if (!this._scrollBtn) return;
        if (this.lastElementChild !== this._scrollBtn) {
            this.appendChild(this._scrollBtn);
        }
    }

    /** Current spacer height — a padding value (framework) or the element's height (core). */
    private _getSpacerHeight(): number {
        if (this._frameworkManagedDOM) return this._fwSpacerHeight;
        return this._bottomSpacer?.offsetHeight ?? 0;
    }

    /** Set the spacer — host padding (framework, additive to base padding) or element height (core). */
    private _setSpacerHeight(px: number): void {
        if (this._frameworkManagedDOM) {
            this._fwSpacerHeight = px;
            this.style.setProperty('--aparte-fw-spacer', `${px}px`);
        } else if (this._bottomSpacer) {
            this._bottomSpacer.style.height = `${px}px`;
        }
    }

    private _setupEventListeners(): void {
        this._container?.addEventListener('scroll', this._handleScroll, { passive: true });
        this._scrollBtn?.addEventListener('click', () => {
            this._isAutoScrollEnabled = true;
            this._smoothScrollToBottom();
            this._updateScrollButton();
        });
        this.addEventListener('aparte-branch-navigate', (e: Event) => {
            const evt = e as CustomEvent<{ messageId: string; direction: 'prev' | 'next' }>;
            evt.stopPropagation();
            this.navigateBranch(evt.detail.messageId, evt.detail.direction);
        });
    }

    private _setupObservers(): void {
        this._resizeObserver = new ResizeObserver(() => {
            if (this._isAutoScrollEnabled) {
                this._scrollToBottom();
            }
            this._recalculateSpacer();
        });

        const wrapper = this.querySelector('.aparte-messages-wrapper');

        if (this._container) {
            // Fires on window/viewport resize and when the composer grows.
            // NOTE: we intentionally do NOT observe .aparte-messages-wrapper here.
            // The wrapper contains the spacer div — observing it would create a
            // feedback loop: spacer changes → wrapper resizes → ResizeObserver →
            // _recalculateSpacer → spacer changes → … → height grows unbounded.
            // Streaming content growth is handled by direct _scheduleSpacerUpdate()
            // calls from appendToken(). New bubbles are handled by MutationObserver.
            // Framework-managed: _container IS the host, whose `padding-bottom`
            // carries the spacer — observe the BORDER box (fixed host size) so a
            // spacer/padding change does NOT re-trigger _recalculateSpacer and
            // loop. Core mode observes the container (no dynamic padding).
            if (this._frameworkManagedDOM) {
                this._resizeObserver.observe(this._container, { box: 'border-box' });
            } else {
                this._resizeObserver.observe(this._container);
            }
        }

        this._mutationObserver = new MutationObserver(() => {
            // Keep the sticky scroll button trailing after framework appends.
            if (this._frameworkManagedDOM) this._keepScrollButtonLast();
            if (this._isAutoScrollEnabled) {
                requestAnimationFrame(() => this._scrollToBottom());
            }
            // Recalculate spacer when DOM mutates (new bubble added, Angular re-render).
            this._scheduleSpacerUpdate();
        });

        // Framework-managed: bubbles are direct children of the host (no wrapper).
        const observeTarget = this._frameworkManagedDOM ? this : wrapper;
        if (observeTarget) {
            this._mutationObserver.observe(observeTarget, {
                childList: true,
                subtree: true
            });
        }
    }

    private _handleScroll(): void {
        if (!this._container) return;

        const { scrollTop, scrollHeight, clientHeight } = this._container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        this._isAutoScrollEnabled = distanceFromBottom <= this._scrollThreshold;
        this._updateScrollButton();
    }

    private _scrollToBottom(): void {
        if (!this._container) return;
        this._container.scrollTop = this._container.scrollHeight;
    }

    private _smoothScrollToBottom(): void {
        if (!this._container) return;
        // scrollTo with behavior:'smooth' is not available in all environments (e.g. jsdom).
        // Fall back to instant scroll so tests and SSR environments stay safe.
        // Reduced-motion users get the instant path too — the CSS
        // prefers-reduced-motion block cannot reach a JS-driven smooth scroll.
        if (typeof this._container.scrollTo === 'function' && !this._prefersReducedMotion()) {
            this._container.scrollTo({ top: this._container.scrollHeight, behavior: 'smooth' });
        } else {
            this._container.scrollTop = this._container.scrollHeight;
        }
    }

    private _prefersReducedMotion(): boolean {
        return typeof matchMedia === 'function'
            && matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /**
     * Show/hide the scroll-to-bottom button based on the current auto-scroll state.
     * Hidden when already at bottom (_isAutoScrollEnabled = true).
     */
    private _updateScrollButton(): void {
        this._scrollBtn?.classList.toggle('aparte-scroll-btn--hidden', this._isAutoScrollEnabled);
    }

    /**
     * Recalculate the bottom spacer height so the last user message is always
     * pinned to the top of the scroll area when a response is being generated.
     *
     * spacer = max(0, viewportHeight - lastUserBubble.offsetHeight - lastAssistantBubble.offsetHeight)
     *
     * The spacer shrinks progressively as the assistant streams content, eventually
     * reaching 0 when the combined height fills the viewport.
     */
    private _recalculateSpacer(): void {
        // Core mode needs the spacer element; framework mode uses host padding
        // (no element) — both need the scroll container.
        if (!this._container) return;
        if (!this._frameworkManagedDOM && !this._bottomSpacer) return;
        // Skip while the host layout is still animating (e.g. the flex transition
        // that moves the composer from the center of the screen to the bottom).
        // Without this guard, every ResizeObserver tick during the transition
        // reads a partially-grown clientHeight and writes an incorrect spacer
        // height that may reach the clientHeight cap and lock the spacer there.
        if (Date.now() < this._spacerFrozenUntil) return;

        const allBubbles = Array.from(
            this.querySelectorAll('aparte-chat-bubble')
        ) as HTMLElement[];

        if (allBubbles.length === 0) {
            this._setSpacerHeight(0);
            return;
        }

        const lastUserBubble = [...allBubbles]
            .reverse()
            .find(b => b.getAttribute('role') === 'user');

        if (!lastUserBubble) {
            this._setSpacerHeight(0);
            return;
        }

        // Read the current spacer height (may be non-zero during a CSS transition
        // or a previous non-zero value). Subtract it from scrollHeight to get the
        // true content height WITHOUT the spacer — no need to zero-then-reflow,
        // which would both fight the CSS transition and force an extra synchronous
        // layout that could read a stale animated value.
        const currentSpacerH = this._getSpacerHeight();

        // Use getBoundingClientRect so gaps, padding, and all children are
        // automatically accounted for — no need to manually sum heights.
        const containerRect = this._container.getBoundingClientRect();
        const userRect = lastUserBubble.getBoundingClientRect();

        // Absolute Y position of the user bubble's top within the full scrollable content
        const userTopInContent = userRect.top - containerRect.top + this._container.scrollTop;

        // Height of content from user bubble top to end, excluding the spacer
        const scrollHeightWithoutSpacer = this._container.scrollHeight - currentSpacerH;

        // If all content already fits in the viewport, no spacer is needed.
        if (scrollHeightWithoutSpacer <= this._container.clientHeight) {
            this._setSpacerHeight(0);
            return;
        }

        const contentBelowUserTop = scrollHeightWithoutSpacer - userTopInContent;

        const needed = this._container.clientHeight - contentBelowUserTop;
        // Hard cap: the spacer can never exceed the visible viewport height.
        // This acts as a safety net against stale layout reads (e.g. mid-swap)
        // that could produce an astronomical value and push content off-screen.
        const maxSpacer = this._container.clientHeight;
        this._setSpacerHeight(Math.min(Math.max(0, needed), maxSpacer));

        // Re-scroll after the spacer height changes so scrollTop is always
        // consistent with the new scrollHeight. Without this, the MutationObserver
        // schedules _scrollToBottom() one RAF *before* _recalculateSpacer() runs,
        // leaving scrollTop based on the pre-spacer scrollHeight. On the next
        // recalculation (e.g. from syncMessagesWithBubbles or a resize) the formula
        // reads a stale scrollTop and may grow the spacer to the clientHeight cap.
        if (this._isAutoScrollEnabled) {
            this._scrollToBottom();
        }
    }

    /**
     * Schedule a spacer recalculation on the next animation frame.
     * Batches multiple rapid calls (e.g. during token streaming) into one.
     *
     * Single-RAF intentional: both the scroll-to-bottom queued by MutationObserver
     * and this spacer recalculation must land in the *same* frame so the browser
     * paints exactly once — with the correct scroll position *and* the correct
     * spacer height. A double-RAF would put the spacer shrink one frame after the
     * scroll, causing a 1-frame layout jump during streaming.
     */
    private _scheduleSpacerUpdate(): void {
        if (this._spacerRafId !== null) return;
        this._spacerRafId = requestAnimationFrame(() => {
            this._spacerRafId = null;
            this._recalculateSpacer();
        });
    }

    /**
     * Cap the number of rendered bubbles in the DOM (perf ceiling only).
     *
     * Drops the oldest `<aparte-chat-bubble>` elements beyond `_maxRenderedBubbles`
     * from the DOM. It **never** touches the MessageRepository — the conversation
     * model and its persistence snapshot stay complete (retention/eviction is a
     * consumer/persistence concern, not the viewport's). No-op when a framework
     * owns the DOM.
     */
    private _pruneRenderedBubbles(): void {
        if (this._frameworkManagedDOM) return;
        const wrapper = this.querySelector('.aparte-messages-wrapper');
        if (!wrapper) return;
        const bubbles = wrapper.querySelectorAll('aparte-chat-bubble');
        const excess = bubbles.length - this._maxRenderedBubbles;
        for (let i = 0; i < excess; i++) {
            bubbles[i]?.remove();
        }
    }

    private _warnMaxMessagesDeprecated(): void {
        if (this._warnedMaxMessagesDeprecation) return;
        this._warnedMaxMessagesDeprecation = true;
        console.warn(
            '[Aparte] `maxMessages` / `max-messages` on aparte-chat-viewport is deprecated: ' +
            'it used to silently evict messages from the conversation model. It now only ' +
            'caps rendered bubbles in the DOM — use `maxRenderedBubbles` / `max-rendered-bubbles`. ' +
            'For actual history retention, configure it on your ConversationManager instead.',
        );
    }

    private _cleanup(): void {
        this._container?.removeEventListener('scroll', this._handleScroll);
        this._resizeObserver?.disconnect();
        this._mutationObserver?.disconnect();
        this._resizeObserver = null;
        this._mutationObserver = null;
        if (this._spacerRafId !== null) {
            cancelAnimationFrame(this._spacerRafId);
            this._spacerRafId = null;
        }
    }
}

// Register the custom element
if (!customElements.get('aparte-chat-viewport')) {
    customElements.define('aparte-chat-viewport', AparteChatViewport);
}

declare global {
    interface HTMLElementTagNameMap {
        'aparte-chat-viewport': AparteChatViewport;
    }
}
