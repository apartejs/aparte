/**
 * stream-run.ts — framework-free structured-stream agent loop.
 *
 * The headless extraction of `AparteClient._streamLoop`: a `while(tool_use)` loop
 * that consumes a structured `AsyncIterable<StreamChatEvent>` from a transport,
 * runs approved tools, feeds their results back into the history, and re-calls
 * the transport until the model stops asking for tools. It performs **no DOM
 * work** — it emits {@link StreamRunEvent}s (in `_streamLoop`'s exact order) that
 * an adapter in `@aparte/core` turns into `targetElement.*` calls.
 *
 * Parity target: `@aparte/core`'s `AparteClient._streamLoop`.
 * Scope: text · thinking · tool_use (+ HITL) · done · error · artifacts (raw /
 * XML / create_artifact) · multi-phase pipeline · synthetic toolChoice bypass.
 * Code-fence promotion stays adapter-side (it needs the core parser).
 */

import type {
    StreamRunEmitter,
    StreamChatEvent,
    StreamChatRequest,
    StreamAgentMessage,
    StreamToolCall,
    StreamToolHandler,
    StreamToolConfig,
    StreamApprovalResolver,
    StreamUsage,
} from './stream-events.js';
import { ArtifactXmlStateMachine, deriveArtifactKind, type XmlArtifactEvent } from './parsers/artifact-xml-state-machine.js';

/** Default per-tool-call handler timeout — mirrors `TOOL_HANDLER_TIMEOUT_MS`. */
const DEFAULT_TOOL_TIMEOUT_MS = 5 * 60 * 1000;
/** Default global turn cap — mirrors `AparteClientOptions.maxTurns ?? 10`. */
const DEFAULT_MAX_TURNS = 10;

/**
 * One phase of a multi-phase pipeline (mirrors `_streamLoop`'s local
 * `PipelinePhase`, aparte-client.ts :1026-1029). Supplied via
 * `baseRequest._meta.pipeline`; each phase runs as one turn with its own system
 * message, and an `'artifact'` phase streams the whole turn into a raw artifact.
 */
type PipelinePhase =
    | { mode: 'text'; system: string }
    | { mode: 'thinking'; system: string; label?: string }
    | { mode: 'artifact'; system: string; mimeType: string; kind: string };

export interface StreamRunOptions {
    /** Id of the assistant message being streamed (opaque; carried in events). */
    messageId: string;
    /** Turn-1 request; the loop clones its `messages` and enriches them per turn. */
    baseRequest: StreamChatRequest;
    /**
     * Calls the transport with the (possibly enriched) request. Returns the
     * structured stream, or a plain string for a non-streaming provider. Mirrors
     * `getTransport().chat(provider, request, auth, ctx)` with provider/auth/ctx
     * closed over by the adapter.
     */
    transportCall: (request: StreamChatRequest) => Promise<AsyncIterable<StreamChatEvent> | string>;
    /** Resolves a tool's handler by name (mirrors `AparteConfig.getToolHandler`). */
    toolLookup: (name: string) => StreamToolHandler | undefined;
    /** Resolves a tool's loop config by name (maxTurns / needsApproval). */
    toolConfigLookup?: (name: string) => StreamToolConfig | undefined;
    /** HITL approval resolver for `needsApproval` tools (default: never called). */
    approvalResolver?: StreamApprovalResolver;
    /** Synchronous, ordered event sink consumed by the adapter. */
    emitter: StreamRunEmitter;
    /** Single abort signal composing `_isAborted` + the stream controller. */
    signal: AbortSignal;
    /** Global turn cap. @default 10 */
    maxTurns?: number;
    /** Per-tool-call handler timeout in ms. @default 300000 */
    toolTimeoutMs?: number;
    /**
     * Generates artifact segment ids (`prefix` is e.g. `'artifact-raw'`). The
     * default is a deterministic per-run counter; the adapter injects a
     * crypto-based one to match `_streamLoop`'s `artifact-*-<uuid>`. (Tool ids
     * still flow from the stream; only artifacts need generated ids.)
     */
    idGen?: (prefix: string) => string;
}

