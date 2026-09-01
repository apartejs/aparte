import { resolveConfig } from '../../config/index.js';
import { APARTE_DEFAULT_LOCALE } from '../../config/locale.js';
import { escapeAttr, escapeHtml } from '../../utils/escape.js';
import { cssEscape } from '../../utils/css-escape.js';

export interface AparteConversationListItem {
    id: string;
    title: string;
    /** Drives the date groups. A list where no item carries one renders flat. */
    updatedAt?: number;
    /** When set, the row is italic and its menu offers unarchive instead of archive. */
    archivedAt?: number;
    /** When set, the row sits in the "Pinned" group first, and its menu offers unpin. */
    pinnedAt?: number;
}

export interface AparteConversationSelectDetail {
    id: string;
}

export interface AparteConversationDeleteDetail {
    id: string;
}

export interface AparteConversationArchiveDetail {
    id: string;
}

export interface AparteConversationPinDetail {
    id: string;
}

export interface AparteConversationRenameDetail {
    id: string;
    /** The new title, trimmed and non-empty — an unchanged or emptied title fires nothing. */
    title: string;
}

/** A date group: its heading (null for the undated tail) and its rows, in host order. */
interface ConversationGroup {
    key: string;
    label: string | null;
    items: AparteConversationListItem[];
}

/** The one open menu, if any. */
interface OpenMenu {
    id: string;
    row: HTMLElement;
    button: HTMLElement;
    menu: HTMLElement;
}

/** Locale keys this element reads; each falls back to the English default. */
type ListLocaleKey =
    | 'newChat' | 'deleteConversation' | 'archiveConversation' | 'unarchiveConversation'
    | 'conversationActions' | 'renameConversation' | 'conversationTitle'
    | 'pinConversation' | 'unpinConversation' | 'deleteConversationConfirm' | 'cancel'
    | 'conversationGroupPinned' | 'conversationGroupToday' | 'conversationGroupYesterday'
    | 'conversationGroupWeek' | 'conversationGroupMonth';

