/**
 * Aparte Events
 * Event interfaces for component communication and control
 */

import type { AparteStatus, AparteMessage } from './models.js';
import type { AparteUsage } from './chat.js';

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
}

/**
 * Detail payload for aparte-token custom event
 * Emitted during streaming when a new token is appended
 */
export interface AparteTokenEventDetail {
    /** Message ID receiving the token */
    messageId: string;

    /** Token chunk content */
    chunk: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Control Events (Inter-package Communication)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Control event for external packages to pilot the Core
 * Allows packages like API adapters or plugins to update message states
 * without direct coupling to the core implementation
 */
export interface AparteControlEvent {
    /** Target message ID for the control action */
    messageId: string;

    /** New status to apply to the message */
    status: AparteStatus;

    /**
     * Optional metadata for arbitrary context
     * Examples: response time, tokens/sec, error details
     */
    metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event detail for message lifecycle changes
 * Emitted when a message is added, updated, or removed
 */
export interface AparteMessageEventDetail {
    /** The message that changed */
    messageId: string;

    /** Type of lifecycle event */
    type: 'added' | 'updated' | 'removed' | 'completed';

    /** Optional additional context */
    metadata?: Record<string, unknown>;
}

/**
 * Event detail for status changes
 * Emitted when the global or message status changes
 */
export interface AparteStatusEventDetail {
    /** Previous status */
    previousStatus: AparteStatus;

    /** New status */
    currentStatus: AparteStatus;

