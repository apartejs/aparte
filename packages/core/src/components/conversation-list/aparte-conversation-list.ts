import { resolveConfig } from '../../config/index.js';
import { escapeAttr } from '../../utils/escape.js';
import { archiveIcon, unarchiveIcon, closeIcon } from '../../icons/glyphs.js';

export interface AparteConversationListItem {
    id: string;
    title: string;
    updatedAt?: number;
    /** When set, the item renders the unarchive action instead of archive. */
    archivedAt?: number;
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

/**
 * Conversation-history sidebar — a framework-agnostic web component. The host sets
 * the `conversations` JS property and the `active-id` attribute; this renders the
 * list and fires the user's intent, never acting on it itself.
 *
 * Children are not a composition point: `_render()` assigns `innerHTML` from the
 * `conversations` array, so any light-DOM child a host writes inside the element is
 * discarded the next time the list renders — and switching this element's locale is
 * enough to trigger one. Compose around the element, not inside it: it renders rows
 * and nothing else, with no header, no new-conversation button and no search field.
 *
 * What it is not: a store. Clicking a row selects nothing, and the two row actions
 * delete and archive nothing — the four events carry an id and stop. A row's text
 * comes from the array, so it changes when the host assigns `conversations` again;
 * the exception is an empty title, which falls back to the locale's new-chat label
 * and therefore follows a locale switch. An archived item is still rendered (it gains
 * `aparte-conv-item--archived` and swaps its action's icon and event name); filtering
 * archived conversations out of the list is the host's decision, not this element's.
 * The asymmetry between the two inputs is deliberate: `active-id` is an attribute
 * because moving the selection patches the rendered rows in place, while
 * `conversations` is a JS property because it is structured data an attribute cannot
 * carry, and setting it re-renders the whole list.
 *
 * @element aparte-conversation-list
 * @attr {string} active-id - The id of the conversation to render as selected.
 *
 * @fires {CustomEvent<AparteConversationSelectDetail>} aparte-select-conversation - A row was activated; the host loads that conversation.
 * @fires {CustomEvent<AparteConversationDeleteDetail>} aparte-delete-conversation - The delete action was pressed. Nothing is removed here.
 * @fires {CustomEvent<AparteConversationArchiveDetail>} aparte-archive-conversation - The archive action was pressed on a live conversation.
 * @fires {CustomEvent<AparteConversationArchiveDetail>} aparte-unarchive-conversation - The same action on an already-archived one; same detail shape, opposite intent.
 *
 * @cssprop [--aparte-conv-list-gap=2px] - Vertical gap between rows. The element itself is the flex column, so this is its `gap`.
 * @cssprop [--aparte-conv-item-padding=7px 10px] - Padding of a row.
 * @cssprop [--aparte-conv-item-gap=6px] - Gap between a row's title and its two action buttons.
 * @cssprop [--aparte-conv-item-radius=var(--aparte-radius-md)] - Corner radius of a row.
 * @cssprop [--aparte-conv-item-font-size=0.8125rem] - Font size of a row's title.
 * @cssprop [--aparte-conv-item-color=var(--aparte-text-muted)] - Title colour of an inactive row.
 * @cssprop [--aparte-conv-item-bg-hover=var(--aparte-surface-3)] - Row background on hover.
 * @cssprop [--aparte-conv-item-bg-active=var(--aparte-surface-3)] - Background of the row matching `active-id`.
 * @cssprop [--aparte-conv-item-color-active=var(--aparte-text)] - Title colour of the active row.
 * @cssprop [--aparte-conv-item-font-weight-active=var(--aparte-font-weight-medium, 500)] - Title weight of the active row.
 * @cssprop [--aparte-conv-action-btn-size=20px] - Square size of both action buttons. Under `(pointer: coarse)` the stylesheet redeclares it as 28px on the buttons themselves, so a value set on the element does not reach them there; the buttons also stay visible instead of appearing on hover.
 * @cssprop [--aparte-conv-delete-color=var(--aparte-text-muted)] - Icon colour of the delete button.
 * @cssprop [--aparte-conv-delete-bg-hover=var(--aparte-error)] - Delete button background on hover.
 * @cssprop [--aparte-conv-delete-color-hover=var(--aparte-text-inverse)] - Delete button icon colour on hover.
 * @cssprop [--aparte-conv-delete-radius=var(--aparte-radius-sm)] - Corner radius of the delete button.
 * @cssprop [--aparte-conv-archive-color=var(--aparte-text-muted)] - Icon colour of the archive/unarchive button.
 * @cssprop [--aparte-conv-archive-bg-hover=var(--aparte-surface-4, var(--aparte-surface-3))] - Archive button background on hover. Core declares no `--aparte-surface-4`, so unset it resolves to `--aparte-surface-3`.
 * @cssprop [--aparte-conv-archive-color-hover=var(--aparte-text)] - Archive button icon colour on hover.
 * @cssprop [--aparte-conv-archive-radius=var(--aparte-radius-sm)] - Corner radius of the archive button.
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
 * list.addEventListener('aparte-delete-conversation', (e) => remove(e.detail.id));
 */
export class AparteConversationList extends HTMLElement {
    private _conversations: AparteConversationListItem[] = [];
    private _activeId: string | null = null;

