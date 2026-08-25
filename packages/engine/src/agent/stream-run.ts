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
 * One phase of a multi-phase pipeline (mirrors the shape of `ApartePipelinePhase`,
 * the pipeline-phase type defined in core's `types/chat.ts`). Supplied via
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
    /** Resolves a tool's handler by name (mirrors `aparteGlobalConfig.getToolHandler`). */
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
     * Called for every turn the loop appends to the history — the grouped
     * `tool_call` envelope, each `tool_result` (resolved or rejected), and a
     * pipeline phase's reply — in order, and always before the transport call that
     * would carry it. Never called for the messages you passed in `baseRequest`.
     *
     * For hosts that own their own transcript. The loop re-sends its `messages`
     * array every turn, which suits stateless message APIs but not a **prefix
     * cache** (llama.cpp slots, vLLM), where turn N+1 must EXTEND turn N byte for
     * byte. Such a host builds its own request in {@link transportCall} — ignoring
     * `request.messages` — and mirrors these notifications into its append-only
     * log, instead of reimplementing the loop's tool bookkeeping. Synchronous and
     * ordered, like {@link emitter}.
     */
    onHistoryAppend?: (message: StreamAgentMessage) => void;
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
/** Warn once per event type for something this version does not map, then skip it. */
const warnedUnknownEvents = new Set<string>();
function warnUnknownStreamEvent(event: unknown): void {
    const type = String((event as { type?: unknown })?.type ?? 'undefined');
    if (warnedUnknownEvents.has(type)) return;
    warnedUnknownEvents.add(type);
    console.warn(
        `[runStreamAgent] Ignoring unrecognised stream event "${type}". The reply is`
        + ' unaffected; this usually means the provider or its SDK emits a part this'
        + ' version of aparté does not map yet.',
    );
}

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

    // Mutable history the loop enriches with tool_call/tool_result turns. Every
    // enrichment goes through `append`, so a caller owning its own transcript sees
    // the same turns in the same order (see `onHistoryAppend`).
    const messages: StreamAgentMessage[] = [...baseRequest.messages];
    const append = (message: StreamAgentMessage): void => {
        messages.push(message);
        opts.onHistoryAppend?.(message);
    };

    // Pipeline mode (mirrors _streamLoop): each phase is one turn with
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

        // ── Synthetic toolChoice bypass (mirrors _streamLoop) ──────
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
            // Narrowed to the declared shape rather than `input: unknown`: now that
            // `StreamChatRequest.toolChoice` mirrors core's type, the cast can be exact.
            const tc = toolChoice as { name: string; input: Record<string, unknown> };
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
            append({ role: 'tool_call', content: '', toolCalls: [{ id: syntheticId, name: tc.name, input: tc.input }] });
            append({ role: 'tool_result', content: outcome.content, toolCallId: syntheticId });
            baseRequest = { ...baseRequest, toolChoice: 'none', tools: undefined };
        }

        // ── Per-phase request build when pipeline is active ──────
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
        // A stop that lands before the first event surfaces here as a REJECTION,
        // not as an `error` event — the fetch is aborted while still in flight, so
        // it never reaches the stream the loop reads. Letting it propagate made a
        // deliberate stop indistinguishable from a transport failure for anyone
        // driving this loop directly. (Core's `_streamTurn` has the mirror of this
        // guard; the browser suite is what found the path, after the two
        // event-level guards were already closed.)
        let response: Awaited<ReturnType<typeof transportCall>>;
        try {
            response = await transportCall(request);
        } catch (err: unknown) {
            if (signal.aborted || (err as { name?: string } | undefined)?.name === 'AbortError') {
                // `break`, not `return`: the post-loop `run-done` below is documented
                // as running on EVERY exit path, and five of the six abort paths fall
                // through to it. Returning here skipped it, so a consumer wiring
                // `runStreamAgent` + `createStreamAdapter` directly never got the
                // `completed` status and the bubble stayed flagged streaming — which
                // is verbatim the defect the client-side guard was added to fix.
                emitter({ type: 'run-aborted' });
                continueLoop = false;
                break;
            }
            throw err;
        }

        // Non-streaming provider: the string IS the full assistant message. The
        // adapter writes it and completes (no done{usage}); spike scenarios
        // always stream, so we finish the run here.
        //
        // `text-flush` is not optional here. It is the adapter's ONLY caller of
        // `parser.finalize()`, and the parser deliberately withholds an ambiguous
        // tail — a lone backtick, a triple backtick, a `<`, or the safe window
        // inside an unterminated fence. Breaking out before the flush dropped all
        // of it, so a non-streaming reply ending on any of those characters lost
        // them and one consisting only of them rendered nothing at all. Core's
        // inline loop does `parse()` AND `finalize()` on its whole-response
        // branch; this is the twin.
        if (typeof response === 'string') {
            emitter({ type: 'text-delta', delta: response });
            emitter({ type: 'text-flush' });
            break;
        }

        // New turn: the adapter resets its per-turn parser / thinking / streaming
        // state here (mirrors `_streamLoop` creating a fresh AparteStreamParser +
        // sets each outer iteration). No DOM effect of its own.
        emitter({ type: 'turn-start' });

        // artifactRaw mode: the WHOLE turn's text streams into one artifact
        // segment (mirrors _streamLoop). Open it up-front, before the
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

        // ── inner (SSE) loop — manual iteration so we can abort around each read.
        // Checked on BOTH sides of the read, and the second check is the one that
        // matters: the loop spends nearly all of its time parked on `next()`, so an
        // abort arriving while parked — the user pressing Stop while watching text
        // stream — is invisible to a check that only runs before the await. It also
        // covers both shapes a provider takes on abort: an `error` event or a quiet
        // close. Without it the `error` branch below throws and the caller reports a
        // deliberate stop as a failure. Mirrors `_streamLoop`'s `bailOnAbort`.
        const iterator = response[Symbol.asyncIterator]();
        const bailOnAbort = async (): Promise<boolean> => {
            if (!signal.aborted) return false;
            await iterator.return?.(undefined);
            emitter({ type: 'run-aborted' });
            continueLoop = false;
            return true;
        };
        try {
            while (true) {
                if (await bailOnAbort()) break;

                const step = await iterator.next();
                if (await bailOnAbort()) break;
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
                        // never through the text parser (mirrors the raw-artifact path in _streamLoop).
                        rawContent += event.delta;
                        emitter({ type: 'artifact-chunk', id: rawSegId, content: rawContent });
                        continue;
                    }
                    if (xmlMachine) {
                        // artifactXml: run the delta through the state machine
                        // (mirrors the XML-artifact path in _streamLoop); it splits chat text from artifacts.
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

                // A DISCRIMINANT GUARD, not a comment.
                //
                // This used to be the bare comment `// event.type === 'tool_use'`, so
                // anything the chain above did not recognise fell in here and was
                // treated as a tool call: a `tool-start` / `tool-aborted` pair with an
                // undefined id and name, and — worse — the rest of the stream was
                // never processed, so the reply was truncated too.
                //
                // Core's inline loop had the opposite failure on the same input (it
                // threw and replaced the reply with an error bubble). Both now ignore
                // the event and carry on, which is what forward compatibility with a
                // provider SDK actually requires.
                if (event.type !== 'tool_use') {
                    warnUnknownStreamEvent(event);
                    continue;
                }
                toolCallsThisTurn.push({ id: event.id, name: event.name, input: event.input });

                // Built-in create_artifact: bypass the generic tool path entirely
                // (no tool-start, no approval, no handler) — build the artifact
                // one-shot and inject a success tool_result (mirrors the create_artifact fast-path in _streamLoop).
                if (event.name === 'create_artifact') {
                    const input = (event.input ?? {}) as { mimeType?: string; title?: string; content?: string };
                    const mimeType = input.mimeType ?? 'text/plain';
                    const kind = deriveArtifactKind(mimeType, 'text');
                    emitter({ type: 'artifact-ready', id: `artifact-${event.id}`, mimeType, kind, title: input.title ?? kind, content: input.content ?? '' });
                    append({ role: 'tool_call', content: '', toolCalls: [{ id: event.id, name: event.name, input: event.input }] });
                    append({ role: 'tool_result', content: 'Artifact created successfully.', toolCallId: event.id });
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
                    /*
                     * Nothing can ask, so nothing may answer.
                     *
                     * The default was `async () => ({ approved: false })`, which sent the
                     * loop into the refusal branch and appended "rejected by the user" —
                     * a host that forgot to wire a resolver had not refused anything, and
                     * the model was told a person had. A misconfiguration is an aborted
                     * call, not a decision.
                     */
                    if (!approvalResolver) {
                        emitter({ type: 'tool-aborted', toolCallId: event.id });
                        continueLoop = false;
                        break;
                    }
                    const decision = await approvalResolver(
                        { id: event.id, name: event.name, input: event.input as Record<string, unknown> },
                        signal,
                    );

                    /*
                     * A stop is not a refusal either. Core's built-in channel resolves
                     * `{ approved: false }` on abort, indistinguishable by value from an
                     * explicit Reject — so the signal is what tells them apart. No
                     * `tool_result`: an aborted call has nothing true to tell the model.
                     */
                    if (signal.aborted) {
                        emitter({ type: 'tool-aborted', toolCallId: event.id });
                        continueLoop = false;
                        break;
                    }

                    if (!decision.approved) {
                        /*
                         * The user's own words when they gave them, and the fixed sentence
                         * otherwise — byte-identical to core's twin, because this is the
                         * only thing the model gets to read about the refusal.
                         *
                         * This branch used to hardcode the generic sentence. The resolver
                         * type declared `instruction` and the whole loop never referenced
                         * it, so on the engine path — the recommended one — a user who
                         * refused and typed "use the staging bucket instead" had those
                         * words dropped before the model saw them. Handing the model a
                         * turn after a refusal exists SO THAT it reads the refusal; here
                         * there was nothing to read.
                         *
                         * The parity suite could not see it: its resolver returned
                         * `{ approved }` and never an instruction, so both loops agreed on
                         * a case neither exercised. It supplies one now.
                         */
                        const rejection = decision.instruction
                            ? `The user rejected this tool call and said: ${decision.instruction}`
                            : 'Tool execution was rejected by the user.';
                        emitter({ type: 'tool-rejected', toolCallId: event.id, reason: rejection });
                        pushToolCallEnvelope(messages, append, toolCallsThisTurn, precedingText);
                        append({ role: 'tool_result', content: rejection, toolCallId: event.id });
                        /*
                         * `break` WITHOUT `continueLoop = false`, and the asymmetry is the
                         * point. The remaining tool calls of this turn must not run — the
                         * model asked for several and refusing one cannot license the
                         * others — but the loop takes another turn, so the sentence just
                         * appended actually reaches the model. It never did: the turn
                         * ended here, and telling the assistant what you wanted instead
                         * meant retyping it as a new message it read out of order.
                         *
                         * Core's twin returns `'respond'` for exactly this, and the parity
                         * suite asserts the two agree.
                         */
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
                    // Same rule as the rejection / turn-limit / missing-handler
                    // exits above, which this branch was missing: a stopped turn
                    // must not go on running the tool calls that follow it.
                    emitter({ type: 'tool-aborted', toolCallId: event.id });
                    continueLoop = false;
                    break;
                } else {
                    emitter({ type: 'tool-resolved', toolCallId: event.id, result: outcome.content });
                    pushToolCallEnvelope(messages, append, toolCallsThisTurn, precedingText);
                    append({ role: 'tool_result', content: outcome.content, toolCallId: event.id });
                }
            }

            // artifactXml finalize comes FIRST, and the order is load-bearing.
            //
            // Its `scanning` branch hands back text the machine was holding — a
            // proper prefix of `<artifact` it could not yet classify. That text
            // travels as `chat-text` -> `text-delta`, and the adapter feeds every
            // `text-delta` into the parser. Emitted AFTER `text-flush` it reached a
            // parser that had already been finalized and never would be again, and
            // since every held value is a prefix of the open tag the parser
            // withholds all of them: the loss was total, not probabilistic.
            //
            // Core's twin sidesteps this by bypassing its parser entirely for held
            // text. This side cannot — the adapter owns the parser — so it flushes
            // in the right order instead.
            if (xmlMachine) emitXml(xmlMachine.finalize());

            // Turn boundary: finalize the parser (flush residual text). Mirrors
            // `_streamLoop`'s `textParser.finalize()` call — runs on normal
            // end AND abort-break, but NOT after a thrown `error` (which escapes
            // this try before reaching here, exactly like `_streamLoop`).
            emitter({ type: 'text-flush' });

            // artifactRaw close comes right after the parser flush, matching the
            // finalize-block order in _streamLoop (text-flush, then artifact-close).
            if (rawSegId) {
                const inline = rawContent.split('\n').length < 15;
                emitter({ type: 'artifact-close', id: rawSegId, content: rawContent, inline });
            }
            // (artifactXml finalize ran above, before the parser flush — its held
            // text has to reach the parser while the parser can still be flushed.)
        } finally {
            // Mirror `reader.releaseLock()` in the finally: settle the iterator.
            await iterator.return?.(undefined).catch(() => { /* best effort */ });
        }

        // No tool calls this turn → final answer, OR advance to the next pipeline
        // phase (mirrors _streamLoop).
        if (toolCallsThisTurn.length === 0) {
            if (pipeline && pipelineIndex < pipeline.length - 1) {
                // Feed this phase's reply into history as context for the next.
                if (precedingText.trim()) {
                    append({ role: 'assistant', content: precedingText.trim() });
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
 * separately). Mirrors `_streamLoop`'s `existingToolCallMsg` guard. Reads
 * `messages` for that guard and writes through `append`, so the duplicate
 * suppression also applies to the `onHistoryAppend` notification.
 */
function pushToolCallEnvelope(
    messages: StreamAgentMessage[],
    append: (message: StreamAgentMessage) => void,
    toolCallsThisTurn: StreamToolCall[],
    precedingText: string,
): void {
    const exists = messages.some(
        m => m.role === 'tool_call' && m.toolCalls?.some(tc => toolCallsThisTurn.some(t => t.id === tc.id)),
    );
    if (exists) return;
    append({
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

    /*
     * RACED, not just signalled.
     *
     * Aborting the controller is a request the handler is free to ignore, and the
     * default shape of a consumer tool ignores it —
     * `async () => ({ content: await fetch(...).then(r => r.text()) })` never reads
     * its signal. So the timeout fired, nothing rejected, and the loop waited
     * forever on an option whose JSDoc promises a timeout.
     *
     * The signal still fires first, because a handler that DOES honour it should
     * get the chance to clean up and reject on its own terms; the race is what
     * makes the promise true when it does not.
     */
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<{ status: 'aborted' }>((resolve) => {
        timeout = setTimeout(() => {
            controller.abort();
            resolve({ status: 'aborted' });
        }, toolTimeoutMs);
    });

    try {
        const result = await Promise.race([
            handler(call, controller.signal).then((r) => ({ status: 'resolved' as const, content: r.content })),
            timedOut,
        ]);
        return result;
    } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return { status: 'aborted' };
        throw err;
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onParentAbort);
    }
}