    /** Optional message ID if status is message-specific */
    messageId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Selection Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Event detail for model selection changes
 * Emitted when user selects a different provider or model
 * 
 * @event aparte-model-change
 */
/**
 * Emitted when a message response completes (apartemessagedone).
 * Carries token usage when the provider reports it.
 */
export interface AparteMessageDoneEventDetail {
    messageId: string;
    role: string;
    /** Token usage for the completed response, if reported by the provider. */
    usage?: AparteUsage;
}

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
 * Per-message sibling metadata carried by `aparte:path-changed`.
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
 * Detail payload for `aparte:branch-navigate`.
 * Dispatched by the bubble's branch-picker buttons; the viewport listens
 * (bubbling) and calls `navigateBranch(messageId, direction)` on its repo.
 *
 * @event aparte:branch-navigate
 */
export interface AparteBranchNavigateEventDetail {
    /** Message id whose siblings should be navigated */
    messageId: string;
    /** 'prev' = move to previous sibling, 'next' = move to next sibling */
    direction: 'prev' | 'next';
}

/**
 * Detail payload for `aparte:path-changed`.
 * Dispatched by the viewport in framework-managed mode after the active
 * path of the conversation tree changes (sibling switch, retry, edit, etc.).
 * Consumers (Angular wrapper) reconcile their signal/state from this payload.
 *
 * @event aparte:path-changed
 */
export interface ApartePathChangedEventDetail {
    /** Messages on the new active path, root → head. */
    messages: AparteMessage[];
    /** Sibling metadata, one entry per message on the path. */
    siblings: AparteSiblingInfo[];
}

/**
 * Detail payload for `aparte:retry`.
 * Dispatched by the assistant bubble's "Retry" action. Picked up by the
 * AparteClient, which calls `addSiblingOf` on the target viewport and streams
 * a fresh response into the new sibling.
 *
 * @event aparte:retry
 */
export interface AparteRetryEventDetail {
    /** Message id of the assistant response being retried (its sibling will be created). */
    messageId: string;
    /** Optional id of the host element (aparte-chat) — used by `scopeToTargetId`. */
    targetId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact Lifecycle Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detail payload for `aparte:artifact-start`.
 * Dispatched by the stream loop the moment an opening `<artifact …>` tag is parsed.
 * Apps typically use this to open a side panel and prepare a streaming code view.
 *
 * @event aparte:artifact-start
 */
export interface AparteArtifactStartEventDetail {
    /** Owning message id */
    messageId: string;
    /** Owning segment id (matches the segment dispatched to the bubble) */
    segmentId: string;
    /** Standard MIME from the `type=` attribute (e.g. `application/vnd.ant.react`) */
    mimeType: string;
    /** Convenience kind ('react'|'html'|'svg'|'js'|'css'|…) derived from `mimeType` */
    artifactType: string;
    /** Optional human title from the `title=` attribute */
    title?: string;
}

/**
 * Detail payload for `aparte:artifact-delta`.
 * Dispatched once per chunk routed into an open artifact body.
 * Consumers append to the displayed buffer in real time.
 *
 * @event aparte:artifact-delta
 */
export interface AparteArtifactDeltaEventDetail {
    /** Owning segment id */
    segmentId: string;
    /** New content fragment to append */
    chunk: string;
}

/**
 * Detail payload for `aparte:artifact-ready`.
 * Dispatched when the closing `</artifact>` tag is parsed (or the stream ends with
 * an active artifact segment). The full content is now available; consumers can
 * switch from streaming view to a final preview.
 *
 * @event aparte:artifact-ready
 */
export interface AparteArtifactReadyEventDetail {
    /** Owning message id */
    messageId: string;
    /** Owning segment id */
    segmentId: string;
    /** MIME type */
    mimeType: string;
    /** Convenience kind */
    artifactType: string;
    /** Optional title */
    title?: string;
    /** Final, complete content */
    content: string;
}

/**
 * Detail payload for `aparte:artifact-open`.
 * Dispatched by the artifact pill when a user clicks it (e.g. on a persisted
 * conversation reload). Apps use this to re-open the preview panel for an
 * already-completed artifact.
 *
 * @event aparte:artifact-open
 */
export interface AparteArtifactOpenEventDetail {
    /** Owning segment id */
    segmentId: string;
    /** MIME type */
    mimeType: string;
    /** Convenience kind */
    artifactType: string;
    /** Optional title */
    title?: string;
    /** Complete content */
    content: string;
}

/**
 * Detail payload for `aparte:edit`.
 * Dispatched by the user bubble after the user confirms an inline edit.
 * Picked up by the AparteClient, which truncates the existing responses to
 * this message and re-streams a new one.
 *
 * @event aparte:edit
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
 * Detail payload for `aparte:feedback`.
 * Dispatched by the assistant bubble's thumbs-up / thumbs-down buttons.
 *
 * @event aparte:feedback
 */
export interface AparteFeedbackEventDetail {
    /** Message id receiving the feedback. */
    messageId: string;
    /** 'positive' for thumbs-up, 'negative' for thumbs-down. */
    value: 'positive' | 'negative';
}

/**
 * Detail payload for `aparte:action`.
 * Dispatched by a custom bubble-toolbar action button (registered via
 * `AparteConfig.registerBubbleAction`). Apps listen (bubbling) and dispatch on
 * `actionId`. Mirrors the built-in bubble events (retry/feedback) so custom
 * actions are wired the same way in every framework and in vanilla.
 *
 * @event aparte:action
 */
export interface AparteActionEventDetail {
    /** The registered action's id (from `AparteBubbleAction.id`). */
    actionId: string;
    /** Message id of the bubble the action was clicked on. */
    messageId: string;
    /** Role of that bubble. */
    role: 'user' | 'assistant';
    /** Optional host element id (aparte-chat) — same use as retry/edit's targetId. */
    targetId?: string;
}

/**
 * Detail payload for `aparte:message-info`.
 * Dispatched by the assistant bubble's info ("i") action button. Apps
 * listen (bubbling) and present a stats popover for the completed response.
 *
 * @event aparte:message-info
 */
export interface AparteMessageInfoEventDetail {
    /** Message id whose stats should be shown. */
    messageId: string;
    /** Token usage + timing for the message, when available. */
    usage?: AparteUsage;
}