/**
 * Run the structured-stream agent loop. Resolves the last turn's usage (the
 * `done{usage}` last-write-wins, mirroring `_streamLoop`'s return), or
 * `undefined`. Throws on a stream `error` event or a non-abort tool failure —
 * the caller (adapter) routes that to its lifecycle-error handler, exactly as
 * `_handleSend`/`_handleRetry`/`_handleEdit` catch `_streamLoop`.
 */
export async function runStreamAgent(opts: StreamRunOptions): Promise<StreamUsage | undefined> {
    const {
        transportCall,
        toolLookup,
        toolConfigLookup,
        approvalResolver,
        emitter,
        signal,
        maxTurns = DEFAULT_MAX_TURNS,
        toolTimeoutMs = DEFAULT_TOOL_TIMEOUT_MS,
    } = opts;

    // Reassignable: the synthetic-toolChoice bypass strips `toolChoice`/`tools`
    // from it after the forced turn-1 handler runs (mirrors `_streamLoop`'s
    // `baseRequest = { ...baseRequest, toolChoice: 'none', tools: undefined }`).
    let baseRequest = opts.baseRequest;

    let idSeq = 0;
    const idGen = opts.idGen ?? ((prefix: string) => `${prefix}-${idSeq++}`);

    // Mutable history the loop enriches with tool_call/tool_result turns.
    const messages: StreamAgentMessage[] = [...baseRequest.messages];

    // Pipeline mode (mirrors _streamLoop :1021-1032): each phase is one turn with
    // its own system message; phase N's reply is appended before phase N+1.
    const pipeline = (baseRequest['_meta'] as Record<string, unknown> | undefined)?.['pipeline'] as
        | PipelinePhase[]
        | undefined;
    let pipelineIndex = 0;

    let continueLoop = true;
    let turns = 0;
    let lastUsage: StreamUsage | undefined;

    // Leading write before turn 1: mark the message streaming.
    emitter({ type: 'run-start' });

    // ── outer (turn) loop — one iteration = one transport call ────────────────
    while (continueLoop) {
        // Abort at the top of a turn: no stream open yet, so no cancel needed.
        if (signal.aborted) {
            emitter({ type: 'run-aborted' });
            break;
        }

        turns++;
        if (turns > maxTurns) {
            emitter({ type: 'turn-limit-exceeded', scope: 'global', limit: maxTurns });
            break;
        }

        // ── Synthetic toolChoice bypass (mirrors _streamLoop :1062-1121) ──────
        // toolChoice = { name, input } (orchestrator-forced): skip the LLM for
        // turn 1, run the handler directly, inject its result as a tool_result,
        // then strip toolChoice/tools and fall through to the transport call in
        // the SAME turn so the model answers with the tool result already in
        // history. (The adapter's tool-start handler injects renderer CSS here
        // too — a benign, idempotent gain over _streamLoop's synthetic path,
        // which skipped it; reconciled in the parity test.)
        const toolChoice = baseRequest['toolChoice'];
        if (
            turns === 1 &&
            toolChoice &&
            typeof toolChoice === 'object' &&
            !Array.isArray(toolChoice) &&
            (toolChoice as { input?: unknown }).input !== undefined
        ) {
            const tc = toolChoice as { name: string; input: unknown };
            const syntheticId = idGen('synthetic-tool');
            emitter({ type: 'tool-start', toolCallId: syntheticId, name: tc.name, input: tc.input });

            const handler = toolLookup(tc.name);
            if (!handler) {
                emitter({ type: 'tool-aborted', toolCallId: syntheticId });
                continueLoop = false;
                continue;
            }

            const outcome = await invokeToolHandler(handler, { id: syntheticId, name: tc.name, input: tc.input }, signal, toolTimeoutMs);
            if (outcome.status === 'aborted') {
                emitter({ type: 'tool-aborted', toolCallId: syntheticId });
                continueLoop = false;
                continue;
            }
            emitter({ type: 'tool-resolved', toolCallId: syntheticId, result: outcome.content });
            messages.push({ role: 'tool_call', content: '', toolCalls: [{ id: syntheticId, name: tc.name, input: tc.input }] });
            messages.push({ role: 'tool_result', content: outcome.content, toolCallId: syntheticId });
            baseRequest = { ...baseRequest, toolChoice: 'none', tools: undefined };
        }

        // ── Per-phase request build when pipeline is active (:1123-1137) ──────
        // Prepend the current phase's system message and, for an 'artifact'
        // phase, inject the artifactRaw hint the streaming loop below reads.
        let phaseMessages = messages;
        let phaseMeta = baseRequest['_meta'] as Record<string, unknown> | undefined;
        if (pipeline && pipelineIndex < pipeline.length) {
            const phase = pipeline[pipelineIndex]!;
            phaseMessages = [{ role: 'system', content: phase.system }, ...messages];
            if (phase.mode === 'artifact') {
                phaseMeta = { ...phaseMeta, artifactRaw: { mimeType: phase.mimeType, kind: phase.kind } };
            } else {
                // Drop any stale artifactRaw / pipeline keys from a text phase.
                const rest = { ...(phaseMeta ?? {}) };
                delete rest['artifactRaw'];
                delete rest['pipeline'];
                phaseMeta = rest;
            }
        }

        const request: StreamChatRequest = { ...baseRequest, messages: phaseMessages, _meta: phaseMeta };
        const response = await transportCall(request);

        // Non-streaming provider: the string IS the full assistant message. The
        // adapter writes it and completes (no done{usage}); spike scenarios
        // always stream, so we finish the run here.
        if (typeof response === 'string') {
            emitter({ type: 'text-delta', delta: response });
            break;
        }

        // New turn: the adapter resets its per-turn parser / thinking / streaming
        // state here (mirrors `_streamLoop` creating a fresh AparteStreamParser +
        // sets each outer iteration). No DOM effect of its own.
        emitter({ type: 'turn-start' });

        // artifactRaw mode: the WHOLE turn's text streams into one artifact
        // segment (mirrors _streamLoop :1172-1185). Open it up-front, before the
        // first delta, exactly as _streamLoop does in its per-turn setup.
        const rawHint = (request['_meta'] as Record<string, unknown> | undefined)?.['artifactRaw'] as
            | { mimeType: string; kind: string }
            | undefined;
        let rawSegId: string | null = null;
        let rawContent = '';
        if (rawHint) {
            rawSegId = idGen('artifact-raw');
            emitter({ type: 'artifact-open', id: rawSegId, mimeType: rawHint.mimeType, kind: rawHint.kind, title: rawHint.kind });
        }

        // artifactXml mode (mutually exclusive with raw; raw wins, matching the
        // _streamLoop branch order). The E2 state machine parses inline
        // `<artifact>` tags; its micro-events map 1:1 to StreamRunEvents.
        const xmlHint = (request['_meta'] as Record<string, unknown> | undefined)?.['artifactXml'] as
            | { mimeType: string; kind: string }
            | undefined;
        const xmlMachine = (xmlHint && !rawHint)
            ? new ArtifactXmlStateMachine(xmlHint, () => idGen('artifact-xml'))
            : null;
        const emitXml = (events: XmlArtifactEvent[]): void => {
            for (const ev of events) {
                if (ev.type === 'chat-text') emitter({ type: 'text-delta', delta: ev.text, ...(ev.reduced ? { reduced: true } : {}) });
                else if (ev.type === 'artifact-open') emitter({ type: 'artifact-open', id: ev.id, mimeType: ev.mimeType, kind: ev.kind, title: ev.title });
                else if (ev.type === 'artifact-chunk') emitter({ type: 'artifact-chunk', id: ev.id, content: ev.content });
                else emitter({ type: 'artifact-close', id: ev.id, content: ev.content, inline: ev.inline });
            }
        };

        // Per-turn streaming state.
        let precedingText = '';
        const toolCallsThisTurn: StreamToolCall[] = [];

        // ── inner (SSE) loop — manual iteration so we can abort before each read
        const iterator = response[Symbol.asyncIterator]();
        try {
            while (true) {
                if (signal.aborted) {
                    await iterator.return?.(undefined);
                    emitter({ type: 'run-aborted' });
                    continueLoop = false;
                    break;
                }

                const step = await iterator.next();
                if (step.done) break;
                const event = step.value;

                if (event.type === 'thinking') {
                    emitter({ type: 'thinking-delta', delta: event.delta });
                    continue;
                }

                if (event.type === 'text') {
                    precedingText += event.delta;
                    if (rawSegId) {
                        // artifactRaw: route the whole delta into the artifact,
                        // never through the text parser (mirrors :1254-1265).
                        rawContent += event.delta;
                        emitter({ type: 'artifact-chunk', id: rawSegId, content: rawContent });
                        continue;
                    }
                    if (xmlMachine) {
                        // artifactXml: run the delta through the state machine
                        // (mirrors :1268-1392); it splits chat text from artifacts.
                        emitXml(xmlMachine.feed(event.delta));
                        continue;
                    }
                    emitter({ type: 'text-delta', delta: event.delta });
                    continue;
                }

                if (event.type === 'done') {
                    if (event.usage) lastUsage = event.usage;
                    continue;
                }

                if (event.type === 'error') {
                    // Mirror `_streamLoop`: throw; the caller's catch handles it.
                    throw new Error(event.message);
                }

                // event.type === 'tool_use'
                toolCallsThisTurn.push({ id: event.id, name: event.name, input: event.input });

                // Built-in create_artifact: bypass the generic tool path entirely
                // (no tool-start, no approval, no handler) — build the artifact
                // one-shot and inject a success tool_result (mirrors :1449-1487).
                if (event.name === 'create_artifact') {
                    const input = (event.input ?? {}) as { mimeType?: string; title?: string; content?: string };
                    const mimeType = input.mimeType ?? 'text/plain';
                    const kind = deriveArtifactKind(mimeType, 'text');
                    emitter({ type: 'artifact-ready', id: `artifact-${event.id}`, mimeType, kind, title: input.title ?? kind, content: input.content ?? '' });
                    messages.push({ role: 'tool_call', content: '', toolCalls: [{ id: event.id, name: event.name, input: event.input }] });
                    messages.push({ role: 'tool_result', content: 'Artifact created successfully.', toolCallId: event.id });
                    continue;
                }

                emitter({ type: 'tool-start', toolCallId: event.id, name: event.name, input: event.input });

                const cfg = toolConfigLookup?.(event.name);

                // Per-tool maxTurns (note: `>=`, stricter than the global `>`).
                const effectiveMaxTurns = cfg?.maxTurns ?? maxTurns;
                if (turns >= effectiveMaxTurns) {
                    emitter({ type: 'turn-limit-exceeded', scope: 'tool', limit: effectiveMaxTurns, toolCallId: event.id });
                    continueLoop = false;
                    break;
                }

                const handler = toolLookup(event.name);
                if (!handler) {
                    emitter({ type: 'tool-aborted', toolCallId: event.id });
                    continueLoop = false;
                    break;
                }

                let effectiveInput = event.input;

                // ── HITL approval gate ────────────────────────────────────────
                if (cfg?.needsApproval) {
                    emitter({ type: 'tool-awaiting-approval', toolCallId: event.id, name: event.name, input: event.input });
                    const resolve = approvalResolver ?? (async () => ({ approved: false }));
                    const decision = await resolve(event.id, signal);

                    if (!decision.approved) {
                        const rejection = 'Tool execution was rejected by the user.';
                        emitter({ type: 'tool-rejected', toolCallId: event.id, reason: rejection });
                        pushToolCallEnvelope(messages, toolCallsThisTurn, precedingText);
                        messages.push({ role: 'tool_result', content: rejection, toolCallId: event.id });
                        continueLoop = false;
                        break;
                    }
                    if (decision.payload && typeof decision.payload === 'object' && !Array.isArray(decision.payload)) {
                        effectiveInput = { ...(event.input as Record<string, unknown>), ...(decision.payload as Record<string, unknown>) };
                    }
                    emitter({ type: 'tool-approved', toolCallId: event.id });
                }

                // ── handler invocation with per-call timeout ──────────────────
                const outcome = await invokeToolHandler(
                    handler,
                    { id: event.id, name: event.name, input: effectiveInput },
                    signal,
                    toolTimeoutMs,
                );
                if (outcome.status === 'aborted') {
                    emitter({ type: 'tool-aborted', toolCallId: event.id });
                    continueLoop = false;
                } else {
                    emitter({ type: 'tool-resolved', toolCallId: event.id, result: outcome.content });
                    pushToolCallEnvelope(messages, toolCallsThisTurn, precedingText);
                    messages.push({ role: 'tool_result', content: outcome.content, toolCallId: event.id });
                }
            }

            // Turn boundary: finalize the parser (flush residual text). Mirrors
            // `_streamLoop`'s `textParser.finalize()` at :1639 — runs on normal
            // end AND abort-break, but NOT after a thrown `error` (which escapes
            // this try before reaching here, exactly like `_streamLoop`).
            emitter({ type: 'text-flush' });

            // artifactRaw close comes right after the parser flush, matching the
            // finalize-block order in _streamLoop (:1639 then :1642-1651).
            if (rawSegId) {
                const inline = rawContent.split('\n').length < 15;
                emitter({ type: 'artifact-close', id: rawSegId, content: rawContent, inline });
            }
            // artifactXml finalize flushes a truncated (unclosed) artifact —
            // after text-flush, mirroring the finalize-block order (:1658-1669).
            if (xmlMachine) emitXml(xmlMachine.finalize());
        } finally {
            // Mirror `reader.releaseLock()` in the finally: settle the iterator.
            await iterator.return?.(undefined).catch(() => { /* best effort */ });
        }

        // No tool calls this turn → final answer, OR advance to the next pipeline
        // phase (mirrors _streamLoop :1709-1726).
        if (toolCallsThisTurn.length === 0) {
            if (pipeline && pipelineIndex < pipeline.length - 1) {
                // Feed this phase's reply into history as context for the next.
                if (precedingText.trim()) {
                    messages.push({ role: 'assistant', content: precedingText.trim() });
                }
                pipelineIndex++;
                emitter({ type: 'phase-advance', index: pipelineIndex });
                // continueLoop stays true — the next iteration runs the new phase.
            } else {
                continueLoop = false;
            }
        }
    }

    // Post-loop finalization runs on every exit path (normal / abort / maxTurns).
    emitter({ type: 'run-done', usage: lastUsage });
    return lastUsage;
}

