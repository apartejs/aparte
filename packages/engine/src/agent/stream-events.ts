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
 * SCOPE: text · thinking · tool_use (+ HITL approval) · done · error · synthetic
 * toolChoice bypass. Tagged blocks in the text are adapter-side (core's parser reads
 * the grammars registered on the config); the built-in `create_artifact` left with
 * the artifact (D7), and the raw / XML artifact modes and the multi-phase pipeline
 * were removed before it (audit 2026-08-28, D2).
 */

// Type-only, erased at build: the run's option types, which a tool's run hands on.
import type { StreamRunOptions } from './stream-run.js';

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
     * The shape guard that used to stand here normalized this exact field away
     * before comparing, so it had been written AROUND the defect: every shape it
     * checked matched, while the composition both packages exist for did not
     * compile. Removing the signature costs nothing — the five named fields are
     * what the loop transports, and a provider's extra timing fields still ride
     * along, since TypeScript only excess-property-checks object literals.
     */
}

/** Why the model stopped writing (mirrors `AparteFinishReason`). */
export type StreamFinishReason = 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other';

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

/** A source a reply draws on (mirrors core's `AparteSource`). */
export interface StreamSource {
    id: string;
    url?: string;
    title?: string;
    snippet?: string;
}

/**
 * Where a reply cites sources (mirrors core's `AparteCitation`): offsets into the text
 * the model call streamed, UTF-16, `end` exclusive.
 */
export interface StreamCitation {
    start?: number;
    end: number;
    sources: string[];
    marker?: boolean;
}

/**
 * A structured stream event from the transport (mirrors `AparteStreamEvent`). The
 * `tool_use` variant spreads {@link StreamToolCall} exactly like core's does.
 */
export type StreamChatEvent =
    | { type: 'text'; delta: string }
    | { type: 'thinking'; delta: string }
    | ({ type: 'tool_use' } & StreamToolCall)
    | { type: 'error'; message: string; code?: string }
    | { type: 'done'; usage?: StreamUsage; finishReason?: StreamFinishReason }
    | { type: 'sources'; sources: StreamSource[]; citations?: StreamCitation[] }
    /**
     * A named step of the agent's work begins or ends ("Reading the parser"): the loop
     * forwards it as the run event of the same name. Steps may nest and overlap; one is
     * identified by its name.
     */
    | { type: 'step-start'; name: string }
    | { type: 'step-end'; name: string };

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
export type StreamContentPart = StreamTextPart | StreamImagePart;

/**
 * A conversation message (mirrors `AparteChatMessage`).
 *
 * `role` used to be a bare `string`, justified by a comment saying the loop needed
 * to push the envelope roles of a tool turn "without importing core's union". But
 * core's union already contained them — so the reason had not been true for some
 * time, and the looseness cost something real: `transportCall`
 * is contravariant, so this message type must ALSO be assignable to core's, and a
 * `string` role is not assignable to a closed union. That was the last link in the
 * chain that stopped `streamRunner: runStreamAgent` from compiling.
 *
 * Mirrored structurally rather than imported, to keep this package zero-import at
 * runtime; core, which depends on this package, compiles the two against each other.
 */
export interface StreamAgentMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
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
    /**
     * Present on an `'assistant'` message — the whole turn's calls, grouped. What it
     * said before them is that message's own `content`, `''` when it said nothing.
     */
    toolCalls?: StreamToolCall[];
    /** Present on a `'tool'` message — which call it answers. */
    toolCallId?: string;
    /** Present on a `'tool'` message — the name of the tool that ran. */
    toolName?: string;
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
    /** Per-turn hints carried through for the host (`prefixSegments`, and whatever the consumer puts there); the loop reads none. */
    _meta?: Record<string, unknown>;
    /**
     * `'none'` makes the loop drop the tool inventory for that turn. An object forces
     * a tool, and forcing is a turn-1 instruction: the loop sends it on the first
     * transport call of the run and lifts it (to `'auto'`) for every turn after, so
     * the model can answer once the tool has.
     */
    toolChoice?: 'auto' | 'none' | { name: string; input?: Record<string, unknown> };
    /** The inventory the loop sends, and clears when `toolChoice` is `'none'`. */
    tools?: StreamTool[];
}

