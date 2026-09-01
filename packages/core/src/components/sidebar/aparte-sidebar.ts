import { resolveConfig } from '../../config/index.js';
import { presenceOn } from '../../utils/presence.js';

/** Detail of `aparte-sidebar-toggle`: the state just entered. */
export interface AparteSidebarToggleDetail {
    collapsed: boolean;
    /** True while the sidebar is a drawer — the window is under the breakpoint. */
    drawer: boolean;
}

/** The window width under which the sidebar becomes a drawer. Mirrored in `sidebar.css`. */
const DRAWER_QUERY = '(max-width: 48rem)';

/**
 * The column beside the chat — conversations, a new-chat button, a search field, an
 * account row — as an element, because it has behaviour: it collapses, it becomes a
 * drawer on a narrow window, and its search field filters the conversation list.
 *
 * What it does NOT own is its content. Children are yours, in the order you want them:
 * a `.aparte-sidebar__header`, a `.aparte-sidebar__search`, a `.aparte-sidebar__body`
 * holding the `<aparte-conversation-list>`, a `.aparte-sidebar__footer`. The
 * stylesheet lays those out and draws nothing you did not put there — the recipe
 * (`.aparte-sidebar`, in `styles/shell/sidebar.css`) is the look, this element is
 * the three behaviours.
 *
 * **Collapse.** `collapsed` is an attribute, reflected, so the host can set it, read
 * it and persist it. Any element carrying `data-aparte-sidebar-toggle` anywhere on
 * the page toggles the nearest sidebar (or the one whose id the attribute names), so
 * a hamburger in the header needs no script. `aparte-sidebar-toggle` fires on every
 * change, whoever caused it.
 *
 * **Drawer.** Under 48rem of window the sidebar leaves the flow and slides over the
 * page (`data-drawer`, set by the element from a media query); open, it draws a
 * scrim, moves the focus to its first focusable child, closes on Escape from anywhere
 * on the page or on a click outside, and hands the focus back to the control that
 * opened it. Nothing here is a portal: the drawer is the same element in the same
 * place, positioned fixed, which is all a sidebar needs and what a dialog would not
 * get away with. Collapsed — folded as a column or slid off as a drawer — it carries
 * `inert` and `aria-hidden`, so nothing invisible keeps a tab stop.
 *
 * **Search.** An input carrying `data-aparte-sidebar-search` filters the conversation
 * list below it by title as the user types — rows that do not match are hidden, and a
 * date group with nothing left hides with them. Client-side, on the titles the list
 * already has: an index over message bodies is the storage adapter's business.
 *
 * @element aparte-sidebar
 *
 * @attr {boolean} collapsed - Hidden (in the flow) or closed (as a drawer). Reflected; set it to start closed.
 * @attr {string} breakpoint - The window width under which the sidebar becomes a drawer: a length (default `48rem`), or `none` for a column that never does.
 * @attr {boolean} data-drawer - Reflected BY the element while the window is narrower than `breakpoint` (48rem unless you set it). Read-only.
 *
 * @fires {CustomEvent<AparteSidebarToggleDetail>} aparte-sidebar-toggle - The sidebar opened or closed, by a toggle, by Escape, by a click on the scrim or by `collapsed` being set. Bubbles.
 *
 * @cssprop [--aparte-sidebar-width=260px] - Width of the column, and of the drawer.
 * @cssprop [--aparte-sidebar-bg=var(--aparte-surface-2)] - Its ground.
 *
 * @example
 * <!-- The sidebar alone, as a column: its header, a search field that filters the list,
 *      the list, a footer. The shell it sits in — header, chat — is the app-shell guide's.
 *      breakpoint="none" keeps it a column at any width; without it, under 48rem of
 *      window it becomes a drawer behind a [data-aparte-sidebar-toggle] control. -->
 * <aparte-sidebar breakpoint="none" style="height: 22rem">
 *   <div class="aparte-sidebar__header">
 *     <span class="aparte-sidebar__brand">aparté</span>
 *     <button class="aparte-btn aparte-btn--icon aparte-btn--sm" type="button" aria-label="New chat">
 *       <aparte-icon name="edit"></aparte-icon>
 *     </button>
 *   </div>
 *   <div class="aparte-sidebar__search aparte-field-group">
 *     <input class="aparte-field aparte-field--sm" type="search" placeholder="Search conversations" data-aparte-sidebar-search>
 *   </div>
 *   <div class="aparte-sidebar__body">
 *     <aparte-conversation-list active-id="c1"></aparte-conversation-list>
 *   </div>
 *   <div class="aparte-sidebar__footer">
 *     <span class="aparte-avatar aparte-avatar--sm">P</span> Paul
 *   </div>
 * </aparte-sidebar>
 * <script>
 *   const day = 864e5;
 *   document.querySelector('aparte-conversation-list').conversations = [
 *     { id: 'c1', title: 'Deploy checklist', updatedAt: Date.now() },
 *     { id: 'c2', title: 'Rename the segment types', updatedAt: Date.now() - day },
 *     { id: 'c3', title: 'Tokens, not selectors', updatedAt: Date.now() - 4 * day },
 *     { id: 'c4', title: 'The first release', updatedAt: Date.now() - 60 * day },
 *   ];
 * </script>
 */
