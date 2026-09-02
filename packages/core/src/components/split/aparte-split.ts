import { resolveConfig } from '../../config/index.js';
import { nextPosition, keyDelta } from './geometry.js';
import { presenceOn } from '../../utils/presence.js';

/** Detail of `aparte-split-resize`: the position that settled, and what settled it. */
export interface AparteSplitResizeDetail {
    /** The achieved size of the primary pane, as a percentage of the container. */
    position: number;
    /** The primary pane is folded to its minimum. */
    collapsed: boolean;
    /** The split is showing one pane — under its breakpoint, or told to by `single`. */
    stacked: boolean;
    /** Which pane is shown while stacked. */
    pane: 'start' | 'end';
    /** The container's axis, as the `orientation` attribute names it. */
    orientation: 'horizontal' | 'vertical';
    /** What moved it: a drag, a key, or the host setting the property. */
    source: 'pointer' | 'keyboard' | 'api';
}

/** The window width under which the split shows one pane. Mirrored in `split.css`'s siblings. */
const STACK_QUERY = '(max-width: 48rem)';

/** The primary pane's size when nothing else says — the same number `theme.css` declares. */
const DEFAULT_POSITION = 38;

/**
 * How long a retired drag overlay stays in the document after it goes inert. Long
 * enough to outlive the `click` and `dblclick` a press produces on any engine, short
 * enough that nothing accumulates. See `_removeScrim`.
 */
const SCRIM_RETIRE_MS = 300;

/** Keep a percentage inside 0..100; anything unreadable answers `fallback`. */
function toPercent(raw: string | null | undefined, fallback: number): number {
    const value = Number.parseFloat(raw ?? '');
    if (!Number.isFinite(value)) return fallback;
    return value < 0 ? 0 : value > 100 ? 100 : value;
}

/**
 * Two panes and a draggable seam — a chat beside a preview, an editor, an artifact card.
 *
 * The grid is the mechanism: `--aparte-split-position` is the primary pane's size and
 * the min/max are CSS clamp bounds, so the browser clamps and nothing here parses a
 * unit. The element adds only what CSS cannot do — the drag, the arrow keys, the ARIA
 * of an APG window splitter, and one pane at a time under a breakpoint. Without the
 * element the `.aparte-split` recipe is still a split; it just does not move.
 *
 * It stores nothing: `position` in, one `aparte-split-resize` out on commit. The
 * attribute is written on COMMIT only — a release, a key up, a double-click, a property
 * set — and the live value during a drag travels on the custom property, so a
 * framework's reconciler is not in the drag loop. Persist from the event; restore by
 * setting `position`.
 *
 * A pane CONTAINS a chat; a chat never contains a split.
 *
 * `aria-orientation` on the handle is the INVERSE of this element's `orientation`: the
 * attribute names the SEPARATOR's own axis, which is what the APG means by "Left Arrow
 * moves a vertical splitter" and what ARIA 1.2 means by the attribute. Do not "fix" it —
 * consumers style against it.
 *
 * Shift + an arrow is ±10%. That is an ecosystem convention, not the APG, which
 * specifies the single step alone.
 *
 * @element aparte-split
 *
 * @attr {number} position - The primary pane's size, as a percentage of the container. Reflected on commit, never per drag frame.
 * @attr {string} orientation - `horizontal` (panes side by side, the default) or `vertical` (stacked). Names the CONTAINER's axis.
 * @attr {string} primary - `start` (default) or `end`: which pane `position` sizes.
 * @attr {boolean} collapsed - The primary pane folded to its minimum. Enter on the seam toggles it; a second Enter restores the size it had.
 * @attr {string} breakpoint - Below this width the split shows one pane at a time. A length (default `48rem`), or `none` to never stack.
 * @attr {string} pane - `start` (default) or `end`: which pane is shown while stacked.
 * @attr {boolean} single - Show one pane — the one `pane` names — whatever the width: the seam and the other pane are gone, as under the breakpoint. For a host that decides itself when a second pane exists (a preview with nothing to preview yet). `collapsed` is not this: it folds the primary pane to `--aparte-split-min` and keeps the seam. The CSS route, `.aparte-split--only-start` / `--only-end`, is the same state for a host that owns its breakpoints.
 * @attr {boolean} disabled - No drag, no keys, no tab stop; the seam stays drawn.
 * @attr {string} label - The seam's accessible name. Defaults to the locale's `splitHandleLabel`.
 * @attr {boolean} data-stacked - Written BY the element while one pane is shown. Read-only; style against it.
 *
 * @fires {CustomEvent<AparteSplitResizeDetail>} aparte-split-resize - The position settled: after a drag, a key, a double-click or a property set. Never during a drag — persist from here.
 *
 * @cssprop [--aparte-split-position=38%] - The primary pane's size.
 * @cssprop [--aparte-split-min=min(20rem, 100%)] - Floor of the primary pane. Any length or percentage.
 * @cssprop [--aparte-split-max=60%] - Ceiling of the primary pane.
 * @cssprop [--aparte-split-handle-size=12px] - The seam's track: the grab zone, and what the grid reserves between the panes. The painted line inside it is `--aparte-split-seam-width`.
 * @cssprop [--aparte-split-hit-area=12px] - The invisible grab zone around it. Grows to the touch target on a coarse pointer.
 *
 * @example
 * <!-- The chat in one pane, your own in the other. Drag the seam, or tab to it and use
 *      the arrows; double-click resets it. `--aparte-split-min` is a CSS length, so the
 *      chat cannot be dragged narrower than 16rem whatever the percentage says. Under
 *      48rem of window the split shows one pane, and the buttons switch it. -->
 * <div class="aparte-app-header">
 *   <button class="aparte-btn aparte-btn--sm aparte-btn--surface" type="button" data-aparte-split-pane="start">Chat</button>
 *   <button class="aparte-btn aparte-btn--sm aparte-btn--surface" type="button" data-aparte-split-pane="end">Preview</button>
 * </div>
 * <aparte-split position="38" style="height: 22rem; --aparte-split-min: 16rem">
 *   <aparte-chat>
 *     <aparte-chat-viewport></aparte-chat-viewport>
 *     <aparte-composer>
 *       <div class="aparte-composer-shell">
 *         <div class="aparte-composer-row">
 *           <aparte-composer-input></aparte-composer-input>
 *           <aparte-composer-send></aparte-composer-send>
 *         </div>
 *       </div>
 *     </aparte-composer>
 *   </aparte-chat>
 *   <section class="aparte-split__pane">
 *     <iframe title="Preview" style="inline-size: 100%; block-size: 100%; border: 0" srcdoc="<h1>Your pane</h1>"></iframe>
 *   </section>
 * </aparte-split>
 * <script>
 *   document.querySelector('aparte-split').addEventListener('aparte-split-resize', (e) => {
 *     localStorage.setItem('split', String(e.detail.position));
 *   });
 * </script>
 */