    static get observedAttributes(): string[] {
        return ['active-id'];
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────

    connectedCallback(): void {
        if (!this.classList.contains('aparte-conv-list')) {
            this.classList.add('aparte-conv-list');
        }
        if (!this.getAttribute('role')) {
            this.setAttribute('role', 'navigation');
        }
        this._render();
        window.addEventListener('aparte-config-change', this._onConfigChange);
    }

    disconnectedCallback(): void {
        window.removeEventListener('aparte-config-change', this._onConfigChange);
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue) return;
        if (name === 'active-id') {
            this._activeId = newValue;
            this._updateActiveState();
        }
    }

    /**
     * Re-render on a locale switch: every row's title fallback and both button
     * labels come from the locale, so without this the list stayed in the previous
     * language until something else happened to re-render it. Only OUR config.
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
        this.innerHTML = this._conversations
            .map(conv => this._renderItem(conv))
            .join('');
        this._bindEvents();
    }

    private _renderItem(conv: AparteConversationListItem): string {
        const locale = resolveConfig(this).getLocale();
        const isActive = conv.id === this._activeId;
        const isArchived = !!conv.archivedAt;
        const activeClass = isActive ? ' aparte-conv-item--active' : '';
        const archivedClass = isArchived ? ' aparte-conv-item--archived' : '';
        const escapedId = this._esc(conv.id);
        const escapedTitle = this._esc(conv.title || locale.newChat);
        const deleteLabel = this._esc(locale.deleteConversation);
        const archiveLabel = this._esc(locale['archiveConversation'] ?? 'Archive conversation');
        const unarchiveLabel = this._esc(locale['unarchiveConversation'] ?? 'Unarchive conversation');
        const archiveAction = isArchived ? 'unarchive' : 'archive';
        const archiveAriaLabel = isArchived ? unarchiveLabel : archiveLabel;
        // Distinct icons: a downward tray for archive, an upward tray for unarchive.
        // Marked at the declaration because the use site is inside a multi-line template
        // literal, where a `//` would render as text rather than exempt anything.
        const archiveGlyph = isArchived ? unarchiveIcon : archiveIcon;  // safe-text: both arms are glyphs from icons/glyphs.ts — markup by contract, the same strings getIcon() returns.
        return `
<div
  class="aparte-menu__item aparte-conv-item${activeClass}${archivedClass}"
  role="button"
  tabindex="0"
  data-conv-id="${escapedId}"
  aria-current="${isActive ? 'page' : 'false'}"
>
  <span class="aparte-conv-item__title">${escapedTitle}</span>
  <button
    class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-conv-item__archive"
    type="button"
    data-archive-id="${escapedId}"
    data-archive-action="${escapeAttr(archiveAction)}"
    aria-label="${escapeAttr(archiveAriaLabel)}"
    tabindex="0"
  >${archiveGlyph}</button>
  <button
    class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-conv-item__delete"
    type="button"
    data-delete-id="${escapedId}"
    aria-label="${deleteLabel}"
    tabindex="0"
  >
    ${closeIcon}
  </button>
</div>`;
    }

    private _bindEvents(): void {
        this.addEventListener('click', this._onClick);
        this.addEventListener('keydown', this._onKeydown);
    }

    private _onClick = (e: Event): void => {
        const target = e.target as HTMLElement;
        const archiveBtn = target.closest('[data-archive-id]') as HTMLElement | null;
        if (archiveBtn) {
            e.stopPropagation();
            const id = archiveBtn.dataset['archiveId']!;
            const action = archiveBtn.dataset['archiveAction'];
            const eventName = action === 'unarchive'
                ? 'aparte-unarchive-conversation'
                : 'aparte-archive-conversation';
            this.dispatchEvent(new CustomEvent<AparteConversationArchiveDetail>(
                eventName,
                { detail: { id }, bubbles: true, composed: true }
            ));
            return;
        }
        const deleteBtn = target.closest('[data-delete-id]') as HTMLElement | null;
        if (deleteBtn) {
            e.stopPropagation();
            const id = deleteBtn.dataset['deleteId']!;
            this.dispatchEvent(new CustomEvent<AparteConversationDeleteDetail>(
                'aparte-delete-conversation',
                { detail: { id }, bubbles: true, composed: true }
            ));
            return;
        }
        const item = target.closest('[data-conv-id]') as HTMLElement | null;
        if (item) {
            const id = item.dataset['convId']!;
            this.dispatchEvent(new CustomEvent<AparteConversationSelectDetail>(
                'aparte-select-conversation',
                { detail: { id }, bubbles: true, composed: true }
            ));
        }
    };

    private _onKeydown = (e: KeyboardEvent): void => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const item = (e.target as HTMLElement).closest('[data-conv-id]') as HTMLElement | null;
        if (item) {
            e.preventDefault();
            item.click();
        }
    };

    /** Update active class without full re-render (perf optimisation). */
    private _updateActiveState(): void {
        const items = this.querySelectorAll<HTMLElement>('[data-conv-id]');
        items.forEach(el => {
            const isActive = el.dataset['convId'] === this._activeId;
            el.classList.toggle('aparte-conv-item--active', isActive);
            el.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    private _esc(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&#039;');
    }
}

if (!customElements.get('aparte-conversation-list')) customElements.define('aparte-conversation-list', AparteConversationList);