export class AparteSidebar extends HTMLElement {
    static get observedAttributes(): string[] {
        return ['collapsed', 'breakpoint'];
    }

    private _media: MediaQueryList | null = null;
    private _scrim: HTMLElement | null = null;
    /** The control that last opened the drawer, to hand the focus back to. */
    private _opener: HTMLElement | null = null;
    private _lastCollapsed: boolean | null = null;

    /**
     * `connectedCallback` has run and the element knows what its markup asked for.
     *
     * Not `isConnected`: during an UPGRADE the element is already in the document, so
     * `attributeChangedCallback` fires for every authored attribute — connected, and
     * before `connectedCallback` — which is the ordinary case for a server-rendered
     * `<aparte-sidebar collapsed>` upgraded when the module loads. Announcing there
     * tells the host its sidebar just closed when all that happened is that the markup
     * was read, and says `drawer: false` because the media query has not run yet.
     */
    private _ready = false;

    /**
     * The host (or the markup) asked for the column to be folded, so widening the
     * window must not unfold it. Only a collapse taken OUTSIDE the drawer state counts:
     * dismissing an overlay says nothing about what a wide window should show.
     */
    private _closedByHost = false;

    /**
     * `_closedByHost` has been taken from the markup once. A re-parent runs
     * `connectedCallback` again, and by then `collapsed` may be the BREAKPOINT's own
     * write — a drawer closes itself on the way in — so reading it back a second time
     * records the element's own doing as the host's word and the column never reopens.
     * Like `_initialCaptured` on `<aparte-split>`, it must survive the move.
     */
    private _hostIntentSeeded = false;

    /** Raised around `_applyDrawer`'s own writes, so the breakpoint is never read as a host's intent. */
    private _auto = false;

    /**
     * The element wrote `inert`/`aria-hidden` and may take them back. A host that inerts
     * the sidebar behind its own modal wrote them itself, and `_syncHidden` runs on every
     * breakpoint re-evaluation: without this it would un-inert the page behind the overlay.
     * Same convention as `_relabel`, which leaves a host-authored `aria-label` alone.
     */
    private _ownHidden = false;

    /** Whether the sidebar is collapsed (hidden in the flow, or closed as a drawer). */
    get collapsed(): boolean {
        return this.hasAttribute('collapsed');
    }

    set collapsed(value: boolean) {
        this.toggleAttribute('collapsed', presenceOn(value));
    }

    /** True while the window is under the breakpoint and the sidebar is a drawer. */
    get drawer(): boolean {
        return this.hasAttribute('data-drawer');
    }

    connectedCallback(): void {
        if (!this.classList.contains('aparte-sidebar')) this.classList.add('aparte-sidebar');
        if (!this.getAttribute('role')) this.setAttribute('role', 'complementary');
        this._relabel();
        // Before the breakpoint runs, and only the FIRST time: whatever the markup asked
        // for is the host's word. On a later connect `collapsed` may be our own.
        if (!this._hostIntentSeeded) {
            this._closedByHost = this.collapsed;
            this._hostIntentSeeded = true;
        }
        this.addEventListener('input', this._onInput);
        // On the DOCUMENT, not on the element: an overlay that only answers Escape when
        // the focus is already inside it answers nobody — the focus is on the page the
        // drawer is covering.
        document.addEventListener('keydown', this._onKeydown);
        document.addEventListener('click', this._onDocumentClick);
        window.addEventListener('aparte-config-change', this._onConfigChange);
        this._watchBreakpoint();
        this._syncHidden();
        // Last: `_watchBreakpoint` may have closed the sidebar on its way in, and that
        // close is the drawer entering, not a change to announce.
        this._lastCollapsed = this.collapsed;
        this._ready = true;
    }

