import { resolveConfig } from '../../config/index.js';
import { APARTE_DEFAULT_LOCALE } from '../../config/locale.js';
import type { AparteConversationManager } from '../../conversations/conversation-manager.js';
import { escapeAttr, escapeHtml } from '../../utils/escape.js';
import { cssEscape } from '../../utils/css-escape.js';
import { activeElementIn } from '../../utils/event-target.js';
import { presenceOn } from '../../utils/presence.js';
import { placeFloating } from '../../utils/place-floating.js';
import { enhanceContextMenu, enhanceMenu, type AparteMenuSelectDetail } from '../../utils/menu.js';
import { foldText, filterConversationRows } from '../../utils/fold-text.js';
import {
    conversationStatusOf,
    rememberConversationStatus,
    tellConversationStatus,
    type AparteConversationStatus,
} from '../../conversations/conversation-status.js';
import { deferHydrationOf } from '../../interop/defer-hydration.js';
import { APARTE_CONVERSATION_DRAG_TYPE } from './drag-type.js';

export interface AparteConversationListItem {
    id: string;
    title: string;
    /** Drives the date groups. A list where no item carries one renders flat. */
    updatedAt?: number;
    /** When set, the row is italic and its menu offers unarchive instead of archive. */
    archivedAt?: number;
    /** When set, the row sits in the "Pinned" group first, and its menu offers unpin. */
    pinnedAt?: number;
    /**
     * The group the row sits in, named by the app (a project, a folder). A row that carries
     * one is grouped by it, before pinning and dates; the groups come first, in order of
     * first appearance, and the items without one fall to the date groups below. `flat`
     * still renders no heading.
     */
    group?: AparteConversationGroup;
}

/** A group of the app's (a project, a folder): what an item's `group` and `moveTargets` hold. */
export interface AparteConversationGroup {
    /** The app's id for the group; what `aparte-conversation-move` names. */
    key: string;
    /** Its heading in the list, and its item in the "Move to…" menu. */
    label: string;
}

/**
 * A conversation moved to another group, by its menu or by a drop. The list moves nothing
 * itself: the app writes the new group and assigns `conversations` again.
 */
export interface AparteConversationMoveDetail {
    id: string;
    /** The key of the group it leaves, or `null` when it was in none. */
    from: string | null;
    /** The key of the group it goes to (one of `moveTargets`), or `null` to take it out of its group. */
    to: string | null;
}

export { APARTE_CONVERSATION_DRAG_TYPE };

/** The row a list of the page is dragging now, seen by the others: one with a `dropKey` takes it. */
let pageDrag: { list: Element; id: string; from: string | null } | null = null;

/** What `renderMeta` is: an element, text, or `null` for a row with nothing to say. */
export type AparteConversationMetaRenderer = (item: AparteConversationListItem) => HTMLElement | string | null;

export interface AparteConversationSelectDetail {
    /**
     * The conversation to open, or `null` for a new conversation. The list sends a row's id; a
     * New chat button of the app's own sends `{ id: null }` on `window`, and the chats bound to
     * a manager start a new conversation for it.
     */
    id: string | null;
    /**
     * The id of the chat the list drives, its `target`, when it has one: the conversation
     * opens in that chat alone. Without it, in every chat of the page.
     */
    targetId?: string;
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

export type { AparteConversationStatus };

/**
 * A conversation's state changed, on `window`. The conversation controller sends it as
 * turns start, pause and end; every list on the page applies it to its row. `null` for
 * neither state.
 *
 * @event aparte-conversation-status
 */
export interface AparteConversationStatusDetail {
    id: string;
    status: AparteConversationStatus | null;
}

/** A status that is one of the two, from anyone's event: anything else is none. */
const statusOf = (value: unknown): AparteConversationStatus | null =>
    value === 'running' || value === 'waiting' ? value : null;

/** A date group: its heading (null for the undated tail) and its rows, in host order. */
interface ConversationGroup {
    key: string;
    label: string | null;
    items: AparteConversationListItem[];
    /** One of the app's groups (an item's `group`), not a date: a row dropped on it moves there. */
    app?: true;
}

/** Locale keys this element reads; each falls back to the English default. */
type ListLocaleKey =
    | 'newChat' | 'loadingConversations' | 'conversationList' | 'deleteConversation' | 'archiveConversation' | 'unarchiveConversation'
    | 'conversationActions' | 'renameConversation' | 'conversationTitle'
    | 'pinConversation' | 'unpinConversation' | 'deleteConversationConfirm' | 'cancel'
    | 'conversationGroupPinned' | 'conversationGroupToday' | 'conversationGroupYesterday'
    | 'conversationGroupWeek' | 'conversationGroupMonth' | 'conversationSearchEmpty'
    | 'conversationRunning' | 'conversationWaiting'
    | 'moveConversation' | 'moveConversationTo' | 'removeFromGroup';

/** A selector for the row button carrying `id` on `attr`. */
function rowSelector(attr: string, id: string): string {
    return `[${attr}="${cssEscape(id)}"]`;  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
}

const DAY = 864e5;
/** The glyphs a row draws: an icon set that changes one of them is a change the list draws. */
const LIST_GLYPHS = ['more', 'edit', 'pin', 'archive', 'unarchive', 'trash'] as const;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * Conversation-history sidebar — a framework-agnostic web component. The host sets
 * the `conversations` JS property and the `active-id` attribute; this renders the
 * rows and fires the user's intent. Acting on it is the host's, unless `manage` hands
 * the row menu's writes to the registered conversation manager.
 *
 * A row is two real buttons: the title, which selects, and a `⋯` that opens the row's
 * menu — rename, pin or unpin, archive or unarchive, delete. A right click on a row,
 * Shift+F10 or the Menu key opens the same menu there. Every item fires an event
 * and stops; the one exception is delete, which asks first, inline in the menu,
 * because it is the one action the host cannot undo. Rename swaps the title for an
 * input: Enter or leaving the field commits, Escape cancels, and an unchanged or
 * emptied title fires nothing. The rows are grouped by date — Pinned, Today,
 * Yesterday, Previous 7 days, Previous 30 days, then one heading per month — as soon
 * as any item carries `updatedAt`; set `flat` to render them flat.
 *
 * Children are not a composition point: `_render()` assigns `innerHTML` from the
 * `conversations` array, so any light-DOM child a host writes inside the element is
 * discarded the next time the list renders — and switching this element's locale is
 * enough to trigger one. Compose around the element, not inside it: it renders rows
 * and nothing else, with no header, no new-conversation button and no search field.
 *
 * What it is not: a store. Selecting, renaming, pinning, archiving and deleting all
 * leave the array untouched — the events carry an id (and, for rename, the title) and
 * stop. Set `manage` and the menu's write gestures are carried out on the conversation
 * manager you registered, so you do not write those six listeners; the
 * event still goes out first and `preventDefault()` takes the gesture back. The array
 * is still not this element's: the manager's own change is what re-renders it.
 * A row's text comes from the array, so it changes when the host assigns
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
 * @attr {boolean} flat - Render the rows flat, in host order, with no date headings.
 * @attr {string} drop-key - The key of the group this whole list stands for (a project the app draws a heading of its own for). Its rows with no `group` are in it, a row dropped on it moves `to` it, from this list's other groups or from another list of the page, and dropped back on it, nothing moves. Unset, the default, a drop on rows of no group takes a row out of its group.
 * @attr {boolean} data-no-match - Reflected BY the element while `filter()` holds a query no title matches. Read-only.
 * @attr {boolean} loading - The list is on its way: six skeleton rows stand where the rows will be, the
 *                    element is `aria-busy` and a visually hidden line names the wait. A list that is
 *                    not there yet is not an empty list. Set it while your store answers, clear it when
 *                    you assign `conversations`.
 * @attr {boolean} manage - Let the list finish the gesture: rename, pin, unpin, archive, unarchive and
 *                    delete are performed on the conversation manager registered with
 *                    `setConversationManager()`, instead of leaving you six listeners to write. The
 *                    event still fires first, and `preventDefault()` on it takes the gesture back.
 *                    Off by default, and selecting stays yours either way.
 * @attr {string} target - The id of the chat this list drives, for a page with more than one chat
 *                    or a list placed beside its chat: a row's click then opens the conversation
 *                    in that chat alone (`targetId` in `aparte-conversation-select`), and `manage`
 *                    acts on that chat's conversation manager. Read at every gesture rather than
 *                    observed. Without it, a click is for every chat of the page, and `manage`
 *                    finds the manager where the list sits.
 *
 * @fires {CustomEvent<AparteConversationSelectDetail>} aparte-conversation-select - A row's title was activated; the host loads that conversation.
 * @fires {CustomEvent<AparteConversationRenameDetail>} aparte-conversation-rename - A rename was committed with a new, non-empty title. Cancelable: `preventDefault()` takes the gesture back from `manage`.
 * @fires {CustomEvent<AparteConversationPinDetail>} aparte-conversation-pin - The pin item was chosen on an unpinned row. Cancelable: `preventDefault()` takes the gesture back from `manage`.
 * @fires {CustomEvent<AparteConversationPinDetail>} aparte-conversation-unpin - The same item on a pinned row; same detail shape, opposite intent. Cancelable, like the rest.
 * @fires {CustomEvent<AparteConversationArchiveDetail>} aparte-conversation-archive - The archive item was chosen on a live conversation. Cancelable: `preventDefault()` takes the gesture back from `manage`.
 * @fires {CustomEvent<AparteConversationArchiveDetail>} aparte-conversation-unarchive - The same item on an already-archived one; same detail shape, opposite intent. Cancelable, like the rest.
 * @fires {CustomEvent<AparteConversationDeleteDetail>} aparte-conversation-delete - The delete was confirmed. Cancelable: `preventDefault()` takes the gesture back from `manage`.
 * @fires {CustomEvent<AparteConversationMoveDetail>} aparte-conversation-move - A conversation was moved to another group of `moveTargets` (`to`), or out of its group (`to: null`), by its menu or by a drop. The list moves nothing: assign `conversations` again with the new group. `manage` does not carry it out either, since a group is the app's, so there is nothing for `preventDefault()` to take back.
 *
 * @cssprop [--aparte-conv-list-gap=var(--aparte-space-1)] - Vertical gap between rows, and between a group's heading and its rows.
 * @cssprop [--aparte-conv-item-padding=var(--aparte-space-4) var(--aparte-space-5)] - Padding of a row's title button.
 * @cssprop [--aparte-conv-item-gap=var(--aparte-space-3)] - Gap between a row's title and its `⋯` button.
 * @cssprop [--aparte-conv-item-radius=var(--aparte-radius-md)] - Corner radius of a row.
 * @cssprop [--aparte-conv-item-font-size=var(--aparte-font-size-md)] - Font size of a row's title.
 * @cssprop [--aparte-conv-item-color=var(--aparte-text)] - Title colour of an inactive row.
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
 * list.addEventListener('aparte-conversation-select', (e) => load(e.detail.id));
 * list.addEventListener('aparte-conversation-rename', (e) => manager.updateTitle(e.detail.id, e.detail.title));
 * list.addEventListener('aparte-conversation-pin', (e) => manager.pin(e.detail.id));
 * list.addEventListener('aparte-conversation-delete', (e) => manager.delete(e.detail.id));
 *
 * @example
 * // Or let the list finish the gesture: register the manager once, add `manage`, and
 * // rename / pin / archive / delete are carried out for you. The events still fire.
 * aparteGlobalConfig.setConversationManager(manager);
 * list.setAttribute('manage', '');
 *
 * @example
 * // Moving a conversation between your groups (projects, folders): name where a row can go,
 * // and write the move yourself. "Move to…" joins the row's menu, a row can be dropped on a
 * // group, and a row in a group gets "Remove from …".
 * list.moveTargets = [{ key: 'p-launch', label: 'Launch' }, { key: 'p-docs', label: 'Docs' }];
 * list.addEventListener('aparte-conversation-move', (e) => {
 *   store.setGroup(e.detail.id, e.detail.to); // `to` is a key, or null for no group
 *   list.conversations = store.items();
 * });
 */
export class AparteConversationList extends HTMLElement {
    private _conversations: AparteConversationListItem[] = [];
    private _activeId: string | null = null;
    /**
     * What stops the menus of the rows on screen: one `enhanceMenu` per `⋯`, and the
     * context menu over the whole list. A render replaces the rows, so it releases them
     * all and wires the new ones.
     */
    private _menus: Array<() => void> = [];
    /** The context menu's element: one for the list, filled for the row it was asked about. */
    private _contextMenu: HTMLElement | null = null;
    private _renaming: { id: string; input: HTMLInputElement; done: boolean } | null = null;
    private _warnedNoManager = false;

