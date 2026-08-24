/**
 * Aparte Segments
 * Extensible segment types for rich message content
 */

// ─────────────────────────────────────────────────────────────────────────────
// Base Segment Types
// ─────────────────────────────────────────────────────────────────────────────

/** Base segment interface - all segments extend this */
export interface AparteSegmentBase {
    /** Unique segment identifier */
    id: string;

    /** Segment type discriminator */
    type: string;

    /** Whether segment is currently being streamed */
    isStreaming?: boolean;

    // ── Identity and measurement ─────────────────────────────────────────────
    // A segment used to know only what it WAS, never where it sat or when it
    // happened — while the message one level up already carried a `timestamp`, a
    // `usage` and a `metadata` bag. The gap was not theoretical: `render(segment)`
    // takes one argument, so a custom renderer could not learn its message;
    // `aparte-terminal-run` shipped a `segmentId` nobody could resolve; and the
    // artifact renderer FABRICATED a message id (`__reload__${Date.now()}`) to get
    // past a consumer dedupe keyed on the pair it did not have.
    //
    // All five are optional, so nothing that exists today changes shape, and all
    // five are stamped in ONE place — `utils/segments.ts`, called by the two owners
    // of a message's segment array (`aparte-chat-viewport`, `aparte-chat-host`).
    // Not by the parser: `tool_call` and `pipeline-waiting` segments never go
    // through it, which would have left a tool call — the most useful duration of
    // all — unmeasured.

    /** Id of the message this segment belongs to. Stamped on insertion. */
    messageId?: string;

    /**
     * Position in the owning message's `segments[]`, maintained across
     * insertions and removals.
     */
    index?: number;

    /** Epoch ms when the segment entered the transcript. */
    startedAt?: number;

    /**
     * Epoch ms when content last arrived on this segment.
     *
     * It ADVANCES while the segment streams and freezes when the segment settles,
     * so `endedAt - startedAt` is a live duration during a turn and a final one
     * after it — ask `isSegmentSettled(segment)` which you are looking at. Core
     * never renders either.
     *
     * Why not simply "when it finished": the two obvious rules are both wrong, and
     * measurably. Closing at the end of the turn makes a reasoning block span the
     * whole answer that followed it (2s of thinking before a 20s reply reads
     * "22s"). Closing when the next segment opens is the same error, smaller — a
     * gap of ten seconds before the next segment is counted as thinking, while the
     * person watching knows nothing happened. The last delta is the only moment
     * the segment itself can vouch for.
     */
    endedAt?: number;

    /**
     * Extras only the producer of the segment can know — token counts, cost,
     * compute device. Core writes nothing here: fill it from an app with
     * `updateSegment(segmentId, { meta })`. Mirrors `AparteMessage.metadata`.
     */
    meta?: Record<string, unknown>;
}

/** Text segment - plain text content */
export interface AparteTextSegment extends AparteSegmentBase {
    type: 'text';
    content: string;
}

/** Thinking/reasoning segment - collapsible */
export interface AparteThinkingSegment extends AparteSegmentBase {
    type: 'thinking';
    content: string;
    collapsed?: boolean;
    label?: string; // e.g., "Reasoning", "Analysis"
}

/** Code segment - syntax highlighted code block */
export interface AparteCodeSegment extends AparteSegmentBase {
    type: 'code';
    content: string;
    language?: string;
    filename?: string;
    showLineNumbers?: boolean;
}

/** Diff segment - before/after code comparison */
export interface AparteDiffSegment extends AparteSegmentBase {
    type: 'diff';
    filename?: string;
    hunks: AparteDiffHunk[];
}

export interface AparteDiffHunk {
    oldStart: number;
    newStart: number;
    lines: AparteDiffLine[];
}

export interface AparteDiffLine {
    type: 'add' | 'remove' | 'context';
    content: string;
}

/** Terminal/console segment - command execution */
export interface AparteTerminalSegment extends AparteSegmentBase {
    type: 'terminal';
    command?: string;
    output?: string;
    exitCode?: number;
    isRunning?: boolean;
}

/** File tree segment - directory structure */
export interface AparteFileTreeSegment extends AparteSegmentBase {
    type: 'file-tree';
    files: AparteFileNode[];
    title?: string;
}

export interface AparteFileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: AparteFileNode[];
    status?: 'added' | 'modified' | 'deleted';
}

/** Image segment */
export interface AparteImageSegment extends AparteSegmentBase {
    type: 'image';
    url: string;
    alt?: string;
    caption?: string;
}

/** Preview/iframe segment */
export interface ApartePreviewSegment extends AparteSegmentBase {
    type: 'preview';
    url: string;
    title?: string;
    height?: number;
}

/** Error segment */
export interface AparteErrorSegment extends AparteSegmentBase {
    type: 'error';
    content: string; // Renamed from message for consistency
    details?: string;
    stack?: string;
}

/** Progress segment - for long operations */
export interface AparteProgressSegment extends AparteSegmentBase {
    type: 'progress';
    label: string;
    percent?: number;
    status?: 'pending' | 'running' | 'complete' | 'error';
}

/** Tool call segment - rendered while waiting for a tool handler to resolve */
export interface AparteToolCallSegment extends AparteSegmentBase {
    type: 'tool_call';
    toolCall: import('./tools.js').AparteToolCall;
    /**
     * `awaiting-approval` — paused for a human decision (needsApproval tools);
     * `rejected` — the human declined to run it.
     */
    status: 'pending' | 'resolved' | 'aborted' | 'awaiting-approval' | 'rejected';
    result?: string;
}