/**
 * A tool handler (mirrors the resolved `AparteToolHandler`).
 *
 * `run` is the run the call belongs to, for a tool that opens a sub-agent
 * ({@link StreamToolRun.startAgent}, or `runSubAgent`). The loop always passes it; a
 * handler written with two parameters never sees it and works as before.
 */
export type StreamToolHandler = (
    call: StreamToolCall,
    signal: AbortSignal,
    run?: StreamToolRun,
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
    /**
     * Known to the model, executed elsewhere — a browser tool behind a server loop.
     * The loop never looks up a handler for it: with `deferral` the call waits for its
     * result in `deferral.outcomes`; without it, the call is aborted like a missing
     * handler.
     */
    external?: boolean;
}

/**
 * Why a deferred call waits. `approval`: a person must decide. `external`: the tool
 * runs elsewhere and its result must come back. `queued`: nothing — it came after the
 * pause point in the same reply, and runs when the run resumes.
 */
export type StreamDeferredReason = 'approval' | 'external' | 'queued';

/** A call a suspended run left without an answer. */
export interface StreamDeferredCall {
    toolCallId: string;
    name: string;
    input: unknown;
    reason: StreamDeferredReason;
    /** The sub-agent whose call this is; absent for the run's own. */
    agentId?: string;
}

/**
 * Who refused a call, for the row: the model reads one sentence whoever it was from, the
 * person reading the transcript needs to know. `'earlier-refusal'` is a call the loop did
 * not run because another call of the same step had been refused.
 */
export type StreamRefusalOrigin = 'person' | 'policy' | 'earlier-refusal';

/**
 * Why a call was aborted: a Stop, its handler's timeout, no handler for it here, or a gate
 * with nobody to ask.
 */
export type StreamAbortCause = 'stopped' | 'timeout' | 'no-handler' | 'no-resolver';

/** The answer to a deferred call, handed to the run that resumes it. */
export type StreamDeferredOutcome =
    | { kind: 'decision'; approved: boolean; reason?: string; instruction?: string; by?: StreamRefusalOrigin; payload?: unknown }
    | { kind: 'result'; content: string; structuredContent?: unknown }
    | { kind: 'failed'; error: string };

/**
 * Defer instead of block — see `StreamRunOptions.deferral`. Data only, so a run it
 * answers can be days old and on another machine.
 */
export interface StreamDeferral {
    /**
     * Answers for calls a previous run left pending, by tool call id. They answer those
     * calls only: a call the model makes after the resume goes through its gate afresh,
     * even when it carries the same id.
     */
    outcomes?: Record<string, StreamDeferredOutcome>;
    /** Opaque to the loop, which never reads it: a remote runner carries its continuation ticket here. */
    token?: string;
}

/**
 * Resolves a human-in-the-loop approval (mirrors core's
 * `AparteToolApprovalResolver`). Injected so the loop stays headless.
 *
 * `call.agent` is the sub-agent whose call this is — its `agentId` and the `name` it was
 * started with — so the question can say who asks; absent for the run's own call. For a
 * sub-agent's sub-agent, it is the innermost one: the agent whose tool is asking.
 */
