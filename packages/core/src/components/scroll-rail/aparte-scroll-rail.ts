import { resolveConfig } from '../../config/index.js';
import type { AparteLocale } from '../../config/locale.js';
import { cssEscape } from '../../utils/css-escape.js';
import { activeElementIn } from '../../utils/event-target.js';
import { deferHydrationOf } from '../../interop/defer-hydration.js';

/** Detail of `aparte-scroll-rail-jump`: the message a tick points at. */
export interface AparteScrollRailJumpDetail {
    messageId: string;
}

/** What a tick is drawn for: one per user turn (the default), or one per message. */
export type AparteScrollRailEvery = 'user' | 'message';

const EXCERPT_LENGTH = 60;
/** The tightest pitch the rail will take before it scrolls itself: a 2px line and a 4px gap. */
const MIN_PITCH = 6;
/** How long the transcript has to be still, after a jump, before the observer marks again. */
const SETTLE_MS = 150;
/** How many times a jump re-aligns on the message once the transcript has settled off it. */
const MAX_ALIGN_PASSES = 4;
/** Within this many pixels of the top, a jump has landed. */
const ALIGN_TOLERANCE = 1;
/** The reading band: the top share of the scroll surface, in percent, where a question is "the one you are under". */
const BAND_PERCENT = 30;

/**
 * A rail of ticks beside the transcript — one per turn — that shows where you are in a
 * long conversation and jumps back to any message on a click.
 *
 * The thing every long chat is missing and no product ships natively: the scrollbar says
 * how far down you are, not which question you are under. This is the minimap of a code
 * editor reduced to its ticks, the search marks of a browser's scrollbar, the scrollspy
 * of a documentation site — the same ancestry, applied to turns. A tick per USER message
 * by default, because a user's turns are the questions and a rail with a tick per reply
 * is unreadable on a long thread; `every="message"` marks each one.
 *
 * It owns nothing of the transcript: the viewport keeps its scroll, the bubbles keep
 * their markup, and the rail only READS them — which bubbles exist (a mutation observer
 * on the chat), which one is under the reader (an intersection observer on the scroll
 * surface, never scroll arithmetic), and the first few words of each for the tick's
 * name. A click is a `scrollIntoView` on the bubble, announced first by a cancelable
 * `aparte-scroll-rail-jump` so a host that pages history in can load it before the
 * jump. Honoured by core alone, so it is live by default.
 *
 * Place it as a direct child of `<aparte-chat>` (or the wrapper's `[data-aparte-chat]`
 * host): the stylesheet floats it on the transcript's end edge, centred on the transcript
 * and clear of a classic scrollbar, and hides it under a coarse pointer, where a 2px
 * tick is not a target. Under two ticks it renders nothing — a rail with one mark says
 * nothing. It is a list, not a minimap: it takes the height of its ticks, up to a share
 * of the transcript (`--aparte-scroll-rail-share`, 60%). When more turns exist than 24px
 * targets fit in that, the pitch tightens to what fits, down to a 6px floor; past that
 * the rail scrolls itself so the current tick is always in view, and the arrow keys walk
 * every tick whatever the pitch. The rail is one Tab stop, the current tick: Tab crosses
 * it once, however long the conversation, and the arrows, Home and End move inside it.
 *
 * @element aparte-scroll-rail
 *
 * @attr {string} target - The id of the `<aparte-chat>` to follow, when the element is not inside it.
 * @attr {string} every - `user` (default): one tick per user turn. `message`: one per message.
 * @attr {boolean} data-empty - Reflected BY the element while it has fewer than two ticks. Read-only.
 *
 * @fires {CustomEvent<AparteScrollRailJumpDetail>} aparte-scroll-rail-jump - A tick was activated. Bubbles, cancelable: `preventDefault()` leaves the transcript where it is.
 *
 * @cssprop [--aparte-scroll-rail-width=max(var(--aparte-scroll-rail-hit-size), calc(var(--aparte-scroll-rail-tick-size) * 1.6))] - The rail's column, the ticks end-aligned in it. Never under one tick's pressable zone: the rail clips, so a narrower column would cut the target back.
 * @cssprop [--aparte-scroll-rail-tick-size=14px] - Length of a tick; the current one is 1.6× that.
 * @cssprop [--aparte-scroll-rail-tick-thickness=2px] - Thickness of a tick.
 * @cssprop [--aparte-scroll-rail-hit-size=24px] - The pressable zone around a tick (WCAG 2.5.8). The drawn line keeps its own size; this one sizes the pseudo-element and, through the gap below, the pitch — so raising it spaces the ticks out rather than overlapping them. When the ticks would not fit, the rail sets it on itself to the pitch that does, never under 6px.
 * @cssprop [--aparte-scroll-rail-gap=calc(var(--aparte-scroll-rail-hit-size) - var(--aparte-scroll-rail-tick-thickness))] - Space between ticks: the zone minus the line, so gap + thickness is exactly the pitch. Set it smaller and the zones overlap.
 * @cssprop [--aparte-scroll-rail-room=calc(var(--aparte-scroll-rail-width) + var(--aparte-space-2))] - The lane the chat leaves at its end edge while the rail is in it, the rail sitting there, so no line runs under the ticks. `0px` lets the rail float over the text.
 * @cssprop [--aparte-scroll-rail-share=.6] - The share of the transcript's height the rail may take. It is the height of its list up to this, centred on the transcript; past it the pitch tightens, then the rail scrolls.
 * @cssprop [--aparte-scroll-rail-bar=0px] - Published BY the element: the width of the transcript's scrollbar when it is a classic one (0 for an overlay bar), which the stylesheet adds to the rail's end inset so the ticks never sit on the bar.
 * @cssprop [--aparte-scroll-rail-block-start=0px] - Published BY the element: the distance from the host's top edge to the transcript's, so the rail centres on the transcript rather than on the composer too.
 * @cssprop [--aparte-scroll-rail-block-end=0px] - Published BY the element: the distance from the transcript's bottom edge to the host's.
 *
 * @example
 * <aparte-chat style="height: 18rem">
 *   <aparte-chat-viewport>
 *     <aparte-chat-bubble message-id="u1" data-role="user" content="What is a web component?"></aparte-chat-bubble>
 *     <aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant" content="A custom element: a tag the browser upgrades to a class you wrote. It carries its own markup, behaviour and, if you want, its own styles — and it works in any framework, or none, because it is the platform's own component model."></aparte-chat-bubble>
 *     <aparte-chat-bubble message-id="u2" data-role="user" content="And a light-DOM one?"></aparte-chat-bubble>
 *     <aparte-chat-bubble message-id="a2" data-role="assistant" name="Assistant" content="One that renders its children into the page rather than into a shadow root, so the page's CSS reaches inside it. aparté is light DOM on purpose: a theme is a stylesheet, not an API."></aparte-chat-bubble>
 *     <aparte-chat-bubble message-id="u3" data-role="user" content="Which one is this rail?"></aparte-chat-bubble>
 *     <aparte-chat-bubble message-id="a3" data-role="assistant" name="Assistant" content="Light DOM, like everything else here. Its ticks are plain buttons in a list; scroll the transcript and watch the current one move."></aparte-chat-bubble>
 *   </aparte-chat-viewport>
 *   <aparte-scroll-rail></aparte-scroll-rail>
 *   <aparte-composer>
 *     <div class="aparte-composer-shell">
 *       <div class="aparte-composer-row">
 *         <aparte-composer-input></aparte-composer-input>
 *         <aparte-composer-send></aparte-composer-send>
 *       </div>
 *     </div>
 *   </aparte-composer>
 * </aparte-chat>
 */
