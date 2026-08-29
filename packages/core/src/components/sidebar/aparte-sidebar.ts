import { resolveConfig } from '../../config/index.js';

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
 * scrim, closes on Escape or on a click outside, and hands the focus back to the
 * control that opened it. Nothing here is a portal: the drawer is the same element
 * in the same place, positioned fixed, which is all a sidebar needs and what a
 * dialog would not get away with.
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
 * @attr {boolean} data-drawer - Reflected BY the element while the window is under 48rem. Read-only.
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

    /** Whether the sidebar is collapsed (hidden in the flow, or closed as a drawer). */
    get collapsed(): boolean {
        return this.hasAttribute('collapsed');
    }

    set collapsed(value: boolean) {
        this.toggleAttribute('collapsed', value);
    }

    /** True while the window is under the breakpoint and the sidebar is a drawer. */
    get drawer(): boolean {
        return this.hasAttribute('data-drawer');
    }

    connectedCallback(): void {
        if (!this.classList.contains('aparte-sidebar')) this.classList.add('aparte-sidebar');
        if (!this.getAttribute('role')) this.setAttribute('role', 'complementary');
        this._relabel();
        this._lastCollapsed = this.collapsed;
        this.addEventListener('input', this._onInput);
        this.addEventListener('keydown', this._onKeydown);
        document.addEventListener('click', this._onDocumentClick);
        window.addEventListener('aparte-config-change', this._onConfigChange);
        this._watchBreakpoint();
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
        this.removeEventListener('keydown', this._onKeydown);
        document.removeEventListener('click', this._onDocumentClick);
        window.removeEventListener('aparte-config-change', this._onConfigChange);
        this._media?.removeEventListener('change', this._onMediaChange);
        this._media = null;
    }

    attributeChangedCallback(name: string): void {
        if (!this.isConnected) return;
        if (name === 'breakpoint') {
            this._watchBreakpoint();
            return;
        }
        if (name !== 'collapsed') return;
        const collapsed = this.collapsed;
        if (collapsed === this._lastCollapsed) return;
        this._lastCollapsed = collapsed;
        this._syncScrim();
        if (collapsed && this.drawer && this._opener?.isConnected) {
            this._opener.focus();
            this._opener = null;
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
        if (drawer && !was) this.collapsed = true;
        else if (!drawer && was) this.collapsed = false;
        this._syncScrim();
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