export type StreamApprovalResolver = (
    call: { id: string; name: string; input: Record<string, unknown>; agent?: { id: string; name?: string } },
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
    /** Who refused, when a `reason` alone would say it wrong; without it a reason is a policy's. */
    by?: StreamRefusalOrigin;
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
 * - `tool-failed`     → updateSegment('failed', error) — the handler threw; the run then ends on that error
 * - `tool-resolved`   → updateSegment('resolved', result)
 * - `tool-aborted`    → updateSegment('aborted') (no-handler path, timeout/abort path, or per-tool maxTurns path)
 * - `turn-limit-exceeded` scope:'global' → addSegment(error 'MAX_TURNS_EXCEEDED');
 *                         scope:'tool'   → updateSegment('aborted')
 * - `run-aborted`     → dispatch `aparte-message-aborted` (from the inner-loop abort check or the outer turn-boundary abort check)
 * - `run-done`        → updateMessage(status:'completed') always + setUsage if usage
 * - `run-suspended`   → (with `deferral`) the run ends with calls left pending; the
 *                        adapter marks them and completes the message — the TURN goes on
 *                        through the run that resumes them
 * - `agent-start` / `agent-end` → a sub-agent begins and ends; never part of the reply
 * - `step-start` / `step-end` → a named step of the work begins and ends; shown while it
 *                        lasts (the waiting indicator, a sub-agent's line), never stored
 *
 * `agentId`, on every event that is not run-level, names the sub-agent the event belongs
 * to: absent, it is the run's own. The four run-level events (`run-start`, `run-done`,
 * `run-aborted`, `run-suspended`) never carry one — a sub-agent never ends the run.
 */
export type StreamRunEvent =
    | { type: 'run-start' }
    | { type: 'turn-start'; agentId?: string }
    | { type: 'text-delta'; delta: string; agentId?: string }
    | { type: 'text-flush'; agentId?: string }
    /** Offsets into the text this model call streamed: the text since its `turn-start`. */
    | { type: 'sources'; sources: StreamSource[]; citations?: StreamCitation[]; agentId?: string }
    | { type: 'thinking-delta'; delta: string; agentId?: string }
    | { type: 'tool-start'; toolCallId: string; name: string; input: unknown; agentId?: string }
    | { type: 'tool-awaiting-approval'; toolCallId: string; name: string; input: unknown; agentId?: string }
    | { type: 'tool-approved'; toolCallId: string; agentId?: string }
    /**
     * `reason` is the sentence the model reads; `by` and `instruction` are for the row, which
     * speaks to a person in their own language (optional for a runner that emits its own).
     */
    | { type: 'tool-rejected'; toolCallId: string; reason: string; by?: StreamRefusalOrigin; instruction?: string; agentId?: string }
    /** The handler threw (not an abort): the row hears of the crash before the run ends on it. */
    | { type: 'tool-failed'; toolCallId: string; error: string; agentId?: string }
    | { type: 'tool-resolved'; toolCallId: string; result: string; structuredResult?: unknown; agentId?: string }
    /**
     * The call did not run to an answer. `cause` says why, for the row: `'no-handler'` and
     * `'no-resolver'` are the page's setup, not anything the person did. Absent on the calls
     * a run ended before reaching.
     */
    | { type: 'tool-aborted'; toolCallId: string; cause?: StreamAbortCause; agentId?: string }
    | { type: 'turn-limit-exceeded'; scope: 'global' | 'tool'; limit: number; toolCallId?: string; agentId?: string }
    /**
     * A sub-agent begins. `toolCallId` is the call that opened it, when one did;
     * `parentAgentId` the sub-agent that opened it, when it is not the run's own.
     */
    | { type: 'agent-start'; agentId: string; name?: string; description?: string; parentAgentId?: string; toolCallId?: string }
    /** A sub-agent ends, once: `result` is what it answered, `error` why it failed. */
    | { type: 'agent-end'; agentId: string; status: StreamAgentStatus; result?: string; error?: string; parentAgentId?: string }
    /**
     * A named step of the work begins ("Searching the repository"), announced by the model's
     * stream, a runner or a sub-agent; the loop only forwards it. Steps may nest and overlap
     * (AG-UI allows both): one is identified by its `name` within its owner, the run or the
     * sub-agent `agentId` names. Live only — nothing of it is stored or sent to the model.
     */
    | { type: 'step-start'; name: string; agentId?: string }
    /** The step of that name ends: the latest one open under that name, for that owner. */
    | { type: 'step-end'; name: string; agentId?: string }
    | { type: 'run-aborted' }
    /** `finishReason` is the last model call's: in a tool turn, the step that wrote the reply. */
    | { type: 'run-done'; usage?: StreamUsage; finishReason?: StreamFinishReason }
    /** Ends a run in place of `run-done` when calls are left for someone else to answer. */
    | { type: 'run-suspended'; pending: StreamDeferredCall[]; usage?: StreamUsage };

/**
 * Synchronous event sink. Synchronous by contract: the
 * loop must never yield between emitting an event and its ordered successor, or
 * the adapter's streaming updates would interleave out of order.
 */
export type StreamRunEmitter = (event: StreamRunEvent) => void;

// ─── Sub-agents ──────────────────────────────────────────────────────────────

/**
 * How a sub-agent ended. `waiting` is one paused for a decision (a runner that relays an
 * agent elsewhere reports it); `stopped` one cut short by a Stop or its call's timeout.
 */
export type StreamAgentStatus = 'done' | 'failed' | 'waiting' | 'stopped';

/**
 * The run a tool call belongs to, handed to its handler as the third argument. What a tool
 * needs to open a sub-agent: the means to announce one, and the parts of the run a nested
 * loop reuses.
 */
export interface StreamToolRun {
    /**
     * Whether a call can stop for a person's decision and wait for it. False when the run
     * can pause instead (it was given a `deferral`: a server loop) or has no
     * `approvalResolver`: a sub-agent's gated call then ends with the cause `no-resolver`.
     */
    readonly canAsk: boolean;
    /**
     * Whether a sub-agent can work in the background of this run (`startSubAgent`). False
     * when the run can pause (it was given a `deferral`: a server loop): it would end at the
     * pause without what the sub-agent answered, and the model would wait for nothing.
     */
    readonly canBackground: boolean;
    /**
     * Announce a sub-agent: emits `agent-start`, carrying this call's `toolCallId` unless
     * `detached` (one tool opening several sub-agents gives each its own line).
     *
     * `background` gives it a life of its own: its call can answer before it is back, it is
     * stopped by a Stop of the run rather than of the call, it names no call (a line of its own),
     * and the run waits for it before it ends — then tells the model how it ended. What
     * `startSubAgent` opens; only where `canBackground` says so.
     */
    startAgent(info: { name?: string; description?: string; detached?: boolean; background?: boolean }): StreamAgentHandle;
    readonly transportCall: StreamRunOptions['transportCall'];
    readonly toolLookup: StreamRunOptions['toolLookup'];
    readonly toolConfigLookup?: StreamRunOptions['toolConfigLookup'];
    readonly approvalResolver?: StreamApprovalResolver;
    readonly maxTurns: number;
    readonly toolTimeoutMs: number;
    /**
     * Whether the run's tool calls of one step run at the same time (its `parallelTools`). A
     * sub-agent's loop does as its run does. Absent means the default, `true`.
     */
    readonly parallelTools?: boolean;
    /** The run's own id generator, so the ids a nested loop mints never collide with it. */
    readonly idGen: (prefix: string) => string;
}

/**
 * A sub-agent opened by {@link StreamToolRun.startAgent}. Closed by `end`, and by a Stop
 * or a timeout of the call that opened it — then with `stopped`, before the call's own
 * `tool-aborted`. A handler that settles with it still open closes it too, before the call's
 * own `tool-failed` / `tool-resolved`: `failed` with the handler's message when it threw,
 * `stopped` otherwise. Once closed, it emits nothing more.
 *
 * One opened in the `background` outlives its call: it is closed by `end`, or with `stopped`
 * by the run — a Stop, the turn limit, a crash, or the tool time limit counted from its
 * start — and the run waits for it before it ends. One opened once the run is over is closed
 * from the start and emits nothing.
 */
export interface StreamAgentHandle {
    readonly agentId: string;
    /**
     * What its work answers to: its call's signal, or, for a sub-agent in the background, a
     * signal of its own, aborted when the run stops it. Aborted when it must stop.
     */
    readonly signal: AbortSignal;
    /**
     * Pass an event on as this sub-agent's: `agentId` is set on it, unless it already
     * carries one (a sub-agent of this one, whose `agent-start` / `agent-end` get this one
     * as `parentAgentId`). A run-level event is dropped: a sub-agent never ends the run.
     */
    emit(event: StreamRunEvent): void;
    /** Emit `agent-end`, once; later calls, and later events, are ignored. */
    end(status: StreamAgentStatus, detail?: { result?: string; error?: string }): void;
}
