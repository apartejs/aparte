/**
 * Aparte Events
 * Event interfaces for component communication and control
 */

import type { AparteMessage } from './models.js';
import type { AparteUsage } from './chat.js';
import type { AparteError } from './errors.js';

// ─────────────────────────────────────────────────────────────────────────────
// User Input Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detail payload for aparte-send custom event
 * Emitted when user sends a message via the input component
 */
export interface AparteSendEventDetail {
    /** The message content being sent */
    content: string;

    /** Timestamp of the send action */
    timestamp: number;

    /**
     * ID of the host element (e.g. aparte-chat) that should receive the response.
     * Set automatically when the input has a `target` attribute.
     * Used by AparteClient to find the host without DOM traversal.
     */
    targetId?: string;

    /** Files attached to this message (populated by composer attachments) */
    files?: File[];

    /**
     * Send THIS message to a specific model, overriding the config's default for one
     * turn — a per-message model picker, the pattern several products now ship.
     *
     * `AparteClient` has honoured both fields for as long as it has read
     * `event.detail`, while nothing declared them: the composer never sends them and
     * this type did not name them, so the capability existed only for someone who
     * read the client's source. A capability cited nowhere is invisible (ratified
     * decision #4); declaring it is what makes it real. Dispatch your own
     * `aparte-send` with them, or set them on the detail from a listener that runs
     * before the client's (capture phase).
     */
    modelId?: string;
    /** The provider that `modelId` belongs to; defaults to the config's `defaultProvider`. */
    providerId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Turn completion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detail payload for `aparte-message-done`.
 * Dispatched when a turn finishes normally. Carries token usage when the provider
 * reports it.
 *
 * @event aparte-message-done
 */
export interface AparteMessageDoneEventDetail {
    /**
     * Id of the `<aparte-chat>` host that produced this turn, when it has one.
     *
     * Stamped by the client's lifecycle dispatcher on EVERY lifecycle event so
     * several chats on one page stay isolated — a composer reacts only to its own
     * host's turn. It was undeclared here while being sent at runtime, and the
     * dispatcher takes `Record<string, unknown>`, so the compiler could not notice.
     */
    targetId?: string;
    messageId: string;
    role: string;
    /** Token usage for the completed response, if reported by the provider. */
    usage?: AparteUsage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detail payload for `aparte-model-change`.
 * Dispatched by `@aparte/plugin-model-selector` when the user picks a different
 * provider or model — the clearest cross-package contract in the set.
 *
 * Its `@event` tag used to sit above `AparteMessageDoneEventDetail`'s doc block
 * instead, so this interface had no documentation of its own and the other one
 * claimed to describe a different event.
 *
 * @event aparte-model-change
 */
export interface AparteModelChangeEventDetail {
    /** Selected provider ID (e.g., 'openrouter', 'gemini') */
    providerId?: string;

    /** Selected model ID (e.g., 'gpt-4-turbo', 'claude-3-opus') */
    modelId: string;

    /** Previous model ID if changed */
    previousModelId?: string;