/**
 * Push the single grouped `tool_call` envelope for the turn — but only once,
 * even when the turn has several tool calls (each call's `tool_result` is pushed
 * separately). Mirrors `_streamLoop`'s `existingToolCallMsg` guard.
 */
function pushToolCallEnvelope(
    messages: StreamAgentMessage[],
    toolCallsThisTurn: StreamToolCall[],
    precedingText: string,
): void {
    const exists = messages.some(
        m => m.role === 'tool_call' && m.toolCalls?.some(tc => toolCallsThisTurn.some(t => t.id === tc.id)),
    );
    if (exists) return;
    messages.push({
        role: 'tool_call',
        content: '',
        toolCalls: toolCallsThisTurn,
        precedingText: precedingText.trim() || undefined,
    });
}

/**
 * Run a tool handler with a per-call timeout, linked to the run's abort signal.
 * Resolves `{ status: 'resolved', content }` on success, or `{ status: 'aborted' }`
 * if the handler aborts (timeout OR parent abort); any other error is re-thrown so
 * the caller routes it to lifecycle-error, exactly as `_streamLoop` does. Shared
 * by the generic tool path and the synthetic-toolChoice bypass (mirrors the
 * AbortController + `TOOL_HANDLER_TIMEOUT_MS` dance both use in `_streamLoop`).
 */
async function invokeToolHandler(
    handler: StreamToolHandler,
    call: StreamToolCall,
    signal: AbortSignal,
    toolTimeoutMs: number,
): Promise<{ status: 'resolved'; content: string } | { status: 'aborted' }> {
    // If the run was already aborted before we got here, don't invoke the
    // handler at all: a past 'abort' event will never re-fire on the listener
    // below, so the handler would otherwise run to completion despite cancel.
    if (signal.aborted) return { status: 'aborted' };

    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    signal.addEventListener('abort', onParentAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), toolTimeoutMs);
    try {
        const result = await handler(call, controller.signal);
        return { status: 'resolved', content: result.content };
    } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return { status: 'aborted' };
        throw err;
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onParentAbort);
    }
}
