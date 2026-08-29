/**
 * Global typing for aparté custom events. Once `@aparte/core` is in a consumer's
 * TypeScript program, `element.addEventListener('aparte-retry', e => e.detail)`
 * types `e` as `CustomEvent<AparteRetryEventDetail>` with a typed `e.detail` — no
 * manual `(e as CustomEvent<…>).detail` cast.
 *
 * ## What belongs here
 *
 * One rule: **an event with a detail belongs in the map.** If a consumer can read
 * `e.detail`, the map is the only thing that types it, and its absence forces the
 * exact cast the paragraph above promises you never need.
 *
 * The rule this file used to state was different and wrong. It said the map covers
 * "events whose detail type lives in the types layer", and named composer-submit,
 * select-change and optgroup-toggle as internal ones that "carry no cross-package
 * detail contract". Two of those three do: `@aparte/plugin-model-selector` reads
 * both across a package boundary, and `AparteSelectChangeDetail` is exported from
 * both public barrels. Meanwhile `aparte-composer-change` sat in the map with its
 * detail imported from a component — breaking the stated criterion in the other
 * direction. A rule contradicted by its own list is not a rule.
 *
 * Events that carry NO detail stay out, and that is the whole exclusion:
 * `aparte-composer-submit`, `aparte-cancel`, `aparte-reset`, `aparte-reset-done`,
 * `aparte-compact-start`, `aparte-select-open`, `aparte-select-close` are all
 * dispatched as a bare `new CustomEvent(name)`. A map entry would type `e.detail`
 * as `null` and gain nothing.
 *
 * All names are kebab-case (`aparte-*`) so every framework can bind them in a
 * template (Angular parses a `:` in an event name as a `target:event` selector,
 * so a colon name could never be `(aparte:x)`-bound there).
 */

import type {
    AparteSendEventDetail,
    AparteRetryEventDetail,
    AparteEditEventDetail,
    AparteActionEventDetail,
    ApartePathChangedEventDetail,
    AparteBranchNavigateEventDetail,
    AparteFeedbackEventDetail,
    AparteMessageInfoEventDetail,
    AparteMessageDoneEventDetail,
    AparteModelChangeEventDetail,
    AparteApprovalModeChangeEventDetail,
    AparteMessageStartEventDetail,
    AparteMessageErrorEventDetail,
    AparteMessageAbortedEventDetail,
    AparteAbortEventDetail,
    AparteCompactEventDetail,
    AparteCompactDoneEventDetail,
    AparteCompactErrorEventDetail,
    AparteAttachmentPreviewEventDetail,
    AparteLinkClickEventDetail,
} from './events.js';
import type { AparteActionClickEventDetail } from '../components/composer/aparte-composer-action.js';
import type { AparteSuggestionEventDetail } from '../components/suggestions/aparte-suggestions.js';
import type { AparteContextThresholdEventDetail } from '../components/context/aparte-context.js';
import type { AparteScrollRailJumpDetail } from '../components/scroll-rail/aparte-scroll-rail.js';
import type { AparteSidebarToggleDetail } from '../components/sidebar/aparte-sidebar.js';
import type { AparteOptgroupToggleEventDetail } from '../primitives/select/aparte-optgroup.js';
import type { AparteConfigChangeEventDetail } from '../config/aparte-config.js';
import type { AparteToolApprovalRequestDetail } from './tools.js';
import type { AparteSegmentUpdateEventDetail } from './segments.js';
import type { AparteSelectChangeDetail } from '../primitives/select/aparte-select.js';
import type {
    AparteConversationSelectDetail,
    AparteConversationDeleteDetail,
    AparteConversationArchiveDetail,
    AparteConversationPinDetail,
    AparteConversationRenameDetail,
} from '../components/conversation-list/aparte-conversation-list.js';
// event-map is a top-level aggregator (imported by the barrel, never by a
// component), so importing this component-coupled detail type is cycle-free.
import type { AparteComposerChangeEventDetail } from '../components/composer/aparte-composer.js';

/**
 * Declared once, applied to all three targets below.
 *
 * It used to be written straight into `HTMLElementEventMap`, which typed
 * `chat.addEventListener(...)` and nothing else — while `document.addEventListener`
 * resolves through `DocumentEventMap` and `window.addEventListener` through
 * `WindowEventMap`, neither of which inherits from it. Every aparté event bubbles
 * and composes, so listening on `document` is the natural way to handle a page's
 * worth of chats in one place; the docs recommend exactly that ("Clicks are
 * declarative — they emit `aparte-action`, so you handle them in one place"), and
 * that recommended snippet did not compile. `AparteClient` itself listens on
 * `window`, so the third map is not hypothetical either.
 */
