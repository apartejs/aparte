/**
 * stream-events.ts — contract for the framework-free structured-stream agent loop.
 *
 * `runStreamAgent` ({@link ./stream-run}) is the cloud-structured sibling of
 * `runAgent` ({@link ./agent-loop}): where `runAgent` drives a text-only
 * provider (`chat → string`, tool calls re-parsed from text), `runStreamAgent`
 * consumes a **structured** `AsyncIterable<StreamChatEvent>` (text / thinking /
 * tool_use / done / error) — the exact stream `AparteClient._streamLoop` reads
 * today. It is the extraction target for that 700-line DOM-coupled loop.
 *
 * DOM stays out of here. The loop emits high-level {@link StreamRunEvent}s in the
 * exact order `_streamLoop` performs its `targetElement.*` calls; a thin adapter
 * (in `@aparte/core`, where the parser and renderers live) translates each event
 * into the imperative viewport surface. So this module — and {@link ./stream-run}
 * — import **nothing** from `@aparte/core`: the types below structurally mirror the
 * core types (`AparteStreamEvent`, `AparteUsage`, `AparteChatMessage`, `AparteToolCall`)
 * so the adapter passes the real objects through with zero runtime conversion.
 *
 * SCOPE: text · thinking · tool_use (+ HITL approval) · done · error · artifacts
 * (raw / XML state machine / create_artifact) · multi-phase pipeline · synthetic
 * toolChoice bypass. Code-fence promotion is the only `_streamLoop` mechanism
 * left out here — it is adapter-side (it needs the core parser).
 */

// ─── Duck-typed mirrors of @aparte/core (structural — NO import) ───────────────

/**
 * Token usage. Structurally a superset-compatible mirror of `AparteUsage`: the
 * five common fields plus an index signature that carries the provider-specific
 * rest (ttft/decode/phases/…) opaquely — the loop transports usage, never reads
 * past these five.
 */
export interface StreamUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    durationMs?: number;
    [key: string]: unknown;
}

/** One tool call as surfaced by the provider stream (mirrors `AparteToolCall`). */
export interface StreamToolCall {
    id: string;
    name: string;
    input: unknown;
}

/**
 * A structured stream event from the transport (mirrors `AparteStreamEvent`). The
 * `tool_use` variant spreads {@link StreamToolCall} exactly like core's does.
 */