    static get observedAttributes(): string[] {
        return ['active-id', 'flat', 'loading', 'manage', 'drop-key'];
    }

    /**
     * The list is on its way: rows of the kit's skeleton stand where the rows will be,
     * the element is `aria-busy`, and a visually hidden line names the wait. Reflected
     * as the `loading` attribute, so a site sets it while its store answers and clears
     * it when `conversations` is set. A list that is not there yet is not an empty list.
     */
    get loading(): boolean {
        return this.hasAttribute('loading');
    }

    set loading(value: boolean) {
        // `presenceOn`, like every other boolean property in core: `''` is the ON that
        // React stringifies and Svelte 5 assigns, and `toggleAttribute` reads it as
        // falsy — the documented spelling turned the wait off.
        this.toggleAttribute('loading', presenceOn(value));
    }

    /**
     * Let the list finish the gesture through the registered conversation manager.
     * Reflected as the `manage` attribute.
     *
     * The property exists because this is the attribute that authorises a WRITE, and Vue
     * and both Sveltes stringify a bound `false` onto an element that has no property of
     * that name — `manage="false"`, which `hasAttribute` reads as on. Without it,
     * turning management off would turn it on. `presenceOn`, like `loading` above it.
     */
    get manage(): boolean {
        return this.hasAttribute('manage');
    }

    set manage(value: boolean) {
        this.toggleAttribute('manage', presenceOn(value));
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
        this.addEventListener('aparte-menu-select', this._onMenuSelect);
        this.addEventListener('pointerdown', this._onPress);
        this.addEventListener('dragstart', this._onDragStart);
        this.addEventListener('dragenter', this._onDragEnter);
        this.addEventListener('dragover', this._onDragOver);
        this.addEventListener('dragleave', this._onDragLeave);
        this.addEventListener('drop', this._onDrop);
        this.addEventListener('dragend', this._onDragEnd);
        this.ownerDocument.addEventListener('dragend', this._onPageDragEnd, true);
        this._render();
        window.addEventListener('aparte-config-change', this._onConfigChange);
        window.addEventListener('aparte-conversation-status', this._onStatus);
    }

    disconnectedCallback(): void {
        this._releaseMenus();
        this.removeEventListener('click', this._onClick);
        this.removeEventListener('keydown', this._onKeydown);
        this.removeEventListener('aparte-menu-select', this._onMenuSelect);
        this.removeEventListener('pointerdown', this._onPress);
        this.removeEventListener('dragstart', this._onDragStart);
        this.removeEventListener('dragenter', this._onDragEnter);
        this.removeEventListener('dragover', this._onDragOver);
        this.removeEventListener('dragleave', this._onDragLeave);
        this.removeEventListener('drop', this._onDrop);
        this.removeEventListener('dragend', this._onDragEnd);
        this.ownerDocument.removeEventListener('dragend', this._onPageDragEnd, true);
        this._dragging = null;
        // A list taken off the page mid-drag gets no `dragend`: its row is no longer the page's drag.
        if (pageDrag?.list === this) pageDrag = null;
        window.removeEventListener('pointerup', this._onRelease, true);
        window.removeEventListener('pointercancel', this._onRelease, true);
        this._pressed = false;
        this._renderAfterPress = false;
        window.removeEventListener('aparte-config-change', this._onConfigChange);
        window.removeEventListener('aparte-conversation-status', this._onStatus);
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue === newValue) return;
        if (name === 'active-id') {
            this._activeId = newValue;
            this._updateActiveState();
        } else if ((name === 'flat' || name === 'loading') && this.isConnected) {
            this._render();
        } else if (name === 'drop-key' && this.isConnected) {
            // The rows' own group changes with it: what Move to… lists.
            this._renderUnlessHeld();
        }
    }

