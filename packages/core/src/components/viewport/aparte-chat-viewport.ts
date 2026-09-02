import type {
    AparteMessage,
    AparteViewportConfig,
    AparteSegment,
    AparteSegmentUpdateEventDetail,
    ApartePathChangedEventDetail,
    AparteSiblingInfo,
    AparteUsage,
} from '../../types/index.js';
import { resolveConfig } from '../../config/index.js';
import { AparteMessageRepository } from '../../runtime/message-repository.js';
import type { ExportedMessageRepository } from '../../runtime/message-repository.js';
import { populateBubbleFromMessage, type SyncableBubble } from '../bubble/bubble-sync.js';
import { cssEscape } from '../../utils/css-escape.js';
import { isAwaitingReply } from '../../utils/is-awaiting-reply.js';
import { revokeAttachmentUrls } from '../../utils/files-to-attachments.js';
import { uuid } from '../../utils/uuid.js';
import {
    stampSegmentOnInsert,
    adoptMessageSegments,
    stampSegmentOnUpdate,
    mergeSegmentUpdate,
    renumberSegments,
    openSegmentIds,
    stampSegmentActivity,
    isTerminalStatus,
} from '../../utils/segments.js';

/**
 * The transcript surface: a light-DOM container with sticky scrolling, token
 * streaming and segment-aware rendering.
 *
 * Features:
 * - Smart Scroll: Sticks to bottom when user is at bottom, stops on manual scroll up
 * - appendToken(): For simple content streaming
 * - appendToSegment(): For segment-aware streaming (thinking, code, etc.)
 *
 * Two DOM modes. By default the element builds its own scroll surface
 * (`.aparte-viewport-container`) around a `.aparte-messages-wrapper`, and creates the
 * `<aparte-chat-bubble>` elements itself (the last `max-rendered-bubbles` of the active
 * path). With `framework-managed` set it builds neither wrapper: the HOST is the scroll
 * surface, the framework owns the bubble elements, and the bottom spacer becomes additive
 * host padding instead of an element — a relocated or removed child is what desynchronises
 * a framework's view tree from the live DOM, so this mode touches neither. The one child
 * it appends in both modes is the scroll-to-bottom button, kept trailing.
 *
 * Children you write inside the element are just children: there is no shadow root and no
 * slot to target. In the default mode they are MOVED into the internal
 * `.aparte-messages-wrapper` at first render, ahead of the bottom spacer, so pre-rendered
 * `<aparte-chat-bubble>` elements land in the transcript flow. A custom element of your own
 * is relocated the same way, and if it carries `data-aparte-bubble` plus a matching
 * `message-id` it also receives the live token and segment pushes, not just a restyle.
 * Do not expect such a child to outlive the transcript, though: anything that re-renders the
 * active path (`addBranch`, `addSiblingOf`, `navigateBranch`, `importTree`) empties the
 * wrapper and rebuilds it from the repository, so only what the repository holds comes back —
 * and `clearAll()` removes `<aparte-chat-bubble>` nodes only, so a `[data-aparte-bubble]`
 * element of your own is left behind with nothing left to render. With `framework-managed`
 * set children are not relocated: they stay direct children of the host, which is itself the
 * scroll surface.
 *
 * Messages are held as a TREE (siblings, branches, an active path), which is what lets
 * a retry fork and a bubble's sibling picker navigate with no host object involved.
 *
 * What it is NOT is storage. `max-rendered-bubbles` is a DOM ceiling and never evicts
 * from the repository — the full tree and its snapshot stay complete, `exportTree()` /
 * `importTree()` hand that snapshot to whoever owns persistence, and real history
 * retention is configured on the conversation manager instead. It is not a chat either:
 * a bare viewport IS a valid `AparteClient` target, but the composer, the transport and
 * the shell layout are other elements.
 *
 * @element aparte-chat-viewport
 *
 * @attr {boolean} framework-managed - The wrapper's explicit hands-off signal: set it and this
 *   element builds no wrapper of its own and relocates none of the nodes the FRAMEWORK renders
 *   into it, because the framework owns them. Not "none of its children": core's own
 *   scroll-to-bottom button is re-appended whenever it stops being last, and that path runs in
 *   this mode only. All four wrappers set it.
 * @attr {number} scroll-threshold - How close to the bottom still counts as "at the bottom".
 * @attr {number} max-rendered-bubbles - Caps how many bubbles stay in the DOM; older ones are released.
 * @attr {boolean} data-busy - Reflected BY the element while a turn streams: the transcript is
 *   read-only meanwhile, and every bubble inside reads it (at connect, and when it changes). The
 *   vanilla path derives it from the repository; a framework host sets it through
 *   `setTranscriptBusy()`. Read-only from the outside.
 *
 * @fires {CustomEvent<AparteSegmentUpdateEventDetail>} aparte-segment-update - A segment grew or settled during a stream.
 * @fires aparte-reset-done - `clearAll()` finished emptying the transcript. No detail.
 * @fires {CustomEvent<ApartePathChangedEventDetail>} aparte-path-changed - The active branch path changed, after a retry fork or a navigation.
 *
 * @cssprop [--aparte-viewport-padding=var(--aparte-space-8)] - Padding around the transcript — on
 *   `.aparte-messages-wrapper`, or on the host itself in framework-managed mode, where the
 *   auto-scroll spacer is added on top of it. A container narrower than 520px tightens it in
 *   the default mode only: that rule reassigns the variable on `.aparte-messages-wrapper`,
 *   which framework-managed mode never builds.
 * @cssprop [--aparte-message-gap=var(--aparte-space-6)] - Gap between consecutive bubbles in the transcript
 *   column (both DOM modes). Shared: it is also the avatar-to-content gap inside a bubble.
 * @cssprop [--aparte-scrollbar-thumb=var(--aparte-neutral)] - Colour of the transcript's scrollbar thumb. A host page with a scrollbar of its own sets this and the track so the chat's does not read as a second, foreign scrollbar.
 * @cssprop [--aparte-scrollbar-track=transparent] - Colour of the transcript's scrollbar track.
 * @cssprop [--aparte-scrollbar-width=6px] - Width of the WebKit scrollbar on the scroll
 *   surface. Firefox and the standard property use `scrollbar-width: thin` and ignore it.
 * @cssprop [--aparte-transcript-inset=var(--aparte-viewport-padding)] - Written BY the viewport on
 *   the chat host: how far from the host's inline edge its rows start (padding plus the
 *   scrollbar gutter, at the current container step). The composer pads by it, so the two
 *   boxes share one edge at every width. Read-only from the outside.
 * @cssprop [--aparte-bottom-inset=0px] - How much of the transcript's bottom is covered
 *   by content floating over it. Written by the viewport itself under
 *   `[overlay-composer]` (never set it there — it would be overwritten); a host that
 *   overlays a composer of its own, without the attribute, sets it by hand and the
 *   spacer, the container padding and the scroll button all clear it.
 * @cssprop [--aparte-scroll-btn-size=var(--aparte-btn-size-lg)] - Diameter of the scroll-to-bottom button. A
 *   coarse pointer raises it to `--aparte-touch-target-size`.
 * @cssprop [--aparte-scroll-btn-shadow=0 2px 8px rgba(0, 0, 0, 0.12)] - Its shadow; the dark
 *   theme sets a heavier one.
 *
 * @example
 * <!-- On its own, outside `<aparte-chat>`. Give it a height: it fills what it is given
 *      and owns the scrolling inside that box, so a viewport in an auto-height parent
 *      grows forever instead of scrolling. Messages are pushed in — it fetches nothing. -->
 * <aparte-chat-viewport style="height: 24rem"></aparte-chat-viewport>
 *
 * <script>
 *   const viewport = document.querySelector('aparte-chat-viewport');
 *   viewport.appendMessage({ id: 'u1', role: 'user', content: 'What is a transport?', timestamp: Date.now() });
 *   viewport.appendMessage({
 *     id: 'a1',
 *     role: 'assistant',
 *     content: 'The object that talks to the model. Swap it and the UI does not change.',
 *     timestamp: Date.now(),
 *   });
 * </script>
 *
 * @example
 * // Three calls are a whole streamed turn.
 * const viewport = document.querySelector('aparte-chat-viewport')!;
 *
 * viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: Date.now() });
 * for await (const chunk of tokens) viewport.appendToken('a1', chunk);
 * viewport.completeMessage('a1');   // stops the streaming caret
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
    private _repo = new AparteMessageRepository();
    private _isAutoScrollEnabled: boolean = true;
    /** The last scroll position we saw, so growth can be told from a gesture. */
    private _lastScrollTop = 0;
    /** The scroll height at the last scroll event: how much it moved since bounds what churn can do. */
    private _lastScrollHeight = 0;
    /** When this component last moved `scrollTop` itself — see `_handleScroll`. "Never" is
     *  -Infinity rather than 0: `performance.now()` can be under a second old. */
    private _ownScrollAt = Number.NEGATIVE_INFINITY;
    /** When the reader last touched the transcript (wheel, touch, pointer, key). */
    private _readerInputAt = Number.NEGATIVE_INFINITY;
    /** A decrease inside this window after our own scroll, with no gesture, is the browser's. */
    private readonly _ownScrollWindowMs = 1000;
    /** How long after a scroll of ours we keep re-anchoring while the layout churns.
     *  Not `readonly`: a test shortens it to run past the window's end in a few frames. */
    private _settleWindowMs = 400;
    /**
     * Until when a smooth scroll of ours is in flight (#57). A user send glides to the
     * bottom with `scrollTo({ behavior: 'smooth' })`; the assistant placeholder and the
     * first tokens used to land INSIDE that glide through the streaming path — an instant
     * `scrollTop = scrollHeight` plus the settle chain — and an instant write cancels a
     * running smooth scroll in every engine. Measured before the fix: five instant writes
     * in the send's own frame (the spacer recalculation scrolls synchronously, the
     * mutation observer queues another), so there never was a glide to cut — the view
     * teleported. While this deadline is ahead, every bottom-pin RE-TARGETS the glide
     * (a second smooth `scrollTo` is continuous) instead of writing `scrollTop`; the
     * browser's `scrollend` closes it early where supported. Streaming is instant again
     * after that, as it must be to keep up with token bursts.
     */
    private _glideUntil = 0;
    /** The glide's budget when `scrollend` is not there to close it: Chromium's smooth scroll over a viewport takes ~300–500 ms. */
    private _glideWindowMs = 450;
    /** Armed with each glide: when the window closes, a view still short of the bottom is pinned. */
    private _glideSettleTimer: ReturnType<typeof setTimeout> | null = null;
    /** Deadline of the settle in flight (0 = none). Pushed forward, never stacked. */
    private _settleUntil = 0;
    private _settleRafId: number | null = null;
    /** The keys that scroll a focused scroll container — the only keydowns that are a gesture. */
    private readonly _scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
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
    private _resizeObserver: ResizeObserver | null = null;
    private _mutationObserver: MutationObserver | null = null;
    /** The `[overlay-composer]` shell this viewport floats in, if any. Read at observer setup, like `framework-managed`. */
    private _overlayRoot: HTMLElement | null = null;
    /** Watches the overlay shell's childList, so a stack child that mounts later (elicitation) gets observed too. */
    private _overlayObserver: MutationObserver | null = null;
    /** Last `--aparte-bottom-inset` written, in px — style writes only when it changes. */
    private _overlayInset = -1;
    /** Last `--aparte-transcript-inset` written on the host, in px — same write-on-change rule. */
    private _transcriptInset = -1;
    private _boundResetHandler: (() => void) | null = null;
    /**
     * When true, _reRenderActivePath() only dispatches aparte-path-changed without
     * touching the DOM. Set via setFrameworkManagedDOM(true) when a framework
     * (e.g. Angular) owns the bubble elements.
     */
    private _frameworkManagedDOM = false;

    static get observedAttributes(): string[] {
        return ['scroll-threshold', 'max-rendered-bubbles'];
    }

    constructor() {
        super();
        this._handleScroll = this._handleScroll.bind(this);
        this._handleScrollEnd = this._handleScrollEnd.bind(this);
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
        this._updateTranscriptInset();
        /**
         * Empty every mounted transcript on the page.
         *
         * A command, not a notification: this is one of the events that travel the
         * other way, dispatched by YOUR app on `window` and listened for here. Every
         * connected `<aparte-chat-viewport>` clears its repository and its DOM and
         * answers with `aparte-reset-done`, so a "New chat" button in a shell that
         * holds no reference to the transcript still empties it. Carries no detail —
         * and therefore no target, so it clears every viewport, not one.
         *
         * @event aparte-reset
         */
        // History, deliberately OUT of the JSDoc: `gen-events-ref.mjs` copies an
        // `@event` body verbatim onto the public page, and this is repo business.
        // The listener had been live and undocumented since it existed — absent from
        // the events reference (the generator's name union read the dispatch sites
        // only, and core never dispatches this one), absent from the manifest (still
        // is, correctly: the element does not FIRE it), and covered by no test. A
        // listener that could have been deleted in silence.
        this._boundResetHandler = () => this.clearAll();
        window.addEventListener('aparte-reset', this._boundResetHandler);
        window.addEventListener('aparte-config-change', this._onConfigChange);
    }

    /**
     * A locale switch changes the reading direction, and `dir` was applied once at
     * render — so a chat already on screen never flipped to RTL until a reload.
     * Only OUR config: an instance-scoped change elsewhere must not touch us.
     */
    private _onConfigChange = (e: Event): void => {
        const detail = (e as CustomEvent).detail as { config?: unknown } | undefined;
        if (detail?.config && detail.config !== resolveConfig(this)) return;
        this._applyDirection();
        // The button's accessible name is locale text too — a language switch is
        // documented as live, and this was the one chrome string that stayed put.
        this._scrollBtn?.setAttribute('aria-label', resolveConfig(this).t('scrollToBottom'));
        // The transcript's own name is locale text on the same terms.
        const surface = this._frameworkManagedDOM ? this : this.querySelector('.aparte-viewport-container');
        surface?.setAttribute('aria-label', resolveConfig(this).t('transcript'));
    };

    /**
     * The transcript is a TAB STOP, with a name.
     *
     * A scrollable region that no element can hold focus in cannot be scrolled from
     * the keyboard in WebKit: Chromium and Firefox hand an unfocusable overflow box a
     * caret or a "scroller" tab stop of their own, Safari does not. So a plain-text
     * transcript — no links, no code blocks, nothing focusable inside — was unreadable
     * past the first screen for a Safari keyboard user, with no error and nothing on
     * screen to say so.
     *
     * `tabindex="0"` on the surface itself, in BOTH DOM modes. The framework mode
     * appeared to work already, and only by accident: the scroll button is inside the
     * host and stays tabbable while it is visually hidden, so Tab happened to land
     * somewhere that scrolled. A tab stop that exists because a hidden button happens
     * to sit there is not an affordance, it is a coincidence.
     *
     * The name ships WITH the tab stop rather than after it: a focusable `role="log"`
     * with no accessible name is announced as an unnamed region, which is a worse
     * answer than no tab stop at all. And the ROLE ships with both: a name on a
     * generic element is the same defect mirrored — `aria-label` is prohibited on an
     * element whose role resolves to none, which is what a bare custom element is. The
     * default mode already writes `role="log"` on the container before this runs, so
     * the guard here is what gives the framework-mode host the same declaration.
     */
    private _nameScrollSurface(el: HTMLElement): void {
        el.setAttribute('tabindex', '0');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'log');
        el.setAttribute('aria-label', resolveConfig(this).t('transcript'));
    }

    /** Mirror `locale.direction` onto the scroll container. */
    private _applyDirection(): void {
        const container = this.querySelector('.aparte-viewport-container');
        if (!container) return;
        const direction = resolveConfig(this).getLocale().direction;
        if (direction) container.setAttribute('dir', direction);
        else container.removeAttribute('dir');
    }

    disconnectedCallback(): void {
        window.removeEventListener('aparte-config-change', this._onConfigChange);
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

        // REPLACE the segment, never mutate it in place. The bubble holds the very
        // same object — `addSegment` handed one object to the repo and to the bubble —
        // and it appends this chunk itself (see `_notifyBubble` below). Mutating here
        // made the two writes land on one object, so every chunk appeared twice, in
        // the model AND on screen ("BonjourBonjour le le monde"). Each view now owns
        // the value it advances.
        const index = message.segments.findIndex(s => s.id === segmentId);
        const segment = index === -1 ? undefined : message.segments[index];
        if (segment && 'content' in segment) {
            message.segments[index] = {
                ...segment,
                content: (segment as { content: string }).content + chunk,
                // Content arriving IS the segment's activity, so this is what
                // `endedAt` measures. Without it a thinking block's end would be
                // whenever someone happened to notice it had stopped — the end of
                // the turn, or the start of the next segment — and both of those
                // silently fold the waiting that followed into the duration.
                ...stampSegmentActivity(segment),
            } as AparteSegment;
        }

        // Dispatch segment update event
        this.dispatchEvent(new CustomEvent<AparteSegmentUpdateEventDetail>('aparte-segment-update', {
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
        // The head, UNLESS a different message is the one actually streaming.
        //
        // The 1-argument convention means "operate on the message being streamed",
        // and this resolved it as "the head" — but `appendMessage` always moves the
        // head (the repository advances it to any new child). So any message appended
        // mid-stream re-pointed the rest of the reply: measured with the real element,
        // segment two of message A landed on message B, and `updateSegment` for a
        // segment that genuinely lives on A became a silent no-op.
        //
        // `AparteChatHost` has had `_isOrphan` for exactly this, which is why the
        // framework wrappers were protected and the raw viewport — the documented
        // vanilla quick start — was not. Refusing, like the host does, rather than
        // routing: losing the tail is visible, writing it onto someone else's message
        // is not.
        const head = this._repo.headId;
        const streaming = this._streamingMessageId();
        if (streaming !== null && streaming !== head) return null;
        return head;
    }

    /** The id of the message currently streaming, if any. */
    private _streamingMessageId(): string | null {
        for (const message of this._repo.getMessages()) {
            if ((message as { isStreaming?: boolean }).isStreaming) return message.id;
        }
        return null;
    }

    /**
     * While a reply streams, the transcript is read-only except for Stop.
     *
     * The streaming message's own footer was already hidden; every OTHER message kept
     * its branch picker and its retry/edit buttons live. Swapping a branch mid-stream
     * re-rendered the active path under the reply being written, and a retry cut that
     * reply off to start another — both seen on the landing page. The state that
     * decides it is the whole transcript's, so it lives on the viewport (`data-busy`)
     * and is pushed to the bubbles it holds; a bubble mounted later, under a
     * framework's DOM, reads the attribute itself when it connects.
     */
    private _syncBusy(): void {
        // One writer per mode. Under a framework the repository is not written during
        // a turn, so deriving it here could only ever say "not busy" — and did, under
        // all four wrappers: the host, which knows, writes it through
        // `setTranscriptBusy` instead, and this must not overwrite it from the repo.
        if (this._frameworkManagedDOM) return;
        this.setTranscriptBusy(this._streamingMessageId() !== null);
    }

    private _busy = false;

    /**
     * The transcript's read-only-while-streaming flag — `data-busy` on this element and
     * fanned out to the bubbles it holds. The vanilla path derives it from the
     * repository (`_syncBusy`); a framework host, whose messages live outside the
     * repository during a turn, writes it directly from its own streaming id.
     */
    setTranscriptBusy(busy: boolean): void {
        this._busy = busy;
        this.toggleAttribute('data-busy', busy);
        for (const bubble of this.querySelectorAll('aparte-chat-bubble')) {
            (bubble as unknown as { setTranscriptBusy?: (busy: boolean) => void }).setTranscriptBusy?.(busy);
        }
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
        // Identity and start time land BEFORE anyone sees the object: the repo and
        // the bubble are handed the same segment, so a later stamp would leave one
        // of the two holding an unstamped copy. This is one of exactly two places
        // that writes those fields (`aparte-chat-host` is the other) — see
        // `utils/segments.ts` for why it is not the parser.
        const stamped = stampSegmentOnInsert(
            message.segments, segment, messageId,
            // THIS chat's defaults, not the page's: two chats on one page can be
            // configured differently, and the config seam is per instance.
            resolveConfig(this).getSegmentDefaults(segment.type),
        );
        message.segments.push(stamped);

        // Notify bubble to render the new segment
        this._notifyBubble(messageId, 'addSegment', stamped);
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
            const current = message.segments[segmentIndex]!;
            // An update that settles the segment carries its `endedAt`. Stamped
            // here rather than at each call site, so `completeSegment`, a tool
            // resolution and an app's own `updateSegment` all measure alike.
            const stamped = stampSegmentOnUpdate(current, updates);
            message.segments[segmentIndex] = mergeSegmentUpdate(current, stamped);

            this._notifyBubble(messageId, 'updateSegment', { segmentId, updates: stamped });
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
            if (idx !== -1) {
                message.segments.splice(idx, 1);
                // `index` is a position, so a removal has to close the gap it left.
                renumberSegments(message.segments);
            }
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
     * Persist token usage on a message and propagate to the live bubble, which is
     * what allows the info ("i") action to render — provided the app declared it
     * with `aparteGlobalConfig.setBubbleActions({ info: true })`; it is off by default,
     * since the popover it opens belongs to the app.
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

            // The message's end IS its segments' end: nothing in the stream says a
            // thinking block is over. Routed through `updateSegment` rather than
            // written onto the objects, so the bubble is told as well — a silent
            // mutation stamped the model and left the renderer thinking it was still
            // streaming, which is exactly what a browser run showed.
            this._settleSegments(messageId, message);

            this._notifyBubble(messageId, 'complete', { status: 'completed' });
            this._syncBusy();
            this._recalculateSpacer();
        }
    }

    /**
     * Close a finished message's still-open segments, one `updateSegment` each.
     *
     * Deliberately NOT a loop that writes `isStreaming` onto the objects: that path
     * stamps the model and tells the bubble nothing, so a renderer never learns its
     * segment settled — no `endedAt` in the rendered label, and no final Markdown
     * flush either. Going through `updateSegment` reuses the one path that does
     * both.
     */
    private _settleSegments(messageId: string, message: AparteMessage): void {
        if (!message.segments) return;
        for (const id of openSegmentIds(message.segments)) {
            this.updateSegment(messageId, id, { isStreaming: false });
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
            // …and close the segments, because THIS is the path a completed turn
            // takes: both agent loops report the end with
            // `updateMessage({ status: 'completed' })`, and `completeMessage()` is
            // called by nobody. Without this a thinking segment kept `isStreaming`
            // unset forever and never recorded an `endedAt` — the duration only
            // worked for tool calls, which settle by their own status.
            if (isTerminalStatus(updates.status)) this._settleSegments(messageId, message);
        }

        // Notify bubble
        this._notifyBubble(messageId, 'update', updates);
        if (updates.status) this._syncBusy();
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
        // Adopted, not stamped: this writes straight to the repository, so it is the
        // caller handing over a message they already hold rather than a turn starting.
        const stored = adoptMessageSegments({ ...message });
        // Same rule as `appendMessage`: a message that ARRIVES streaming (a pending
        // shell, a reply the host is about to write into) is a streaming one in the
        // tree, or the manual-stream path — which used to invent this message with
        // `isStreaming: true` — would stop making the transcript read-only.
        if (isAwaitingReply(message)) stored.isStreaming = true;
        this._repo.addOrUpdateMessage(this._repo.headId, stored);
        this._pruneRenderedBubbles();
        this._syncBusy();
        this._autoScroll();
    }

    /**
     * Append a new message and create its bubble in the DOM.
     * Implements the same contract as the Angular wrapper's appendMessage(),
     * making aparte-chat-viewport a fully standalone target for aparte-client.
     * When `_frameworkManagedDOM` is true, only the internal repo is updated —
     * the framework owns the DOM and will create the bubble element itself.
     */
    appendMessage(message: AparteMessage, options?: { historical?: boolean }): void {
        /*
         * A message may arrive with its segments already populated, and the two reasons
         * are not the same act: an app injecting a prefix or the client's own error
         * fallback is producing something NOW, while `setMessages` is handing back
         * something that happened. Both used to take the live path, so reloading a
         * three-week-old conversation stamped every one of its segments with `Date.now()`.
         *
         * Provenance is a parameter and not a guess. "Arrived with its segments" cannot
         * mean "historical" — `AparteClient` appends a message with a ready-made error
         * segment live, and a consumer streaming into a seeded segment is doing the same
         * thing. Defaulting to live keeps every existing caller's behaviour.
         *
         * Either way the segments go through a seam and into a NEW array, so `index`
         * follows the position and the caller's array is not retained.
         */
        const stored: AparteMessage = options?.historical
            ? adoptMessageSegments(message)
            : message.segments?.length
                ? { ...message, segments: message.segments.reduce<AparteSegment[]>(
                    (acc, segment) => {
                        acc.push(stampSegmentOnInsert(
                            acc, segment, message.id,
                            resolveConfig(this).getSegmentDefaults(segment.type),
                        ));
                        return acc;
                    },
                    [],
                ) }
                : { ...message };
        // The model's own flag, from the same predicate the bubble's `streaming`
        // attribute uses below. `updateMessage` maps a status to it; a message that
        // ARRIVES streaming (the client appends a pending shell, a host appends a
        // reply it is about to write into) used to reach the repository without it,
        // so `_streamingMessageId()` — and everything read-only that hangs off it —
        // could not see a turn that had not yet been updated once. Not for a
        // historical message: a conversation saved mid-reply is a record, not a turn.
        if (!options?.historical && isAwaitingReply(message)) stored.isStreaming = true;
        this._repo.addOrUpdateMessage(this._repo.headId, stored);
        if (!this._frameworkManagedDOM) {
            const wrapper = this.querySelector('.aparte-messages-wrapper');
            if (wrapper) {
                const bubble = document.createElement('aparte-chat-bubble') as HTMLElement;
                bubble.setAttribute('message-id', message.id);
                bubble.setAttribute('data-role', message.role);
                if (message.compaction) bubble.setAttribute('data-kind', 'compaction');
                if (message.timestamp) bubble.setAttribute('timestamp', String(message.timestamp));
                if (message.content) bubble.setAttribute('content', message.content);
                // Also true for an empty assistant message with no status: an
                // imperative "the reply is coming" shell, which otherwise rendered
                // as a finished answer (action bar and all) before a single token.
                if (isAwaitingReply(message)) {
                    bubble.setAttribute('streaming', '');
                }
                // Insert before spacer so spacer stays last
                if (this._bottomSpacer && this._bottomSpacer.parentNode === wrapper) {
                    wrapper.insertBefore(bubble, this._bottomSpacer);
                } else {
                    wrapper.appendChild(bubble);
                }
                // Attributes alone can't carry segments / attachments / usage —
                // push them through the same helper the full render path uses,
                // or an imperatively appended message renders text-only.
                //
                // `stored`, not `message`: the bubble has to see the STAMPED segments
                // the repository holds. Handed the caller's object it rendered ones
                // with no `index` or `startedAt`, so the same segment was stamped in
                // the model and bare on screen — and an app reading them back off the
                // bubble got the bare ones.
                populateBubbleFromMessage(bubble as unknown as SyncableBubble, stored);
            }
        }
        this._pruneRenderedBubbles();
        this._syncBusy();
        // User sending always anchors to bottom regardless of scroll position — and it
        // GLIDES there. The glide begins before the spacer recalculation below, because
        // that recalculation pins the bottom synchronously: started after it, the smooth
        // scroll found the view already teleported (#57). Streaming auto-scroll stays
        // instant (via _autoScroll) so it can keep up with rapid token bursts — once the
        // glide has ended; inside it, every pin re-targets the glide.
        if (message.role === 'user') {
            this._isAutoScrollEnabled = true;
            this._smoothScrollToBottom();
        }
        this._recalculateSpacer();
        if (message.role === 'user') {
            requestAnimationFrame(() => { if (this._isAutoScrollEnabled) this._smoothScrollToBottom(); });
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
            id: uuid(),
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
        // A retry starts a turn here: the sibling arrives pending, and the model's
        // flag has to say so from this moment (see `appendMessage`), not from the
        // first `updateMessage` — the rebuild below already pushes the busy state.
        const stored: AparteMessage = { ...newMessage };
        if (isAwaitingReply(newMessage)) stored.isStreaming = true;
        this._repo.addOrUpdateMessage(parentId, stored);
        this._repo.switchToBranch(newMessage.id);
        this._reRenderActivePath();
        return newMessage.id;
    }

    /**
     * Navigate to the previous or next sibling branch of a message.
     * Triggers a full re-render of the active path.
     */
    navigateBranch(messageId: string, direction: 'prev' | 'next'): void {
        // Not while a reply streams: the active path must not change under it (the
        // pickers are disabled for the same reason — see `setTranscriptBusy`; this covers
        // a programmatic call). The stored flag, so the arrows and this guard agree in
        // both modes — the repository cannot answer for a framework-managed turn.
        if (this._busy) return;
        const siblings = this._repo.getBranches(messageId);
        const currentIdx = siblings.indexOf(messageId);
        if (currentIdx === -1) return;

        const targetIdx = direction === 'prev' ? currentIdx - 1 : currentIdx + 1;
        if (targetIdx < 0 || targetIdx >= siblings.length) return;

        // Branch navigation is a deliberate user action, so it must not yank a user
        // who is reading mid-transcript: auto-scroll goes off and neither the spacer
        // recalculation nor the MutationObserver callback will scroll them away.
        //
        // But if they were already AT the bottom, staying there IS the expected
        // behaviour — and switching auto-follow off there is what left the
        // scroll-to-bottom button offering to scroll nowhere (a React consumer). It
        // also protects the swap itself: a rebuild's height flickers (measured on
        // React: 1730 → 1934 → 1730px as the new bubble renders and settles), so a
        // reader pinned to the bottom would drift up by whatever the flicker was.
        this._isAutoScrollEnabled = this._isAtBottom();
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

    /**
     * The messages on the currently ACTIVE path, root → head — not the whole tree.
     * A message that was retried contributes only the branch currently selected;
     * `exportTree()` is what returns every sibling.
     */
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
        // Not `clearAll()`: an import re-populates from a snapshot that may hold the
        // very attachment objects currently in the repo — which is exactly what a
        // conversation load does. See the note in `clearAll`.
        this.clearAll({ revokeAttachments: false });
        // A snapshot is history by definition, and this is the path that used to write
        // it to the repository RAW — so `messageId`/`index` stayed whatever the storage
        // held, and a tree saved before those fields existed came back without them.
        // It also runs AFTER `setMessages` on a conversation load, so whatever that
        // stamped was being replaced by this anyway: two paths, one of them silent.
        this._repo.import({
            ...tree,
            messages: tree.messages.map((entry) => ({
                ...entry,
                message: adoptMessageSegments(entry.message),
            })),
        });
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
    clearAll(options?: { revokeAttachments?: boolean }): void {
        /*
         * Release the attachments' object URLs before dropping the messages: after
         * `_repo.clear()` there is no way left to reach them, and nothing else
         * revoked them — so every `File` a session had sent stayed reachable for
         * the life of the page.
         *
         * UNLESS the caller is about to put the same messages back. Two callers do:
         * `setMessages` and `importTree`, and `ConversationController._load` runs
         * BOTH in sequence over one conversation. `export()` stores live `node.current`
         * references, so `conv.messages` and `conv.tree` share the very same
         * attachment objects — meaning the second clear revoked the object URLs of
         * the conversation being opened. Every image and file chip was dead on load,
         * and re-opening revoked twice.
         *
         * A reset (`aparte-reset`, the public `clearAll()`) still revokes: there the
         * messages really are gone.
         */
        if (options?.revokeAttachments !== false) {
            for (const message of this._repo.getMessages()) {
                revokeAttachmentUrls(message.attachments);
            }
        }
        this._repo.clear();
        // An empty transcript streams nothing: the busy flag is derived from the
        // repository, and this is the one path that empties it without a status.
        this._syncBusy();
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
        // Same reason as `importTree`: the incoming messages may BE the outgoing
        // ones, and a conversation the user can switch back to still holds them.
        this.clearAll({ revokeAttachments: false });
        for (const m of messages) {
            // Historical by definition: this replaces the transcript with a list the
            // caller already had. Nothing here is starting now.
            this.appendMessage(m, { historical: true });
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
            `aparte-chat-bubble[message-id="${cssEscape(messageId)}"], [data-aparte-bubble][message-id="${cssEscape(messageId)}"]`,
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
            case 'update': {
                // Atomic update: forward it when it carries anything the bubble
                // renders. `content` and `attachments` used to be filtered out
                // here, so an edit (which sends `{ content }`) updated the repo —
                // and therefore the history sent to the model — while the bubble
                // kept displaying the old text.
                const updates = payload as Record<string, unknown>;
                const renderable = ['status', 'segments', 'content', 'attachments', 'usage'];
                if (renderable.some((key) => key in updates)) {
                    bubble.updateMessage?.(payload as Partial<AparteMessage>);
                }
                break;
            }
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
            bubble.setAttribute('data-role', message.role);
            if (message.compaction) bubble.setAttribute('data-kind', 'compaction');
            if (message.timestamp) bubble.setAttribute('timestamp', String(message.timestamp));
            if (isAwaitingReply(message)) {
                bubble.setAttribute('streaming', '');
            }
            wrapper.appendChild(bubble);

            // Reconcile content / segments / attachments / sibling-picker via
            // the shared helper — same code path the framework wrappers use,
            // so the contract stays in lockstep.
            populateBubbleFromMessage(bubble as unknown as SyncableBubble, message, sibInfo);
        }

        this._dispatchPathChanged(activeMessages, siblingsInfo);
        this._syncBusy();
        this._recalculateSpacer();

        // No post-swap re-measure of the auto-scroll INTENT here, deliberately: a
        // rebuild's height flickers, and a one-shot measurement that lands mid-flicker
        // can only get it wrong (it would disarm auto-follow for a reader who is
        // pinned to the bottom). The intent is decided once, in `navigateBranch`, from
        // the position the user was actually in; the button re-derives itself from
        // geometry on every scroll and on every post-mutation frame.
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
            // `_scrollToBottom` turns a pending smooth request into the glide itself.
            requestAnimationFrame(() => { if (this._isAutoScrollEnabled) this._scrollToBottom(); });
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
            this._nameScrollSurface(container);

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
            this._scrollBtn.className = 'aparte-btn aparte-btn--surface aparte-btn--circle aparte-btn--lg aparte-scroll-btn aparte-scroll-btn--hidden';
            this._scrollBtn.setAttribute('type', 'button');
            this._scrollBtn.setAttribute('aria-label', resolveConfig(this).t('scrollToBottom'));
            const scrollIcon = resolveConfig(this).getIcon('scrollDown');
            this._scrollBtn.innerHTML = scrollIcon;
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
        this._nameScrollSurface(this);

        const scrollBtn = document.createElement('button');
        scrollBtn.className = 'aparte-btn aparte-btn--surface aparte-btn--circle aparte-btn--lg aparte-scroll-btn aparte-scroll-btn--hidden';
        scrollBtn.setAttribute('type', 'button');
        scrollBtn.setAttribute('aria-label', resolveConfig(this).t('scrollToBottom'));
        const scrollIcon = resolveConfig(this).getIcon('scrollDown');
        scrollBtn.innerHTML = scrollIcon;
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

    // Bound fields, not inline arrows: a custom element is re-connected every
    // time it is MOVED in the DOM (a portal, a dialog, a framework re-parenting),
    // so `_setupEventListeners` runs again each time. An inline arrow can never
    // be handed to `removeEventListener`, so it just accumulates — one branch
    // click then ran N handlers, N active-path re-renders and N storage writes
    // through the conversation controller. The window listeners next to these
    // were always removed properly; these two, attached to `this`, were not.
    private readonly _onScrollBtnClick = (): void => {
        this._isAutoScrollEnabled = true;
        this._smoothScrollToBottom();
        this._updateScrollButton();
    };

    /**
     * Only the inputs that can SCROLL count as the reader's hand: a wheel notch, a
     * touch, a navigation key, a press in the scrollbar's gutter. A press on a control
     * inside the transcript — a branch arrow, a copy button — is not a scroll gesture,
     * and counting it disarmed the follow through the swap it triggered (react-webkit,
     * 1 run in 6: the rebuild's height churn moved scrollTop within the second after
     * the click, and the click made that look like the reader's).
     */
    private readonly _noteReaderInput = (e: Event): void => {
        if (e.type === 'keydown' && !this._scrollKeys.has((e as KeyboardEvent).key)) return;
        if (e.type === 'pointerdown') {
            const container = this._container;
            if (!container) return;
            const { clientX } = e as PointerEvent;
            const rect = container.getBoundingClientRect();
            const rtl = getComputedStyle(container).direction === 'rtl';
            const inGutter = rtl
                ? clientX <= rect.right - container.clientWidth
                : clientX >= rect.left + container.clientWidth;
            if (!inGutter) return;
        }
        this._readerInputAt = performance.now();
        // The reader's hand ends a glide. A physical wheel cancels a programmatic smooth
        // scroll on its own; a synthetic one (CI's `page.mouse.wheel`, some assistive
        // input) does not, and the animation ran on to the bottom over the gesture —
        // `streaming-progressive` on CI: "the scroll-up gesture did not take, top is
        // still 477px". Writing the CURRENT position is how a running smooth scroll is
        // stopped where it is, in every engine; the reader's own scroll then lands on it.
        //
        // For the WHEEL and a TOUCH only. A scroll key starts the ENGINE'S own smooth
        // animation, and this write landed on it and killed it — the keyboard-scroll
        // spec on vanilla-webkit pressed a key inside a seed send's glide window and the
        // transcript did not move (main CI, flaky). A key closes the window like any
        // reader input; the key's scroll needs no help from us.
        if (this._gliding() && this._container) {
            this._glideUntil = 0;
            if (e.type === 'wheel' || e.type === 'touchmove') {
                this._ownScrollAt = performance.now();
                const here = this._container.scrollTop;
                this._container.scrollTop = here;
            }
        }
    };

    private readonly _onBranchNavigate = (e: Event): void => {
        const evt = e as CustomEvent<{ messageId: string; direction: 'prev' | 'next' }>;
        evt.stopPropagation();
        this.navigateBranch(evt.detail.messageId, evt.detail.direction);
    };

    private _setupEventListeners(): void {
        this._container?.addEventListener('scroll', this._handleScroll, { passive: true });
        this._container?.addEventListener('scrollend', this._handleScrollEnd, { passive: true });
        // The reader's hand on the transcript, so `_handleScroll` can tell their scroll
        // from one the browser made while settling ours.
        // `touchmove`, not `touchstart`: a tap on a control fires touchstart too, and
        // a tap is no more a scroll gesture than a click — a finger that scrolls moves.
        for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const) {
            this._container?.addEventListener(type, this._noteReaderInput, { passive: true });
        }
        this._scrollBtn?.addEventListener('click', this._onScrollBtnClick);
        this.addEventListener('aparte-branch-navigate', this._onBranchNavigate);
    }

    private _setupObservers(): void {
        this._resizeObserver = new ResizeObserver(() => {
            // First, because everything below reads the geometry it changes: in
            // overlay mode a composer that grew is THE resize being reported, and
            // re-anchoring against the stale inset would land the reader short.
            this._updateOverlayInset();
            this._updateTranscriptInset();
            if (this._isAutoScrollEnabled) {
                this._scrollToBottom();
            }
            this._recalculateSpacer();
            /*
             * And the button, for the same reason the spacer is here.
             *
             * "Is anything below the fold" is a pure function of the geometry this
             * observer exists to watch, and only the MUTATION path re-derived it
             * (`_scheduleSpacerUpdate`, whose comment already says the fold may have
             * moved). A resize that changes nothing in the DOM therefore left the
             * button showing whatever the last mutation happened to measure.
             *
             * That gap has a name in this file already: a branch swap rebuilds the
             * transcript and React's height FLICKERS through it — 1730 → 1934 → 1730,
             * measured, see `navigateBranch`. The settle from 1934 back to 1730 is a
             * resize, not a mutation, so a button evaluated at 1934 stayed wrong. CI
             * caught it on react-webkit holding "visible" across 43 polls, five seconds
             * after a swap that ended at the bottom.
             *
             * Cheap enough to run unconditionally: one geometry read and a
             * `classList.toggle`.
             */
            this._updateScrollButton();
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

        // Overlay mode: the shell's bottom stack (elicitation, an above-composer
        // row, the composer) floats OVER this scroll surface, so its height is part
        // of the geometry this observer exists to watch — and the container alone
        // no longer says it: with the viewport absolute over the shell, a composer
        // that grows resizes NOTHING this observer was looking at. Observe every
        // stack child with the SAME observer; the callback already does everything
        // an inset change needs (write the var, re-anchor a pinned reader, spacer,
        // button).
        // Bare attribute selector on purpose: the shell is <aparte-chat> in vanilla,
        // a [data-aparte-chat] div in React/Vue/Svelte, Angular's inner
        // .aparte-chat-container - and a hand-rolled host that sets the attribute on
        // its own shell gets the measurement for free (the CSS readers are
        // unconditional; only the recipe rules are qualified).
        this._overlayRoot = this.closest('[overlay-composer]');
        if (this._overlayRoot && this._resizeObserver) {
            for (const child of this._overlayStack()) this._resizeObserver.observe(child);
            // A stack child can mount later (elicitation appears on request):
            // observe it from that moment. childList only, never subtree — what is
            // inside those children is the host's business, and their size changes
            // already reach the ResizeObserver.
            this._overlayObserver = new MutationObserver(() => {
                for (const child of this._overlayStack()) this._resizeObserver?.observe(child);
                this._updateOverlayInset();
            });
            this._overlayObserver.observe(this._overlayRoot, { childList: true });
            this._updateOverlayInset();
        }

        this._mutationObserver = new MutationObserver((mutations) => {
            // Keep the sticky scroll button trailing after framework appends.
            if (this._frameworkManagedDOM) this._keepScrollButtonLast();
            // A user bubble arriving is a send, whichever framework rendered it: the pin
            // this observer queues below must glide, not jump (#57). The four wrappers ask
            // the same thing one event earlier through requestSmoothScroll(); a host that
            // renders bubbles itself and never heard of that call gets the glide all the
            // same. The viewport owns it.
            // A send is ONE user bubble, appended last. A branch swap or a transcript rebuild
            // re-adds many bubbles in one batch, user ones included, with auto-follow armed
            // again — taken for a send, the swap glided instead of pinning, the settle held
            // its hand for the glide, and the swap's height churn left the view short with a
            // scroll-to-bottom button over a reader who never left (CI, bubble-actions:370).
            if (this._isAutoScrollEnabled && !this._gliding()) {
                const added = mutations
                    .flatMap((m) => Array.from(m.addedNodes))
                    .filter((n): n is Element => n instanceof Element && n.tagName === 'APARTE-CHAT-BUBBLE');
                const only = added.length === 1 ? added[0] : undefined;
                if (only && only.getAttribute('data-role') === 'user' && only.parentElement) {
                    const bubbles = only.parentElement.querySelectorAll('aparte-chat-bubble');
                    if (bubbles[bubbles.length - 1] === only) this._smoothScrollOnce = true;
                }
            }
            // The gate is tested TWICE: when the frame is queued, and again when it
            // runs. The second test is what lets a reader leave.
            //
            // During a stream a frame is nearly always queued, and it used to scroll
            // unconditionally when it ran. So a reader who wheeled up was disarmed by
            // that gesture (`_handleScroll` sees the decrease) — and one frame later the
            // already-queued scroll dragged them back to the bottom, whose scroll event
            // re-armed auto-follow. Every attempt to read above the stream lasted one
            // frame ("on a du mal à remonter", reported from a real session). The
            // run-time check reads the INTENT flag, which only a real decrease disarms,
            // so it cannot fall into the trap an earlier attempt did — that one
            // re-tested `_isAtBottom()` at run time, which a branch swap's height churn
            // makes briefly false, and it refused to re-anchor a reader who was at the
            // bottom (`bubble-actions.spec.ts` on WebKit, 3 runs out of 3). Growth does
            // not decrease `scrollTop` and a clamp lands at the bottom, so the flag
            // stays armed through a swap; only a person turns it off.
            if (this._isAutoScrollEnabled) {
                requestAnimationFrame(() => { if (this._isAutoScrollEnabled) this._scrollToBottom(); });
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

    /** The overlay shell's element children that are not this viewport — the floating bottom stack. */
    private _overlayStack(): HTMLElement[] {
        if (!this._overlayRoot) return [];
        return Array.from(this._overlayRoot.children).filter(
            (el): el is HTMLElement => el instanceof HTMLElement && el !== (this as HTMLElement),
        );
    }

    /**
     * Measure how much of this viewport the overlay stack covers, and publish it as
     * `--aparte-bottom-inset` — the `::after` spacer (framework mode), the
     * container's own padding (core mode) and the scroll button's `bottom` all read
     * it (shell.css). Measured from the stack's highest visible top edge rather
     * than by summing heights, so margins and anything the host renders between
     * the rows count themselves. No-op outside overlay mode, and when the value
     * has not changed — a var write invalidates layout, and this runs from the
     * ResizeObserver its own write can re-trigger (core mode observes the
     * container's content box, which the padding is part of).
     */
    private _updateOverlayInset(): void {
        if (!this._overlayRoot) return;
        const bottom = this.getBoundingClientRect().bottom;
        let top = Infinity;
        for (const el of this._overlayStack()) {
            const rect = el.getBoundingClientRect();
            if (rect.height > 0) top = Math.min(top, rect.top);
        }
        const inset = top === Infinity ? 0 : Math.max(0, Math.round(bottom - top));
        if (inset === this._overlayInset) return;
        this._overlayInset = inset;
        this.style.setProperty('--aparte-bottom-inset', `${inset}px`);
    }

    /**
     * Publish, on the chat host, how far from the host's inline edge the rows start —
     * the transcript's padding plus the scrollbar gutter the scroller reserves on both
     * edges, at whatever step its container query has taken — as
     * `--aparte-transcript-inset`. The composer pads by it (composer.css), so its box
     * lands on the row's box at every width. The two used to be independent stacks: the
     * composer cannot know the gutter and a container query cannot reach it, so they sat
     * 10px apart at 768 and the gutter's half apart at 1280, and the reading-column demo
     * showed three left edges 12px apart. Written only when the value changes, for the
     * same reason `_updateOverlayInset` is. On the HOST, not on this element: the
     * composer is a sibling, and a custom property only travels down.
     */
    private _updateTranscriptInset(): void {
        const host = this.parentElement;
        if (!host) return;
        const ref = this.querySelector<HTMLElement>('.aparte-messages-wrapper') ?? this._container ?? this;
        const pad = parseFloat(getComputedStyle(ref).paddingInlineStart) || 0;
        const rtl = getComputedStyle(host).direction === 'rtl';
        const refRect = ref.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const raw = rtl ? hostRect.right - refRect.right : refRect.left - hostRect.left;
        const inset = Math.max(0, Math.round((raw + pad) * 10) / 10);
        if (inset === this._transcriptInset) return;
        this._transcriptInset = inset;
        host.style.setProperty('--aparte-transcript-inset', `${inset}px`);
    }

    /** Is the scroll surface within `_scrollThreshold` of its bottom, right now? */
    private _isAtBottom(): boolean {
        if (!this._container) return true;
        const { scrollTop, scrollHeight, clientHeight } = this._container;
        return scrollHeight - scrollTop - clientHeight <= this._scrollThreshold;
    }

    private _handleScroll(): void {
        if (!this._container) return;
        /*
         * A scroll is the reader's intent — but only when the reader caused it.
         *
         * This used to assign `_isAutoScrollEnabled = _isAtBottom()` on every event, and
         * `_isAtBottom()` answers "no" for two completely different reasons: the reader
         * moved up, or the CONTENT GREW UNDER THEM. The second one disarmed auto-follow
         * exactly when it was most needed. A branch swap rebuilds the transcript, its
         * height settles in stages, one of those stages fires a scroll event while the
         * distance is briefly large — and the follow that was supposed to put the reader
         * back at the bottom had already switched itself off. CI caught it on
         * react-webkit parked 114px up, five seconds after a swap that started at the
         * bottom (scrollTop 1071, scrollHeight 1718, clientHeight 533).
         *
         * The two cases are told apart BY POSITION, which is what the note this replaces
         * asked for and what an event counter could not do: growth does not move
         * `scrollTop`, and a reader going up does. So a decrease disarms, the bottom
         * re-arms, and everything else leaves the flag exactly as it was.
         *
         * With one exception, measured after the queued frames started re-reading the
         * flag: a decrease the BROWSER makes while settling a scroll of ours. When a
         * stream ends the action bar appears (+34px) and the bottom spacer gives the
         * same 34px back in the same frame; through that churn WebKit moved `scrollTop`
         * from 829 to 804 — a 25px decrease, no reader anywhere near it — and the
         * decrease disarmed the follow that was in the middle of landing, leaving the
         * transcript 25px short and a scroll-to-bottom button on a reader who never
         * left (vanilla-webkit and react-webkit, 3 runs out of 3; Chromium settles the
         * same churn without moving). So a decrease is the reader's unless both hold: it
         * comes within a second of a scroll this component asked for, and no scroll
         * gesture touched the transcript in that second. A real gesture always leaves a
         * trace (`_noteReaderInput`); a jump the reader did not make either
         * (find-in-page, a host's own `scrollTo`) still disarms, except in that
         * one-second shadow of our own scroll.
         *
         * The size of the decrease is bounded by the EVIDENCE of churn — how much the
         * scroll height moved since the last scroll event — rather than by a number: a
         * first version capped it at 100px and a branch swap on React refuted that
         * (the rebuild flickers the height by ~200px, measured in `navigateBranch`,
         * and WebKit moves scrollTop by as much); a second version dropped the cap
         * altogether, and during a stream — where every token refreshes
         * `_ownScrollAt`, so the shadow never closes — a reader drag-selecting text
         * upward, whose press lands on the text and not in the gutter, was snapped
         * back to the bottom by the next token. Churn moves scrollTop by at most the
         * height it changed; a reader, a find-in-page jump or a host's `scrollTo` move
         * it with the height standing still.
         */
        const top = this._container.scrollTop;
        const height = this._container.scrollHeight;
        const drop = this._lastScrollTop - top;
        const churn = Math.abs(height - this._lastScrollHeight);
        const now = performance.now();
        const settlingOurs = drop <= churn + 2
            && now - this._ownScrollAt < this._ownScrollWindowMs
            && now - this._readerInputAt >= this._ownScrollWindowMs;
        const readerWentUp = drop > 1 && !settlingOurs;
        // The same decrease, asked of the reader's HAND rather than of its size. The
        // generosity below is for layout drift; a gesture we can see is not drift, however
        // few pixels it moved.
        const readerHandOnIt = drop > 1 && now - this._readerInputAt < this._ownScrollWindowMs;
        this._lastScrollTop = top;
        this._lastScrollHeight = height;

        if (this._isAtBottom() && !readerHandOnIt) {
            // `_isAtBottom()` stays deliberately generous (`_scrollThreshold`, 50px): a
            // few pixels of drift must not read as "the reader walked away".
            //
            // But generosity that outranks the reader PINS them. A wheel notch over the
            // transcript moves WebKit ~33px at a time; 33 < 50, so this branch re-armed
            // the follow, and the settle chain — which re-anchors every frame while
            // armed — undid the notch one millisecond later. Measured in CI: wheel at
            // 135ms, the reader at 565, `scrollTop = 598` from `_settleAtBottom`'s step
            // at 155ms, repeat for every one of twelve notches. Mid-stream on WebKit the
            // reader simply could not read back. So the branch yields when the decrease
            // came with a gesture: `_readerInputAt` already tells the two apart, and
            // `settlingOurs` already trusts it — this is the same evidence, read on the
            // arming side, where it was missing.
            this._isAutoScrollEnabled = true;
        } else if (readerWentUp) {
            this._isAutoScrollEnabled = false;
        } else if (drop > 1 && settlingOurs && this._isAutoScrollEnabled) {
            // Armed, and a gap the reader did not open. Nothing else will close it: the
            // rebuild's mutations are over, the host's border box did not change (so the
            // ResizeObserver is silent in framework mode), and the settle may be spent.
            // Measured on react-webkit: top 763 -> 759 -> 720 while the max churned
            // 891 -> 1091 -> 891, leaving the transcript 171px short with the follow
            // still armed and no code path acting on it. Classifying the churn was only
            // half the job — the other half is doing something about it.
            //
            // Gated on `settlingOurs`, so it can never reach a reader: a drag-selection
            // upward (a decrease with the height standing still) and a find-in-page jump
            // (outside the one-second shadow) both take the disarm branch above.
            //
            // And gated on `drop > 1`, the same threshold `readerWentUp` uses: only a
            // DECREASE is a gap the layout opened, which is the whole of the measured
            // mechanism. A scroll of ours that is still moving DOWN is `settlingOurs`
            // too (`drop` is negative, so the churn test passes trivially) — and that is
            // every frame of a native smooth scroll: `requestSmoothScroll()`, the
            // scroll-to-bottom button, the glide after a user's send. Re-anchoring one
            // of those frames assigns `scrollTop`, which per CSSOM-View performs an
            // instant scroll and ABORTS the running animation, so every glide became a
            // one-frame stutter and a jump.
            this._settleAtBottom();
        }
        this._updateScrollButton();
    }

    private _scrollToBottom(): void {
        if (!this._container) return;
        // A smooth scroll was asked for (a user send, by whichever path — appendMessage,
        // a wrapper's requestSmoothScroll(), or a user bubble the mutation observer saw
        // arrive): the FIRST pin after it is the glide, not a jump. In framework-managed
        // mode the observer's own pin used to run first and instant — 630 px in one frame
        // measured on React — and the smooth request was only honoured later, by
        // _autoScroll, on a view that had already teleported.
        if (this._smoothScrollOnce) {
            this._smoothScrollOnce = false;
            this._smoothScrollToBottom();
            return;
        }
        if (this._gliding()) { this._retargetGlide(); return; }
        this._ownScrollAt = performance.now();
        this._container.scrollTop = this._container.scrollHeight;
        this._settleAtBottom();
    }

    private _gliding(): boolean {
        return performance.now() < this._glideUntil;
    }

    /** A second smooth `scrollTo` is continuous where an instant write is a cut. */
    private _retargetGlide(): void {
        if (!this._container) return;
        this._ownScrollAt = performance.now();
        this._container.scrollTo({ top: this._container.scrollHeight, behavior: 'smooth' });
    }

    /**
     * The browser says a scroll came to rest — the glide is over ONLY if it rested at the
     * bottom. WebKit fires `scrollend` when a smooth scroll is REPLACED by another (our own
     * re-target), 45–60 ms into the glide and hundreds of pixels short; taken at its word,
     * that closed the window and the next pin was the cut this guard exists to prevent
     * (react-webkit and vanilla-webkit, 2 of 2). Short of the bottom, the budget keeps
     * bounding the window.
     */
    private _handleScrollEnd(): void {
        if (!this._container) return;
        const max = this._container.scrollHeight - this._container.clientHeight;
        if (max - this._container.scrollTop <= 1) this._glideUntil = 0;
    }

    /**
     * Confirm over the next few frames that we actually reached the bottom.
     *
     * One assignment is not enough, and the reason is measured rather than guessed.
     * A timeline of a streamed turn on Safari (framework mode) recorded the content
     * settling in TWO layout passes — 1118 → 1121 → 1152 px. `scrollTop =
     * scrollHeight` ran against the middle one, clamped to that layout's max (603),
     * and nothing ran afterwards: the last 31px never closed. Auto-follow stayed
     * armed the whole time, so the component was not disarmed — it was SATISFIED.
     * `_isAtBottom()` answers "yes" for any gap under `_scrollThreshold` (50), which
     * is the right rule for keeping auto-follow armed and the wrong one as a
     * definition of "anchored".
     *
     * Ruled out on the way here, so nobody pays for it twice: not a WebKit
     * padding-accounting difference (a probe writing `scrollTop = 1e7` reached
     * exactly `scrollHeight - clientHeight`), not a missing `characterData`
     * mutation, and not a child resize a ResizeObserver could see.
     *
     * A BOUNDED retry, not one corrective frame: a single frame lands on the same
     * stale layout and was measured leaving a wider gap than doing nothing. Bounded
     * so it always terminates; re-reads `_isAutoScrollEnabled` every frame so a
     * reader who scrolls away mid-settle is left alone.
     *
     * Bounded by TIME, and it does not stop at the first closed gap — both of those
     * were the second half of the same bug. It used to be four frames (~64ms on an
     * idle 60Hz machine) and to return permanently the frame the gap first closed.
     * A branch swap at the bottom of a long transcript on react-webkit falsified
     * both at once: the rebuild's scrollable max churned 891 -> 1091 -> 891, the gap
     * WAS closed for a frame against the tall layout, the chain returned, the height
     * fell back with WebKit holding `scrollTop` at 720 — and the transcript stood
     * 171px short with auto-follow still armed. A frame count is a proxy for time
     * that fails exactly on the slow engine, so the budget is real milliseconds now,
     * and a closed gap only ends the chain when the window is over. One chain, not
     * one per call: during a stream every token used to start its own.
     */
    private _settleAtBottom(): void {
        this._settleUntil = performance.now() + this._settleWindowMs;
        if (this._settleRafId !== null) return;      // one chain; the deadline re-arms it
        const step = (): void => {
            this._settleRafId = null;
            // A detached viewport has nothing to settle. `_cleanup` cancels the chain on
            // disconnect, but a document that goes away whole — a closed window, a test
            // environment torn down — fires no disconnectedCallback, and the next frame
            // then ran against globals that no longer existed (27 errors after teardown
            // in the wrapper suites, whose rAF stub is a 0ms timer that survives it).
            if (!this.isConnected || !this._container || !this._isAutoScrollEnabled) { this._settleUntil = 0; return; }
            const max = this._container.scrollHeight - this._container.clientHeight;
            // A closed gap is NOT the end: the churn re-opens it (891 -> 1091 -> 891).
            // And an open gap during a glide is the glide itself, not a shortfall.
            if (max - this._container.scrollTop > 1 && !this._gliding()) {
                this._ownScrollAt = performance.now();
                this._container.scrollTop = max;
            }
            if (performance.now() < this._settleUntil) this._settleRafId = requestAnimationFrame(step);
            else this._settleUntil = 0;
        };
        this._settleRafId = requestAnimationFrame(step);
    }

    private _smoothScrollToBottom(): void {
        if (!this._container) return;
        // scrollTo with behavior:'smooth' is not available in all environments (e.g. jsdom).
        // Fall back to instant scroll so tests and SSR environments stay safe.
        // Reduced-motion users get the instant path too — the CSS
        // prefers-reduced-motion block cannot reach a JS-driven smooth scroll.
        this._ownScrollAt = performance.now();
        if (typeof this._container.scrollTo === 'function' && !this._prefersReducedMotion()) {
            this._glideUntil = performance.now() + this._glideWindowMs;
            this._container.scrollTo({ top: this._container.scrollHeight, behavior: 'smooth' });
            // A glide can miss: its target was read before a height churn, or the engine
            // dropped it. Nothing re-pins once the mutations are over, so the glide arms
            // the pin itself — an instant one, with the settle chain, once the window is
            // closed and only if the view is still short and the reader still followed.
            if (this._glideSettleTimer !== null) clearTimeout(this._glideSettleTimer);
            this._glideSettleTimer = setTimeout(() => {
                this._glideSettleTimer = null;
                if (!this._container || !this._isAutoScrollEnabled || this._gliding()) return;
                const max = this._container.scrollHeight - this._container.clientHeight;
                if (max - this._container.scrollTop > 1) this._scrollToBottom();
            }, this._glideWindowMs + 16);
        } else {
            this._container.scrollTop = this._container.scrollHeight;
        }
    }

    private _prefersReducedMotion(): boolean {
        return typeof matchMedia === 'function'
            && matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /**
     * Show/hide the scroll-to-bottom button from the **current geometry**, not from
     * `_isAutoScrollEnabled`.
     *
     * The two answer different questions: the flag is intent ("should new content
     * pull the view down"), the button is a fact ("is there anything below the
     * fold"). Mirroring the flag made the button lie whenever the two diverged —
     * `navigateBranch` deliberately disarms auto-follow, so swapping a branch while
     * already at the bottom of a scrollable transcript left the button offering to
     * scroll nowhere (reported from a React consumer). Re-derived on scroll, on the
     * post-mutation frame and after a path swap, so it converges to the truth
     * whatever a framework's render timing does in between.
     */
    private _updateScrollButton(): void {
        const btn = this._scrollBtn;
        if (!btn) return;
        const hidden = this._isAtBottom();
        // This runs on every scroll event of a streaming transcript, so it writes only
        // what changes: `classList.toggle` is already idempotent, `setAttribute` is not
        // — it produces a mutation record whatever the value it writes, and the two
        // below sit in the hottest path the component has. The state is read back from
        // the button rather than cached in a field, because the button is rebuilt on
        // every re-render and a cached flag would skip the stamp on the new one.
        if (btn.classList.contains('aparte-scroll-btn--hidden') === hidden
            && btn.hasAttribute('tabindex') === hidden) return;
        btn.classList.toggle('aparte-scroll-btn--hidden', hidden);
        // Hidden is opacity 0 and no pointer, which the tab order cannot see: the
        // button stayed a stop while invisible, so a keyboard user landed on nothing
        // between the transcript and the composer — and the transcript's own stop,
        // once it had one, pushed the composer past the eighth Tab on the vanilla
        // example. A control nobody can see is not a control anybody can reach.
        if (hidden) {
            btn.setAttribute('tabindex', '-1');
            btn.setAttribute('aria-hidden', 'true');
        } else {
            btn.removeAttribute('tabindex');
            btn.removeAttribute('aria-hidden');
        }
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
            .find(b => b.getAttribute('data-role') === 'user');

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
            // The DOM just changed (new bubble, streamed token, framework re-render):
            // whether anything sits below the fold changed with it.
            this._updateScrollButton();
        });
    }

    /**
     * Cap the number of rendered bubbles in the DOM (perf ceiling only).
     *
     * Drops the oldest `<aparte-chat-bubble>` elements beyond `_maxRenderedBubbles`
     * from the DOM. It **never** touches the AparteMessageRepository — the conversation
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

    private _cleanup(): void {
        this._container?.removeEventListener('scroll', this._handleScroll);
        this._container?.removeEventListener('scrollend', this._handleScrollEnd);
        if (this._glideSettleTimer !== null) { clearTimeout(this._glideSettleTimer); this._glideSettleTimer = null; }
        for (const type of ['wheel', 'touchmove', 'pointerdown', 'keydown'] as const) {
            this._container?.removeEventListener(type, this._noteReaderInput);
        }
        this._scrollBtn?.removeEventListener('click', this._onScrollBtnClick);
        this.removeEventListener('aparte-branch-navigate', this._onBranchNavigate);
        this._resizeObserver?.disconnect();
        this._mutationObserver?.disconnect();
        this._overlayObserver?.disconnect();
        this._overlayObserver = null;
        this._overlayRoot = null;
        this._overlayInset = -1;
        this._transcriptInset = -1;
        this._resizeObserver = null;
        this._mutationObserver = null;
        if (this._spacerRafId !== null) {
            cancelAnimationFrame(this._spacerRafId);
            this._spacerRafId = null;
        }
        // A custom element is re-connected on every DOM move, so a settle left in flight
        // would accumulate one chain per move.
        if (this._settleRafId !== null) {
            cancelAnimationFrame(this._settleRafId);
            this._settleRafId = null;
        }
        this._settleUntil = 0;
    }
}

// Register the custom element
if (!customElements.get('aparte-chat-viewport')) {
    customElements.define('aparte-chat-viewport', AparteChatViewport);
}