    /**
     * The drawer's media query, from the `breakpoint` attribute: a length (`48rem`, the
     * default, or `640px`), or `none` for a column that never becomes a drawer — which
     * a narrow host that has room for it wants, and a documentation frame needs.
     */
    private _watchBreakpoint(): void {
        this._media?.removeEventListener('change', this._onMediaChange);
        this._media = null;
        const attr = (this.getAttribute('breakpoint') ?? '').trim();
        if (attr === 'none') {
            this._applyDrawer(false);
            return;
        }
        if (typeof matchMedia !== 'function') return;
        const query = attr ? `(max-width: ${attr})` : DRAWER_QUERY;
        this._media = matchMedia(query);
        this._media.addEventListener('change', this._onMediaChange);
        this._applyDrawer(this._media.matches);
    }

    disconnectedCallback(): void {
        this.removeEventListener('input', this._onInput);
        document.removeEventListener('keydown', this._onKeydown);
        document.removeEventListener('click', this._onDocumentClick);
        window.removeEventListener('aparte-config-change', this._onConfigChange);
        this._media?.removeEventListener('change', this._onMediaChange);
        this._media = null;
        this._ready = false;
    }

    attributeChangedCallback(name: string): void {
        if (!this._ready) return;
        if (name === 'breakpoint') {
            this._watchBreakpoint();
            return;
        }
        if (name !== 'collapsed') return;
        const collapsed = this.collapsed;
        if (collapsed === this._lastCollapsed) return;
        this._lastCollapsed = collapsed;
        // A collapse taken in the flow is a preference about the COLUMN, and survives a
        // resize. One taken over a drawer, or by the breakpoint itself, is not.
        if (!this._auto && !this.drawer) this._closedByHost = collapsed;
        this._syncScrim();
        this._syncHidden();
        if (collapsed && this.drawer && this._opener?.isConnected) {
            this._opener.focus();
            this._opener = null;
        } else if (!collapsed && this.drawer) {
            this._focusFirst();
        }
        this.dispatchEvent(new CustomEvent<AparteSidebarToggleDetail>('aparte-sidebar-toggle', {
            detail: { collapsed, drawer: this.drawer },
            bubbles: true,
            composed: true,
        }));
    }

    // ─── Public API ───────────────────────────────────────────────────────

    /** Open the sidebar. `opener` is the control to hand the focus back to when it closes. */
    open(opener?: HTMLElement): void {
        if (opener) this._opener = opener;
        this.collapsed = false;
    }

    close(): void {
        this.collapsed = true;
    }

    toggle(opener?: HTMLElement): void {
        if (this.collapsed) this.open(opener);
        else this.close();
    }

    // ─── Drawer ───────────────────────────────────────────────────────────

    private _onMediaChange = (e: MediaQueryListEvent): void => this._applyDrawer(e.matches);

    /**
     * Entering the drawer state closes the sidebar: a narrow window that opens on an
     * overlay covering the chat is the wrong first screen. Leaving it reopens, since
     * a wide window has room for the column — unless the host had collapsed it before.
     */
    private _applyDrawer(drawer: boolean): void {
        const was = this.drawer;
        this.toggleAttribute('data-drawer', drawer);
        this._auto = true;
        try {
            if (drawer && !was) this.collapsed = true;
            else if (!drawer && was && !this._closedByHost) this.collapsed = false;
        } finally {
            this._auto = false;
        }
        this._syncScrim();
        this._syncHidden();
    }