interface AparteEventMap {
    'aparte-send': CustomEvent<AparteSendEventDetail>;
    'aparte-retry': CustomEvent<AparteRetryEventDetail>;
    'aparte-edit': CustomEvent<AparteEditEventDetail>;
    'aparte-action': CustomEvent<AparteActionEventDetail>;
    'aparte-path-changed': CustomEvent<ApartePathChangedEventDetail>;
    'aparte-branch-navigate': CustomEvent<AparteBranchNavigateEventDetail>;
    'aparte-link-click': CustomEvent<AparteLinkClickEventDetail>;
    'aparte-feedback': CustomEvent<AparteFeedbackEventDetail>;
    'aparte-message-info': CustomEvent<AparteMessageInfoEventDetail>;
    'aparte-message-done': CustomEvent<AparteMessageDoneEventDetail>;
    'aparte-model-change': CustomEvent<AparteModelChangeEventDetail>;
    'aparte-approval-mode-change': CustomEvent<AparteApprovalModeChangeEventDetail>;
    'aparte-tool-approval-request': CustomEvent<AparteToolApprovalRequestDetail>;
    // Forwarded by the wrappers' AparteUi (in APARTE_DEFAULT_UI_EVENTS); detail is
    // component-coupled but event-map is a top-level aggregator, so typing it here.
    'aparte-composer-change': CustomEvent<AparteComposerChangeEventDetail>;

    // ── Events whose detail type was already public, and still needed a cast ────
    // Each of these is dispatched with a typed generic and has an exported detail
    // interface — and every consumer still had to write `(e as CustomEvent).detail`,
    // because the map is what carries the type to `addEventListener`.
    'aparte-select-change': CustomEvent<AparteSelectChangeDetail>;
    'aparte-segment-update': CustomEvent<AparteSegmentUpdateEventDetail>;
    // The conversation list's four intents. `conversation-persistence.md` documents
    // them as one family ("handle the four events it emits, all bubble") and the
    // generated API reference's own example reads `e.detail.id` uncast — which did
    // not compile. Archive and unarchive share one detail interface because the
    // dispatcher picks the event name from a variable and types both branches with
    // it; the separate `AparteConversationUnarchiveDetail` was referenced by nothing
    // and is gone.
    'aparte-select-conversation': CustomEvent<AparteConversationSelectDetail>;
    'aparte-delete-conversation': CustomEvent<AparteConversationDeleteDetail>;
    'aparte-archive-conversation': CustomEvent<AparteConversationArchiveDetail>;
    'aparte-unarchive-conversation': CustomEvent<AparteConversationArchiveDetail>;
    'aparte-rename-conversation': CustomEvent<AparteConversationRenameDetail>;
    'aparte-pin-conversation': CustomEvent<AparteConversationPinDetail>;
    'aparte-unpin-conversation': CustomEvent<AparteConversationPinDetail>;

    // ── The turn lifecycle, minus the one entry it used to have ────────────────
    // `aparte-message-done` was in the map alone. Its siblings — start, error,
    // aborted — come off the same dispatcher, are listened for by the same
    // components, and had no type at all. Splitting one family so that only
    // "done" is typed was an omission, not a rule.
    'aparte-message-start': CustomEvent<AparteMessageStartEventDetail>;
    'aparte-message-error': CustomEvent<AparteMessageErrorEventDetail>;
    'aparte-message-aborted': CustomEvent<AparteMessageAbortedEventDetail>;

    // ── Commands a CONSUMER dispatches ────────────────────────────────────────
    // Core listens for these and never sends them, which makes them the most
    // public events in the set: without a type there was nothing to tell you what
    // to put in `detail`.
    'aparte-abort': CustomEvent<AparteAbortEventDetail>;
    'aparte-compact': CustomEvent<AparteCompactEventDetail>;
    'aparte-compact-done': CustomEvent<AparteCompactDoneEventDetail>;
    'aparte-compact-error': CustomEvent<AparteCompactErrorEventDetail>;

    // ── Host-handler events (decision #8 tier b: off until you declare them) ───
    'aparte-attachment-preview': CustomEvent<AparteAttachmentPreviewEventDetail>;

    // ── Element events whose only possible consumer is the app ────────────────
    'aparte-action-click': CustomEvent<AparteActionClickEventDetail>;
    'aparte-suggestion': CustomEvent<AparteSuggestionEventDetail>;
    'aparte-context-threshold': CustomEvent<AparteContextThresholdEventDetail>;
    'aparte-scroll-rail-jump': CustomEvent<AparteScrollRailJumpDetail>;
    'aparte-sidebar-toggle': CustomEvent<AparteSidebarToggleDetail>;
    'aparte-optgroup-toggle': CustomEvent<AparteOptgroupToggleEventDetail>;
    'aparte-config-change': CustomEvent<AparteConfigChangeEventDetail>;
}

declare global {
    interface HTMLElementEventMap extends AparteEventMap {}
    interface DocumentEventMap extends AparteEventMap {}
    interface WindowEventMap extends AparteEventMap {}
}

export {};