export type StreamChatEvent =
    | { type: 'text'; delta: string }
    | { type: 'thinking'; delta: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
    | { type: 'error'; message: string }
    | { type: 'done'; usage?: StreamUsage };

/**
 * A conversation message (mirrors `AparteChatMessage`). `role` is left open
 * (`string`) so the loop can push the `'tool_call'` / `'tool_result'` envelope
 * roles `_streamLoop` uses without importing core's union.
 */
export interface StreamAgentMessage {
    role: string;
    content: string;
    /** Present on a `'tool_call'` envelope — the whole turn's calls, grouped. */
    toolCalls?: StreamToolCall[];
    /** Present on a `'tool_result'` message — which call it answers. */
    toolCallId?: string;
    /** Assistant text that preceded the tool call(s) this turn. */
    precedingText?: string;
    [key: string]: unknown;
}

/** The request handed to the transport each turn (mirrors `AparteChatRequest`). */
export interface StreamChatRequest {
    messages: StreamAgentMessage[];
    [key: string]: unknown;
}

/** A tool handler (mirrors the resolved `AparteToolHandler`). */
export type StreamToolHandler = (
    call: StreamToolCall,
    signal: AbortSignal,
) => Promise<{ content: string }>;

/** Per-tool loop configuration (mirrors the `AparteTool` subset the loop reads). */
export interface StreamToolConfig {
    maxTurns?: number;
    needsApproval?: boolean;
}

/**
 * Resolves a human-in-the-loop approval (mirrors core's
 * `AparteToolApprovalResolver`). Injected so the loop stays headless.
 */
export type StreamApprovalResolver = (
    toolCallId: string,
    signal: AbortSignal,
) => Promise<{ approved: boolean; payload?: unknown }>;

// ─── The events runStreamAgent emits ─────────────────────────────────────────

/**
 * High-level, DOM-free events isomorphic to `_streamLoop`'s `targetElement.*`
 * call sequence. Emitted **synchronously and in order** (see {@link StreamRunEmitter})
 * so the adapter reproduces the exact streaming update order.
 *
 * Mapping to `_streamLoop` (aparte-client.ts) for the adapter:
 * - `run-start`       → updateMessage(status:'streaming') once at loop entry (the leading write before turn 1)
 * - `turn-start`      → reset the per-turn parser / thinking / streaming-segment state (no DOM); one per turn
 * - `text-delta`      → parser-driven addSegment/updateSegment, else typeName/updateLastMessage (:1245-1440)
 * - `text-flush`      → textParser.finalize() then addSegment/updateSegment the finalized segments (:1639-1707);
 *                       one per turn, after the inner SSE loop ends (surfaced by the spike — a turn-boundary flush)
 * - `thinking-delta`  → addSegment('thinking') then updateSegment(content) (:1227-1244); first `text-delta` after
 *                       thinking collapses it (updateSegment collapsed:true, :1247-1250)
 * - `tool-start`      → renderer lookup + per-tool-name CSS inject into document.head + addSegment (:1490-1522)
 * - `tool-awaiting-approval` → updateSegment('awaiting-approval') + dispatch `aparte-tool-approval-request` (:1544-1550)
 * - `tool-approved`   → updateSegment('pending') (:1580)
 * - `tool-rejected`   → updateSegment('rejected', result) (:1560)
 * - `tool-resolved`   → updateSegment('resolved', result) (:1588)
 * - `tool-aborted`    → updateSegment('aborted') (no-handler :1624, timeout/abort :1614, per-tool maxTurns :1528)
 * - `turn-limit-exceeded` scope:'global' → addSegment(error 'MAX_TURNS_EXCEEDED') (:1052-1058);
 *                         scope:'tool'   → updateSegment('aborted') (:1526-1531)
 * - `phase-advance`   → addSegment({type:'pipeline-waiting'}) (:1720-1721); the loop has already
 *                       pushed the phase's reply into history and bumped the phase index
 * - `run-aborted`     → dispatch `aparte-message-aborted` (:1218-1221 / :1046)
 * - `run-done`        → updateMessage(status:'completed') always + setUsage if usage (:1733-1742)
 */
export type StreamRunEvent =
    | { type: 'run-start' }
    | { type: 'turn-start' }
    // `reduced` (XML mode only): chat text that precedes an `<artifact>` open tag
    // — the adapter renders it through `_streamLoop`'s reduced pre-tag path
    // (completed segments only, no trailing active segment). Absent everywhere else.
    | { type: 'text-delta'; delta: string; reduced?: boolean }
    | { type: 'text-flush' }
    | { type: 'thinking-delta'; delta: string }
    // Artifacts. `open`→addSegment(artifact)+dispatchArtifactLifecycle(final:false);
    // `chunk`→updateSegment(content)+lifecycle(false); `close`→updateSegment(
    // content,inline)+lifecycle(true). Raw mode (whole stream → one artifact,
    // aparte-client.ts :1172-1185/:1254-1265/:1642-1651) and the XML state machine
    // (E2) both emit these; the adapter renders them identically.
    | { type: 'artifact-open'; id: string; mimeType: string; kind: string; title: string }
    | { type: 'artifact-chunk'; id: string; content: string }
    | { type: 'artifact-close'; id: string; content: string; inline: boolean }
    // One-shot artifact from the built-in `create_artifact` tool: full content
    // up-front (aparte-client.ts :1449-1487) → a single addSegment + lifecycle(true),
    // NOT the streamed open/chunk/close dance.
    | { type: 'artifact-ready'; id: string; mimeType: string; kind: string; title: string; content: string }
    | { type: 'tool-start'; toolCallId: string; name: string; input: unknown }
    | { type: 'tool-awaiting-approval'; toolCallId: string; name: string; input: unknown }
    | { type: 'tool-approved'; toolCallId: string }
    | { type: 'tool-rejected'; toolCallId: string; reason: string }
    | { type: 'tool-resolved'; toolCallId: string; result: string }
    | { type: 'tool-aborted'; toolCallId: string }
    | { type: 'turn-limit-exceeded'; scope: 'global' | 'tool'; limit: number; toolCallId?: string }
    // Pipeline: after a tool-less turn that is NOT the last phase, advance to the
    // next phase (mirrors aparte-client.ts :1709-1726). The loop has already pushed
    // this turn's reply into history as context and bumped the phase index;
    // `index` is the new (post-increment) index. The adapter shows a
    // `pipeline-waiting` segment while the next phase's turn runs.
    | { type: 'phase-advance'; index: number }
    | { type: 'run-aborted' }
    | { type: 'run-done'; usage?: StreamUsage };

/**
 * Synchronous event sink — mirrors `AGUIEmitter`. Synchronous by contract: the
 * loop must never yield between emitting an event and its ordered successor, or
 * the adapter's streaming updates would interleave out of order.
 */
export type StreamRunEmitter = (event: StreamRunEvent) => void;
