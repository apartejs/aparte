/**
 * Aparte Models
 * Core data structures for message handling and attachments
 */

import type { AparteSegment } from './segments.js';

// ─────────────────────────────────────────────────────────────────────────────
// Flow States
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic status type for flow management
 * Used to drive loading indicators, error states, and transitions
 * without coupling to any specific data source
 */
export type AparteStatus = 'idle' | 'pending' | 'streaming' | 'completed' | 'error' | 'success';

// ─────────────────────────────────────────────────────────────────────────────
// Roles & Basic Types
// ─────────────────────────────────────────────────────────────────────────────

/** Role of a message sender in the conversation */
export type AparteBubbleRole = 'user' | 'assistant';

// ─────────────────────────────────────────────────────────────────────────────
// Attachments (Media Support)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attachment interface for media and file support
 * Future-proof structure for images, audio, documents, etc.
 */
export interface AparteAttachment {
    /** Unique identifier for the attachment */
    id: string;

    /** Display name of the attachment */
    name: string;

    /** MIME type (e.g., 'image/png', 'application/pdf') */
    type: string;

    /** URL or data URI to access the attachment */
    url: string;

    /** Optional file size in bytes */
    size?: number;

    /** Optional thumbnail URL for previews */
    thumbnailUrl?: string;

    /** Optional metadata for custom properties */
    metadata?: Record<string, unknown>;

