/**
 * AparteConversationList — conversation history sidebar primitive
 *
 * Framework-agnostic web component. The host sets the `conversations`
 * JS property and the `active-id` attribute; the component renders the
 * list and fires events for user interactions.
 *
 * @fires {CustomEvent<AparteConversationSelectDetail>} aparte:select-conversation
 * @fires {CustomEvent<AparteConversationDeleteDetail>} aparte:delete-conversation
 * @fires {CustomEvent<AparteConversationArchiveDetail>} aparte:archive-conversation
 * @fires {CustomEvent<AparteConversationUnarchiveDetail>} aparte:unarchive-conversation
 */

import { resolveConfig } from '../../config/index.js';

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

export interface AparteConversationUnarchiveDetail {
    id: string;
}

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
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue) return;
        if (name === 'active-id') {
            this._activeId = newValue;
            this._updateActiveState();
        }
    }

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
        const archiveIcon = isArchived
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 8 21 8"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><polyline points="9 14 12 11 15 14"/><line x1="12" y1="11" x2="12" y2="19"/></svg>`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 8 21 8"/><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><polyline points="9 14 12 17 15 14"/><line x1="12" y1="11" x2="12" y2="17"/></svg>`;
        return `
<div
  class="aparte-conv-item${activeClass}${archivedClass}"
  role="button"
  tabindex="0"
  data-conv-id="${escapedId}"
  aria-current="${isActive ? 'page' : 'false'}"
>
  <span class="aparte-conv-item__title">${escapedTitle}</span>
  <button
    class="aparte-conv-item__archive"
    type="button"
    data-archive-id="${escapedId}"
    data-archive-action="${archiveAction}"
    aria-label="${archiveAriaLabel}"
    tabindex="0"
  >${archiveIcon}</button>
  <button
    class="aparte-conv-item__delete"
    type="button"
    data-delete-id="${escapedId}"
    aria-label="${deleteLabel}"
    tabindex="0"
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
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
                ? 'aparte:unarchive-conversation'
                : 'aparte:archive-conversation';
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
                'aparte:delete-conversation',
                { detail: { id }, bubbles: true, composed: true }
            ));
            return;
        }
        const item = target.closest('[data-conv-id]') as HTMLElement | null;
        if (item) {
            const id = item.dataset['convId']!;
            this.dispatchEvent(new CustomEvent<AparteConversationSelectDetail>(
                'aparte:select-conversation',
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
            .replace(/>/g, '&gt;');
    }
}

customElements.define('aparte-conversation-list', AparteConversationList);
