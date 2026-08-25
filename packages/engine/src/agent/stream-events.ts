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
    /*
     * The index signature that used to sit here was documented as the ONE
     * intentional asymmetry of the seam — and it was the last thing making
     * `streamRunner: runStreamAgent` un-assignable, because core's `AparteUsage`
     * has no index signature and `transportCall` needs the core -> engine
     * direction too.
     *
     * The guard in stream-events.contract.ts normalized this exact field away
     * before comparing, so it had been written AROUND the defect: every shape it
     * checked matched, while the composition both packages exist for did not
     * compile. Removing the signature costs nothing — the five named fields are
     * what the loop transports, and a provider's extra timing fields still ride
     * along, since TypeScript only excess-property-checks object literals.
     */
}

/** One tool call as surfaced by the provider stream (mirrors `AparteToolCall`). */
export interface StreamToolCall {
    id: string;
    name: string;
    /**
     * `Record<string, unknown>`, mirroring core exactly, not `unknown`.
     *
     * `unknown` looked safer — the loop does not read tool input, it forwards it —
     * but the seam needs assignability in BOTH directions (`transportCall` is
     * contravariant), and `unknown` is not assignable to `Record<string, unknown>`.
     * Locked to core's shape by `stream-events.contract.ts`.
     */
    input: Record<string, unknown>;
}

/**
 * A structured stream event from the transport (mirrors `AparteStreamEvent`). The
 * `tool_use` variant spreads {@link StreamToolCall} exactly like core's does.
 */
export type StreamChatEvent =
    | { type: 'text'; delta: string }
    | { type: 'thinking'; delta: string }
    | ({ type: 'tool_use' } & StreamToolCall)
    | { type: 'error'; message: string }
    | { type: 'done'; usage?: StreamUsage };

/**
 * A tool declaration, structurally mirroring core's `AparteTool`.
 *
 * The loop forwards the inventory to the transport and reads `maxTurns` and
 * `needsApproval` from its own lookup — it never interprets the schema. Mirrored
 * exactly all the same, because the seam needs assignability in both directions;
 * `stream-events.contract.ts` locks it.
 */
export interface StreamTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    systemPrompt?: string;
    maxTurns?: number;
    needsApproval?: boolean;
}

/**
 * Multimodal content parts — a structural mirror of core's `AparteContentPart`.
 *
 * Mirrored rather than imported for the same reason as everything else in this
 * file: engine stays zero-import at runtime. Mirrored EXACTLY rather than
 * loosened to `unknown[]`, which was the first attempt: `transportCall` is
 * contravariant, so the message type has to be assignable to core's AND core's to
 * it, and `unknown[]` fails the second direction. `stream-events.contract.ts`
 * asserts the equality, so a part added on either side is a typecheck error
 * rather than a silent divergence.
 *
 * The loop never looks inside content — it carries messages to the transport and
 * appends results. This exists to make the seam type-check, not to be read.
 */
export interface StreamTextPart { type: 'text'; text: string }
export interface StreamImagePart { type: 'image'; image: string; mimeType?: string }
export interface StreamFilePart { type: 'file'; data: string; mimeType: string; name?: string }
export type StreamContentPart = StreamTextPart | StreamImagePart | StreamFilePart;

/**
 * A conversation message (mirrors `AparteChatMessage`).
 *
 * `role` used to be a bare `string`, justified by a comment saying the loop needed
 * to push the `'tool_call'` / `'tool_result'` envelope roles "without importing
 * core's union". But core's union already contains both — so the reason had not
 * been true for some time, and the looseness cost something real: `transportCall`
 * is contravariant, so this message type must ALSO be assignable to core's, and a
 * `string` role is not assignable to a closed union. That was the last link in the
 * chain that stopped `streamRunner: runStreamAgent` from compiling.
 *
 * Mirrored structurally rather than imported, to keep this package zero-import at
 * runtime; `stream-events.contract.ts` asserts the two line up.
 */
export interface StreamAgentMessage {
    role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';
    /**
     * Message content — carried, never inspected by this loop.
     *
     * Was plain `string`, because core's `AparteChatMessage.content` became
     * `string | AparteContentPart[]` for multimodal messages and this mirror never
     * followed. The consequence was not subtle: `new AparteClient({ streamRunner:
     * runStreamAgent })` — the one composition the two packages exist to make, and
     * the headline of five docs pages — did not typecheck.
     */
    content: string | StreamContentPart[];
    /** Present on a `'tool_call'` envelope — the whole turn's calls, grouped. */
    toolCalls?: StreamToolCall[];
    /** Present on a `'tool_result'` message — which call it answers. */
    toolCallId?: string;
    /** Assistant text that preceded the tool call(s) this turn. */
    precedingText?: string;
    /*
     * No `[key: string]: unknown` here, deliberately.
     *
     * It reads like "extra fields are carried through", but an index signature on
     * the TARGET of an assignment is a requirement, not a permission: it made
     * core's `AparteChatMessage` un-assignable to this type ("Index signature for
     * type 'string' is missing"), which is what actually broke
     * `streamRunner: runStreamAgent`. Pass-through needs nothing — TypeScript only
     * excess-property-checks object literals, so a message with extra fields
     * assigns fine without it.
     */
}