    /**
     * Re-render on a locale switch: every row's title fallback, the `⋯` button's name
     * and the group headings come from the locale, so without this the list stayed in
     * the previous language until something else happened to re-render it. Only OUR
     * config.
     *
     * Only for what the list draws from it, and held like any render asked from outside.
     * The event goes out for every change of the config (a provider registered, a model
     * selected, a tool display), and redrawing on each of them detached a row menu open
     * under the pointer and lost a title being renamed, when an app registered its models
     * a second after launch.
     */
    private _onConfigChange = (e: Event): void => {
        const detail = (e as CustomEvent).detail as { config?: unknown } | undefined;
        if (detail?.config && detail.config !== resolveConfig(this)) return;
        const now = this._configDrawn();
        const drawn = this._drawnWith;
        if (drawn && drawn.locale === now.locale && drawn.glyphs === now.glyphs) return;
        this._renderUnlessHeld();
    };

    /** What the last render read from the config: its words and its glyphs. */
    private _drawnWith: { locale: object; glyphs: string } | null = null;

    /** The locale the list's words come from, and the glyphs it draws. */
    private _configDrawn(): { locale: object; glyphs: string } {
        const cfg = resolveConfig(this);
        return {
            locale: cfg.getLocale(),
            glyphs: LIST_GLYPHS.map((name) => cfg.getIcon(name)).join('\n'),
        };
    }

    /**
     * `aparte-conversation-status`, on `window`: the controller's, a list's, or an app's own.
     * Kept page-wide too (an app may dispatch the event itself), then drawn on this row.
     */
    private _onStatus = (e: Event): void => {
        const detail = (e as CustomEvent<Partial<AparteConversationStatusDetail> | undefined>).detail;
        if (typeof detail?.id !== 'string') return;
        rememberConversationStatus(detail.id, statusOf(detail.status));
        const row = this.querySelector<HTMLElement>(rowSelector('data-conv-id', detail.id));
        if (row) this._applyStatus(row, detail.id);
    };

    // ─── Public API ───────────────────────────────────────────────────────

    /**
     * Say what a conversation is doing: `running` while an AI answers in it, `waiting`
     * while its turn waits for the person, `null` for neither. The row carries it as
     * `data-status`, a running title wears `aparte-shimmer`, a waiting row shows its mark
     * (`.aparte-conv-item__status`, an empty slot otherwise), and a screen reader hears
     * the state with the title. The look is CSS on `data-status`: a site that wants a dot
     * for `running` draws it in the slot and takes the shimmer off.
     *
     * A state is about a conversation, not about this list: it is kept page-wide and every
     * list on the page draws it, one that connects later included. Patched in place, and
     * kept across re-renders and for rows not drawn yet. The conversation controller sets
     * it on its own through `aparte-conversation-status`.
     */
    setConversationStatus(id: string, status: AparteConversationStatus | null): void {
        tellConversationStatus(id, statusOf(status));
    }

    /** What a conversation is doing, as last told; `null` for neither. */
    getConversationStatus(id: string): AparteConversationStatus | null {
        return conversationStatusOf(id);
    }

    /** Write a conversation's state onto its row — the same three things `_renderItem` draws. */
    private _applyStatus(row: HTMLElement, id: string): void {
        const status = conversationStatusOf(id);
        if (status) row.setAttribute('data-status', status);
        else row.removeAttribute('data-status');
        const answering = status === 'running';
        row.querySelector('.aparte-conv-item__title')?.classList.toggle('aparte-shimmer', answering);
        const heard = row.querySelector('.aparte-conv-item__state');
        if (heard) heard.textContent = this._statusWords(status);
    }

    /** The words a screen reader hears for a state. Literal `t('…')` reads, for the locale guard. */
    private _statusWords(status: AparteConversationStatus | null): string {
        if (status === 'running') return this._t('conversationRunning');
        if (status === 'waiting') return this._t('conversationWaiting');
        return '';
    }

    /**
     * Set the list of conversations to display. Triggers a re-render — held while a row's menu is
     * open or a title is being renamed, and run when that ends.
     *
     * A host assigns this on every manager change, and a wrapper on every render of the app around
     * it, often the very array the list holds (mutated in place, so it is drawn again rather than
     * skipped). A render replaces the rows, and with them the open menu and the field being typed
     * in: those are the reader's, so the rows wait for them, as they wait for a press to land.
     */
    set conversations(items: AparteConversationListItem[]) {
        this._conversations = Array.isArray(items) ? items : [];
        this._renderUnlessHeld();
    }

    /** A render held by an open menu or a rename (see `conversations`): run once it is over. */
    private _renderAfterMenu = false;

    /**
     * The one way a render asked from outside runs: held while a row menu is open or a title is
     * being renamed, drawn once that ends. A press's deferred render goes through it too, so a
     * rename started by the click that closed a menu is not wiped by the render that menu held.
     */
    private _renderUnlessHeld(): void {
        // A drag too: drawing the rows again under it removes the row being dragged, and the
        // drop then lands nowhere.
        if ((this._renaming && !this._renaming.done) || this.querySelector('[data-menu-for]') || this._dragging) {
            this._renderAfterMenu = true;
            return;
        }
        this._render();
    }
    private _renderHeld(): void {
        if (!this._renderAfterMenu || !this.isConnected) return;
        this._renderAfterMenu = false;
        this._render();
    }

    private _moveTargets: AparteConversationGroup[] = [];

    /**
     * Where a conversation can be moved: the app's groups (projects, folders), the same
     * `{ key, label }` an item's `group` carries, in the order "Move to…" lists them.
     *
     * Empty, the default, nothing moves and the list is what it always was. Set, a row's menu
     * offers "Move to…" (every target but the row's own group, listed in the menu) and, for a
     * row in a group, "Remove from …"; and a row can be dragged onto another group, or out of
     * its group onto the rest of the list. Each sends `aparte-conversation-move`, and the list
     * moves nothing until `conversations` is assigned again. A target no row is in has no
     * heading to drop on: the menu reaches it.
     */
    set moveTargets(targets: AparteConversationGroup[]) {
        // Kept as given, as `conversations` is: a wrapper hands the same array back on every
        // render, and reads back the one it gave.
        this._moveTargets = Array.isArray(targets) ? targets : [];
        this._renderUnlessHeld();
    }

    get moveTargets(): AparteConversationGroup[] {
        return this._moveTargets;
    }

    /** The key of the group this whole list stands for, or `null`: the `drop-key` attribute. */
    get dropKey(): string | null {
        return this.getAttribute('drop-key') || null;
    }

    set dropKey(key: string | null) {
        if (key) this.setAttribute('drop-key', key);
        else this.removeAttribute('drop-key');
    }


    /** The targets that are groups: a `{ key, label }` of strings, anything else skipped. */
    private _targets(): AparteConversationGroup[] {
        return this._moveTargets.filter((t) => !!t && typeof t.key === 'string' && typeof t.label === 'string');
    }

    get conversations(): AparteConversationListItem[] {
        return this._conversations;
    }

    private _renderMeta: AparteConversationMetaRenderer | null = null;

    /**
     * Draws something of the app's after a row's title — a shared mark, a count, a status
     * pill — and returns `null` for a row with nothing to say. An element goes in as it is;
     * a string is text, never markup. It sits BESIDE the title button, not inside it, so it
     * may hold a button or a link of its own, with its own accessible name. Setting it draws
     * the rows again, held like `conversations` while a menu is open or a title is being
     * renamed; the same function handed again draws nothing. It is read on every render after that.
     */
    set renderMeta(fn: AparteConversationMetaRenderer | null) {
        const next = typeof fn === 'function' ? fn : null;
        if (next === this._renderMeta) return;
        this._renderMeta = next;
        this._renderUnlessHeld();
    }