    /** Previous provider ID if changed */
    previousProviderId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Branching Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-message sibling metadata carried by `aparte-path-changed`.
 * `index` is 0-based; UI renders it as `index + 1 / count`.
 */
export interface AparteSiblingInfo {
    /** Message id */
    id: string;
    /** Total number of siblings (including this one). 1 = no branch picker. */
    count: number;
    /** 0-based position of this message among its siblings. */
    index: number;
}

/**
 * Detail payload for `aparte-link-click`.
 * Dispatched by the bubble, cancelable, when a link in a message body is about to be
 * followed — a link the MODEL wrote. `preventDefault()` on the event keeps the browser
 * from navigating, so a host routes the link itself (an external browser, a
 * confirmation, an embedded view) without intercepting the DOM. With no listener the
 * browser follows it; the sanitizer has made an external URL open in a new tab.
 *
 * @event aparte-link-click
 */
export interface AparteLinkClickEventDetail {
    /** The `href` as written on the anchor, after sanitization. */
    href: string;
    /** The anchor itself, for a host that wants its text or its `rel`. */
    anchor: HTMLAnchorElement;
    /** The message the link sits in, or `null` for a bubble mounted without one. */
    messageId: string | null;
}

/**
 * Detail payload for `aparte-branch-navigate`.
 * Dispatched by the bubble's branch-picker buttons; the viewport listens
 * (bubbling) and calls `navigateBranch(messageId, direction)` on its repo.
 *
 * @event aparte-branch-navigate
 */
export interface AparteBranchNavigateEventDetail {
    /** Message id whose siblings should be navigated */
    messageId: string;
    /** 'prev' = move to previous sibling, 'next' = move to next sibling */
    direction: 'prev' | 'next';
}

/**
 * Detail payload for `aparte-path-changed`.
 * Dispatched by the viewport in framework-managed mode after the active
 * path of the conversation tree changes (sibling switch, retry, edit, etc.).
 * Consumers (Angular wrapper) reconcile their signal/state from this payload.
 *
 * @event aparte-path-changed
 */
export interface ApartePathChangedEventDetail {
    /** Messages on the new active path, root → head. */
    messages: AparteMessage[];
    /** Sibling metadata, one entry per message on the path. */
    siblings: AparteSiblingInfo[];
}

/**
 * Detail payload for `aparte-retry`.
 * Dispatched by the assistant bubble's "Retry" action. Picked up by the
 * AparteClient, which calls `addSiblingOf` on the target viewport and streams
 * a fresh response into the new sibling.
 *
 * @event aparte-retry
 */
export interface AparteRetryEventDetail {
    /** Message id of the assistant response being retried (its sibling will be created). */
    messageId: string;
    /** Optional id of the host element (aparte-chat) — used by `scopeToTargetId`. */
    targetId?: string;
}

/**
 * Detail payload for `aparte-edit`.
 * Dispatched by the user bubble after the user confirms an inline edit.
 * Picked up by the AparteClient, which truncates the existing responses to
 * this message and re-streams a new one.
 *
 * @event aparte-edit
 */
export interface AparteEditEventDetail {
    /** Message id of the user message being edited. */
    messageId: string;
    /** New content submitted by the user. */
    content: string;
    /** Optional id of the host element (aparte-chat) — used by `scopeToTargetId`. */
    targetId?: string;
}

/**
 * Detail payload for `aparte-feedback`.
 * Dispatched by the assistant bubble's thumbs-up / thumbs-down buttons.
 *
 * @event aparte-feedback
 */
export interface AparteFeedbackEventDetail {
    /** Message id receiving the feedback. */
    messageId: string;
    /** 'positive' for thumbs-up, 'negative' for thumbs-down. */
    value: 'positive' | 'negative';
}

/**
 * Detail payload for `aparte-action`.
 * Dispatched by a custom action button (registered via `aparteGlobalConfig.registerAction`)
 * in either the composer or a message-bubble toolbar. Apps listen (bubbling) and
 * dispatch on `actionId`. Mirrors the built-in bubble events (retry/feedback) so
 * custom actions are wired the same way in every framework and in vanilla.
 *
 * @event aparte-action
 */
export interface AparteActionEventDetail {
    /** The registered action's id (from `AparteAction.id`). */
    actionId: string;
    /** Which zone the action was clicked in. */
    zone: 'composer' | 'bubble';
    /** Message id of the bubble the action was clicked on (bubble zone only). */
    messageId?: string;
    /** Role of that bubble (bubble zone only). */
    role?: 'user' | 'assistant';
    /** Optional host element id (aparte-chat) — same use as retry/edit's targetId. */
    targetId?: string;
}

/**
 * Detail payload for `aparte-message-info`.
 * Dispatched by the assistant bubble's info ("i") action button. Apps
 * listen (bubbling) and present a stats popover for the completed response.
 *
 * @event aparte-message-info
 */
export interface AparteMessageInfoEventDetail {
    /** Message id whose stats should be shown. */
    messageId: string;
    /** Token usage + timing for the message, when available. */
    usage?: AparteUsage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Turn lifecycle
// ─────────────────────────────────────────────────────────────────────────────
//
// Every one of these was dispatched with a real payload and had no declared type,
// so a consumer reading `e.detail` wrote the `(e as CustomEvent).detail` cast the
// event map exists to remove — including in `guides/troubleshooting.md`, which
// printed that cast in a ```ts block.
//
// `targetId` is optional on all of them for one reason: the client's lifecycle
// dispatcher stamps `target.id || undefined`, so a single-instance page with no
// `id` on its `<aparte-chat>` broadcasts without one.

/**
 * Detail payload for `aparte-message-start`.
 * Dispatched when a turn begins, before the first token. The composer and the
 * conversation controller both use it to enter their streaming state.
 *
 * @event aparte-message-start
 */
export interface AparteMessageStartEventDetail {
    /** Host element id, when the `<aparte-chat>` has one. */
    targetId?: string;
    /** Id of the assistant message about to stream. */
    messageId: string;
    /** Role of the message being created — `'assistant'` in every current path. */
    role: string;
}

/**
 * Detail payload for `aparte-message-error`.
 * Dispatched when a turn fails. Four core components listen for it, and it is the
 * event `guides/troubleshooting.md` tells you to bind to surface a failure.
 *
 * @event aparte-message-error
 */
export interface AparteMessageErrorEventDetail {
    /** Host element id, when the `<aparte-chat>` has one. */
    targetId?: string;
    /** Id of the message that failed. */
    messageId: string;
    /** The failure, with its `code` — not a string, unlike `aparte-compact-error`. */
    error: AparteError;
}

/**
 * Detail payload for `aparte-message-aborted`.
 * Dispatched when the user stops a turn.
 *
 * @event aparte-message-aborted
 */
export interface AparteMessageAbortedEventDetail {
    /** Host element id, when the `<aparte-chat>` has one. */
    targetId?: string;
    /**
     * Id of the aborted message — OPTIONAL, and that is not laziness: the composer
     * dispatches this event on its own with only a `targetId`, because a user can
     * press Stop during the pre-flight window before any message id exists.
     */
    messageId?: string;
}

/**
 * Detail payload for `aparte-abort` — a COMMAND, not a notification.
 *
 * `AparteClient` listens for it on `window`; a bring-your-own-composer consumer
 * dispatches it to stop a stream. Nothing in core dispatches it on the consumer's
 * behalf, which is exactly why its shape had to be documented somewhere.
 *
 * @event aparte-abort
 */
export interface AparteAbortEventDetail {
    /** Which chat to stop. Omit on a single-chat page. */
    targetId?: string;
}

/**
 * Detail payload for `aparte-compact` — a COMMAND dispatched on `window` to ask for
 * the conversation so far to be summarised.
 *
 * `<aparte-context auto-compact>` dispatches it on reaching `danger`, and a host
 * dispatches it from a button; `@aparte/plugin-compaction` is what answers it. Core
 * itself neither listens for it nor compacts — the events below are the plugin's.
 *
 * @event aparte-compact
 */
export interface AparteCompactEventDetail {
    /** Which chat to compact. Omit on a single-chat page. */
    targetId?: string;
}

/**
 * Detail payload for `aparte-compact-start` — the summarisation began. The point for a
 * host to show a spinner: summarising a long conversation is a model call and takes as
 * long as one.
 *
 * @event aparte-compact-start
 */
export interface AparteCompactStartEventDetail {
    /** The chat being compacted, when it has an id. */
    targetId?: string;
}

/**
 * Detail payload for `aparte-compact-done`.
 *
 * A union flattened to optional fields, because the two outcomes carry different
 * payloads and a consumer cannot guess which: nothing to compact sends
 * `{ skipped: true, reason }`, a real compaction sends `{ summary, kept, dropped }`.
 *
 * @event aparte-compact-done
 */
export interface AparteCompactDoneEventDetail {
    /** `true` when there was nothing worth summarising; the other two are absent. */
    skipped?: boolean;
    /**
     * Why it was skipped: `empty` (no messages), `nothing-to-drop` (the selector kept
     * everything), `running` (a compaction was already in flight), `streaming` (a turn
     * is in flight in the transcript).
     */
    reason?: 'empty' | 'nothing-to-drop' | 'running' | 'streaming';
    /** The summary that replaced the compacted turns. */
    summary?: string;
    /** How many messages were kept verbatim after the summary. */
    kept?: number;
    /** How many messages the summary replaced. */
    dropped?: number;
    /** The chat that was compacted, when it has an id — so a gauge on a multi-chat page resets only its own. */
    targetId?: string;
}

/**
 * Detail payload for `aparte-compact-error`.
 *
 * Note the asymmetry with `aparte-message-error`, which is deliberate rather than
 * hidden: `error` here is a plain string, not an `AparteError`.
 *
 * @event aparte-compact-error
 */
export interface AparteCompactErrorEventDetail {
    /** Human-readable failure reason. */
    error: string;
    /** The chat the compaction was for, when it has an id. */
    targetId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Host-handler events (ratified decision #8, tier b — opt-in, off by default)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detail payload for `aparte-attachment-preview`.
 * Dispatched when a user clicks an image tile, once
 * `setHostHandlers({ attachmentPreview: true })` has declared that you will open
 * a lightbox. Without the handler the tile is not interactive at all.
 *
 * @event aparte-attachment-preview
 */
export interface AparteAttachmentPreviewEventDetail {
    /** Object URL or remote URL of the image. */
    url: string;
    /** File name, or `''` when the attachment carries none. */
    name: string;
}


/**
 * Detail for `aparte-approval-mode-change` — dispatched by `@aparte/plugin-approval`'s
 * `<aparte-approval-mode>` after the person switched the approval mode. Bubbles and
 * crosses shadow roots, so a host can persist the choice from any ancestor.
 *
 * Declared here, like `aparte-model-change`, because a listener in any framework reads
 * `e.detail` through the typed event map. The values are the plugin's four modes
 * (`plan`, `ask`, `auto-edit`, `auto`); typed as strings so core names none of them.
 *
 * @event aparte-approval-mode-change
 */
export interface AparteApprovalModeChangeEventDetail {
    /** The mode just switched to. */
    mode: string;
    /** The mode it replaced. */
    previousMode: string;
}