/** Custom segment - for framework-specific views (Onboarding, Tools, etc.) */
export interface AparteCustomSegment extends AparteSegmentBase {
    type: 'custom';
    /** Unique string structure to identify the view (e.g. 'onboarding', 'webcontainer', 'weather-widget') */
    subType: string;
    /** Arbitrary data payload for the component */
    data?: unknown;
    /** Optional fallback text representation */
    fallback?: string;
}

/**
 * Artifact segment — a structured payload (React/HTML/SVG/JS/CSS, etc.) embedded in the
 * assistant's reply. The payload is delimited in the stream by `<artifact type="...">…</artifact>`.
 *
 * The core only models the data and emits lifecycle events (`aparte-artifact-start|delta|ready`).
 * Apps decide how to render the rich preview (typically a side panel with an iframe/code view).
 *
 * `mimeType` follows standard MIME conventions, with the Anthropic vendor namespace for
 * framework-specific kinds:
 *   - `application/vnd.ant.react` (or `application/vnd.ant.html`, etc.)
 *   - `text/html`, `text/css`, `application/javascript`
 *   - `image/svg+xml`
 */
export interface AparteArtifactSegment extends AparteSegmentBase {
    type: 'artifact';
    /** Standard MIME type (verbatim from the `type="…"` attribute on the opening tag) */
    mimeType: string;
    /**
     * Short kind identifier derived from `mimeType` (e.g. 'react', 'html', 'svg').
     * Convenience for UIs that want to switch on a stable enum-like string.
     */
    artifactType: string;
    /** Optional human title (from the `title="…"` attribute on the opening tag) */
    title?: string;
    /** Body content between the opening and closing tag — accumulates while streaming. */
    content: string;
    /**
     * When true, the renderer displays the artifact inline as a code block
     * instead of a clickable pill that opens the side panel.
     * Set by the client after the stream ends, based on content line count.
     * Defaults to false (pill) while streaming.
     */
    inline?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Union Type
// ─────────────────────────────────────────────────────────────────────────────

/** Transient waiting indicator shown between pipeline phases */
export interface ApartePipelineWaitingSegment extends AparteSegmentBase {
    type: 'pipeline-waiting';
}

/** All built-in segment types */
export type AparteSegment =
    | AparteTextSegment
    | AparteThinkingSegment
    | AparteCodeSegment
    | AparteDiffSegment
    | AparteTerminalSegment
    | AparteFileTreeSegment
    | AparteImageSegment
    | ApartePreviewSegment
    | AparteErrorSegment
    | AparteProgressSegment
    | AparteCustomSegment
    | AparteToolCallSegment
    | AparteArtifactSegment
    | ApartePipelineWaitingSegment;

/** Segment type discriminator values */
export type AparteSegmentType = AparteSegment['type'];

// ─────────────────────────────────────────────────────────────────────────────
// Segment Renderer Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Segment renderer interface for custom segment types
 * Implement this to add new segment renderers
 */
export interface AparteSegmentRenderer<T extends AparteSegmentBase = AparteSegmentBase> {
    /** Segment type this renderer handles */
    type: string;

    /**
     * Render a segment to either an HTML string or a ready DOM element.
     *
     * Return a **string** for simple markup (inserted via innerHTML) — the built-in
     * renderers do this. Return an **HTMLElement** to skip innerHTML entirely: you
     * can attach event listeners and framework nodes directly, and there is no
     * innerHTML XSS surface for values you interpolate. Either way, `setup()` (if
     * provided) runs afterwards with the resulting element. For in-place streaming
     * updates to find your element, keep a `data-segment-id="<segment.id>"` on its
     * root (or implement `update()`).
     *
     * @param segment - Segment data to render
     * @returns HTML string or a DOM element
     */
    render(segment: T): string | HTMLElement;

    /**
     * Optional: Get CSS styles for this segment type
     * @returns CSS string to inject
     */
    getStyles?(): string;

    /**
     * Optional: Setup interactivity after render
     * @param element - The rendered DOM element
     * @param segment - Segment data
     */
    setup?(element: HTMLElement, segment: T): void;

    /**
     * Optional: In-place DOM update during streaming.
     * When provided, called instead of re-rendering the full element.
     * Must not add/remove child nodes — only mutate attributes or textContent
     * so the MutationObserver (childList) doesn't fire and scroll stays stable.
     */
    update?(element: HTMLElement, segment: T): void;

    /**
     * Optional: re-read the CONFIG-DERIVED text of an already-rendered segment —
     * an icon from the icon provider, a label from the locale.
     *
     * Called when the config changes (a language switch, a new icon set), on every
     * segment already on screen. Bound by the same rule as `update()`: **must not
     * add or remove child nodes** — only attributes and textContent — so the
     * viewport's childList observer stays quiet and scroll does not move.
     *
     * This exists because the obvious alternative does not work. Re-rendering the
     * segments container to pick up a new locale destroys state the DOM owns and the
     * segment data does not: a mounted sandboxed artifact preview, a reasoning block
     * the reader expanded by clicking `<summary>` (which never writes back to
     * `collapsed`), scroll position inside a long terminal, the focus on an
     * Approve/Reject gate, and the buffered lookahead of the incremental Markdown
     * parser mid-stream. It also fires container-wide childList mutations, which is
     * exactly what the rule above forbids.
     *
     * Implement it only if the rendered output contains text or icons that came from
     * the config. A renderer whose chrome is entirely its own data — `file-tree`,
     * `progress` — correctly does not, exactly as it does not implement `update()`.
     */
    relabel?(element: HTMLElement, segment: T): void;

    /**
     * Optional: Cleanup when segment is removed
     * @param element - The DOM element being removed
     */
    cleanup?(element: HTMLElement): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment Event Types
// ─────────────────────────────────────────────────────────────────────────────

/** Event when segment content is updated during streaming */
export interface AparteSegmentUpdateEventDetail {
    messageId: string;
    segmentId: string;
    content: string;
    append?: boolean;
}