    /**
     * Binary payload. Set at message-creation time (File from upload) so the
     * persistence adapter can save it to its attachments table. Stripped from
     * the serialised message row — the adapter reconstructs `url` via
     * `URL.createObjectURL(blob)` on hydration. Not serialised to JSON.
     */
    blob?: Blob;
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Branching (legacy)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single branch (alternative response) within an assistant message.
 *
 * @deprecated The active branching system is tree-based via `AparteMessageRepository`
 *   (siblings under the same parent node). This in-message versioning struct is
 *   kept only for backwards compatibility with existing serialised payloads.
 *   New code should rely on viewport methods `addSiblingOf` / `navigateBranch`
 *   and on the `aparte-path-changed` event payload to drive the branch picker UI.
 */
export interface AparteMessageBranch {
    /** Unique identifier for this branch */
    id: string;
    /** Text content of this branch */
    content?: string;
    /** Rich segments of this branch */
    segments?: AparteSegment[];
    /** Branch status */
    status?: AparteStatus;
    /** Creation timestamp */
    timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Bar Config
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Names of the individual action-bar buttons, used for explicit per-role
 * ordered configuration (see `AparteBubbleActionsConfig.user` / `.assistant`).
 */
export type AparteBubbleActionName = 'copy' | 'edit' | 'retry' | 'thumbUp' | 'thumbDown' | 'info';

/**
 * Controls which action buttons are rendered in message bubbles.
 * Pass to `aparteGlobalConfig.setBubbleActions()` to customise or disable actions.
 *
 * **Every button is off by default.** Copy is the one core honors alone — turn it on
 * with `{ copy: true }`. Every other button needs someone outside core to honor it —
 * `AparteClient` (retry, edit) or your own listener (feedback, info). A button nobody
 * answers is a lie told to the user, so aparté ships them off and you turn on what you
 * handle:
 *
 * ```ts
 * aparteGlobalConfig.setBubbleActions({ copy: true });                // core copies on its own
 * aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });   // you run AparteClient
 * ```
 *
 * Two ways to configure:
 * - Global flags (`copy`/`retry`/`edit`/`feedback`/`info`) — role-aware defaults.
 * - Explicit per-role ordered sets (`user`/`assistant`) — when provided for a
 *   role, they fully replace the flag-derived set for that role: buttons render
 *   in exactly the given order, and naming a button there IS the opt-in (the flag
 *   is not consulted). Lets a theme match a specific product 1:1.
 */
export interface AparteBubbleActionsConfig {
    /** Copy message text to clipboard — the one action core honors alone. Default: false */
    copy?: boolean;
    /** Retry / regenerate the response (assistant bubbles). Needs a host to re-send. Default: false */
    retry?: boolean;
    /** Edit the sent message inline (user bubbles). Needs a host to keep the new text. Default: false */
    edit?: boolean;
    /** Thumbs-up / thumbs-down feedback (assistant bubbles). Needs a listener. Default: false */
    feedback?: boolean;
    /**
     * The details ("i") button, which opens the **app-owned** stats popover by
     * emitting `aparte-message-info` (assistant bubbles). Rendered only when the
     * message also carries a `usage` — no numbers, nothing to show. Default: false
     */
    info?: boolean;
    /** Explicit, ordered action set for USER bubbles. Example: `['edit', 'copy']`. */
    user?: AparteBubbleActionName[];
    /** Explicit, ordered action set for ASSISTANT bubbles. Example: `['copy', 'thumbUp', 'thumbDown', 'retry']`. */
    assistant?: AparteBubbleActionName[];
}

/**
 * The affordances core RENDERS but cannot COMPLETE — each one only asks, through a
 * DOM event, and the app does the work. Declare what your app actually handles
 * with `aparteGlobalConfig.setHostHandlers()`; everything else stays out of the UI
 * rather than showing a control that answers to nobody.
 *
 * ```ts
 * aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });   // you open a lightbox
 * ```
 *
 * These are declarations, not callbacks: the event (`aparte-attachment-preview`)
 * is unchanged, and you keep listening for it wherever you already do.
 */
export interface AparteHostHandlersConfig {
    /**
     * Clicking an image attachment asks for a full-size preview
     * (`aparte-attachment-preview`) — core owns no lightbox. Until declared, the
     * tile is inert and is not signalled as a button. Default: false
     */
    attachmentPreview?: boolean;
    /**
     * Clicking a file — not an image — in a sent message asks for it to be opened, with the
     * same `aparte-attachment-preview` and its `type`. Its own declaration, so a lightbox
     * written for images is never handed a PDF: you claim files when you open them, in a
     * new tab for instance. Only a file whose URL a tab can open (an object URL, a remote
     * one) becomes a button. Default: false
     */
    filePreview?: boolean;
}

/**
 * A checkpoint over a kept history: what the model reads in place of the messages
 * before the one that carries it. Written by whoever summarises
 * (`@aparte/plugin-compaction`, or a host summarising by other means) onto the first
 * kept message as `AparteMessage.contextSummary`.
 */
export interface AparteContextSummary {
    /** What the model reads in place of every message before this one on the path. */
    summary: string;

    /** How many messages of the path the summary stands for — the separator's "N". */
    count: number;

    /** When the summary was written, in epoch milliseconds. */
    createdAt: number;
}

/**
 * Core message structure for the chat
 * Supports both simple content and rich multi-segment content
 */
export interface AparteMessage {
    /** Unique identifier for the message */
    id: string;

    /** Role of the message sender */
    role: AparteBubbleRole;

    /**
     * Simple text content (for basic messages)
     * Use `segments` for rich content with multiple parts
     */
    content?: string;

    /**
     * Rich content segments (thinking, code, tool calls, artifacts, …)
     * Takes precedence over `content` if provided
     */
    segments?: AparteSegment[];

    /** Unix timestamp of message creation */
    timestamp: number;

    /** Whether the message is still being streamed */
    isStreaming?: boolean;

    /** Current status of the message */
    status?: AparteStatus;

    /** Optional attachments (images, files, etc.) */
    attachments?: AparteAttachment[];

    /** Token usage + timing reported by the provider for assistant messages. */
    usage?: import('./chat.js').AparteUsage;

    /**
     * Why the model stopped writing this reply, when the provider said. Kept with the
     * message, so a reply cut off at the length limit (`'length'`) still says so after a
     * reload.
     */
    finishReason?: import('./chat.js').AparteFinishReason;

