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
 * The criterion is not where the detail type lives: `@aparte/plugin-model-selector`
 * reads `aparte-select-change` and `aparte-optgroup-toggle` across a package boundary,
 * and `AparteSelectChangeDetail` is exported from both public barrels, while
 * `aparte-composer-change` is in the map with a detail imported from a component.
 *
 * Events that carry NO detail stay out, and that is the whole exclusion:
 * `aparte-composer-submit`, `aparte-cancel`, `aparte-reset`, `aparte-reset-done`,
 * `aparte-select-open`, `aparte-select-close` are all dispatched as a bare
 * `new CustomEvent(name)`. A map entry would type `e.detail`
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
    AparteMessagePausedEventDetail,
    AparteMessageResumedEventDetail,
    AparteAbortEventDetail,
    AparteCompactEventDetail,
    AparteCompactDoneEventDetail,
    AparteCompactStartEventDetail,
    AparteCompactErrorEventDetail,
    AparteAttachmentPreviewEventDetail,
    AparteLinkClickEventDetail,
} from './events.js';
import type { AparteActionClickEventDetail } from '../components/composer/aparte-composer-action.js';
import type { AparteSuggestionEventDetail } from '../components/suggestions/aparte-suggestions.js';
import type { AparteContextThresholdEventDetail } from '../components/context/aparte-context.js';
import type { AparteScrollRailJumpDetail } from '../components/scroll-rail/aparte-scroll-rail.js';
import type { AparteSidebarToggleDetail } from '../components/sidebar/aparte-sidebar.js';
import type { AparteSplitResizeDetail } from '../components/split/aparte-split.js';
import type { AparteOptgroupToggleEventDetail } from '../primitives/select/aparte-optgroup.js';
import type { AparteConfigChangeEventDetail } from '../config/aparte-config.js';
import type { AparteToolApprovalRequestDetail } from './tools.js';
import type { AparteSegmentUpdateEventDetail } from './segments.js';
import type { AparteConversationLoadedDetail } from '../conversations/types.js';
import type { AparteSelectChangeDetail } from '../primitives/select/aparte-select.js';
import type {
    AparteConversationSelectDetail,
    AparteConversationDeleteDetail,
    AparteConversationArchiveDetail,
    AparteConversationPinDetail,
    AparteConversationRenameDetail,
    AparteConversationStatusDetail,
} from '../components/conversation-list/aparte-conversation-list.js';
// event-map is a top-level aggregator (imported by the barrel, never by a
// component), so importing this component-coupled detail type is cycle-free.
import type { AparteComposerChangeEventDetail } from '../components/composer/aparte-composer.js';

/**
 * Declared once, applied to all three targets below.
 *
 * Writing it into `HTMLElementEventMap` alone would type `chat.addEventListener(...)`
 * and nothing else, while `document.addEventListener` resolves through
 * `DocumentEventMap` and `window.addEventListener` through `WindowEventMap`, neither of
 * which inherits from it. Every aparté event bubbles and composes, so listening on
 * `document` is the natural way to handle a page's worth of chats in one place (the
 * docs recommend it: "Clicks are declarative — they emit `aparte-action`, so you
 * handle them in one place"), and `AparteClient` itself listens on `window`.
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
    // The conversation list's seven intents, subject-first like every other event here
    // (`aparte-conversation-select`, not `aparte-select-conversation`: the detail types
    // were already subject-first, and one addEventListener line read both orders).
    // `conversation-persistence.md` documents them as one family (all bubble) and the
    // generated API reference's own example reads `e.detail.id` uncast — which did
    // not compile. Archive and unarchive share one detail interface because the
    // dispatcher picks the event name from a variable and types both branches with
    // it; the separate `AparteConversationUnarchiveDetail` was referenced by nothing
    // and is gone.
    'aparte-conversation-select': CustomEvent<AparteConversationSelectDetail>;
    'aparte-conversation-delete': CustomEvent<AparteConversationDeleteDetail>;
    'aparte-conversation-archive': CustomEvent<AparteConversationArchiveDetail>;
    'aparte-conversation-unarchive': CustomEvent<AparteConversationArchiveDetail>;
    'aparte-conversation-rename': CustomEvent<AparteConversationRenameDetail>;
    'aparte-conversation-pin': CustomEvent<AparteConversationPinDetail>;
    // The controller's, not the list's: a conversation's messages are on screen.
    'aparte-conversation-loaded': CustomEvent<AparteConversationLoadedDetail>;
    'aparte-conversation-unpin': CustomEvent<AparteConversationPinDetail>;
    // The controller's, on window, to every list: what a conversation is doing.
    'aparte-conversation-status': CustomEvent<AparteConversationStatusDetail>;

    // ── The turn lifecycle, minus the one entry it used to have ────────────────
    // `aparte-message-done` was in the map alone. Its siblings — start, error,
    // aborted — come off the same dispatcher, are listened for by the same
    // components, and had no type at all. Splitting one family so that only
    // "done" is typed was an omission, not a rule.
    'aparte-message-start': CustomEvent<AparteMessageStartEventDetail>;
    'aparte-message-error': CustomEvent<AparteMessageErrorEventDetail>;
    'aparte-message-aborted': CustomEvent<AparteMessageAbortedEventDetail>;
    'aparte-message-paused': CustomEvent<AparteMessagePausedEventDetail>;
    'aparte-message-resumed': CustomEvent<AparteMessageResumedEventDetail>;

    // ── The compaction conversation, and the one command core listens for ─────
    // `aparte-abort` is the only one here core NEVER sends: it listens for it, so an
    // app is always the sender. The other four are a round trip an app can join at
    // either end — `<aparte-context auto-compact>` dispatches `aparte-compact` when
    // the gauge reaches `danger` and so can your own button, `@aparte/plugin-compaction`
    // answers it and reports back with `-start` / `-done` / `-error`. This block used
    // to say "Core never sends these", which was false of four of the five and hid the
    // gauge's own event from the manifest and from its docs page for as long.
    // Either way they are the most public events in the set: without a type there was
    // nothing to tell you what to put in `detail`.
    'aparte-abort': CustomEvent<AparteAbortEventDetail>;
    'aparte-compact': CustomEvent<AparteCompactEventDetail>;
    'aparte-compact-start': CustomEvent<AparteCompactStartEventDetail>;
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
    'aparte-split-resize': CustomEvent<AparteSplitResizeDetail>;
    'aparte-optgroup-toggle': CustomEvent<AparteOptgroupToggleEventDetail>;
    'aparte-config-change': CustomEvent<AparteConfigChangeEventDetail>;
}

declare global {
    interface HTMLElementEventMap extends AparteEventMap {}
    interface DocumentEventMap extends AparteEventMap {}
    interface WindowEventMap extends AparteEventMap {}
}

export {};