const DAY = 864e5;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * Conversation-history sidebar — a framework-agnostic web component. The host sets
 * the `conversations` JS property and the `active-id` attribute; this renders the
 * rows and fires the user's intent, never acting on it itself.
 *
 * A row is two real buttons: the title, which selects, and a `⋯` that opens the row's
 * menu — rename, pin or unpin, archive or unarchive, delete. Every item fires an event
 * and stops; the one exception is delete, which asks first, inline in the menu,
 * because it is the one action the host cannot undo. Rename swaps the title for an
 * input: Enter or leaving the field commits, Escape cancels, and an unchanged or
 * emptied title fires nothing. The rows are grouped by date — Pinned, Today,
 * Yesterday, Previous 7 days, Previous 30 days, then one heading per month — as soon
 * as any item carries `updatedAt`; set `no-groups` to render them flat.
 *
 * Children are not a composition point: `_render()` assigns `innerHTML` from the
 * `conversations` array, so any light-DOM child a host writes inside the element is
 * discarded the next time the list renders — and switching this element's locale is
 * enough to trigger one. Compose around the element, not inside it: it renders rows
 * and nothing else, with no header, no new-conversation button and no search field.
 *
 * What it is not: a store. Selecting, renaming, pinning, archiving and deleting all
 * leave the array untouched — the events carry an id (and, for rename, the title) and
 * stop. A row's text comes from the array, so it changes when the host assigns
 * `conversations` again; the exception is an empty title, which falls back to the
 * locale's new-chat label and therefore follows a locale switch. An archived item is
 * still rendered (it gains `aparte-conv-item--archived`); filtering archived
 * conversations out of the list is the host's decision, not this element's. The
 * asymmetry between the two inputs is deliberate: `active-id` is an attribute because
 * moving the selection patches the rendered rows in place, while `conversations` is a
 * JS property because it is structured data an attribute cannot carry, and setting it
 * re-renders the whole list.
 *
 * @element aparte-conversation-list
 * @attr {string} active-id - The id of the conversation to render as selected.
 * @attr {boolean} no-groups - Render the rows flat, in host order, with no date headings.
 *
 * @fires {CustomEvent<AparteConversationSelectDetail>} aparte-select-conversation - A row's title was activated; the host loads that conversation.
 * @fires {CustomEvent<AparteConversationRenameDetail>} aparte-rename-conversation - A rename was committed with a new, non-empty title. Nothing is renamed here.
 * @fires {CustomEvent<AparteConversationPinDetail>} aparte-pin-conversation - The pin item was chosen on an unpinned row.
 * @fires {CustomEvent<AparteConversationPinDetail>} aparte-unpin-conversation - The same item on a pinned row; same detail shape, opposite intent.
 * @fires {CustomEvent<AparteConversationArchiveDetail>} aparte-archive-conversation - The archive item was chosen on a live conversation.
 * @fires {CustomEvent<AparteConversationArchiveDetail>} aparte-unarchive-conversation - The same item on an already-archived one; same detail shape, opposite intent.
 * @fires {CustomEvent<AparteConversationDeleteDetail>} aparte-delete-conversation - The delete was confirmed. Nothing is removed here.
 *
 * @cssprop [--aparte-conv-list-gap=var(--aparte-space-1)] - Vertical gap between rows, and between a group's heading and its rows.
 * @cssprop [--aparte-conv-item-padding=var(--aparte-space-4) var(--aparte-space-5)] - Padding of a row's title button.
 * @cssprop [--aparte-conv-item-gap=var(--aparte-space-3)] - Gap between a row's title and its `⋯` button.
 * @cssprop [--aparte-conv-item-radius=var(--aparte-radius-md)] - Corner radius of a row.
 * @cssprop [--aparte-conv-item-font-size=var(--aparte-font-size-md)] - Font size of a row's title.
 * @cssprop [--aparte-conv-item-color=var(--aparte-text-muted)] - Title colour of an inactive row.
 * @cssprop [--aparte-conv-item-bg-hover=var(--aparte-surface-3)] - Row background on hover.
 * @cssprop [--aparte-conv-item-bg-active=var(--aparte-surface-3)] - Background of the row matching `active-id`.
 * @cssprop [--aparte-conv-item-color-active=var(--aparte-text)] - Title colour of the active row.
 * @cssprop [--aparte-conv-item-font-weight-active=var(--aparte-font-weight-medium)] - Title weight of the active row.
 * @cssprop [--aparte-conv-action-btn-size=var(--aparte-btn-size-sm)] - Square size of the `⋯` button (the recipe's small step). Under `(pointer: coarse)` the stylesheet redeclares it as the touch target size on the button itself, so a value set on the element does not reach it there; the button also stays visible instead of appearing on hover.
 *
 * @example
 * <!-- It stores nothing and fetches nothing: an empty tag renders the empty state, and
 *      the list appears when the host assigns `conversations`. -->
 * <aparte-conversation-list active-id="c1" style="max-width: 20rem"></aparte-conversation-list>
 *
 * <script>
 *   const day = 864e5;
 *   document.querySelector('aparte-conversation-list').conversations = [
 *     { id: 'c0', title: 'Release checklist', updatedAt: Date.now() - 3 * day, pinnedAt: Date.now() },
 *     { id: 'c1', title: 'Deploy checklist', updatedAt: Date.now() },
 *     { id: 'c2', title: 'Rename the segment types', updatedAt: Date.now() - day },
 *     { id: 'c3', title: 'Tokens, not selectors', updatedAt: Date.now() - 4 * day },
 *   ];
 * </script>
 *
 * @example
 * // The host owns the data: set the `conversations` property, listen for the intent.
 * const list = document.querySelector('aparte-conversation-list')!;
 * list.conversations = [
 *   { id: 'c1', title: 'Deploy checklist', updatedAt: Date.now() },
 *   { id: 'c2', title: 'Old thread', updatedAt: 0, archivedAt: Date.now() },
 * ];
 * list.setAttribute('active-id', 'c1');
 *
 * list.addEventListener('aparte-select-conversation', (e) => load(e.detail.id));
 * list.addEventListener('aparte-rename-conversation', (e) => manager.updateTitle(e.detail.id, e.detail.title));
 * list.addEventListener('aparte-pin-conversation', (e) => manager.pin(e.detail.id));
 * list.addEventListener('aparte-delete-conversation', (e) => manager.delete(e.detail.id));
 */
export class AparteConversationList extends HTMLElement {
    private _conversations: AparteConversationListItem[] = [];
    private _activeId: string | null = null;
    private _open: OpenMenu | null = null;
    private _renaming: { id: string; input: HTMLInputElement; done: boolean } | null = null;

    static get observedAttributes(): string[] {
        return ['active-id', 'no-groups'];
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────

    connectedCallback(): void {
        if (!this.classList.contains('aparte-conv-list')) {
            this.classList.add('aparte-conv-list');
        }
        if (!this.getAttribute('role')) {
            this.setAttribute('role', 'navigation');
        }
        this.addEventListener('click', this._onClick);
        this.addEventListener('keydown', this._onKeydown);
        this.addEventListener('focusout', this._onFocusOut);
        this._render();
        window.addEventListener('aparte-config-change', this._onConfigChange);
    }

    disconnectedCallback(): void {
        this._closeMenu();
        this.removeEventListener('click', this._onClick);
        this.removeEventListener('keydown', this._onKeydown);
        this.removeEventListener('focusout', this._onFocusOut);
        window.removeEventListener('aparte-config-change', this._onConfigChange);
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue) return;
        if (name === 'active-id') {
            this._activeId = newValue;
            this._updateActiveState();
        } else if (name === 'no-groups' && this.isConnected) {
            this._render();
        }
    }

    /**
     * Re-render on a locale switch: every row's title fallback, the `⋯` button's name
     * and the group headings come from the locale, so without this the list stayed in
     * the previous language until something else happened to re-render it. Only OUR
     * config.
     */
    private _onConfigChange = (e: Event): void => {
        const detail = (e as CustomEvent).detail as { config?: unknown } | undefined;
        if (detail?.config && detail.config !== resolveConfig(this)) return;
        this._render();
    };

    // ─── Public API ───────────────────────────────────────────────────────

    /** Set the list of conversations to display. Triggers a re-render. */
    set conversations(items: AparteConversationListItem[]) {
        this._conversations = Array.isArray(items) ? items : [];
        this._render();
    }

    get conversations(): AparteConversationListItem[] {
        return this._conversations;
    }

    // ─── Rendering ────────────────────────────────────────────────────────

    private _render(): void {
        // The menu and the rename input live inside the rows; a render replaces them.
        this._closeMenu();
        this._renaming = null;
        this.innerHTML = this._groups().map(g => this._renderGroup(g)).join('');
    }

    private _t(key: ListLocaleKey): string {
        const locale = resolveConfig(this).getLocale();
        return locale[key] ?? APARTE_DEFAULT_LOCALE[key] ?? '';
    }

    /**
     * Pinned first, then the calendar buckets every chat product uses, then a heading
     * per month (newest first), then whatever carries no date. Flat when nothing is
     * dated or the host asked for `no-groups`: a heading over the only group would say
     * nothing.
     */
    private _groups(): ConversationGroup[] {
        const items = this._conversations;
        if (this.hasAttribute('no-groups') || !items.some(c => typeof c.updatedAt === 'number')) {
            return [{ key: 'all', label: null, items }];
        }
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const tag = resolveConfig(this).getLocale().tag;
        const buckets = new Map<string, ConversationGroup>();
        const push = (key: string, label: string | null, item: AparteConversationListItem): void => {
            let g = buckets.get(key);
            if (!g) {
                g = { key, label, items: [] };
                buckets.set(key, g);
            }
            g.items.push(item);
        };
        for (const c of items) {
            if (c.pinnedAt) { push('pinned', this._t('conversationGroupPinned'), c); continue; }
            const at = c.updatedAt;
            if (typeof at !== 'number') { push('undated', null, c); continue; }
            if (at >= today) push('today', this._t('conversationGroupToday'), c);
            else if (at >= today - DAY) push('yesterday', this._t('conversationGroupYesterday'), c);
            else if (at >= today - 7 * DAY) push('week', this._t('conversationGroupWeek'), c);
            else if (at >= today - 30 * DAY) push('month', this._t('conversationGroupMonth'), c);
            else {
                const d = new Date(at);
                const sameYear = d.getFullYear() === now.getFullYear();
                const raw = new Intl.DateTimeFormat(tag, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(d);
                // French month names are lower-case; a heading is not.
                const label = raw.charAt(0).toLocaleUpperCase(tag) + raw.slice(1);
                push(`m-${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`, label, c);
            }
        }
        const fixed = ['pinned', 'today', 'yesterday', 'week', 'month']
            .map(k => buckets.get(k))
            .filter((g): g is ConversationGroup => !!g);
        const months = [...buckets.keys()]
            .filter(k => k.startsWith('m-'))
            .sort((a, b) => b.localeCompare(a))
            .map(k => buckets.get(k)!);
        const undated = buckets.get('undated');
        return [...fixed, ...months, ...(undated ? [undated] : [])];
    }

    private _renderGroup(group: ConversationGroup): string {
        const rows = group.items.map(conv => this._renderItem(conv)).join('');  // safe-text: each row is built by _renderItem, which escapes every field it interpolates.
        if (group.label === null) {
            return `<div class="aparte-conv-group">${rows}</div>`;
        }
        const label = escapeHtml(group.label);
        return `
<div class="aparte-conv-group" role="group" aria-label="${escapeAttr(group.label)}">
  <div class="aparte-menu__label aparte-conv-group__label" aria-hidden="true">${label}</div>
  ${rows}
</div>`;
    }

    private _renderItem(conv: AparteConversationListItem): string {
        const isActive = conv.id === this._activeId;
        const classes = [
            'aparte-menu__item aparte-conv-item',
            isActive ? 'aparte-conv-item--active' : '',
            conv.archivedAt ? 'aparte-conv-item--archived' : '',
            conv.pinnedAt ? 'aparte-conv-item--pinned' : '',
        ].filter(Boolean).join(' ');
        const escapedId = escapeAttr(conv.id);
        const title = escapeHtml(conv.title || this._t('newChat'));
        const actionsLabel = escapeAttr(this._t('conversationActions'));
        // Marked at the declaration because the use site is inside a multi-line template
        // literal, where a `//` would render as text rather than exempt anything.
        const moreGlyph = resolveConfig(this).getIcon('more');  // safe-text: the icon provider's SVG — markup by contract, which is what getIcon returns everywhere in core.
        return `
<div class="${escapeAttr(classes)}" data-conv-id="${escapedId}">
  <button
    class="aparte-conv-item__select"
    type="button"
    data-select-id="${escapedId}"
    aria-current="${isActive ? 'page' : 'false'}"
  ><span class="aparte-conv-item__title">${title}</span></button>
  <button
    class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-conv-item__more"
    type="button"
    data-more-id="${escapedId}"
    aria-label="${actionsLabel}"
    title="${actionsLabel}"
    aria-haspopup="menu"
    aria-expanded="false"
  >${moreGlyph}</button>
</div>`;
    }

    // ─── The row's menu ───────────────────────────────────────────────────

    private _menuMarkup(conv: AparteConversationListItem): string {
        const config = resolveConfig(this);
        const editGlyph = config.getIcon('edit');  // safe-text: the icon provider's SVG — markup by contract.
        const pinGlyph = config.getIcon('pin');  // safe-text: the icon provider's SVG — markup by contract.
        const archiveGlyph = config.getIcon(conv.archivedAt ? 'unarchive' : 'archive');  // safe-text: the icon provider's SVG — markup by contract.
        const trashGlyph = config.getIcon('trash');  // safe-text: the icon provider's SVG — markup by contract.
        const rename = escapeHtml(this._t('renameConversation'));
        const pin = escapeHtml(this._t(conv.pinnedAt ? 'unpinConversation' : 'pinConversation'));
        const archive = escapeHtml(this._t(conv.archivedAt ? 'unarchiveConversation' : 'archiveConversation'));
        const remove = escapeHtml(this._t('deleteConversation'));
        return `
<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="rename">${editGlyph}<span>${rename}</span></button>
<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="pin">${pinGlyph}<span>${pin}</span></button>
<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="archive">${archiveGlyph}<span>${archive}</span></button>
<div class="aparte-menu__separator" role="separator"></div>
<button type="button" class="aparte-menu__item aparte-conv-menu__item--danger" role="menuitem" data-menu-action="delete">${trashGlyph}<span>${remove}</span></button>`;
    }

    private _confirmMarkup(conv: AparteConversationListItem): string {
        const question = escapeHtml(this._t('deleteConversationConfirm').replace('{title}', conv.title || this._t('newChat')));
        const cancel = escapeHtml(this._t('cancel'));
        const remove = escapeHtml(this._t('deleteConversation'));
        return `
<div class="aparte-conv-menu__confirm" role="group" aria-label="${escapeAttr(question)}">
  <p class="aparte-conv-menu__question">${question}</p>
  <div class="aparte-conv-menu__actions">
    <button type="button" class="aparte-btn aparte-btn--sm aparte-btn--ghost" data-menu-action="cancel">${cancel}</button>
    <button type="button" class="aparte-btn aparte-btn--sm aparte-btn--danger aparte-btn--solid" data-menu-action="confirm-delete">${remove}</button>
  </div>
</div>`;
    }

    private _openMenu(row: HTMLElement, button: HTMLElement): void {
        this._closeMenu();
        const id = row.dataset['convId']!;
        const conv = this._conversations.find(c => c.id === id);
        if (!conv) return;
        const menu = document.createElement('div');
        menu.className = 'aparte-menu aparte-conv-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', conv.title || this._t('newChat'));
        menu.innerHTML = this._menuMarkup(conv);  // safe-text: _menuMarkup escapes every locale string and only interpolates provider glyphs.
        row.appendChild(menu);
        button.setAttribute('aria-expanded', 'true');
        this._open = { id, row, button, menu };
        this._placeMenu(button, menu);
        menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
        document.addEventListener('pointerdown', this._onDocumentPointerDown, true);
        window.addEventListener('scroll', this._onWindowScroll, true);
        window.addEventListener('resize', this._onWindowScroll);
    }

    /**
     * Fixed, below the button's end edge, flipped above it when the viewport ends
     * first. Fixed rather than absolute because a sidebar scrolls: an absolute menu on
     * the last rows would be clipped by the list's own overflow. No anchoring library —
     * the menu closes on any scroll or resize, which is what makes the arithmetic
     * safe to do once.
     */
    private _placeMenu(button: HTMLElement, menu: HTMLElement): void {
        const r = button.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        let top = r.bottom + MENU_GAP;
        if (top + m.height > window.innerHeight - VIEWPORT_MARGIN && r.top - m.height - MENU_GAP >= VIEWPORT_MARGIN) {
            top = r.top - m.height - MENU_GAP;
        }
        const rtl = getComputedStyle(this).direction === 'rtl';
        let left = rtl ? r.left : r.right - m.width;
        left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - m.width - VIEWPORT_MARGIN));
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
    }

    private _closeMenu(returnFocus = false): void {
        const open = this._open;
        if (!open) return;
        this._open = null;
        open.menu.remove();
        open.button.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', this._onDocumentPointerDown, true);
        window.removeEventListener('scroll', this._onWindowScroll, true);
        window.removeEventListener('resize', this._onWindowScroll);
        if (returnFocus && open.button.isConnected) open.button.focus();
    }

    private _onDocumentPointerDown = (e: Event): void => {
        const open = this._open;
        if (!open) return;
        const target = e.target as Node;
        // The button's own click toggles; closing here too would reopen on the click.
        if (open.menu.contains(target) || open.button.contains(target)) return;
        this._closeMenu();
    };

    private _onWindowScroll = (): void => {
        this._closeMenu();
    };

    private _onFocusOut = (e: FocusEvent): void => {
        const open = this._open;
        if (!open) return;
        const next = e.relatedTarget as Node | null;
        if (next && (open.menu.contains(next) || open.button.contains(next))) return;
        // Focus left the menu for somewhere else (a Tab, a programmatic move): close
        // without pulling it back.
        if (open.menu.contains(e.target as Node)) this._closeMenu();
    };

    private _onMenuAction(action: string): void {
        const open = this._open;
        if (!open) return;
        const conv = this._conversations.find(c => c.id === open.id);
        if (!conv) { this._closeMenu(); return; }
        const id = conv.id;
        switch (action) {
            case 'rename':
                this._closeMenu();
                this._startRename(open.row, conv);
                return;
            // The two toggles dispatch each name as a LITERAL, in its own branch: the
            // manifest analyzer records a dispatch whose name is a ternary as an event
            // with no name (the Angular generator then crashes on it), and one whose
            // name is a local as an event called after the local.
            case 'pin':
                this._closeMenu(true);
                if (conv.pinnedAt) {
                    this.dispatchEvent(new CustomEvent<AparteConversationPinDetail>(
                        'aparte-unpin-conversation',
                        { detail: { id }, bubbles: true, composed: true }
                    ));
                } else {
                    this.dispatchEvent(new CustomEvent<AparteConversationPinDetail>(
                        'aparte-pin-conversation',
                        { detail: { id }, bubbles: true, composed: true }
                    ));
                }
                return;
            case 'archive':
                this._closeMenu(true);
                if (conv.archivedAt) {
                    this.dispatchEvent(new CustomEvent<AparteConversationArchiveDetail>(
                        'aparte-unarchive-conversation',
                        { detail: { id }, bubbles: true, composed: true }
                    ));
                } else {
                    this.dispatchEvent(new CustomEvent<AparteConversationArchiveDetail>(
                        'aparte-archive-conversation',
                        { detail: { id }, bubbles: true, composed: true }
                    ));
                }
                return;
            case 'delete':
                // Ask first. The safe answer takes the focus.
                open.menu.innerHTML = this._confirmMarkup(conv);  // safe-text: _confirmMarkup escapes the title and every locale string.
                this._placeMenu(open.button, open.menu);
                open.menu.querySelector<HTMLElement>('[data-menu-action="cancel"]')?.focus();
                return;
            case 'cancel':
                this._closeMenu(true);
                return;
            case 'confirm-delete':
                this._closeMenu(true);
                this.dispatchEvent(new CustomEvent<AparteConversationDeleteDetail>(
                    'aparte-delete-conversation',
                    { detail: { id }, bubbles: true, composed: true }
                ));
                return;
        }
    }

    private _menuFocusables(): HTMLElement[] {
        const open = this._open;
        if (!open) return [];
        return Array.from(open.menu.querySelectorAll<HTMLElement>('[role="menuitem"], [data-menu-action]'));
    }

    private _onMenuKeydown(e: KeyboardEvent): void {
        const items = this._menuFocusables();
        const index = items.indexOf(document.activeElement as HTMLElement);
        const focusAt = (i: number): void => {
            e.preventDefault();
            items[(i + items.length) % items.length]?.focus();
        };
        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                this._closeMenu(true);
                return;
            case 'Tab':
                // APG: Tab leaves the menu. Land on the button rather than on whatever
                // follows a node that no longer exists.
                e.preventDefault();
                this._closeMenu(true);
                return;
            case 'ArrowDown': focusAt(index + 1); return;
            case 'ArrowUp': focusAt(index - 1); return;
            case 'Home': focusAt(0); return;
            case 'End': focusAt(items.length - 1); return;
        }
    }

    // ─── Rename ───────────────────────────────────────────────────────────

    private _startRename(row: HTMLElement, conv: AparteConversationListItem): void {
        const select = row.querySelector<HTMLElement>('.aparte-conv-item__select');
        if (!select) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'aparte-field aparte-field--sm aparte-conv-item__input';
        input.value = conv.title;
        input.setAttribute('aria-label', this._t('conversationTitle'));
        input.dataset['renameId'] = conv.id;
        select.replaceWith(input);
        this._renaming = { id: conv.id, input, done: false };
        input.addEventListener('blur', () => this._finishRename(true, false));
        input.focus();
        input.select();
    }

    /**
     * One exit for the three ways out (Enter, Escape, leaving the field), guarded so
     * the blur a removal causes cannot commit a second time. The row is re-rendered
     * from the array either way: the list shows data, and the host's re-assignment is
     * what makes the new title appear.
     */
    private _finishRename(commit: boolean, viaKeyboard: boolean): void {
        const renaming = this._renaming;
        if (!renaming || renaming.done) return;
        renaming.done = true;
        const conv = this._conversations.find(c => c.id === renaming.id);
        const title = renaming.input.value.trim();
        this._render();
        if (viaKeyboard) {
            this.querySelector<HTMLElement>(`[data-select-id="${cssEscape(renaming.id)}"]`)?.focus();  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
        }
        if (commit && conv && title && title !== conv.title) {
            this.dispatchEvent(new CustomEvent<AparteConversationRenameDetail>(
                'aparte-rename-conversation',
                { detail: { id: conv.id, title }, bubbles: true, composed: true }
            ));
        }
    }

    // ─── Events ───────────────────────────────────────────────────────────

    private _onClick = (e: Event): void => {
        const target = e.target as HTMLElement;
        const menuAction = target.closest<HTMLElement>('[data-menu-action]');
        if (menuAction && this._open?.menu.contains(menuAction)) {
            e.stopPropagation();
            this._onMenuAction(menuAction.dataset['menuAction']!);
            return;
        }
        const more = target.closest<HTMLElement>('[data-more-id]');
        if (more) {
            e.stopPropagation();
            if (this._open?.button === more) {
                this._closeMenu(true);
            } else {
                this._openMenu(more.closest<HTMLElement>('[data-conv-id]')!, more);
            }
            return;
        }
        if (target.closest('[data-rename-id]')) return;
        const select = target.closest<HTMLElement>('[data-select-id]');
        if (select) {
            this._closeMenu();
            this.dispatchEvent(new CustomEvent<AparteConversationSelectDetail>(
                'aparte-select-conversation',
                { detail: { id: select.dataset['selectId']! }, bubbles: true, composed: true }
            ));
        }
    };

    private _onKeydown = (e: KeyboardEvent): void => {
        const target = e.target as HTMLElement;
        if (this._open?.menu.contains(target)) {
            this._onMenuKeydown(e);
            return;
        }
        if (target.matches('[data-rename-id]')) {
            if (e.key === 'Enter') { e.preventDefault(); this._finishRename(true, true); }
            else if (e.key === 'Escape') { e.preventDefault(); this._finishRename(false, true); }
            return;
        }
        // The rows are real buttons: Enter and Space are the browser's.
    };

    /** Update active class without full re-render (perf optimisation). */
    private _updateActiveState(): void {
        const items = this.querySelectorAll<HTMLElement>('[data-conv-id]');
        items.forEach(el => {
            const isActive = el.dataset['convId'] === this._activeId;
            el.classList.toggle('aparte-conv-item--active', isActive);
            el.querySelector('[data-select-id]')?.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
    }
}

if (!customElements.get('aparte-conversation-list')) customElements.define('aparte-conversation-list', AparteConversationList);