    /**
     * The provider, model and temperature an assistant turn ran on, written by
     * `AparteClient` when the turn starts. A turn a server paused is resumed on them after
     * a reload (`resumeDeferred`), not on whatever model is selected by then.
     */
    model?: { providerId: string; modelId: string; temperature?: number };

    /**
     * This message is the summary `@aparte/plugin-compaction` injected in place of the
     * turns it summarised (a host that summarises by other means sets the flag too). Its role is `user` — the summary is context handed to the
     * model, and a `system` message mid-conversation is refused by some providers —
     * but it is not something the user said: the bubble draws a separator in its place
     * ("Earlier messages were summarised", with the summary behind Show summary; no
     * count and no Restore, since an older compaction replaced the turns) and the history
     * sends it under a fixed preamble saying what it is. A compaction that keeps the
     * messages writes {@link AparteMessage.contextSummary} instead.
     */
    compaction?: true;

    /**
     * A checkpoint: from this message on, the model reads `contextSummary.summary` in
     * place of every message before it on the path. Nothing before it is deleted — the
     * reader still scrolls up to them, a host still stores them — only what goes to the
     * model is shortened (`historyFromCheckpoint`). It sits on the first KEPT message,
     * which is a `user` message, so the history still alternates its roles.
     *
     * Absent and `undefined` mean the same thing: no checkpoint here.
     */
    contextSummary?: AparteContextSummary;

    /**
     * The estimate, in tokens, of the request that produced this reply, recorded by
     * `AparteClient` when it sends. Read back beside the provider's real input count
     * (`usage.inputTokens`) to calibrate the context measure: the ratio of the two says
     * how far the character heuristic is off for this model and this conversation.
     * Absent when the request carried a part the heuristic cannot count (an image).
     */
    contextEstimate?: number;

    /**
     * Alternative responses generated by retrying.
     *
     * @deprecated Use the tree-based branching exposed by `AparteMessageRepository`
     *   (siblings under the same parent). The bubble no longer reads this field
     *   — sibling counts come from `aparte-path-changed` event metadata.
     */
    branches?: AparteMessageBranch[];

    /**
     * Index of the currently displayed branch (default 0).
     * @deprecated See {@link AparteMessage.branches}.
     */
    activeBranchIndex?: number;

    /** Optional metadata for custom properties */
    metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Configuration options for AparteChatViewport */
export interface AparteViewportConfig {
    /** Threshold in pixels for smart scroll detection */
    scrollThreshold?: number;

    /**
     * DOM render cap: the max number of bubbles kept in the DOM at once (a perf
     * ceiling for very long conversations). This does NOT evict messages from the
     * conversation model — the full tree and its persistence snapshot stay intact.
     * Defaults to 1000.
     */
    maxRenderedBubbles?: number;

    /**
     * Duration in milliseconds to freeze spacer recalculation after resetSpacer().
     * Set this to the duration of any CSS layout transition in the host app
     * (e.g. the flex animation that moves the composer from center to bottom).
     * Defaults to 0 (no freeze). Example: 350 when `transition: flex 0.3s ease` is used.
     */
    layoutTransitionMs?: number;
}

/** Configuration options for the composer input. */
export interface AparteInputConfig {
    /** Placeholder text for the input */
    placeholder?: string;

    /** Maximum height in pixels for auto-expand */
    maxHeight?: number;

    /** Minimum height in pixels */
    minHeight?: number;
}

/**
 * Marks a message whose `segments` were DERIVED from its `content` on display (the
 * viewport parses a markdown string into segments so a stored reply renders like the
 * stream did). The manager reads it to compare messages without those segments: a
 * conversation merely opened and left must not count as changed, or it re-saves and
 * floats to the top of the list. Set as a non-enumerable property, so a spread or a
 * JSON round-trip never carries it into storage.
 */
export const APARTE_DERIVED_SEGMENTS: unique symbol = Symbol.for('aparte.derivedSegments');
