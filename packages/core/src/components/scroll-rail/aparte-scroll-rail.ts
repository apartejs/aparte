import { resolveConfig } from '../../config/index.js';
import { cssEscape } from '../../utils/css-escape.js';

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
 * jump. Honoured by core alone, so it is live by default (ratified decision #8, tier a).
 *
 * Place it as a direct child of `<aparte-chat>` (or the wrapper's `[data-aparte-chat]`
 * host): the stylesheet floats it on the transcript's end edge, centred on the transcript
 * and clear of a classic scrollbar, and hides it under a coarse pointer, where a 2px
 * tick is not a target. Under two ticks it renders nothing — a rail with one mark says
 * nothing. It is a list, not a minimap: it takes the height of its ticks, up to a share
 * of the transcript (`--aparte-scroll-rail-share`, 60%). When more turns exist than 24px
 * targets fit in that, the pitch tightens to what fits, down to a 6px floor; past that
 * the rail scrolls itself so the current tick is always in view, and the arrow keys walk
 * every tick whatever the pitch.
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
    /** The scroll surface the observer is rooted on, and whose bottom edge is read. */
    private _observedSurface: HTMLElement | null = null;
    private _rebuildQueued = false;
    private _pickQueued = false;
    private _currentId: string | null = null;
    /** Visible ratio per message id in the reading band, from the intersection observer. */
    private _visible = new Map<string, number>();
    /** The bubbles on screen at all, from the second observer; only the last one is read. */
    private _onScreen = new Set<string>();
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
        if (typeof MutationObserver !== 'undefined') {
            this._mutations = new MutationObserver((records) => {
                if (records.some((record) => !this.contains(record.target))) this._queueRebuild();
            });
            this._mutations.observe(this._host, { childList: true, subtree: true, characterData: true });
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

    /** Coalesce a burst of mutations (a streaming reply is one per token) into one rebuild. */
    private _queueRebuild(): void {
        if (this._rebuildQueued) return;
        this._rebuildQueued = true;
        requestAnimationFrame(() => {
            this._rebuildQueued = false;
            this._rebuild();
        });
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

    private _bubbles(): HTMLElement[] {
        const viewport = this._viewport();
        if (!viewport) return [];
        const every: AparteScrollRailEvery = this.getAttribute('every') === 'message' ? 'message' : 'user';
        const all = Array.from(viewport.querySelectorAll<HTMLElement>('aparte-chat-bubble[message-id]'));
        return every === 'message' ? all : all.filter((b) => b.getAttribute('data-role') === 'user');
    }

    // ─── Rendering ────────────────────────────────────────────────────────

    /** The first words of a message, for the tick's name. An excerpt, never a summary. */
    private _excerpt(bubble: HTMLElement): string {
        const body = bubble.querySelector<HTMLElement>('.aparte-message-content') ?? bubble;
        const text = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
        return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…` : text;
    }

    private _tickLabel(bubble: HTMLElement): string {
        const locale = resolveConfig(this).getLocale();
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
        const bubbles = this._bubbles();
        const locale = resolveConfig(this).getLocale();
        this.setAttribute('aria-label', locale.scrollRailLabel ?? 'Conversation outline');

        if (bubbles.length < 2) {
            this.setAttribute('data-empty', '');
            this.replaceChildren();
            this._unobserve();
            this._currentId = null;
            this._write('--aparte-scroll-rail-hit-size', '');
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
        const known = new Set<string>();
        let index = 0;
        for (const bubble of bubbles) {
            const id = bubble.getAttribute('message-id')!;
            known.add(id);
            let item = existing.get(id);
            if (item) {
                existing.delete(id);
            } else {
                item = document.createElement('li');
                const tick = document.createElement('button');
                tick.type = 'button';
                tick.className = 'aparte-scroll-rail__tick';
                tick.dataset['messageId'] = id;
                item.appendChild(tick);
            }
            const tick = item.firstElementChild as HTMLElement;
            const label = this._tickLabel(bubble);
            if (tick.getAttribute('aria-label') !== label) {
                tick.setAttribute('aria-label', label);
                tick.title = label;
            }
            if (id === this._currentId) tick.setAttribute('aria-current', 'true');
            else tick.removeAttribute('aria-current');
            const at = list.children[index] ?? null;
            if (at !== item) list.insertBefore(item, at);
            index++;
        }
        for (const stale of existing.values()) stale.remove();

        if (this._currentId && !known.has(this._currentId)) this._currentId = null;
        if (!sameElements(this._observedBubbles, bubbles)) this._observe(bubbles);
        this._layout();
    }

    /**
     * Which tick is current is read, not computed: the scroll surface is the root and an
     * intersection observer reports which bubbles reach a reading band — the top 30% of
     * the surface, from its very top so that the bubble a jump aligned there counts. The
     * rule is a scrollspy's: the LAST question that has reached the band is the one the
     * reader is under. "The largest visible share" was the rule before, and at the bottom
     * of a thread of short turns, where three questions sit in the band, it named the
     * first of them. Scroll arithmetic was the alternative, and every scroll-position
     * rule in the viewport carries a regression note; the one read here is the bottom,
     * because at the bottom the reader is under the latest question whatever the band
     * holds, and the observer has nothing to report on the last few pixels.
     */
    private _observe(bubbles: HTMLElement[]): void {
        this._unobserve();
        this._observedBubbles = bubbles;
        if (typeof IntersectionObserver === 'undefined') return;
        const root = this._scrollSurface();
        if (!root) return;
        this._intersections = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const id = (entry.target as HTMLElement).getAttribute('message-id');
                if (id) this._visible.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
            }
            this._pickCurrent();
        }, { root, rootMargin: '0px 0px -70% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
        // The whole surface, for one question only: the last. While the end of the thread
        // is on screen the reader is at the end, whatever the band holds — after a send,
        // the viewport rests with the new question low on the screen and older ones in
        // the band, and a rail marking the question above the one just asked is wrong.
        this._onScreenObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const id = (entry.target as HTMLElement).getAttribute('message-id');
                if (!id) continue;
                if (entry.isIntersecting) this._onScreen.add(id);
                else this._onScreen.delete(id);
            }
            this._pickCurrent();
        }, { root, threshold: [0] });
        for (const bubble of bubbles) {
            this._intersections.observe(bubble);
            this._onScreenObserver.observe(bubble);
        }
        this._observedSurface = root;
        root.addEventListener('scroll', this._onRootScroll, { passive: true });
    }

    private _unobserve(): void {
        this._intersections?.disconnect();
        this._intersections = null;
        this._onScreenObserver?.disconnect();
        this._onScreenObserver = null;
        this._observedSurface?.removeEventListener('scroll', this._onRootScroll);
        this._observedSurface = null;
        this._observedBubbles = [];
        this._visible.clear();
        this._onScreen.clear();
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
        const lastId = bubbles[bubbles.length - 1]!.getAttribute('message-id')!;
        if (this._atBottom() || this._onScreen.has(lastId)) {
            this._setCurrent(lastId);
            return;
        }
        let last: string | null = null;
        for (const bubble of bubbles) {
            const id = bubble.getAttribute('message-id')!;
            if ((this._visible.get(id) ?? 0) > 0) last = id;
        }
        // Nothing in the band (the reader is deep in one reply): keep the last mark
        // rather than clearing it.
        if (last !== null) this._setCurrent(last);
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
        const count = this._list()?.children.length ?? 0;
        const height = this.clientHeight;
        if (!count || !height) {
            this._write('--aparte-scroll-rail-hit-size', '');
            this._write('--aparte-scroll-rail-gap', '');
            return;
        }
        // The default pitch is the theme's, read above this element so that the value the
        // rail itself wrote is never mistaken for it.
        const above = host ?? document.documentElement;
        const aboveStyle = getComputedStyle(above);
        const hit = parseFloat(aboveStyle.getPropertyValue('--aparte-scroll-rail-hit-size')) || 24;
        const thickness = parseFloat(aboveStyle.getPropertyValue('--aparte-scroll-rail-tick-thickness')) || 2;
        if (count * hit <= height) {
            this._write('--aparte-scroll-rail-hit-size', '');
            this._write('--aparte-scroll-rail-gap', '');
            return;
        }
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
        const index = ticks.indexOf(document.activeElement as HTMLElement);
        if (index === -1) return;
        e.preventDefault();
        const next = e.key === 'Home' ? 0
            : e.key === 'End' ? ticks.length - 1
            : e.key === 'ArrowDown' ? Math.min(ticks.length - 1, index + 1)
            : Math.max(0, index - 1);
        ticks[next]?.focus();
    };

    /**
     * Scroll the transcript to a message. Announced first, cancelable; then a
     * `scrollIntoView` on the bubble, smooth unless the reader prefers reduced motion.
     * The clicked tick is the mark until the transcript has stopped moving: while a
     * smooth scroll crosses other questions the band would name each in turn, and it
     * ended on the wrong one two times in three before this hold.
     *
     * Where the scroll lands is checked once it has settled, and corrected. The bubbles
     * carry `content-visibility: auto`, so a bubble far from the reader has an estimated
     * height until it is rendered: the scroll aims at an estimate, the bubbles above it
     * take their real size on the way, and the message ends up above or below the top —
     * measured from 36px to 1,213px off, in all three engines, the further the worse.
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
            const off = bubble.getBoundingClientRect().top - surface.getBoundingClientRect().top;
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

function sameElements(a: HTMLElement[], b: HTMLElement[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

if (!customElements.get('aparte-scroll-rail')) {
    customElements.define('aparte-scroll-rail', AparteScrollRail);
}