    get renderMeta(): AparteConversationMetaRenderer | null {
        return this._renderMeta;
    }

    /** Puts what `renderMeta` returns after each row's title. Rows are strings, so this runs on the built DOM. */
    private _applyMeta(): void {
        const draw = this._renderMeta;
        if (!draw) return;
        const byId = new Map(this._conversations.map((c) => [c.id, c]));
        for (const row of this.querySelectorAll<HTMLElement>('[data-conv-id]')) {
            const item = byId.get(row.dataset['convId'] ?? '');
            const select = row.querySelector('.aparte-conv-item__select');
            if (!item || !select) continue;
            const made = draw(item);
            if (made === null || made === undefined || made === '') continue;
            const slot = document.createElement('span');
            slot.className = 'aparte-conv-item__meta';
            if (typeof made === 'string') slot.textContent = made;
            else slot.append(made);
            select.after(slot);
        }
    }

    // ─── Rendering ────────────────────────────────────────────────────────

    /**
     * A press holds every render until its click has landed. The host re-assigns
     * `conversations` on every manager change (a save moves a row, a select marks one),
     * and a row replaced between `mousedown` and `mouseup` loses its click: Chromium
     * sends it to the list, where the delegated handler matches nothing, and WebKit
     * sends none. Keeping the row node would not help: a row moved to its new place
     * leaves the document on the way, and the row that moves is often the one pressed
     * (the conversation just saved). So nothing changes under a pointer that is down,
     * and the render runs once, after the click.
     */
    private _pressed = false;
    private _renderAfterPress = false;

    private _onPress = (): void => {
        if (this._pressed) return;
        this._pressed = true;
        window.addEventListener('pointerup', this._onRelease, true);
        window.addEventListener('pointercancel', this._onRelease, true);
    };

    private _onRelease = (e: Event): void => {
        window.removeEventListener('pointerup', this._onRelease, true);
        window.removeEventListener('pointercancel', this._onRelease, true);
        // A finger's tap: its click comes after the finger is lifted, as a gesture of its own,
        // later than the next task. Ended then, the held render replaced the row under the
        // finger before its click arrived. It lasts until that click, or a moment if none comes.
        if (e.type === 'pointerup' && (e as PointerEvent).pointerType === 'touch') {
            const end = (): void => {
                clearTimeout(timer);
                window.removeEventListener('click', end, true);
                setTimeout(() => this._endPress(), 0);
            };
            const timer = setTimeout(end, 600);
            window.addEventListener('click', end, true);
            return;
        }
        // `mouseup` and `click` follow `pointerup` in the same task: this runs after them.
        setTimeout(() => this._endPress(), 0);
    };

    /** The press is over: the render it held runs now, unless something else still holds it. */
    private _endPress(): void {
        window.removeEventListener('pointerup', this._onRelease, true);
        window.removeEventListener('pointercancel', this._onRelease, true);
        this._pressed = false;
        if (!this._renderAfterPress) return;
        this._renderAfterPress = false;
        if (this.isConnected) this._renderUnlessHeld();
    }

    /** The name this element last wrote, so one the app wrote — before or after connect — is left alone. */
    private _ownLabel: string | null = null;

    private _render(): void {
        // A landmark needs a name once a page has a second one (axe landmark-unique): the
        // locale's, unless the app named it — an `aria-label` or `aria-labelledby` of its own wins.
        const current = this.getAttribute('aria-label');
        if (!this.hasAttribute('aria-labelledby') && (current === null || current === this._ownLabel)) {
            this._ownLabel = this._t('conversationList');
            this.setAttribute('aria-label', this._ownLabel);
        }
        if (this._pressed) {
            this._renderAfterPress = true;
            return;
        }
        this._renderAfterMenu = false;
        this._drawnWith = this._configDrawn();
        // The menus and the rename input live inside the rows; a render replaces them.
        this._releaseMenus();
        this._renaming = null;
        // Where the keyboard was, so it can be put back: `innerHTML` below replaces every
        // row, and Enter on a row is followed by exactly this render (the host marks the
        // active conversation and re-assigns the list). The button the reader was on is
        // gone by then and the focus lands on `<body>`, so the next Tab restarts at the
        // top of the page. Same rule the rename exit already follows.
        // `activeElementIn`, not `document.activeElement`: that retargets to the shadow
        // HOST for a list mounted in a consumer's own root, so `contains` answered no and
        // nothing was ever held.
        const focused = activeElementIn(this) as HTMLElement | null;
        const held = focused && this.contains(focused)
            ? focused.closest<HTMLElement>('[data-select-id], [data-more-id]')
            : null;
        const restore = held?.dataset['selectId']
            ? rowSelector('data-select-id', held.dataset['selectId'])
            : held?.dataset['moreId']
                ? rowSelector('data-more-id', held.dataset['moreId'])
                : null;
        // Where that row sat, for the case where it does not come back: a delete is
        // confirmed from the row's own menu, so the row the keyboard is on is the row
        // that leaves.
        const heldRow = held?.closest<HTMLElement>('[data-conv-id]') ?? null;
        // Among the rows a reader can reach: with a search held, the hidden ones do not count.
        const visible = (el: Element): boolean => !el.closest('[hidden]');
        const heldIndex = heldRow
            ? Array.from(this.querySelectorAll<HTMLElement>('[data-conv-id]')).filter(visible).indexOf(heldRow)
            : -1;
        const loading = this.hasAttribute('loading');
        this.setAttribute('aria-busy', loading ? 'true' : 'false');
        if (loading) {
            // A list on its way matches nothing yet: no "no match" while it loads.
            this.removeAttribute('data-no-match');
            // Six rows of the recipe, the widths varied so it reads as a list and not a
            // grid; a status line off screen, because aria-busy alone is often ignored.
            // Literals only, no interpolation at all: the text-escaping guard reads a
            // `.repeat()` on a string as an interpolation it cannot see through, and a red
            // guard is a guard somebody skips.
            const row = '<span class="aparte-skeleton aparte-skeleton--text"></span>';
            this.innerHTML =
                '<div class="aparte-conv-list-loading" aria-hidden="true">' + row + row + row + row + row + row + '</div>'
                + '<span class="aparte-conv-list-loading-status aparte-sr-only" role="status"></span>';
            // The text lands AFTER the node does. A live region created with its content
            // already in it is a new node, not a change, and several screen readers
            // announce nothing at all. One frame is enough for it to be registered; if the
            // wait ends first the node is gone and there is nothing left to say.
            const status = this.querySelector<HTMLElement>('.aparte-conv-list-loading-status');
            const say = (): void => { if (status?.isConnected) status.textContent = this._t('loadingConversations'); };
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(say);
            else say();
            return;
        }
        // The no-match line outlives the rows, and never leaves the document: rebuilt with
        // them, or detached and put back, it is a new live region to the accessibility tree,
        // whose text may be announced again — "No conversation matches" after every save.
        const line = this.querySelector<HTMLElement>(':scope > .aparte-conv-list-no-match');
        const groups = this._groups().map(g => this._renderGroup(g)).join('');
        if (line) {
            for (const child of Array.from(this.childNodes)) if (child !== line) child.remove();
            line.insertAdjacentHTML('beforebegin', groups);
        } else {
            this.innerHTML = groups;
        }
        this._applyMeta();
        this._applyFilter();
        this._wireMenus();
        if (!restore) return;
        // The same row, by id — not the same element, which no longer exists — when the
        // search still shows it: a focus() inside `hidden` lands on <body>.
        const back = this.querySelector<HTMLElement>(restore);  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
        if (back && visible(back)) { back.focus(); return; }
        // That row left the list. The keyboard goes to the row that took its place (the
        // next one, else the one above), and to the list itself when the last
        // conversation goes — never to `<body>`, which would restart the next Tab at the
        // top of the page right after the one action here that cannot be undone.
        const rows = Array.from(this.querySelectorAll<HTMLElement>('[data-select-id]')).filter(visible);
        const next = heldIndex >= 0 ? (rows[heldIndex] ?? rows[rows.length - 1]) : null;
        if (next) { next.focus(); return; }
        // Borrowed, not taken: a host that made the list focusable keeps its own tab
        // stop, and the one we add leaves with the focus rather than sitting in the tab
        // order for the rest of the session.
        if (!this.hasAttribute('tabindex')) {
            this.setAttribute('tabindex', '-1');
            this.addEventListener('blur', () => this.removeAttribute('tabindex'), { once: true });
        }
        this.focus();
    }