export class AparteSplit extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['position', 'orientation', 'primary', 'collapsed', 'breakpoint', 'pane', 'disabled', 'label', 'single'];
    }

    private _handle: HTMLElement | null = null;
    private _scrim: HTMLElement | null = null;
    private _media: MediaQueryList | null = null;
    private _observer: ResizeObserver | null = null;
    /** The pending `_measureBounds()` from a resize, batched to one per frame. */
    private _measureRafId: number | null = null;
    /** The host size the last resize tick measured, so an unchanged one does nothing. */
    private _observedPx = 0;

    /** Ids for the panes `aria-controls` names — a counter, the way the primitives do it. */
    private static _paneIdSeq = 0;

    /** The live position. The attribute holds it only after a commit. */
    private _position = DEFAULT_POSITION;
    /** What `reset()` — and a double-click on the seam — goes back to. */
    private _initialPosition = DEFAULT_POSITION;
    /**
     * `_initialPosition` has been taken from the markup once. A re-parent runs
     * `connectedCallback` again, and by then the attribute holds the LAST COMMIT, not
     * what the author wrote: capturing a second time makes a framework re-render, a tab
     * switch or a drag-and-drop of the panel redefine what "reset" means.
     */
    private _initialCaptured = false;
    /** The size the primary pane had before it was collapsed, for the second Enter. */
    private _preCollapsePosition: number | null = null;

    /** Committed values, so a reflection of our own does not read as a host's change. */
    private _lastPosition: number | null = null;
    private _lastCollapsed: boolean | null = null;
    private _lastPane: 'start' | 'end' | null = null;

    /** What an attribute-driven commit blames. Raised around a key that changes state. */
    private _source: AparteSplitResizeDetail['source'] = 'api';

    /**
     * `connectedCallback` has run and the element knows what its markup asked for.
     *
     * Not `isConnected`: during an UPGRADE the element is already in the document, so
     * `attributeChangedCallback` fires for every authored attribute — connected, and
     * before `connectedCallback` — which is the ordinary case for a server-rendered
     * `<aparte-split position="38">` upgraded when the module loads. Committing there
     * measures a layout the element has not set up yet (no `data-stacked`, so on a
     * phone the probe reads the stacked pane and writes `position="84"`), reflects that
     * over the authored number, and sends it to whatever the host persists.
     */
    private _ready = false;

    private _dragging = false;
    private _captured = false;
    /** The gesture actually moved the seam. A press that did not commits nothing. */
    private _moved = false;
    private _pointerId: number | null = null;
    private _dragStartPercent = DEFAULT_POSITION;
    private _dragOriginPx = 0;
    private _dragContainerPx = 0;
    /** A key is down and has moved the seam; its keyup is the commit. */
    private _keying = false;

    // ─── Properties ───────────────────────────────────────────────────────

    /** The primary pane's size, as a percentage of the container. Setting it commits. */
    get position(): number {
        return this._position;
    }

    set position(value: number) {
        const next = toPercent(String(value), this._position);
        if (this.isConnected && next === this._lastPosition) return;
        this._position = next;
        this._setLive(next);
        if (this.isConnected) this._commit('api');
    }

    /** The container's axis: `horizontal` (side by side) or `vertical` (stacked). */
    get orientation(): 'horizontal' | 'vertical' {
        return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
    }

    set orientation(value: 'horizontal' | 'vertical') {
        this.setAttribute('orientation', value);
    }

    /** Which pane `position` sizes. */
    get primary(): 'start' | 'end' {
        return this.getAttribute('primary') === 'end' ? 'end' : 'start';
    }

    set primary(value: 'start' | 'end') {
        this.setAttribute('primary', value);
    }

    /** The primary pane is folded to its minimum. */
    get collapsed(): boolean {
        return this.hasAttribute('collapsed');
    }

    set collapsed(value: boolean) {
        this.toggleAttribute('collapsed', presenceOn(value));
    }

    /** Which pane is shown while the split is stacked. */
    get pane(): 'start' | 'end' {
        return this.getAttribute('pane') === 'end' ? 'end' : 'start';
    }

    set pane(value: 'start' | 'end') {
        this.setAttribute('pane', value);
    }

    /** No drag, no keys, no tab stop. The seam stays drawn. */
    get disabled(): boolean {
        return this.hasAttribute('disabled');
    }

    set disabled(value: boolean) {
        this.toggleAttribute('disabled', presenceOn(value));
    }

    /**
     * True while the split is showing one pane. Read-only.
     *
     * Both routes into that state count. `data-stacked` is the one this element writes
     * from its own breakpoint; `.aparte-split--only-start` / `--only-end` are the CSS
     * route a host takes when it owns its breakpoints and sets `breakpoint="none"`. The
     * sheet gives the two byte-identical rules, so the element has to read them the same
     * way — every guard downstream keys on this getter, and a split stacked by the class
     * alone would measure a one-track grid and commit `position="100"`.
     */
    get stacked(): boolean {
        return (
            this.hasAttribute('data-stacked')
            || this.hasAttribute('single')
            || this.classList.contains('aparte-split--only-start')
            || this.classList.contains('aparte-split--only-end')
        );
    }

    /** One pane on demand, whatever the width (#54). Reflected. */
    get single(): boolean {
        return this.hasAttribute('single');
    }

    set single(value: boolean) {
        this.toggleAttribute('single', presenceOn(value));
    }

    // ─── Public API ───────────────────────────────────────────────────────

    /** Fold the primary pane to its minimum, remembering the size it had. */
    collapse(): void {
        this.collapsed = true;
    }

    /** Unfold it, back to the size it had before it collapsed. */
    expand(): void {
        this.collapsed = false;
    }

    toggleCollapse(): void {
        this.collapsed = !this.collapsed;
    }

    /** Show one pane, which only has a visible effect while the split is stacked. */
    showPane(which: 'start' | 'end'): void {
        this.pane = which;
    }

    /**
     * Back to the position the split was FIRST connected with — a re-parent restores
     * that, it does not redefine it. What a double-click on the seam does.
     */
    reset(): void {
        this._position = this._initialPosition;
        this._setLive(this._position);
        if (this.isConnected) this._commit('api');
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────

    connectedCallback(): void {
        if (!this.classList.contains('aparte-split')) this.classList.add('aparte-split');
        this._handle = this._ensureHandle();

        const attr = this.getAttribute('position');
        if (attr !== null) {
            this._position = toPercent(attr, DEFAULT_POSITION);
            this._setLive(this._position);
        } else {
            // No attribute: adopt whatever the cascade already resolves to, and write
            // nothing. That is the server-rendered case — a split styled from CSS alone
            // must not snap to a JS default the moment the element upgrades.
            this._position = toPercent(
                getComputedStyle(this).getPropertyValue('--aparte-split-position'),
                DEFAULT_POSITION,
            );
        }
        if (!this._initialCaptured) {
            this._initialPosition = this._position;
            this._initialCaptured = true;
        }
        // A `collapsed` present in the markup is applied HERE, not by the attribute
        // callback: that one fires during upgrade, before this runs, and early-returns
        // on `!_ready`. Without this the attribute and the render disagree from the
        // first frame — server-rendered `<aparte-split collapsed>` came up open.
        if (this.collapsed) {
            // …but only if it is arriving folded, not COMING BACK folded. `_lastCollapsed`
            // survives `disconnectedCallback` and is reassigned four lines down, so here
            // it still answers "was it folded when it left" — and a split that left folded
            // has `position="0"` on it, so capturing again would record 0 as the size to
            // restore and `expand()` would reopen onto nothing.
            if (this._lastCollapsed !== true) this._preCollapsePosition = this._position;
            this._position = 0;
            this._setLive(0);
        }
        this._lastPosition = this._position;
        this._lastCollapsed = this.collapsed;
        this._lastPane = this.pane;

        this._stampHandle();
        this._relabel();
        this._measureBounds();

        this._handle.addEventListener('pointerdown', this._onPointerDown);
        this._handle.addEventListener('dblclick', this._onDoubleClick);
        this._handle.addEventListener('focusout', this._onFocusOut);
        this.addEventListener('keydown', this._onKeydown);
        this.addEventListener('keyup', this._onKeyup);
        document.addEventListener('click', this._onDocumentClick);
        window.addEventListener('aparte-config-change', this._onConfigChange);
        this._watchBreakpoint();
        this._watchSize();
        // Last: everything above reads the markup directly, and until it has run an
        // attribute change is the upgrade replaying what the author already wrote.
        this._ready = true;
    }

    disconnectedCallback(): void {
        this._handle?.removeEventListener('pointerdown', this._onPointerDown);
        this._handle?.removeEventListener('dblclick', this._onDoubleClick);
        this._handle?.removeEventListener('focusout', this._onFocusOut);
        this.removeEventListener('keydown', this._onKeydown);
        this.removeEventListener('keyup', this._onKeyup);
        document.removeEventListener('click', this._onDocumentClick);
        window.removeEventListener('aparte-config-change', this._onConfigChange);
        this._releasePointer();
        this._media?.removeEventListener('change', this._onMediaChange);
        this._media = null;
        this._observer?.disconnect();
        this._observer = null;
        if (this._measureRafId !== null) {
            cancelAnimationFrame(this._measureRafId);
            this._measureRafId = null;
        }
        // A scrim left behind is fixed, full-page and transparent: the whole document
        // would go dead to the pointer with nothing on screen to explain it.
        this._removeScrim();
        this._handle?.removeAttribute('data-dragging');
        this._dragging = false;
        this._keying = false;
        this._ready = false;
    }

    attributeChangedCallback(name: string): void {
        if (!this._ready) return;
        switch (name) {
            case 'position': {
                const next = toPercent(this.getAttribute('position'), this._position);
                if (next === this._lastPosition) return;
                this._position = next;
                this._setLive(next);
                this._commit();
                return;
            }
            case 'collapsed': {
                const collapsed = this.collapsed;
                if (collapsed === this._lastCollapsed) return;
                this._lastCollapsed = collapsed;
                if (collapsed) {
                    this._preCollapsePosition = this._position;
                    this._position = 0;
                } else {
                    this._position = this._preCollapsePosition ?? this._initialPosition;
                }
                this._setLive(this._position);
                this._commit();
                return;
            }
            case 'pane': {
                const pane = this.pane;
                if (pane === this._lastPane) return;
                this._lastPane = pane;
                this._commit();
                return;
            }
            case 'orientation':
            case 'primary':
                this._stampHandle();
                this._measureBounds();
                return;
            case 'disabled':
                // A drag in flight on a split that just went inert would keep tracking
                // the pointer and commit on release. Cancel it, restoring the value the
                // press started from: the gesture did not finish, so it did not decide.
                if (this.disabled && this._dragging) this._endDrag('pointer', this._dragStartPercent);
                this._stampHandle();
                return;
            case 'single':
                // Same as a breakpoint crossing for the seam: a drag on a split that just
                // went to one pane has nothing left to size.
                if (this.single && this._dragging) this._endDrag('pointer', this._dragStartPercent);
                this._stampHandle();
                return;
            case 'breakpoint':
                this._watchBreakpoint();
                return;
            case 'label':
                this._relabel();
        }
    }

    // ─── Structure ────────────────────────────────────────────────────────

    /**
     * The seam. An author-written `.aparte-split__handle` is ADOPTED — a second one
     * would be a second tab stop drawn over the first — otherwise one is inserted
     * between the first two children, which is where a two-pane grid needs it.
     *
     * An adopted one is MOVED there if the author put it elsewhere. The sheet is
     * positional — three tracks with the seam in the middle, and the stacked rules hide
     * `:nth-child(1)` / `:nth-child(3)` — so a handle written first would take the
     * primary pane's track and make stacking hide the wrong child.
     */
    private _ensureHandle(): HTMLElement {
        const own = Array.from(this.children).find(
            (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('aparte-split__handle'),
        );
        if (own) {
            if (this.children[1] !== own) {
                const second = Array.from(this.children).filter((child) => child !== own)[1] ?? null;
                this.insertBefore(own, second);
            }
            return own;
        }
        const handle = document.createElement('div');
        handle.className = 'aparte-split__handle';
        const second = this.children[1] ?? null;
        if (second) this.insertBefore(handle, second);
        else this.appendChild(handle);
        return handle;
    }

    /** The panes: every element child that is not the seam. */
    private _panes(): HTMLElement[] {
        return Array.from(this.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement && !child.classList.contains('aparte-split__handle'),
        );
    }

    private _primaryPane(): HTMLElement | null {
        const panes = this._panes();
        return (this.primary === 'end' ? panes[panes.length - 1] : panes[0]) ?? null;
    }

    /**
     * The APG's window splitter, plus the two states that take it out of the tab order.
     *
     * `aria-orientation` is the INVERSE of `orientation`: the attribute names the
     * separator's own axis, so a split whose panes sit side by side has a VERTICAL
     * separator between them.
     */
    private _stampHandle(): void {
        const handle = this._handle;
        if (!handle) return;
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', this.orientation === 'vertical' ? 'horizontal' : 'vertical');
        if (this.disabled || this.stacked) handle.removeAttribute('tabindex');
        else handle.setAttribute('tabindex', '0');
        // The ACHIEVED size, never the requested one — `_stampHandle` runs again after
        // every `_measureBounds`, so announcing the request here would undo the
        // reconciliation and put valuenow back outside the range it just published.
        handle.setAttribute('aria-valuenow', String(Math.round(this._achievedPercent())));
        const pane = this._primaryPane();
        if (pane) {
            if (!pane.id) pane.id = `aparte-split-pane-${++AparteSplit._paneIdSeq}`;
            handle.setAttribute('aria-controls', pane.id);
        }
    }

    // ─── Measurement ──────────────────────────────────────────────────────

    private _measure(el: Element): number {
        const box = el.getBoundingClientRect();
        return this.orientation === 'vertical' ? box.height : box.width;
    }

    /**
     * What the pane ACTUALLY got, which is not what was asked for: the CSS clamp between
     * `--aparte-split-min` and `--aparte-split-max` has the last word, and announcing the
     * requested value instead is how a splitter comes to tell a screen reader 5% while
     * the pane sits at 22%. Without layout (jsdom, `display: none`, before first paint)
     * the request is all there is, so it stands.
     *
     * While STACKED there is nothing to read: one pane is `display: none` and the other
     * spans the single track, so the ratio is 0 or 100 whatever the seam was set to.
     * Measuring it there is how tapping "Preview" on a phone used to write `position="0"`
     * into the attribute, the event and the host's storage.
     */
    private _achievedPercent(): number {
        if (this.stacked) return this._position;
        const total = this._measure(this);
        const pane = this._primaryPane();
        if (!pane || !(total > 0)) return this._position;
        return Math.max(0, Math.min(100, (this._measure(pane) / total) * 100));
    }

    /**
     * The range the seam can actually reach, written onto the separator: park the pane
     * at 0% and read it, park it at 100% and read it, put the position back. Two forced
     * layouts in one synchronous task, so nothing paints in between.
     *
     * It also reconciles `aria-valuenow`, because the two have to be one story: the
     * requested percentage can sit outside the clamped range the probe just announced —
     * with a `--aparte-split-min` of `20rem`, `position="38"` on a 700px container asks
     * for 38 and gets ~46 — and a separator whose value is below its own minimum is the
     * unclamped-announcement bug this probe exists to prevent, just at rest. `_position`
     * is left alone: it is the REQUESTED value, and `reset()` means it.
     *
     * Gated on `!_dragging`: a ResizeObserver tick mid-gesture would move the pane to
     * both ends under the pointer. Gated on `!stacked` for the reason
     * `_achievedPercent()` is: a pane that spans everything measures the same at 0% and
     * at 100%, which would announce a range of one number.
     */
    private _measureBounds(): void {
        const handle = this._handle;
        if (!handle || this._dragging || this.stacked) return;
        const pane = this._primaryPane();
        const total = this._measure(this);
        if (!pane || !(total > 0)) {
            handle.setAttribute('aria-valuemin', '0');
            handle.setAttribute('aria-valuemax', '100');
            return;
        }
        const saved = this.style.getPropertyValue('--aparte-split-position');
        this.style.setProperty('--aparte-split-position', '0%');
        const min = (this._measure(pane) / total) * 100;
        this.style.setProperty('--aparte-split-position', '100%');
        const max = (this._measure(pane) / total) * 100;
        if (saved) this.style.setProperty('--aparte-split-position', saved);
        else this.style.removeProperty('--aparte-split-position');
        handle.setAttribute('aria-valuemin', String(Math.round(min)));
        handle.setAttribute('aria-valuemax', String(Math.round(max)));
        handle.setAttribute('aria-valuenow', String(Math.round(this._achievedPercent())));
    }

    /**
     * Re-measure when the container's size changes — and only then. The probe writes the
     * host's `style` three times, and the reflection is commit-only precisely because a
     * `MutationObserver({ attributes: true })` (the docs' preview frame has one) reposts
     * a frame height per mutation, which resizes the split, which re-ticks this observer.
     * So: ignore a tick that did not move the size, and batch the rest to one per frame.
     */
    private _watchSize(): void {
        if (typeof ResizeObserver !== 'function') return;
        this._observer = new ResizeObserver(() => {
            const px = this._measure(this);
            if (Math.abs(px - this._observedPx) <= 1) return;
            this._observedPx = px;
            if (this._measureRafId !== null) return;
            this._measureRafId = requestAnimationFrame(() => {
                this._measureRafId = null;
                this._measureBounds();
            });
        });
        this._observer.observe(this);
    }

    // ─── The one write, and the one event ─────────────────────────────────

    private _setLive(value: number): void {
        this.style.setProperty('--aparte-split-position', `${Math.round(value * 1000) / 1000}%`);
    }

    /**
     * The commit: reflect, announce, dispatch — once. Everything downstream reads the
     * ACHIEVED size, so the attribute, `aria-valuenow` and the detail are one number.
     *
     * There is no per-frame event on purpose. A bubbling, composed CustomEvent per
     * pointermove is a reconciler in the drag loop, and no pane in this repo re-lays
     * itself out in JS — they resize in CSS. The trigger for adding
     * `aparte-split-resizing` is a consumer whose pane needs a JS measurement mid-drag.
     */
    private _commit(source: AparteSplitResizeDetail['source'] = this._source): void {
        const position = Math.round(this._achievedPercent());
        this._position = position;
        this._setLive(position);
        this._lastPosition = position;
        if (this.getAttribute('position') !== String(position)) this.setAttribute('position', String(position));
        this._handle?.setAttribute('aria-valuenow', String(position));
        this.dispatchEvent(
            new CustomEvent<AparteSplitResizeDetail>('aparte-split-resize', {
                detail: {
                    position,
                    collapsed: this.collapsed,
                    stacked: this.stacked,
                    pane: this.pane,
                    orientation: this.orientation,
                    source,
                },
                bubbles: true,
                composed: true,
            }),
        );
    }

    // ─── Pointer ──────────────────────────────────────────────────────────

    /** The computed direction, never `document.dir`: a host can flip one subtree. */
    private _rtl(): boolean {
        return getComputedStyle(this).direction === 'rtl';
    }

    private _onPointerDown = (event: PointerEvent): void => {
        if (this.disabled || this.stacked || this._dragging) return;
        if (event.button > 0) return;
        // Not the browser's default: without this a drag starts a text selection in the
        // pane the pointer crosses. The focus that preventDefault costs is given back
        // below, which Safari would not have given at all.
        event.preventDefault();
        this._handle?.focus();
        this._dragging = true;
        this._captured = false;
        this._moved = false;
        this._pointerId = event.pointerId;
        this._dragStartPercent = this._position;
        this._dragOriginPx = this.orientation === 'vertical' ? event.clientY : event.clientX;
        this._dragContainerPx = this._measure(this);
        this._handle?.setAttribute('data-dragging', '');
        this._addScrim();
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        window.addEventListener('pointercancel', this._onPointerCancel);
    };

    /**
     * Only the pointer that started the gesture. On a hybrid device a hovering pen or a
     * stray touch delivers a `pointermove` with `buttons === 0`, which would otherwise
     * fall into the release branch below and end someone else's mouse drag.
     */
    private _isOurPointer(event: PointerEvent): boolean {
        return this._pointerId === null || event.pointerId === this._pointerId;
    }

    private _onPointerMove = (event: PointerEvent): void => {
        if (!this._dragging || !this._isOurPointer(event)) return;
        // A pointer released over a cross-origin iframe never delivers `pointerup`, so
        // the drag would never end. Checked HERE and only here: on `pointerleave`
        // Firefox reports 0 for a button that is still down, and the drag would end at
        // the first pane the pointer crosses.
        if (event.buttons === 0) {
            this._endDrag('pointer');
            return;
        }
        if (!this._captured && this._pointerId !== null) {
            this._captured = true;
            // Deferred to the FIRST MOVE on purpose. Capturing on pointerdown retargets
            // the pointerup and suppresses the click a dblclick is built from — and
            // double-click is how the seam resets. By the first move the gesture is a
            // drag, not a click, so there is nothing left to suppress.
            try {
                this._handle?.setPointerCapture(this._pointerId);
            } catch {
                // Not every engine has capture for every pointer type; the window
                // listeners are what actually carry the drag.
            }
        }
        const point = this.orientation === 'vertical' ? event.clientY : event.clientX;
        this._position = nextPosition({
            startPercent: this._dragStartPercent,
            deltaPx: point - this._dragOriginPx,
            containerPx: this._dragContainerPx,
            rtl: this._rtl(),
            vertical: this.orientation === 'vertical',
            primaryEnd: this.primary === 'end',
        });
        this._moved = true;
        this._setLive(this._position);
    };

    private _onPointerUp = (event: PointerEvent): void => {
        if (this._isOurPointer(event)) this._endDrag('pointer');
    };

    private _onPointerCancel = (event: PointerEvent): void => {
        if (this._isOurPointer(event)) this._endDrag('pointer');
    };

    private _endDrag(source: AparteSplitResizeDetail['source'], restore?: number): void {
        if (!this._dragging) return;
        const moved = this._moved;
        this._dragging = false;
        this._moved = false;
        this._releasePointer();
        this._handle?.removeAttribute('data-dragging');
        // A gesture that MOVED was captured, so its release already targets the handle
        // and the overlay can go at once. A press that did not move is the one a
        // double-click is built from, and its release landed on the scrim — that one is
        // retired rather than removed. See `_removeScrim`.
        this._removeScrim(!moved);
        if (restore !== undefined) {
            this._position = restore;
            this._setLive(restore);
        }
        // A press that never moved settled nothing. Clicking the seam is how it takes
        // focus, and a double-click is two of them — three events for one reset, two of
        // them carrying the pre-reset value into whatever the host persists.
        if (!moved && restore === undefined) return;
        this._measureBounds();
        this._commit(source);
    }

    private _releasePointer(): void {
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('pointercancel', this._onPointerCancel);
        if (this._captured && this._pointerId !== null) {
            try {
                this._handle?.releasePointerCapture(this._pointerId);
            } catch {
                // Already released, or never captured on this engine.
            }
        }
        this._captured = false;
        this._pointerId = null;
    }

    /**
     * The drag overlay: a fixed, transparent child of the HANDLE, alive for one gesture.
     * Topmost, so it swallows an iframe pane's hit-testing — the case this exists for —
     * and paints the drag cursor across the page. A child of the handle rather than of
     * the body so `click`, and therefore `dblclick`, still dispatches at the handle.
     */
    private _addScrim(): void {
        if (this._scrim || !this._handle) return;
        const scrim = document.createElement('div');
        scrim.className = 'aparte-split__scrim';
        scrim.setAttribute('aria-hidden', 'true');
        this._handle.appendChild(scrim);
        this._scrim = scrim;
    }

    /**
     * Take the overlay off.
     *
     * `retire` is the press that never moved — the one a click, and then a double-click,
     * is built from. Its release happened ON the scrim (nothing captured the pointer
     * yet), and WebKit works out what a click hit by walking the pointerup target's LIVE
     * ancestors: take the node out here and that chain is rooted nowhere, so no `click`
     * fires at all, no `dblclick` follows, and the seam never resets. Chromium and Gecko
     * resolve the target before dispatch and do not care.
     *
     * So a retired scrim goes INERT immediately — `pointer-events: none`, which is what
     * actually matters, since a full-page overlay left hit-testable is a page dead to the
     * pointer — and leaves the document a moment later. Not on the next task: a first
     * measurement removed it there and it still raced the click under a loaded machine
     * (the trace is in `e2e/tests/layout.spec.ts`). The reference is dropped either way,
     * so the next press builds its own; an inert one on its way out costs nothing.
     *
     * Teardown never retires: `disconnectedCallback` takes the live one out at once.
     */
    private _removeScrim(retire = false): void {
        const scrim = this._scrim;
        this._scrim = null;
        if (!scrim) return;
        if (!retire) {
            scrim.remove();
            return;
        }
        scrim.style.pointerEvents = 'none';
        setTimeout(() => scrim.remove(), SCRIM_RETIRE_MS);
    }

    private _onDoubleClick = (): void => {
        if (this.disabled || this.stacked) return;
        this.reset();
    };

    // ─── Keyboard ─────────────────────────────────────────────────────────

    private _onKeydown = (event: KeyboardEvent): void => {
        if (this._dragging && event.key === 'Escape') {
            event.preventDefault();
            this._endDrag('pointer', this._dragStartPercent);
            return;
        }
        if (this.disabled || this.stacked || event.target !== this._handle) return;
        if (event.key === 'Enter') {
            event.preventDefault();
            this._source = 'keyboard';
            try {
                this.toggleCollapse();
            } finally {
                this._source = 'api';
            }
            return;
        }
        const delta = keyDelta(
            event.key,
            event.shiftKey,
            this._rtl(),
            this.orientation === 'vertical',
            this.primary === 'end',
        );
        // An arrow off this split's axis is the page's, not ours: not swallowing it is
        // what lets a pane scroll while the seam has the focus.
        if (delta === null) return;
        event.preventDefault();
        this._keying = true;
        this._position = toPercent(String(this._position + delta), this._position);
        this._setLive(this._position);
    };

    /**
     * The keyup commits, not the keydown: a held arrow repeats, and one release should
     * write one attribute and send one event, not thirty.
     */
    private _onKeyup = (event: KeyboardEvent): void => {
        if (!this._keying || event.target !== this._handle) return;
        if (keyDelta(event.key, event.shiftKey, this._rtl(), this.orientation === 'vertical') === null) return;
        this._keying = false;
        this._commit('keyboard');
    };

    /**
     * The other end of a key step. If focus leaves the seam while the key is still down —
     * alt-tab, a click into a pane, a host moving focus — the keyup never arrives, and
     * the pane would stay where the keydown put it while the attribute and
     * `aria-valuenow` kept the old number for good. What is rendered is what commits.
     */
    private _onFocusOut = (): void => {
        if (!this._keying) return;
        this._keying = false;
        this._commit('keyboard');
    };

    // ─── The breakpoint ───────────────────────────────────────────────────

    /**
     * The stacking query, from the `breakpoint` attribute: a length (`48rem`, the
     * default, or `640px`), or `none` for a split that stays two panes at any width —
     * which a documentation frame needs and a host with its own breakpoint wants.
     */
    private _watchBreakpoint(): void {
        this._media?.removeEventListener('change', this._onMediaChange);
        this._media = null;
        const attr = (this.getAttribute('breakpoint') ?? '').trim();
        if (attr === 'none') {
            this._applyStacked(false);
            return;
        }
        if (typeof matchMedia !== 'function') return;
        const query = attr ? `(max-width: ${attr})` : STACK_QUERY;
        this._media = matchMedia(query);
        this._media.addEventListener('change', this._onMediaChange);
        this._applyStacked(this._media.matches);
    }

    private _onMediaChange = (e: MediaQueryListEvent): void => this._applyStacked(e.matches);

    /**
     * Entering the stacked state shows the START pane: the chat, never a preview of
     * nothing — the same judgement that makes the sidebar's drawer enter closed. Unless
     * the markup already named one, which is an answer to the same question and a better
     * one. Leaving it restores both panes, and with them the seam and its tab stop.
     *
     * `was` is the ATTRIBUTE, not the `stacked` getter: the getter also counts
     * `.aparte-split--only-*`, the CSS route a host takes when it owns its breakpoints
     * and sets `breakpoint="none"`. Read through the getter, that mount looks like a
     * split leaving a stacked state it never entered — and the `pane` the author wrote
     * is deleted on the way in.
     */
    private _applyStacked(stacked: boolean): void {
        const was = this.hasAttribute('data-stacked');
        // Crossing the breakpoint mid-drag hides the seam under the pointer. Cancel
        // first, while there is still a two-pane layout to measure and restore against.
        if (stacked && !was && this._dragging) this._endDrag('pointer', this._dragStartPercent);
        this.toggleAttribute('data-stacked', stacked);
        if (stacked && !was) {
            if (!this.hasAttribute('pane')) this.showPane('start');
        } else if (!stacked && was) {
            this.removeAttribute('pane');
        }
        // Both writes above can happen before `_ready`, from the mount's own
        // `_watchBreakpoint()` — and `attributeChangedCallback` early-returns there, so
        // nothing records them. Left unstamped, the NEXT `showPane` back to the value the
        // markup held reads as "no change" and commits nothing.
        this._lastPane = this.pane;
        this._stampHandle();
        if (stacked !== was) this._measureBounds();
    }

    /**
     * A `[data-aparte-split-pane]` anywhere on the page switches a split's pane, so a
     * two-button toggle in a header needs no script.
     *
     * The value is `start` or `end` — the pane to show. Any other non-empty value names
     * a split's `id` and TOGGLES that one; empty toggles the nearest split, else the
     * first on the page. Same shape as `[data-aparte-sidebar-toggle]`.
     */
    private _onDocumentClick = (e: Event): void => {
        const control = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-aparte-split-pane]');
        if (!control) return;
        const value = (control.getAttribute('data-aparte-split-pane') ?? '').trim();
        const which = value === 'start' || value === 'end' ? value : null;
        const named = which ? '' : value;
        if (named) {
            if (named !== this.id) return;
        } else if ((control.closest('aparte-split') ?? document.querySelector('aparte-split')) !== this) {
            return;
        }
        this.showPane(which ?? (this.pane === 'start' ? 'end' : 'start'));
    };

    // ─── Locale ───────────────────────────────────────────────────────────

    private _onConfigChange = (): void => this._relabel();

    /**
     * The seam's accessible name. A host that wrote its own `aria-label` — or an
     * `aria-labelledby` pointing at a heading — keeps it: `data-own-label` marks the
     * one we set, so a language switch replaces ours and never theirs.
     */
    private _relabel(): void {
        const handle = this._handle;
        if (!handle) return;
        if (handle.hasAttribute('aria-labelledby')) return;
        if (handle.hasAttribute('aria-label') && handle.dataset['ownLabel'] !== 'locale') return;
        const locale = resolveConfig(this).getLocale();
        handle.setAttribute('aria-label', this.getAttribute('label') ?? locale.splitHandleLabel ?? 'Resize the panes');
        handle.dataset['ownLabel'] = 'locale';
    }
}

if (!customElements.get('aparte-split')) {
    customElements.define('aparte-split', AparteSplit);
}
