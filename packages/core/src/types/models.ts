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
 * @deprecated The active branching system is tree-based via `MessageRepository`
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
export type AparteBubbleActionName = 'copy' | 'edit' | 'retry' | 'thumbUp' | 'thumbDown';

/**
 * Controls which action buttons are rendered in message bubbles.
 * Pass to `AparteConfig.setBubbleActions()` to customise or disable actions.
 *
 * Two ways to configure:
 * - Global flags (`copy`/`retry`/`edit`/`feedback`) — role-aware defaults, the
 *   original behaviour.
 * - Explicit per-role ordered sets (`user`/`assistant`) — when provided for a
 *   role, they fully replace the flag-derived set for that role: buttons render
 *   in exactly the given order and nothing is auto-appended (not even the usage
 *   "info" button). Lets a theme match a specific product 1:1.
 */
export interface AparteBubbleActionsConfig {
    /** Copy message text to clipboard. Default: true */
    copy?: boolean;
    /** Retry / regenerate the response (assistant bubbles). Default: true */
    retry?: boolean;
    /** Edit the sent message inline (user bubbles). Default: true */
    edit?: boolean;
    /** Thumbs-up / thumbs-down feedback (assistant bubbles). Default: false */
    feedback?: boolean;
    /** Explicit, ordered action set for USER bubbles. Example: `['edit', 'copy']`. */
    user?: AparteBubbleActionName[];
    /** Explicit, ordered action set for ASSISTANT bubbles. Example: `['copy', 'thumbUp', 'thumbDown', 'retry']`. */
    assistant?: AparteBubbleActionName[];
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
     * Rich content segments (thinking, code, terminal, etc.)
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
     * Alternative responses generated by retrying.
     *
     * @deprecated Use the tree-based branching exposed by `MessageRepository`
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
     * @deprecated Renamed to {@link maxRenderedBubbles}. This used to silently
     * evict messages from the conversation model (data loss); it now only caps
     * rendered bubbles. For real history retention, configure it on your
     * ConversationManager instead.
     */
    maxMessages?: number;

    /**
     * Duration in milliseconds to freeze spacer recalculation after resetSpacer().
     * Set this to the duration of any CSS layout transition in the host app
     * (e.g. the flex animation that moves the composer from center to bottom).
     * Defaults to 0 (no freeze). Example: 350 when `transition: flex 0.3s ease` is used.
     */
    layoutTransitionMs?: number;
}

/** Configuration options for AparteChatInput */
export interface AparteInputConfig {
    /** Placeholder text for the input */
    placeholder?: string;

    /** Maximum height in pixels for auto-expand */
    maxHeight?: number;

    /** Minimum height in pixels */
    minHeight?: number;
}