    /**
     * A collapsed sidebar is invisible — folded to nothing in the flow, slid off the
     * screen as a drawer — so it must not keep its tab stops or its place in the
     * accessibility tree. `inert` covers focus and the pointer, `aria-hidden` covers
     * the readers that predate it; a browser without `inert` still gets the second.
     *
     * It removes only what it wrote. Both are standard global attributes a host sets
     * itself — inerting the sidebar behind its own modal is the ordinary pattern — and
     * this runs on every breakpoint re-evaluation, so clearing them unconditionally lets
     * an unrelated resize re-expose the page under an overlay. Same convention as
     * `_relabel`, which leaves a host-authored `aria-label` alone.
     *
     * Neither is declared `@attr`, and `data-drawer` is not the precedent: a `@attr` on a
     * STANDARD name displaces the wrappers' own prop for it — React's JSX props are
     * `Omit<HTMLAttributes, keyof T>`, so declaring `inert` here would retype
     * `<aparte-sidebar inert={busy}>` out of existence. The class docblock says it in prose.
     */
    private _syncHidden(): void {
        if (this.collapsed) {
            this.toggleAttribute('inert', true);
            this.setAttribute('aria-hidden', 'true');
            this._ownHidden = true;
        } else if (this._ownHidden) {
            this.removeAttribute('inert');
            this.removeAttribute('aria-hidden');
            this._ownHidden = false;
        }
    }

    /**
     * The drawer covers the page, so the focus has to follow it in — otherwise the next
     * Tab walks the transcript under the overlay. The host owns the children, so this
     * takes the first thing that can hold focus and leaves the rest alone; a drawer with
     * nothing focusable in it keeps the focus where it was, which is the honest outcome.
     */
    private _focusFirst(): void {
        this.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }

    private _syncScrim(): void {
        const wanted = this.drawer && !this.collapsed;
        if (wanted && !this._scrim) {
            this._scrim = document.createElement('div');
            this._scrim.className = 'aparte-sidebar__scrim';
            this._scrim.setAttribute('aria-hidden', 'true');
            this._scrim.addEventListener('click', () => this.close());
            this.appendChild(this._scrim);
        } else if (!wanted && this._scrim) {
            this._scrim.remove();
            this._scrim = null;
        }
    }

    private _onKeydown = (e: KeyboardEvent): void => {
        if (e.key === 'Escape' && this.drawer && !this.collapsed) {
            e.preventDefault();
            this.close();
        }
    };

    /** A `[data-aparte-sidebar-toggle]` anywhere toggles this sidebar — no script in the host. */
    private _onDocumentClick = (e: Event): void => {
        const control = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-aparte-sidebar-toggle]');
        if (!control) return;
        const named = control.getAttribute('data-aparte-sidebar-toggle');
        if (named) {
            if (named !== this.id) return;
        } else if (nearestSidebar(control) !== this) {
            return;
        }
        this.toggle(control);
    };

    // ─── Search ───────────────────────────────────────────────────────────

    private _onInput = (e: Event): void => {
        const input = e.target as HTMLInputElement | null;
        if (!input?.matches?.('[data-aparte-sidebar-search]')) return;
        this.filter(input.value);
    };

    /**
     * Hide the conversation rows whose title does not contain `query`, and the date
     * groups left empty. Case- and accent-insensitive. An empty query shows everything.
     */
    filter(query: string): void {
        const needle = fold(query);
        for (const list of this.querySelectorAll<HTMLElement>('aparte-conversation-list')) {
            for (const row of list.querySelectorAll<HTMLElement>('[data-conv-id]')) {
                const title = row.querySelector('.aparte-conv-item__title')?.textContent ?? row.textContent ?? '';
                row.hidden = needle !== '' && !fold(title).includes(needle);
            }
            for (const group of list.querySelectorAll<HTMLElement>('.aparte-conv-group')) {
                group.hidden = needle !== '' && !Array.from(group.querySelectorAll<HTMLElement>('[data-conv-id]')).some((r) => !r.hidden);
            }
        }
    }

    // ─── Locale ───────────────────────────────────────────────────────────

    private _onConfigChange = (): void => this._relabel();

    private _relabel(): void {
        if (this.hasAttribute('aria-label') && this.dataset['ownLabel'] !== 'locale') return;
        const locale = resolveConfig(this).getLocale();
        this.setAttribute('aria-label', locale.sidebarLabel ?? 'Conversations');
        this.dataset['ownLabel'] = 'locale';
    }
}

/** What the drawer hands the focus to when it opens. The host owns the children. */
const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The sidebar a toggle belongs to: the closest ancestor, else the first on the page. */
function nearestSidebar(control: HTMLElement): Element | null {
    return control.closest('aparte-sidebar') ?? document.querySelector('aparte-sidebar');
}

/** Lower-case, accents stripped: "Épingler" matches "epingler". */
function fold(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

if (!customElements.get('aparte-sidebar')) {
    customElements.define('aparte-sidebar', AparteSidebar);
}