    /** The query `filter()` holds, folded; re-applied on every render, so new rows obey it. */
    private _query = '';

    /**
     * Show only the conversations whose title contains `query`, case- and
     * accent-insensitive, and the date groups that still hold one; return how many match.
     * An empty query shows everything. The query is kept through every render — a new
     * conversation, a rename — and when nothing matches the list says so in a status line
     * (the locale's `conversationSearchEmpty`) and carries `data-no-match`.
     */
    filter(query: string): number {
        this._query = foldText(query);
        return this._applyFilter();
    }

    private _applyFilter(): number {
        const needle = this._query;
        // Rows that are not there yet match nothing and miss nothing: the skeleton is shown.
        if (this.hasAttribute('loading')) return 0;
        const matches = filterConversationRows(this, needle);
        const noMatch = needle !== '' && matches === 0;
        this.toggleAttribute('data-no-match', noMatch);
        // Always there, empty until a miss: a live region created with its text already in
        // it is a new node, not a change, and several screen readers announce nothing.
        let line = this.querySelector<HTMLElement>(':scope > .aparte-conv-list-no-match');
        const born = !line;
        if (!line) {
            line = document.createElement('p');
            line.className = 'aparte-conv-list-no-match';
            line.setAttribute('role', 'status');
            this.appendChild(line);
        }
        const text = noMatch ? this._t('conversationSearchEmpty') : '';
        const write = (): void => { if (line!.isConnected && line!.textContent !== text) line!.textContent = text; };
        // A line a render just made is a new node, and its first text has to come a frame
        // later to be announced (same as the loading status).
        if (born && text && typeof requestAnimationFrame === 'function') requestAnimationFrame(write);
        else write();
        return matches;
    }

    private _t(key: ListLocaleKey): string {
        const locale = resolveConfig(this).getLocale();
        return locale[key] ?? APARTE_DEFAULT_LOCALE[key] ?? '';
    }