export class AparteScrollRail extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['target', 'every'];
    }

    private _host: HTMLElement | null = null;
    private _mutations: MutationObserver | null = null;
    private _resizes: ResizeObserver | null = null;
    private _intersections: IntersectionObserver | null = null;
    /** The bubbles the intersection observer watches — compared by identity, so a re-rendered bubble is re-observed. */
    private _observedBubbles: HTMLElement[] = [];
    /**
     * Every message the reading band watches: the ticked ones and, with `every="user"`, the
     * replies too, each read under the question above it.
     */
    private _bandTargets: HTMLElement[] = [];
    /** The scroll surface the observer is rooted on, and whose bottom edge is read. */
    private _observedSurface: HTMLElement | null = null;
    /** One frame does the queued work: a full rebuild when bubbles came or went, else the re-labels. */
    private _frameQueued = false;
    private _rebuildWanted = false;
    /** Ticked bubbles whose text changed since the last frame: only their names can have moved. */
    private _relabel = new Set<HTMLElement>();
    private _pickQueued = false;
    private _currentId: string | null = null;
    /**
     * Visible ratio per message in the reading band, from the intersection observer. Keyed by
     * the element, not its id: an id changed in place keeps what the observer saw, and a
     * bubble that left is let go with it.
     */
    private _visible = new WeakMap<Element, number>();
    /** Whether the last question is on screen at all, from the second observer. */
    private _onScreen = new WeakSet<Element>();
    private _onScreenObserver: IntersectionObserver | null = null;
    /** The mark a jump asked for, held until the transcript has stopped moving. */
    private _held: string | null = null;
    private _settleTimer: ReturnType<typeof setTimeout> | null = null;
    private _settleSurface: HTMLElement | null = null;
    /** Re-alignments done for the jump in flight. */
    private _alignPasses = 0;
    /** The custom properties written on this element, so each is written only when it changes. */
    private _written = new Map<string, string>();

    private _onConfigChange = (): void => this._rebuild();
    private _onSurfaceScroll = (): void => this._bumpSettle();

    /** The id of the message the rail currently marks, or `null`. */
    get currentMessageId(): string | null {
        return this._currentId;
    }

    connectedCallback(): void {
        if (!this.classList.contains('aparte-scroll-rail')) this.classList.add('aparte-scroll-rail');
        if (!this.getAttribute('role')) this.setAttribute('role', 'navigation');
        this.addEventListener('click', this._onClick);
        this.addEventListener('keydown', this._onKeydown);
        window.addEventListener('aparte-config-change', this._onConfigChange);
        this._attach();
    }

    disconnectedCallback(): void {
        this._detach();
        this.removeEventListener('click', this._onClick);
        this.removeEventListener('keydown', this._onKeydown);
        window.removeEventListener('aparte-config-change', this._onConfigChange);
    }

    attributeChangedCallback(name: string): void {
        if (!this.isConnected) return;
        if (name === 'target') this._attach();
        else this._rebuild();
    }

    // ─── Wiring ───────────────────────────────────────────────────────────

    /** The chat this rail follows: `target`, else the host above it — the gauge's rule. */
    private _findHost(): HTMLElement | null {
        const target = this.getAttribute('target');
        if (target) return document.getElementById(target);
        let node: HTMLElement | null = this.parentElement;
        while (node) {
            if (node.tagName.toLowerCase() === 'aparte-chat' || node.hasAttribute('data-aparte-chat')) return node;
            node = node.parentElement;
        }
        return null;
    }

    private _attach(): void {
        this._detach();
        this._host = this._findHost();
        if (!this._host) {
            this._rebuild();
            return;
        }
        // One observer on the host, subtree-wide: it sees a bubble appended to the
        // viewport AND the viewport itself appearing, which a wrapper mounts after the
        // rail on some frameworks. The rail is in that subtree too, and its own rebuilds
        // are mutations: those are dropped here, or the rail rebuilds itself every frame
        // for ever (measured at 61 to 146 rebuilds a second, at rest, each with a fresh
        // intersection observer — and nothing on a tick survived a frame).
        //
        // And only bubbles coming or going rebuild it. A reply streaming is a mutation per
        // token, and the full reconcile walked every bubble and re-read every question's text
        // each frame for a name that had not changed: 10.8 ms a frame at 500 questions,
        // measured in Chromium, half a frame's budget, on every reply of a long conversation.
        // A change inside a message re-names that message's tick, when it has one.
        if (typeof MutationObserver !== 'undefined') {
            this._mutations = new MutationObserver((records) => {
                for (const record of records) {
                    if (this.contains(record.target)) continue;
                    if (record.type === 'attributes') {
                        // A bubble's id or role changed in place (a framework reusing an element):
                        // which messages have ticks, and under which ids, is what a rebuild reads.
                        if (isBubble(record.target)) {
                            this._queueRebuild();
                            return;
                        }
                        continue;
                    }
                    // Inside a message, checked first: bubbles are never nested, so nothing there
                    // adds or removes one, and only that message's name can change. A reply
                    // re-rendered whole on each token replaces its subtree, which the structural
                    // test below would otherwise walk on every token.
                    const at = record.target instanceof Element ? record.target : record.target.parentElement;
                    const owner = at?.closest<HTMLElement>('aparte-chat-bubble');
                    if (owner) {
                        if (this._ticked(owner)) this._queueRelabel(owner);
                        continue;
                    }
                    if (record.type === 'childList' && (holdsBubbles(record.addedNodes) || holdsBubbles(record.removedNodes))) {
                        this._queueRebuild();
                        return;
                    }
                }
            });
            this._mutations.observe(this._host, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['message-id', 'data-role'],
            });
        }
        // The rail spans the transcript and sits clear of its scrollbar, both measured:
        // re-measured when the chat or the transcript changes size (a composer that grows).
        if (typeof ResizeObserver !== 'undefined') {
            this._resizes = new ResizeObserver(() => this._layout());
            this._resizes.observe(this._host);
            const viewport = this._viewport();
            if (viewport) this._resizes.observe(viewport);
        }
        this._rebuild();
    }

    private _detach(): void {
        this._mutations?.disconnect();
        this._mutations = null;
        this._resizes?.disconnect();
        this._resizes = null;
        this._unobserve();
        this._release();
        this._host = null;
    }

    /** Coalesce a burst of mutations into one frame of work: a rebuild, which re-names every tick too. */
    private _queueRebuild(): void {
        this._rebuildWanted = true;
        this._queueFrame();
    }

    private _queueRelabel(bubble: HTMLElement): void {
        this._relabel.add(bubble);
        this._queueFrame();
    }

    private _queueFrame(): void {
        if (this._frameQueued) return;
        this._frameQueued = true;
        requestAnimationFrame(() => {
            this._frameQueued = false;
            const relabel = [...this._relabel];
            this._relabel.clear();
            if (this._rebuildWanted) {
                this._rebuildWanted = false;
                this._rebuild();
                return;
            }
            const locale = resolveConfig(this).getLocale();
            for (const bubble of relabel) this._label(bubble, locale);
        });
    }

    /** Whether a bubble has a tick: every message with `every="message"`, else the user's. */
    private _ticked(bubble: HTMLElement): boolean {
        if (!bubble.hasAttribute('message-id')) return false;
        return this.getAttribute('every') === 'message' || bubble.getAttribute('data-role') === 'user';
    }

    /** Re-name one bubble's tick, written only when the name changed. */
    private _label(bubble: HTMLElement, locale: AparteLocale): void {
        const id = bubble.getAttribute('message-id');
        if (!id) return;
        const tick = this.querySelector<HTMLElement>(`.aparte-scroll-rail__tick[data-message-id="${cssEscape(id)}"]`);  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
        if (!tick) return;
        const label = this._tickLabel(bubble, locale);
        if (tick.getAttribute('aria-label') !== label) {
            tick.setAttribute('aria-label', label);
            tick.title = label;
        }
    }

    private _viewport(): HTMLElement | null {
        return this._host?.querySelector<HTMLElement>('aparte-chat-viewport') ?? null;
    }

    /** The element that scrolls: the vanilla container, or the viewport itself under a wrapper. */
    private _scrollSurface(): HTMLElement | null {
        const viewport = this._viewport();
        if (!viewport) return null;
        return viewport.querySelector<HTMLElement>('.aparte-viewport-container') ?? viewport;
    }

    /** Every message bubble of the transcript, in document order. */
    private _messages(): HTMLElement[] {
        const viewport = this._viewport();
        return viewport ? Array.from(viewport.querySelectorAll<HTMLElement>('aparte-chat-bubble[message-id]')) : [];
    }

    /** The bubbles that get a tick, from all of them. */
    private _bubbles(all: HTMLElement[] = this._messages()): HTMLElement[] {
        const every: AparteScrollRailEvery = this.getAttribute('every') === 'message' ? 'message' : 'user';
        return every === 'message' ? all : all.filter((b) => b.getAttribute('data-role') === 'user');
    }

    // ─── Rendering ────────────────────────────────────────────────────────

    /** The first words of a message, for the tick's name. An excerpt, never a summary. */
    private _excerpt(bubble: HTMLElement): string {
        const body = bubble.querySelector<HTMLElement>('.aparte-message-content') ?? bubble;
        // The head of the text only, read node by node: `textContent` built the whole message
        // (a pasted document, a long reply on every rebuild) to keep sixty characters.
        let head = '';
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node && head.length < EXCERPT_LENGTH * 16; node = walker.nextNode()) head += node.nodeValue ?? '';
        const text = head.slice(0, EXCERPT_LENGTH * 16).replace(/\s+/g, ' ').trim();
        return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : text;
    }

    private _tickLabel(bubble: HTMLElement, locale: AparteLocale): string {
        const role = bubble.getAttribute('data-role') === 'user'
            ? (locale.roleNameUser ?? 'You')
            : (locale.roleNameAssistant ?? 'Assistant');
        const excerpt = this._excerpt(bubble);
        return excerpt ? `${role}: ${excerpt}` : role;
    }

    private _list(): HTMLOListElement | null {
        return this.querySelector<HTMLOListElement>(':scope > .aparte-scroll-rail__list');
    }

    /**
     * Reconcile the ticks with the bubbles, by message id. A tick that already exists is
     * kept — the same node, so the focus on it, its hover and its tooltip survive a turn
     * being appended or a reply streaming beside it — moved only when its order changed,
     * and dropped when its bubble left.
     */
    private _rebuild(): void {
        const all = this._messages();
        const bubbles = this._bubbles(all);
        const locale = resolveConfig(this).getLocale();
        // Written only when the value changes: a reconcile runs on every host mutation, and
        // an attribute rewritten to the value it already has is still a DOM mutation —
        // measured on CI's WebKit, where a late one landed inside the rail's rest window.
        const railLabel = locale.scrollRailLabel ?? 'Conversation outline';
        if (this.getAttribute('aria-label') !== railLabel) this.setAttribute('aria-label', railLabel);

        if (bubbles.length < 2) {
            this.setAttribute('data-empty', '');
            this.replaceChildren();
            this._unobserve();
            this._currentId = null;
            this._write('--aparte-scroll-rail-hit-size', '');
            this._write('--aparte-scroll-rail-gap', '');
            return;
        }
        this.removeAttribute('data-empty');

        let list = this._list();
        if (!list) {
            list = document.createElement('ol');
            list.className = 'aparte-scroll-rail__list';
            this.replaceChildren(list);
        }
        const existing = new Map<string, HTMLLIElement>();
        for (const item of Array.from(list.children) as HTMLLIElement[]) {
            const id = item.firstElementChild instanceof HTMLElement ? item.firstElementChild.dataset['messageId'] : undefined;
            if (id) existing.set(id, item);
        }
        // The ticks whose bubble left go first. Removed after the placement, a tick gone from
        // the front stood at every position the loop compared against, so each kept tick was
        // taken out and put back: all 500 on every turn once the viewport prunes its oldest
        // bubble, and a tick that had the focus lost it.
        const known = new Set(bubbles.map((b) => b.getAttribute('message-id')!));
        for (const [id, item] of existing) {
            if (known.has(id)) continue;
            item.remove();
            existing.delete(id);
        }
        // A cursor, not `list.children[index]`: the collection is re-walked after each move.
        let at: Element | null = list.firstElementChild;
        for (const bubble of bubbles) {
            const id = bubble.getAttribute('message-id')!;
            let item = existing.get(id);
            if (!item) {
                item = document.createElement('li');
                const tick = document.createElement('button');
                tick.type = 'button';
                tick.className = 'aparte-scroll-rail__tick';
                tick.dataset['messageId'] = id;
                tick.tabIndex = -1;
                item.appendChild(tick);
            }
            const tick = item.firstElementChild as HTMLElement;
            const label = this._tickLabel(bubble, locale);
            if (tick.getAttribute('aria-label') !== label) {
                tick.setAttribute('aria-label', label);
                tick.title = label;
            }
            if (id === this._currentId) {
                if (tick.getAttribute('aria-current') !== 'true') tick.setAttribute('aria-current', 'true');
            } else {
                tick.removeAttribute('aria-current');
            }
            if (item === at) at = at.nextElementSibling;
            else list.insertBefore(item, at);
        }

        const dropped = this._currentId !== null && !known.has(this._currentId);
        if (dropped) this._currentId = null;
        this._syncTabStop();
        if (!sameElements(this._observedBubbles, bubbles) || !sameElements(this._bandTargets, all)) this._observe(bubbles, all);
        this._layout();
        // The marked message left, or its id changed in place: what the observers last
        // reported, kept by element, names the question again; no scroll needs to happen.
        if (dropped) this._pickCurrent();
    }

    /**
     * Which tick is current is read, not computed: the scroll surface is the root and an
     * intersection observer reports which bubbles reach a reading band — the top 30% of
     * the surface, from its very top so that the bubble a jump aligned there counts. The
     * rule is a scrollspy's: the LAST question that has reached the band is the one the
     * reader is under. (The largest visible share would name the first of three questions
     * sitting in the band at the bottom of a thread of short turns.) The one scroll
     * position read is the bottom, because there the reader is under the latest question
     * whatever the band holds, and the observer has nothing to report on the last few
     * pixels.
     *
     * The replies are watched too, and a reply in the band is read under its question. With
     * the questions alone the band was empty whenever the reader was inside a long reply, and
     * nothing moved the mark when the layout did: a bubble never rendered has an estimated
     * height (`content-visibility`) and takes its real one once the scroll has stopped, so a
     * still reader's question changed with no scroll and no question crossing the band. The
     * observer reports a reply entering the band whatever moved it.
     */
    private _observe(bubbles: HTMLElement[], all: HTMLElement[]): void {
        const root = typeof IntersectionObserver === 'undefined' ? null : this._scrollSurface();
        if (!root) {
            this._unobserve();
            this._observedBubbles = bubbles;
            this._bandTargets = all;
            return;
        }
        // Made once per scroll surface and re-pointed by difference. Made afresh on every
        // change, the band observer was torn down twice a turn (the question, then its reply)
        // over every message, and each new one delivered every entry again.
        if (!this._intersections || !this._onScreenObserver || this._observedSurface !== root) {
            this._unobserve();
            this._intersections = new IntersectionObserver((entries) => {
                for (const entry of entries) this._visible.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
                this._pickCurrent();
            }, { root, rootMargin: `0px 0px -${100 - BAND_PERCENT}% 0px`, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
            // The whole surface, for one question only: the last. While the end of the thread
            // is on screen the reader is at the end, whatever the band holds — after a send,
            // the viewport rests with the new question low on the screen and older ones in
            // the band, and a rail marking the question above the one just asked is wrong.
            this._onScreenObserver = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) this._onScreen.add(entry.target);
                    else this._onScreen.delete(entry.target);
                }
                this._pickCurrent();
            }, { root, threshold: [0] });
            this._observedSurface = root;
            root.addEventListener('scroll', this._onRootScroll, { passive: true });
        }
        const next = new Set<Element>(all);
        for (const bubble of this._bandTargets) if (!next.has(bubble)) this._intersections.unobserve(bubble);
        const before = new Set<Element>(this._bandTargets);
        for (const bubble of all) if (!before.has(bubble)) this._intersections.observe(bubble);
        // Only the last is ever read from this one: watching every question made the browser
        // compute their intersections each frame of a scroll, and called back on each crossing.
        const last = bubbles[bubbles.length - 1]!;
        const previous = this._observedBubbles[this._observedBubbles.length - 1];
        if (previous !== last) {
            if (previous) this._onScreenObserver.unobserve(previous);
            this._onScreenObserver.observe(last);
        }
        this._observedBubbles = bubbles;
        this._bandTargets = all;
    }

    private _unobserve(): void {
        this._intersections?.disconnect();
        this._intersections = null;
        this._onScreenObserver?.disconnect();
        this._onScreenObserver = null;
        this._observedSurface?.removeEventListener('scroll', this._onRootScroll);
        this._observedSurface = null;
        this._observedBubbles = [];
        this._bandTargets = [];
        this._visible = new WeakMap();
        this._onScreen = new WeakSet();
    }

    /** A scroll only matters at the bottom edge, where the observer is silent: one pick per frame. */
    private _onRootScroll = (): void => {
        if (this._pickQueued) return;
        this._pickQueued = true;
        requestAnimationFrame(() => {
            this._pickQueued = false;
            this._pickCurrent();
        });
    };

    /** At the bottom edge of a surface that scrolls; a surface with nothing to scroll has no bottom to be at. */
    private _atBottom(): boolean {
        const surface = this._observedSurface;
        if (!surface) return false;
        const max = surface.scrollHeight - surface.clientHeight;
        return max > 0 && max - surface.scrollTop <= 2;
    }

    private _pickCurrent(): void {
        // A jump said which mark is right; the band's mid-scroll opinions wait for it to settle.
        if (this._held) return;
        const bubbles = this._observedBubbles;
        if (bubbles.length === 0) return;
        const lastBubble = bubbles[bubbles.length - 1]!;
        const lastId = lastBubble.getAttribute('message-id')!;
        if (this._atBottom() || this._onScreen.has(lastBubble)) {
            this._setCurrent(lastId);
            return;
        }
        // The last message in the band names the question: itself when it has a tick, else the
        // ticked one above it. With the questions alone, a reader who wheeled up through long
        // replies was still marked on the last question seven questions later, measured in
        // Chromium: the band held only replies, and an empty band kept the old mark.
        let last: string | null = null;
        let above: string | null = null;
        for (const bubble of this._bandTargets) {
            if (this._ticked(bubble)) above = bubble.getAttribute('message-id');
            if (above !== null && (this._visible.get(bubble) ?? 0) > 0) last = above;
        }
        // No message in the band at all (above the first one, or in the space after the
        // last): the band's rule, read from the layout.
        last ??= this._lastAbove();
        if (last !== null) this._setCurrent(last);
    }

    /**
     * The last question whose top is above the reading band's lower edge: by halves, since
     * the questions are in document order and their tops only grow. A question never
     * rendered has its estimated height (`content-visibility`), which keeps that order.
     * `null` when nothing is laid out, and the mark stays as it was.
     */
    private _lastAbove(): string | null {
        const surface = this._observedSurface;
        const bubbles = this._observedBubbles;
        if (!surface || bubbles.length === 0) return null;
        const box = surface.getBoundingClientRect();
        if (box.height <= 0) return null;
        const edge = box.top + (box.height * BAND_PERCENT) / 100;
        let low = 0;
        let high = bubbles.length - 1;
        let found = 0;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (bubbles[mid]!.getBoundingClientRect().top < edge) {
                found = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return bubbles[found]!.getAttribute('message-id');
    }

    private _setCurrent(id: string | null): void {
        if (this._currentId === id) return;
        this._currentId = id;
        for (const tick of this.querySelectorAll<HTMLElement>('.aparte-scroll-rail__tick')) {
            if (tick.dataset['messageId'] === id) {
                tick.setAttribute('aria-current', 'true');
                this._reveal(tick);
            } else {
                tick.removeAttribute('aria-current');
            }
        }
        this._syncTabStop();
    }

    /**
     * One Tab stop for the whole rail, as in a toolbar: the tick that has the focus, else
     * the current one, else the last. Every tick was a button in the tab order, so a
     * keyboard reader crossed 500 of them between the transcript and the composer of a
     * long conversation; the arrows, Home and End walk the rail instead.
     */
    private _syncTabStop(): void {
        const ticks = Array.from(this.querySelectorAll<HTMLElement>('.aparte-scroll-rail__tick'));
        if (ticks.length === 0) return;
        const focused = activeElementIn(this);
        const stop = (focused instanceof HTMLElement && ticks.includes(focused) ? focused : undefined)
            ?? ticks.find((t) => t.dataset['messageId'] === this._currentId)
            ?? ticks[ticks.length - 1]!;
        this._setTabStop(stop, ticks);
    }

    private _setTabStop(stop: HTMLElement, ticks: HTMLElement[]): void {
        for (const tick of ticks) {
            const wanted = tick === stop ? 0 : -1;
            if (tick.tabIndex !== wanted) tick.tabIndex = wanted;
        }
    }

    /** Past the floor the rail scrolls itself: the current tick is kept inside its window. */
    private _reveal(tick: HTMLElement): void {
        const room = this.clientHeight;
        if (!room) return;
        const top = tick.offsetTop;
        const bottom = top + tick.offsetHeight;
        if (top < this.scrollTop) this.scrollTop = top;
        else if (bottom > this.scrollTop + room) this.scrollTop = bottom - room;
    }

    // ─── Geometry ─────────────────────────────────────────────────────────

    /** Write a custom property on this element only when its value changed; '' removes it. */
    private _write(name: string, value: string): void {
        if (this._written.get(name) === value) return;
        this._written.set(name, value);
        if (value) this.style.setProperty(name, value);
        else this.style.removeProperty(name);
    }

    /**
     * The three measurements the stylesheet positions the rail by, and the pitch.
     *
     * The scrollbar: `offsetWidth − clientWidth` of the scroll surface is the width of a
     * classic bar and 0 for an overlay one, so the rail sits clear of the bar exactly
     * where there is one. The extent: the transcript's box within the host, so the rail
     * spans the messages and not the composer under them. The pitch: the stylesheet's
     * 24px targets whenever `count × 24` fits the rail; otherwise the pitch that does,
     * never under `MIN_PITCH` — the rail sets `--aparte-scroll-rail-hit-size` on itself
     * and the gap, the padding and the zone all follow it, as they do for a consumer's
     * value. Past the floor the rail scrolls (`_reveal`), and the arrows still walk it.
     */
    private _layout(): void {
        const host = this._host;
        const viewport = this._viewport();
        const surface = this._scrollSurface();
        if (host && surface) {
            this._write('--aparte-scroll-rail-bar', `${Math.max(0, surface.offsetWidth - surface.clientWidth)}px`);
        }
        if (host && viewport) {
            const v = viewport.getBoundingClientRect();
            const h = host.getBoundingClientRect();
            if (v.height > 0 && h.height > 0) {
                this._write('--aparte-scroll-rail-block-start', `${Math.max(0, Math.round(v.top - h.top))}px`);
                this._write('--aparte-scroll-rail-block-end', `${Math.max(0, Math.round(h.bottom - v.bottom))}px`);
            }
        }
        // The default pitch is the theme's, read above this element so that the value the
        // rail itself wrote is never mistaken for it.
        const above = host ?? document.documentElement;
        const aboveStyle = getComputedStyle(above);
        const hit = parseFloat(aboveStyle.getPropertyValue('--aparte-scroll-rail-hit-size')) || 24;
        const thickness = parseFloat(aboveStyle.getPropertyValue('--aparte-scroll-rail-tick-thickness')) || 2;
        // The room is the rail's ceiling, measured at the theme's pitch: there a list that does
        // not fit is cut at the ceiling, so the rail's height IS the ceiling, whatever sets it —
        // its share of the transcript, a host's border or inner container, a consumer's own
        // max-height. Measured at the tightened pitch, it was the tightened list and the pitch
        // never loosened: a 1000-message conversation, then a 20-message one, kept 6px ticks
        // where 24px fit (Chromium).
        this._write('--aparte-scroll-rail-hit-size', '');
        this._write('--aparte-scroll-rail-gap', '');
        const height = this.clientHeight;
        const count = this._list()?.children.length ?? 0;
        if (!count || !height || count * hit <= height) return;
        const pitch = Math.max(MIN_PITCH, Math.floor(height / count));
        this._write('--aparte-scroll-rail-hit-size', `${pitch}px`);
        // The theme derives the gap from the hit size on `:root`, and a `var()` resolves
        // where the property is DECLARED, not where it is read: the tightened hit size
        // set here would leave the gap at its root value. So the gap is written too.
        this._write('--aparte-scroll-rail-gap', `${Math.max(0, pitch - thickness)}px`);
    }

    // ─── Interaction ──────────────────────────────────────────────────────

    private _onClick = (e: Event): void => {
        const tick = (e.target as HTMLElement).closest<HTMLElement>('.aparte-scroll-rail__tick');
        if (!tick || !this.contains(tick)) return;
        const messageId = tick.dataset['messageId'];
        if (!messageId) return;
        this.jumpTo(messageId);
    };

    /** The ticks are buttons; the arrows walk them, as in any toolbar. */
    private _onKeydown = (e: KeyboardEvent): void => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
        const ticks = Array.from(this.querySelectorAll<HTMLElement>('.aparte-scroll-rail__tick'));
        // The focus as the rail's own tree reports it: `document.activeElement` is the
        // shadow HOST for a rail mounted in a consumer's root, so the index was -1 and
        // every arrow bailed out silently.
        const index = ticks.indexOf(activeElementIn(this) as HTMLElement);
        if (index === -1) return;
        e.preventDefault();
        const next = e.key === 'Home' ? 0
            : e.key === 'End' ? ticks.length - 1
            : e.key === 'ArrowDown' ? Math.min(ticks.length - 1, index + 1)
            : Math.max(0, index - 1);
        const target = ticks[next];
        if (!target) return;
        this._setTabStop(target, ticks);
        target.focus();
    };

    /**
     * Scroll the transcript to a message. Announced first, cancelable; then a
     * `scrollIntoView` on the bubble, smooth unless the reader prefers reduced motion.
     * The clicked tick is the mark until the transcript has stopped moving: while a
     * smooth scroll crosses other questions the band would name each in turn.
     *
     * Where the scroll lands is checked once it has settled, and corrected. The bubbles
     * carry `content-visibility: auto`, so a bubble far from the reader has an estimated
     * height until it is rendered: the scroll aims at an estimate, the bubbles above it
     * take their real size on the way, and the message ends up above or below the top,
     * the further away the worse.
     * A second `scrollIntoView` from a rendered neighbourhood lands; a few are allowed.
     */
    jumpTo(messageId: string): void {
        const announced = this.dispatchEvent(new CustomEvent<AparteScrollRailJumpDetail>('aparte-scroll-rail-jump', {
            detail: { messageId },
            bubbles: true,
            composed: true,
            cancelable: true,
        }));
        if (!announced) return;
        const bubble = this._bubbleOf(messageId);
        if (!bubble) return;
        // The reader chose a message, not the bottom: the follow stops first. Mid-stream a
        // jump into history never rendered shortens the transcript at its first scroll event
        // (the bubbles leave their 320px fallback), which the viewport reads as a clamp of
        // its own — armed, it pinned the reader straight back to the bottom.
        (this._viewport() as (HTMLElement & { setAutoScroll?: (enabled: boolean) => void }) | null)?.setAutoScroll?.(false);
        this._scrollTo(bubble);
        this._setCurrent(messageId);
        this._hold(messageId);
    }

    private _bubbleOf(messageId: string): HTMLElement | null {
        return this._viewport()?.querySelector<HTMLElement>(`aparte-chat-bubble[message-id="${cssEscape(messageId)}"]`) ?? null;  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
    }

    private _scrollTo(bubble: HTMLElement): void {
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        bubble.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    }

    /** Keep `id` as the mark until the scroll surface has been still for `SETTLE_MS`. */
    private _hold(id: string): void {
        this._release();
        this._held = id;
        this._alignPasses = 0;
        this._settleSurface = this._scrollSurface();
        this._settleSurface?.addEventListener('scroll', this._onSurfaceScroll);
        // An instant scroll, or none at all, fires no scroll event: the first timer settles it.
        this._bumpSettle();
    }

    private _bumpSettle(): void {
        if (this._settleTimer !== null) clearTimeout(this._settleTimer);
        this._settleTimer = setTimeout(() => this._settle(), SETTLE_MS);
    }

    /** The transcript is still: land on the message if the scroll did not, else release the hold. */
    private _settle(): void {
        const id = this._held;
        const surface = this._settleSurface;
        const bubble = id ? this._bubbleOf(id) : null;
        if (id && bubble && surface && this._alignPasses < MAX_ALIGN_PASSES) {
            // Measured from where `scrollIntoView` aims: the surface's top, below its scroll
            // padding (`--aparte-top-inset`, a header floating over the transcript).
            const aim = surface.getBoundingClientRect().top + (parseFloat(getComputedStyle(surface).scrollPaddingTop) || 0);
            const off = bubble.getBoundingClientRect().top - aim;
            if (Math.abs(off) > ALIGN_TOLERANCE) {
                this._alignPasses++;
                this._scrollTo(bubble);
                this._bumpSettle();
                return;
            }
        }
        this._release();
        if (id) this._setCurrent(id);
    }

    private _release(): void {
        if (this._settleTimer !== null) clearTimeout(this._settleTimer);
        this._settleTimer = null;
        this._settleSurface?.removeEventListener('scroll', this._onSurfaceScroll);
        this._settleSurface = null;
        this._held = null;
    }
}

/** By local name, which keeps its case in an XHTML document where `tagName` does not upper-case it. */
function isBubble(node: Node): boolean {
    return node instanceof Element && node.localName === 'aparte-chat-bubble';
}

/** A bubble, or an element holding some (the viewport, a wrapper rendered whole): the set of ticks can change. */
function holdsBubbles(nodes: NodeList): boolean {
    return Array.from(nodes).some((n) =>
        n instanceof Element && (isBubble(n) || n.localName === 'aparte-chat-viewport' || n.querySelector('aparte-chat-bubble') !== null));
}

function sameElements(a: HTMLElement[], b: HTMLElement[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

deferHydrationOf(AparteScrollRail);
if (!customElements.get('aparte-scroll-rail')) {
    customElements.define('aparte-scroll-rail', AparteScrollRail);
}