/**
 * The request handed to the transport each turn (mirrors `AparteChatRequest`).
 *
 * The two fields the loop actually reads are DECLARED rather than reached through
 * an index signature. They used to be dynamic (`[key: string]: unknown`), which
 * read like "extra fields pass through" but is a requirement on the target of an
 * assignment, not a permission — it is what made core's `AparteChatRequest`
 * un-assignable here and broke `streamRunner: runStreamAgent`. Declaring them is
 * both the fix and the more honest description: these are the fields the loop
 * branches on. Anything else a host attaches still passes through untouched,
 * because TypeScript only excess-property-checks object literals.
 *
 * Types kept structural (not imported from core) so this package stays
 * zero-import at runtime; `stream-events.contract.ts` asserts they line up.
 */
export interface StreamChatRequest {
    messages: StreamAgentMessage[];
    /**
     * Required, because `transportCall` is contravariant: the runner hands this
     * request to a transport typed against core's `AparteChatRequest`, where
     * `modelId` is required. A mirror that omitted it made the whole runner
     * un-assignable — from the opposite direction to the `messages` mismatch.
     */
    modelId: string;
    /** Per-turn hints the loop branches on (pipeline phases, artifact modes, …). */
    _meta?: Record<string, unknown>;
    /** `'none'` makes the loop drop the tool inventory for that turn. */
    toolChoice?: 'auto' | 'none' | { name: string; input?: Record<string, unknown> };
    /** The inventory the loop sends, and clears when `toolChoice` is `'none'`. */
    tools?: StreamTool[];
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
    call: { id: string; name: string; input: Record<string, unknown> },
    signal: AbortSignal,
) => Promise<{ approved: boolean; payload?: unknown; instruction?: string }>;

// ─── The events runStreamAgent emits ─────────────────────────────────────────

/**
 * High-level, DOM-free events isomorphic to `_streamLoop`'s `targetElement.*`
 * call sequence. Emitted **synchronously and in order** (see {@link StreamRunEmitter})
 * so the adapter reproduces the exact streaming update order.
 *
 * Mapping to `_streamLoop` (aparte-client.ts) for the adapter:
 * - `run-start`       → updateMessage(status:'streaming') once at loop entry (the leading write before turn 1)
 * - `turn-start`      → reset the per-turn parser / thinking / streaming-segment state (no DOM); one per turn
 * - `text-delta`      → parser-driven addSegment/updateSegment, else typeName/updateLastMessage
 * - `text-flush`      → textParser.finalize() then addSegment/updateSegment the finalized segments;
 *                       one per turn, after the inner SSE loop ends (surfaced by the spike — a turn-boundary flush)
 * - `thinking-delta`  → addSegment('thinking') then updateSegment(content); first `text-delta` after
 *                       thinking collapses it (updateSegment collapsed:true)
 * - `tool-start`      → renderer lookup + per-tool-name CSS inject into document.head + addSegment
 * - `tool-awaiting-approval` → updateSegment('awaiting-approval') + dispatch `aparte-tool-approval-request`
 * - `tool-approved`   → updateSegment('pending')
 * - `tool-rejected`   → updateSegment('rejected', result)
 * - `tool-resolved`   → updateSegment('resolved', result)
 * - `tool-aborted`    → updateSegment('aborted') (no-handler path, timeout/abort path, or per-tool maxTurns path)
 * - `turn-limit-exceeded` scope:'global' → addSegment(error 'MAX_TURNS_EXCEEDED');
 *                         scope:'tool'   → updateSegment('aborted')
 * - `phase-advance`   → addSegment({type:'pipeline-waiting'}); the loop has already
 *                       pushed the phase's reply into history and bumped the phase index
 * - `run-aborted`     → dispatch `aparte-message-aborted` (from the inner-loop abort check or the outer turn-boundary abort check)
 * - `run-done`        → updateMessage(status:'completed') always + setUsage if usage
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
    // mirrors aparte-client.ts) and the XML state machine
    // (E2) both emit these; the adapter renders them identically.
    | { type: 'artifact-open'; id: string; mimeType: string; kind: string; title: string }
    | { type: 'artifact-chunk'; id: string; content: string }
    | { type: 'artifact-close'; id: string; content: string; inline: boolean }
    // One-shot artifact from the built-in `create_artifact` tool: full content
    // up-front (mirrors aparte-client.ts's create_artifact fast path) → a single addSegment + lifecycle(true),
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
    // next phase (mirrors aparte-client.ts). The loop has already pushed
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
