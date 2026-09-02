import { resolveConfig } from '../../config/index.js';
import { cssEscape } from '../../utils/css-escape.js';

/** Detail of `aparte-scroll-rail-jump`: the message a tick points at. */
export interface AparteScrollRailJumpDetail {
    messageId: string;
}

/** What a tick is drawn for: one per user turn (the default), or one per message. */
export type AparteScrollRailEvery = 'user' | 'message';

const EXCERPT_LENGTH = 60;

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
 * host): the stylesheet floats it on the transcript's end edge, vertically centred, and
 * hides it under a coarse pointer, where a 2px tick is not a target. Under two ticks it
 * renders nothing — a rail with one mark says nothing.
 *
 * @element aparte-scroll-rail
 *
 * @attr {string} target - The id of the `<aparte-chat>` to follow, when the element is not inside it.
 * @attr {string} every - `user` (default): one tick per user turn. `message`: one per message.
 * @attr {boolean} data-empty - Reflected BY the element while it has fewer than two ticks. Read-only.
 *
 * @fires {CustomEvent<AparteScrollRailJumpDetail>} aparte-scroll-rail-jump - A tick was activated. Bubbles, cancelable: `preventDefault()` leaves the transcript where it is.
 *
 * @cssprop [--aparte-scroll-rail-width=calc(var(--aparte-scroll-rail-tick-size) * 1.6)] - The rail's column, the ticks right-aligned in it.
 * @cssprop [--aparte-scroll-rail-tick-size=14px] - Length of a tick; the current one is 1.6× that.
 * @cssprop [--aparte-scroll-rail-tick-thickness=2px] - Thickness of a tick.
 * @cssprop [--aparte-scroll-rail-gap=8px] - Space between ticks.
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
    private _intersections: IntersectionObserver | null = null;
    private _rebuildQueued = false;
    private _currentId: string | null = null;
    /** Visible ratio per message id, from the intersection observer. */
    private _visible = new Map<string, number>();

    private _onConfigChange = (): void => this._rebuild();

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
        // rail on some frameworks.
        if (typeof MutationObserver !== 'undefined') {
            this._mutations = new MutationObserver(() => this._queueRebuild());
            this._mutations.observe(this._host, { childList: true, subtree: true, characterData: true });
        }
        this._rebuild();
    }

    private _detach(): void {
        this._mutations?.disconnect();
        this._mutations = null;
        this._intersections?.disconnect();
        this._intersections = null;
        this._visible.clear();
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

    private _rebuild(): void {
        const bubbles = this._bubbles();
        const locale = resolveConfig(this).getLocale();
        this.setAttribute('aria-label', locale.scrollRailLabel ?? 'Conversation outline');

        if (bubbles.length < 2) {
            this.setAttribute('data-empty', '');
            this.replaceChildren();
            this._intersections?.disconnect();
            this._intersections = null;
            this._visible.clear();
            this._currentId = null;
            return;
        }
        this.removeAttribute('data-empty');

        const list = document.createElement('ol');
        list.className = 'aparte-scroll-rail__list';
        const known = new Set<string>();
        for (const bubble of bubbles) {
            const id = bubble.getAttribute('message-id')!;
            known.add(id);
            const item = document.createElement('li');
            const tick = document.createElement('button');
            tick.type = 'button';
            tick.className = 'aparte-scroll-rail__tick';
            tick.dataset['messageId'] = id;
            const label = this._tickLabel(bubble);
            tick.setAttribute('aria-label', label);
            tick.title = label;
            if (id === this._currentId) tick.setAttribute('aria-current', 'true');
            item.appendChild(tick);
            list.appendChild(item);
        }
        this.replaceChildren(list);

        if (this._currentId && !known.has(this._currentId)) this._currentId = null;
        this._observe(bubbles);
    }

    /**
     * Which tick is current is read, not computed: the scroll surface is the root, and
     * the bubble with the largest visible share of a reading band near the top wins.
     * Scroll arithmetic was the alternative, and every scroll-position rule in the
     * viewport carries a regression note — this one has none to carry.
     */
    private _observe(bubbles: HTMLElement[]): void {
        this._intersections?.disconnect();
        this._intersections = null;
        this._visible.clear();
        if (typeof IntersectionObserver === 'undefined') return;
        const root = this._scrollSurface();
        if (!root) return;
        this._intersections = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const id = (entry.target as HTMLElement).getAttribute('message-id');
                if (id) this._visible.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
            }
            this._pickCurrent(bubbles);
        }, { root, rootMargin: '-15% 0px -55% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });
        for (const bubble of bubbles) this._intersections.observe(bubble);
    }

    private _pickCurrent(bubbles: HTMLElement[]): void {
        let best: string | null = null;
        let bestRatio = 0;
        for (const bubble of bubbles) {
            const id = bubble.getAttribute('message-id')!;
            const ratio = this._visible.get(id) ?? 0;
            if (ratio > bestRatio) {
                bestRatio = ratio;
                best = id;
            }
        }
        // Nothing in the band (a reply taller than the band, or the very bottom): keep
        // the last mark rather than clearing it.
        if (best !== null) this._setCurrent(best);
    }

    private _setCurrent(id: string | null): void {
        if (this._currentId === id) return;
        this._currentId = id;
        for (const tick of this.querySelectorAll<HTMLElement>('.aparte-scroll-rail__tick')) {
            if (tick.dataset['messageId'] === id) tick.setAttribute('aria-current', 'true');
            else tick.removeAttribute('aria-current');
        }
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
     */
    jumpTo(messageId: string): void {
        const announced = this.dispatchEvent(new CustomEvent<AparteScrollRailJumpDetail>('aparte-scroll-rail-jump', {
            detail: { messageId },
            bubbles: true,
            composed: true,
            cancelable: true,
        }));
        if (!announced) return;
        const viewport = this._viewport();
        const bubble = viewport?.querySelector<HTMLElement>(`aparte-chat-bubble[message-id="${cssEscape(messageId)}"]`);  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
        if (!bubble) return;
        const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        bubble.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
        this._setCurrent(messageId);
    }
}

if (!customElements.get('aparte-scroll-rail')) {
    customElements.define('aparte-scroll-rail', AparteScrollRail);
}
