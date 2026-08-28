/**
 * stream-events.ts — contract for the framework-free structured-stream agent loop.
 *
 * `runStreamAgent` ({@link ./stream-run}) is the cloud-structured sibling of
 * `runAgent` ({@link ./agent-loop}): where `runAgent` drives a text-only
 * provider (`chat → string`, tool calls re-parsed from text), `runStreamAgent`
 * consumes a **structured** `AsyncIterable<StreamChatEvent>` (text / thinking /
 * tool_use / done / error) — the stream core's inline loop used to read. That loop
 * is gone (audit 2026-08-28, D1): this is THE loop, and `AparteClient` runs it.
 *
 * DOM stays out of here. The loop emits high-level {@link StreamRunEvent}s in the
 * exact order the inline loop performed its `targetElement.*` calls; a thin adapter
 * (in `@aparte/core`, where the parser and renderers live) translates each event
 * into the imperative viewport surface. So this module — and {@link ./stream-run}
 * — import **nothing** from `@aparte/core`: the types below structurally mirror the
 * core types (`AparteStreamEvent`, `AparteUsage`, `AparteChatMessage`, `AparteToolCall`)
 * so the adapter passes the real objects through with zero runtime conversion.
 *
 * SCOPE: text · thinking · tool_use (+ HITL approval) · done · error · the built-in
 * create_artifact · synthetic toolChoice bypass. Code-fence promotion and `<artifact>`
 * tags in the text are adapter-side (they need the core parser); the raw / XML
 * artifact modes and the multi-phase pipeline were removed (audit 2026-08-28, D2).
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
     * Core's composition compiles against it.
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
 * core's composition compiles against it.
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
 * it, and `unknown[]` fails the second direction. Core compiles
 * `streamRunner: runStreamAgent`, so a part added on one side and not the other is
 * a typecheck error there rather than a silent divergence.
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
 * runtime; core, which depends on this package, compiles the two against each other.
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
 * zero-import at runtime; core's composition compiles the two against each other.
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
    /** Per-turn hints carried through for the adapter (`artifactHint`, `prefixSegments`); the loop reads none. */
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
) => Promise<{
    /** What the model reads. */
    content: string;
    /** The same result as a value, forwarded on `tool-resolved` as `structuredResult`; the model never sees it. */
    structuredContent?: unknown;
}>;

/** Per-tool loop configuration (mirrors the `AparteTool` subset the loop reads). */
export interface StreamToolConfig {
    maxTurns?: number;
    /**
     * Whether a call of this tool pauses for a decision. A boolean is the tool's own
     * declaration; a predicate decides PER CALL, from the arguments — the shape an
     * approval policy needs ("a write to this path asks, a read does not"), and one a
     * boolean could only approximate by gating every call and auto-approving most,
     * which paints `awaiting-approval` on rows nobody was ever going to be asked about.
     *
     * The predicate has three answers, because a policy has three: `false` runs the
     * call, `'ask'` (or `true`) puts it to someone — the loop announces the pause with
     * `tool-awaiting-approval` — and `'deny'` means the decision is already made: the
     * resolver is still consulted (it is the one channel that carries the refusal
     * sentence back), but nothing is announced, since nobody is being asked.
     */
    needsApproval?: boolean | ((call: { id: string; name: string; input: Record<string, unknown> }) => boolean | 'ask' | 'deny');
}

/**
 * Resolves a human-in-the-loop approval (mirrors core's
 * `AparteToolApprovalResolver`). Injected so the loop stays headless.
 */
export type StreamApprovalResolver = (
    call: { id: string; name: string; input: Record<string, unknown> },
    signal: AbortSignal,
) => Promise<{
    approved: boolean;
    payload?: unknown;
    /** What the user said to do instead, on a refusal — quoted to the model as theirs. */
    instruction?: string;
    /**
     * The refusal, verbatim, when nobody said anything — a policy that refused on its
     * own ("plan mode: read-only tools only"). The sentence the loop would otherwise
     * write attributes the refusal to the user, which would be a lie here.
     */
    reason?: string;
}>;

// ─── The events runStreamAgent emits ─────────────────────────────────────────

/**
 * High-level, DOM-free events isomorphic to the inline loop's `targetElement.*`
 * call sequence. Emitted **synchronously and in order** (see {@link StreamRunEmitter})
 * so the adapter reproduces the exact streaming update order.
 *
 * Mapping to the inline loop it replaced, for the adapter:
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
 * - `run-aborted`     → dispatch `aparte-message-aborted` (from the inner-loop abort check or the outer turn-boundary abort check)
 * - `run-done`        → updateMessage(status:'completed') always + setUsage if usage
 */
export type StreamRunEvent =
    | { type: 'run-start' }
    | { type: 'turn-start' }
    | { type: 'text-delta'; delta: string }
    | { type: 'text-flush' }
    | { type: 'thinking-delta'; delta: string }
    // One-shot artifact from the built-in `create_artifact` tool: full content
    // up-front → a single addSegment + lifecycle(true).
    | { type: 'artifact-ready'; id: string; mimeType: string; kind: string; title: string; content: string }
    | { type: 'tool-start'; toolCallId: string; name: string; input: unknown }
    | { type: 'tool-awaiting-approval'; toolCallId: string; name: string; input: unknown }
    | { type: 'tool-approved'; toolCallId: string }
    | { type: 'tool-rejected'; toolCallId: string; reason: string }
    | { type: 'tool-resolved'; toolCallId: string; result: string; structuredResult?: unknown }
    | { type: 'tool-aborted'; toolCallId: string }
    | { type: 'turn-limit-exceeded'; scope: 'global' | 'tool'; limit: number; toolCallId?: string }
    | { type: 'run-aborted' }
    | { type: 'run-done'; usage?: StreamUsage };

/**
 * Synchronous event sink — mirrors `AGUIEmitter`. Synchronous by contract: the
 * loop must never yield between emitting an event and its ordered successor, or
 * the adapter's streaming updates would interleave out of order.
 */
export type StreamRunEmitter = (event: StreamRunEvent) => void;