    /**
     * Pinned first, then the calendar buckets every chat product uses, then a heading
     * per month (newest first), then whatever carries no date. Flat when nothing is
     * dated or the host asked for `flat`: a heading over the only group would say
     * nothing.
     */
    private _groups(): ConversationGroup[] {
        const items = this._conversations;
        if (this.hasAttribute('flat') || !items.some(c => typeof c.updatedAt === 'number' || c.group)) {
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
        const named = new Map<string, ConversationGroup>();
        for (const c of items) {
            if (c.group) {
                // The app's own group wins over pinning and dates, and has a map of its own so
                // a group called 'today' cannot be mistaken for the date bucket.
                let g = named.get(c.group.key);
                if (!g) {
                    g = { key: c.group.key, label: c.group.label, items: [], app: true };
                    named.set(c.group.key, g);
                }
                g.items.push(c);
                continue;
            }
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
        return [...named.values(), ...fixed, ...months, ...(undated ? [undated] : [])];
    }

    private _renderGroup(group: ConversationGroup): string {
        const rows = group.items.map(conv => this._renderItem(conv)).join('');  // safe-text: each row is built by _renderItem, which escapes every field it interpolates.
        if (group.label === null) {
            return `<div class="aparte-conv-group">${rows}</div>`;
        }
        const label = escapeHtml(group.label);
        // The app's own group says which it is, for a row dropped on it (`moveTargets`).
        const key = group.app ? ` data-group-key="${escapeAttr(group.key)}"` : '';
        return `
<div class="aparte-conv-group"${key} role="group" aria-label="${escapeAttr(group.label)}">
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
        // What the conversation is doing (setConversationStatus): data on the row, a
        // shimmer on a running title, the mark's slot, and the words a screen reader hears
        // with the title. `status` is one of two literals: `statusOf` let nothing else in.
        const status = conversationStatusOf(conv.id);
        const statusAttr = status ? ` data-status="${escapeAttr(status)}"` : '';
        const titleClass = escapeAttr(status === 'running' ? 'aparte-conv-item__title aparte-shimmer' : 'aparte-conv-item__title');
        const heard = escapeHtml(this._statusWords(status));
        // Draggable only when there is somewhere to drag it to: without `moveTargets` a row is
        // what it always was, and a press that moves the mouse selects text as it did.
        const draggable = this._targets().length > 0 ? ' draggable="true"' : '';
        return `
<div class="${escapeAttr(classes)}" data-conv-id="${escapedId}"${statusAttr}${draggable}>
  <button
    class="aparte-conv-item__select"
    type="button"
    data-select-id="${escapedId}"
    aria-current="${isActive ? 'page' : 'false'}"
  ><span class="${titleClass}" dir="auto">${title}</span><span class="aparte-conv-item__status" aria-hidden="true"></span><span class="aparte-conv-item__state aparte-sr-only">${heard}</span></button>
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
        // With `moveTargets`: "Move to…" when there is another group to go to, and "Remove
        // from …" for a row that is in one, where the market puts them (after pin, before
        // archive). Without, the menu is the one it always was.
        let moving = '';
        const targets = this._targets();
        if (targets.length > 0) {
            const folderGlyph = config.getIcon('folder');  // safe-text: the icon provider's SVG — markup by contract.
            const closeGlyph = config.getIcon('close');  // safe-text: the icon provider's SVG — markup by contract.
            if (targets.some((t) => t.key !== this._groupOf(conv))) {
                const move = escapeHtml(this._t('moveConversation'));
                moving += `<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="move" aria-haspopup="menu">${folderGlyph}<span>${move}</span></button>`;
            }
            if (conv.group) {
                const out = escapeHtml(this._t('removeFromGroup').replace('{group}', () => conv.group!.label));
                moving += `<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="ungroup">${closeGlyph}<span>${out}</span></button>`;
            }
        }
        return `
<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="rename">${editGlyph}<span>${rename}</span></button>
<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="pin">${pinGlyph}<span>${pin}</span></button>
${moving}
<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="archive">${archiveGlyph}<span>${archive}</span></button>
<div class="aparte-menu__separator" role="separator"></div>
<button type="button" class="aparte-menu__item aparte-conv-menu__item--danger" role="menuitem" data-menu-action="delete">${trashGlyph}<span>${remove}</span></button>`;
    }

    /** "Move to…"'s step: every target but the row's own group, as items of the same menu. */
    private _moveMarkup(conv: AparteConversationListItem): string {
        const folderGlyph = resolveConfig(this).getIcon('folder');  // safe-text: the icon provider's SVG — markup by contract.
        return this._targets()
            .filter((t) => t.key !== this._groupOf(conv))
            .map((t) => `<button type="button" class="aparte-menu__item" role="menuitem" data-menu-action="move-to" data-move-to="${escapeAttr(t.key)}">${folderGlyph}<span>${escapeHtml(t.label)}</span></button>`)
            .join('');
    }

    /**
     * Say a conversation moved, from the group it is in to `to` (`null`: out of any). The
     * list moves nothing: the app writes it and assigns `conversations` again. Nothing is
     * said for a move to where it already is.
     */
    private _move(conv: AparteConversationListItem, to: string | null): void {
        const from = this._groupOf(conv);
        if (from === to) return;
        this._dispatchMove({ id: conv.id, from, to });
    }

    private _dispatchMove(detail: AparteConversationMoveDetail): void {
        this.dispatchEvent(new CustomEvent<AparteConversationMoveDetail>('aparte-conversation-move', { detail, bubbles: true, composed: true }));
    }

    /** The group a row is in: its own `group`, else the list's key (`dropKey`), else none. */
    private _groupOf(conv: AparteConversationListItem): string | null {
        return conv.group?.key ?? this.dropKey ?? null;
    }

    /** The question the confirm step asks — the popover's accessible name while it asks it. */
    private _confirmQuestion(conv: AparteConversationListItem): string {
        return this._t('deleteConversationConfirm').replace('{title}', () => conv.title || this._t('newChat'));
    }

    private _confirmMarkup(conv: AparteConversationListItem): string {
        const question = escapeHtml(this._confirmQuestion(conv));
        const cancel = escapeHtml(this._t('cancel'));
        const remove = escapeHtml(this._t('deleteConversation'));
        return `
<div class="aparte-conv-menu__confirm">
  <p class="aparte-conv-menu__question">${question}</p>
  <div class="aparte-conv-menu__actions">
    <button type="button" class="aparte-btn aparte-btn--sm aparte-btn--ghost" data-menu-action="cancel">${cancel}</button>
    <button type="button" class="aparte-btn aparte-btn--sm aparte-btn--danger aparte-btn--solid" data-menu-action="confirm-delete">${remove}</button>
  </div>
</div>`;
    }

    /** A row menu's element, empty: `_fillMenu` gives it its items as it opens. */
    private _newMenu(): HTMLElement {
        const menu = document.createElement('div');
        menu.className = 'aparte-menu aparte-conv-menu';
        menu.setAttribute('role', 'menu');
        return menu;
    }

    /**
     * Fills `menu` for the row's conversation and puts it in the row, as it opens; it leaves
     * the row when it closes, so a list with no menu open holds none. `enhanceMenu` places it
     * fixed to the window, because a sidebar scrolls and an absolute menu on the last rows
     * would be clipped by the list's own overflow. False — stay closed — when the
     * conversation is gone.
     */
    private _fillMenu(row: HTMLElement, menu: HTMLElement): boolean {
        const id = row.dataset['convId'];
        const conv = id ? this._conversations.find(c => c.id === id) : undefined;
        if (!conv) return false;
        menu.dataset['menuFor'] = conv.id;
        // A menu again, if the delete question made it a dialog the last time it was open.
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', conv.title || this._t('newChat'));
        menu.innerHTML = this._menuMarkup(conv);  // safe-text: _menuMarkup escapes every locale string and only interpolates provider glyphs.
        row.appendChild(menu);
        return true;
    }

    /**
     * The keyboard, the closing and the placing are `enhanceMenu`'s, the same code the kit
     * gives a host for its own menus: each row's `⋯` drives its own menu, and a right
     * click, Shift+F10 or the Menu key on a row opens one shared menu there
     * (`enhanceContextMenu`). Both fill as they open.
     */
    private _wireMenus(): void {
        for (const button of this.querySelectorAll<HTMLElement>('[data-more-id]')) {
            const row = button.closest<HTMLElement>('[data-conv-id]');
            if (!row) continue;
            const menu = this._newMenu();
            this._menus.push(enhanceMenu(button, menu, {
                gap: MENU_GAP,
                margin: VIEWPORT_MARGIN,
                align: 'end',
                onOpen: () => this._fillMenu(row, menu),
                onClose: () => {
                    menu.remove();
                    this._renderHeld();
                },
            }));
        }
        const context = this._contextMenu ??= this._newMenu();
        this._menus.push(enhanceContextMenu(this, context, {
            gap: MENU_GAP,
            margin: VIEWPORT_MARGIN,
            onOpen: (target) => {
                const row = target.closest<HTMLElement>('[data-conv-id]');
                // Off a row, or in a title being renamed: the browser keeps its own menu there.
                // Inside a row's open menu: that menu is already the answer.
                if (!row || !this.contains(row) || target.closest('[data-rename-id], [data-menu-for]')) return false;
                return this._fillMenu(row, context);
            },
            onClose: () => {
                context.remove();
                this._renderHeld();
            },
        }));
    }

    /** Closes whichever menu is open, without moving the focus, and stops them all. */
    private _releaseMenus(): void {
        for (const release of this._menus.splice(0)) release();
    }

    /**
     * Placed again once the question has taken the items' place, since it is not their
     * size: the `⋯` menu against its button, the context menu on the corner it opened at.
     */
    private _placeQuestion(menu: HTMLElement, id: string): void {
        const rtl = getComputedStyle(this).direction === 'rtl';
        const button = menu === this._contextMenu ? null : this.querySelector<HTMLElement>(rowSelector('data-more-id', id));  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
        const box = menu.getBoundingClientRect();
        const corner = rtl ? box.right : box.left;
        placeFloating(button?.getBoundingClientRect() ?? { top: box.top, bottom: box.top, left: corner, right: corner }, menu, {
            gap: button ? MENU_GAP : 0,
            margin: VIEWPORT_MARGIN,
            align: button ? 'end' : 'start',
            rtl,
        });
    }

    /**
     * An item chosen in a row's menu: `enhanceMenu` asks before it closes. Delete keeps it
     * open, since the question takes the items' place. The event stops here: the menu is
     * this element's own, and what the list tells the page is `aparte-conversation-*`.
     */
    private _onMenuSelect = (e: CustomEvent<AparteMenuSelectDetail>): void => {
        if ((e.target as HTMLElement).dataset['menuFor'] === undefined) return;
        e.stopPropagation();
        // Delete asks, and "Move to…" lists where to: both keep the menu open for their step.
        const action = e.detail.item.dataset['menuAction'];
        if (action === 'delete' || action === 'move') e.preventDefault();
    };

    /**
     * The gesture, finished. The event has already gone out — cancelable, so a host
     * that wants the write for itself calls `preventDefault()` and this stands down —
     * and what is left is the registered conversation manager doing it. Without
     * `manage` the element behaves exactly as it did before the attribute existed.
     *
     * A `manage` with no manager registered is a menu that does nothing, so the first
     * gesture says so and names the call that fixes it. Said here rather than at
     * `connectedCallback` because a list in the page's HTML connects before the script
     * that registers the manager runs: a warning at connect would fire on a setup that
     * is perfectly correct one tick later.
     */
    private _manage(event: Event, run: (manager: AparteConversationManager) => Promise<unknown>): void {
        if (!this.hasAttribute('manage') || event.defaultPrevented) return;
        // The manager of the chat this list drives: beside a chat that has a configuration of
        // its own, where the list sits resolves to the page's, which holds no manager.
        const target = this.getAttribute('target');
        // In the list's own tree first: a chat inside a shadow root is not found from the document.
        const root = this.getRootNode() as Document | ShadowRoot;
        const chat = target ? (root.getElementById?.(target) ?? this.ownerDocument.getElementById(target)) : null;
        const manager = resolveConfig(chat ?? this).getConversationManager();
        if (!manager) {
            if (this._warnedNoManager) return;
            this._warnedNoManager = true;
            console.warn(
                '[aparte-conversation-list] `manage` is set but no conversation manager is registered, '
                + 'so the row menu writes nothing. Call setConversationManager(manager) on your config, '
                + 'or drop `manage` and handle the events yourself.'
            );
            return;
        }
        void run(manager).catch((err: unknown) => {
            console.warn('[aparte-conversation-list] the conversation manager refused the change:', err);
        });
    }

    /**
     * What the item does, once the menu has done its part: by now it has closed and put the
     * focus back on the `⋯` (or the row) — except for delete, kept open to ask.
     */
    private _onMenuAction(action: string, menu: HTMLElement, item?: HTMLElement): void {
        const conv = this._conversations.find(c => c.id === menu.dataset['menuFor']);
        if (!conv) return;
        const id = conv.id;
        switch (action) {
            case 'move': {
                // The groups take the items' place, in the same menu, as delete's question
                // does and for the same reason: the first one takes the focus BEFORE the items
                // it replaces are removed, or the blur of the removed item closes the menu.
                // They are menu items, so the menu's own keys walk them.
                const previous = [...menu.childNodes];
                const holder = document.createElement('div');
                holder.innerHTML = this._moveMarkup(conv);  // safe-text: _moveMarkup escapes every label and key, and interpolates only provider glyphs.
                menu.append(...holder.childNodes);
                menu.setAttribute('aria-label', this._t('moveConversationTo').replace('{title}', () => conv.title || this._t('newChat')));
                menu.querySelector<HTMLElement>('[data-menu-action="move-to"]')?.focus();
                for (const node of previous) node.remove();
                this._placeQuestion(menu, id);
                return;
            }
            case 'move-to':
                this._move(conv, item?.dataset['moveTo'] ?? null);
                return;
            case 'ungroup':
                this._move(conv, null);
                return;
            case 'rename': {
                const row = this.querySelector<HTMLElement>(rowSelector('data-conv-id', id));  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
                if (row) this._startRename(row, conv);
                return;
            }
            // The two toggles dispatch each name as a LITERAL, in its own branch: the
            // manifest analyzer records a dispatch whose name is a ternary as an event
            // with no name (the Angular generator then crashes on it), and one whose
            // name is a local as an event called after the local.
            case 'pin':
                if (conv.pinnedAt) {
                    const unpin = new CustomEvent<AparteConversationPinDetail>(
                        'aparte-conversation-unpin',
                        { detail: { id }, bubbles: true, composed: true, cancelable: true }
                    );
                    this.dispatchEvent(unpin);
                    this._manage(unpin, (m) => m.unpin(id));
                } else {
                    const pin = new CustomEvent<AparteConversationPinDetail>(
                        'aparte-conversation-pin',
                        { detail: { id }, bubbles: true, composed: true, cancelable: true }
                    );
                    this.dispatchEvent(pin);
                    this._manage(pin, (m) => m.pin(id));
                }
                return;
            case 'archive':
                if (conv.archivedAt) {
                    const unarchive = new CustomEvent<AparteConversationArchiveDetail>(
                        'aparte-conversation-unarchive',
                        { detail: { id }, bubbles: true, composed: true, cancelable: true }
                    );
                    this.dispatchEvent(unarchive);
                    this._manage(unarchive, (m) => m.unarchive(id));
                } else {
                    const archive = new CustomEvent<AparteConversationArchiveDetail>(
                        'aparte-conversation-archive',
                        { detail: { id }, bubbles: true, composed: true, cancelable: true }
                    );
                    this.dispatchEvent(archive);
                    this._manage(archive, (m) => m.archive(id));
                }
                return;
            case 'delete': {
                // Ask first. The safe answer takes the focus — and it takes it BEFORE the
                // items it replaces are removed, which is the whole of this dance.
                //
                // `menu.innerHTML = …` destroyed the item the reader had just activated
                // while it still held the focus, and a browser blurs a node it is about to
                // remove: `focusout`, no `relatedTarget`, dispatched while the node is
                // still in the tree. The menu reads that as "the focus left the menu"
                // and closes — so the question never appeared and there was no way at
                // all to delete a conversation. jsdom runs no such fixup, which is why the
                // unit tests were green; see `the-keyboard-keeps-its-place.test.ts`.
                //
                // Adding the question, moving the focus into it, and only then removing the
                // old items means nothing focused is ever removed.
                const previous = [...menu.childNodes];
                const holder = document.createElement('div');
                holder.innerHTML = this._confirmMarkup(conv);  // safe-text: _confirmMarkup escapes the title and every locale string.
                menu.append(...holder.childNodes);
                // While it asks, the popover IS the question: a `role="menu"` may hold
                // menu items and nothing else, and the two answers are buttons — axe reads
                // that as a critical `aria-required-children` violation, on a state one
                // click away, in the element the accessibility guide offers as the pattern
                // to copy. `role="menuitem"` on a destructive confirm would be the cheap
                // lie; a question with two answers is a dialog. `_fillMenu` sets the role
                // back with the items the next time it opens. The row's more
                // button keeps `aria-haspopup="menu"` on purpose: what it opens IS a
                // menu, and the question is one step inside it, not what the button
                // announces.
                menu.setAttribute('role', 'dialog');
                menu.setAttribute('aria-label', this._confirmQuestion(conv));
                menu.querySelector<HTMLElement>('[data-menu-action="cancel"]')?.focus();
                for (const node of previous) node.remove();
                this._placeQuestion(menu, id);
                return;
            }
            case 'cancel':
                // Its press closed the menu and put the focus back: nothing left to do.
                return;
            case 'confirm-delete': {
                const remove = new CustomEvent<AparteConversationDeleteDetail>(
                    'aparte-conversation-delete',
                    { detail: { id }, bubbles: true, composed: true, cancelable: true }
                );
                this.dispatchEvent(remove);
                this._manage(remove, (m) => m.delete(id));
                return;
            }
        }
    }

    /**
     * The delete question's own keys: the arrows, Home and End between its two answers.
     * A menu holds no item while it asks, so the menu's own arrows have nothing to move
     * to; Escape and Tab are still the menu's, and close it.
     */
    private _onQuestionKeydown(e: KeyboardEvent, menu: HTMLElement): void {
        if (e.defaultPrevented) return;
        const answers = Array.from(menu.querySelectorAll<HTMLElement>('[data-menu-action]'));
        // The focus as this element's own tree reports it — retargeted to the shadow host
        // in `document`, which made the index -1 and every arrow jump from the first answer.
        const index = answers.indexOf(activeElementIn(this) as HTMLElement);
        const focusAt = (i: number): void => {
            e.preventDefault();
            answers[(i + answers.length) % answers.length]?.focus();
        };
        switch (e.key) {
            case 'ArrowDown': focusAt(index + 1); return;
            case 'ArrowUp': focusAt(index - 1); return;
            case 'Home': focusAt(0); return;
            case 'End': focusAt(answers.length - 1); return;
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
        input.addEventListener('blur', (e) => {
            const next = (e as FocusEvent).relatedTarget as Node | null;
            // Restore when the focus is going nowhere (`<body>`) or into the list this
            // render is about to destroy. Not when it is heading for a live element
            // outside — pulling it back from there is the theft a menu losing the focus avoids too.
            this._finishRename(true, !next || this.contains(next));
        });
        input.focus();
        input.select();
    }

    /**
     * One exit for the three ways out (Enter, Escape, leaving the field), guarded so
     * the blur a removal causes cannot commit a second time. The row is re-rendered
     * from the array either way: the list shows data, and the host's re-assignment is
     * what makes the new title appear.
     *
     * `restoreFocus` puts the keyboard back on the row: every exit destroys the field
     * the reader was in, so without it the focus lands on `<body>` and the next Tab
     * restarts at the top of the page. The caller decides — the blur path says no when
     * the focus is already heading somewhere live outside this list.
     */
    private _finishRename(commit: boolean, restoreFocus: boolean): void {
        const renaming = this._renaming;
        if (!renaming || renaming.done) return;
        renaming.done = true;
        const conv = this._conversations.find(c => c.id === renaming.id);
        const title = renaming.input.value.trim();
        this._render();
        if (commit && conv && title && title !== conv.title) {
            const rename = new CustomEvent<AparteConversationRenameDetail>(
                'aparte-conversation-rename',
                { detail: { id: conv.id, title }, bubbles: true, composed: true, cancelable: true }
            );
            this.dispatchEvent(rename);
            this._manage(rename, (m) => m.updateTitle(conv.id, title));
        }
        // After the event, not before: a host that re-assigns `conversations` on it
        // re-renders the list, and the button focused beforehand is gone by now.
        if (restoreFocus) {
            this.querySelector<HTMLElement>(`[data-select-id="${cssEscape(renaming.id)}"]`)?.focus();  // safe-attr: a selector, not markup — cssEscape() is the right escape here.
        }
    }

    // ─── Moving a row by dragging it (`moveTargets`) ──────────────────────

    /** The row being dragged and the group it is in, while a drag of this list's lasts. */
    private _dragging: { id: string; from: string | null } | null = null;

    /**
     * Where a drop on `target` would move the dragged row: an app group's key, `null` for out
     * of any group (a date group, or the list's undated rows), `undefined` for nowhere — the
     * group it is already in, a group that is not a target, or outside the list's groups.
     */
    private _dropTo(target: EventTarget | null, e?: DragEvent): string | null | undefined {
        const drag = this._dragging ?? this._incoming(e);
        if (!drag || !(target instanceof Element)) return undefined;
        const group = this._groupAt(target);
        if (!group) return undefined;
        // A group of no key of its own (a date group, the flat list) is the list's key, if it has one.
        const to = (group !== this ? group.dataset['groupKey'] : undefined) ?? this.dropKey ?? null;
        if (to === drag.from) return undefined;
        if (to !== null && to !== this.dropKey && !this._targets().some((t) => t.key === to)) return undefined;
        return to;
    }

    /** The group of this list under `target`; the list itself for a list with a key of its own and no row there (an empty one). */
    private _groupAt(target: Element): HTMLElement | null {
        const group = target.closest<HTMLElement>('.aparte-conv-group');
        if (group && this.contains(group)) return group;
        return this.dropKey !== null && this.contains(target) ? this : null;
    }

    /**
     * A drag that did not start in this list: a row of another list of the page, or an element of
     * the app's own that carries {@link APARTE_CONVERSATION_DRAG_TYPE}. Taken only by a list with a
     * key of its own (`dropKey`), which is what a drop on it means; `id` is empty until the drop
     * reads it, for a drag of the app's own.
     */
    private _incoming(e?: DragEvent): { id: string; from: string | null } | null {
        if (this.dropKey === null) return null;
        if (pageDrag && pageDrag.list !== this) return { id: pageDrag.id, from: pageDrag.from };
        const types = e?.dataTransfer?.types;
        if (types && Array.from(types).includes(APARTE_CONVERSATION_DRAG_TYPE)) return { id: '', from: null };
        return null;
    }

    /**
     * The group a drop would land in, marked; every other one unmarked, the list itself included:
     * an empty list with a key of its own is its own drop zone, and a clearing that looked only
     * inside it left its outline after the drag.
     */
    private _markDrop(group: Element | null): void {
        for (const el of [this, ...this.querySelectorAll('.aparte-conv-group--drop')]) {
            if (el !== group) el.classList.remove('aparte-conv-group--drop');
        }
        group?.classList.add('aparte-conv-group--drop');
    }

    /**
     * Any drag of the page ended, wherever it began. Its `dragend` goes to the element it began on
     * (a row of another list, an element of the app's own), never to a list it only hovered: a
     * drag ended by Escape over this list, or dropped where the page refused it, left the mark.
     */
    private _onPageDragEnd = (): void => {
        this._markDrop(null);
    };

    /**
     * A drag ends the press it began with: a drag is never a click, so the press hold has
     * nothing left to protect, and WebKit sends no `pointerup` nor `pointercancel` after a native
     * drag to end it (Chromium sends `pointercancel`). Left waiting, it held every render until
     * the next click anywhere: the moved row stayed where it was. Ended after the drag's own
     * hold is set, so a render the press was holding is held by the drag instead.
     */
    private _onDragStart = (e: DragEvent): void => {
        this._beginDrag(e);
        if (this._pressed) this._endPress();
    };

    private _beginDrag(e: DragEvent): void {
        if (this._targets().length === 0 || (this._renaming && !this._renaming.done)) return;
        const row = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-conv-id]') : null;
        if (!row || !this.contains(row)) return;
        const conv = this._conversations.find((c) => c.id === row.dataset['convId']);
        if (!conv) return;
        this._dragging = { id: conv.id, from: this._groupOf(conv) };
        // Seen by the other lists of the page, which take it when they have a key of their own.
        pageDrag = { list: this, ...this._dragging };
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            // A drag carries data or some browsers start none: the id, under the list's own type
            // (public: an app's own drop target reads it), so the row dropped into a text field
            // writes nothing there.
            e.dataTransfer.setData(APARTE_CONVERSATION_DRAG_TYPE, conv.id);
        }
        row.classList.add('aparte-conv-item--dragging');
    }

    /**
     * Entering a group a drop would land in: allowed here too, not only on `dragover`. WebKit
     * takes an element whose `dragenter` was not cancelled for no drop target, and sends the
     * drop to the page's body: the group was marked while the row hovered it, and the row
     * stayed where it was (Safari). Chromium drops on `dragover` alone.
     */
    private _onDragEnter = (e: DragEvent): void => {
        if (this._dropTo(e.target, e) !== undefined) e.preventDefault();
    };

    private _onDragOver = (e: DragEvent): void => {
        const to = this._dropTo(e.target, e);
        if (to === undefined) {
            this._markDrop(null);
            return;
        }
        // Allowed here: without this, the browser refuses the drop.
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        this._markDrop(this._groupAt(e.target as Element));
    };

    /** Off the list altogether: nothing is where it would land any more. */
    private _onDragLeave = (e: DragEvent): void => {
        const at = document.elementFromPoint(e.clientX, e.clientY);
        if (!at || !this.contains(at)) this._markDrop(null);
    };

    private _onDrop = (e: DragEvent): void => {
        const to = this._dropTo(e.target, e);
        const dragging = this._dragging;
        if (to === undefined) return;
        e.preventDefault();
        if (!dragging) {
            // From another list, or the app's own: said here, where it lands. The list it came
            // from ends its drag on its own `dragend`.
            const incoming = this._incoming(e);
            const id = incoming?.id || e.dataTransfer?.getData(APARTE_CONVERSATION_DRAG_TYPE) || '';
            this._markDrop(null);
            if (incoming && id) this._dispatchMove({ id, from: incoming.from, to });
            return;
        }
        const conv = this._conversations.find((c) => c.id === dragging.id);
        // Over before the event: an app that assigns `conversations` in its listener is drawn
        // at once, not held for a drag that has ended.
        this._endDrag();
        if (conv) this._move(conv, to);
    };

    /** Dropped anywhere, or Escape: the browser ends the drag here either way. */
    private _onDragEnd = (): void => {
        this._endDrag();
    };

    private _endDrag(): void {
        if (!this._dragging) return;
        this._dragging = null;
        if (pageDrag?.list === this) pageDrag = null;
        this._markDrop(null);
        this.querySelector('.aparte-conv-item--dragging')?.classList.remove('aparte-conv-item--dragging');
        this._renderHeld();
    }

    // ─── Events ───────────────────────────────────────────────────────────

    private _onClick = (e: Event): void => {
        const target = e.target as HTMLElement;
        // The menu may have left the row by now (it closes before this runs), but the
        // pressed item is still inside it, and the menu still says which row it was for.
        const menuAction = target.closest<HTMLElement>('[data-menu-action]');
        const menu = menuAction?.closest<HTMLElement>('[data-menu-for]');
        if (menuAction && menu) {
            e.stopPropagation();
            this._onMenuAction(menuAction.dataset['menuAction']!, menu, menuAction);
            return;
        }
        // The `⋯` opens and closes its menu itself (`enhanceMenu`).
        if (target.closest('[data-more-id]')) {
            e.stopPropagation();
            return;
        }
        if (target.closest('[data-rename-id]')) return;
        const select = target.closest<HTMLElement>('[data-select-id]');
        if (select) {
            // An open menu was closed by the press that made this click.
            const targetId = this.getAttribute('target');
            this.dispatchEvent(new CustomEvent<AparteConversationSelectDetail>(
                'aparte-conversation-select',
                { detail: { id: select.dataset['selectId']!, ...(targetId ? { targetId } : {}) }, bubbles: true, composed: true }
            ));
        }
    };

    private _onKeydown = (e: KeyboardEvent): void => {
        const target = e.target as HTMLElement;
        // A menu's keys are its own (`enhanceMenu`); the delete question adds its arrows.
        const menu = target.closest<HTMLElement>('[data-menu-for]');
        if (menu) {
            if (menu.getAttribute('role') === 'dialog') this._onQuestionKeydown(e, menu);
            return;
        }
        if (target.matches('[data-rename-id]')) {
            // The Enter that confirms a candidate and the Escape that cancels a composition (an
            // input method: Japanese, Chinese, Korean) are the word's, not the rename's. Firefox
            // flags them `isComposing`; Safari sends that Enter after the composition, as 229.
            if (e.isComposing || e.keyCode === 229) return;
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

deferHydrationOf(AparteConversationList);
if (!customElements.get('aparte-conversation-list')) customElements.define('aparte-conversation-list', AparteConversationList);
