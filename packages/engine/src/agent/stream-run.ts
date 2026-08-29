/**
 * stream-run.ts — framework-free structured-stream agent loop.
 *
 * The agent loop — extracted from core's inline `_streamLoop`, which it has since
 * replaced (audit 2026-08-28, D1): a `while(tool_use)` loop
 * that consumes a structured `AsyncIterable<StreamChatEvent>` from a transport,
 * runs approved tools, feeds their results back into the history, and re-calls
 * the transport until the model stops asking for tools. It performs **no DOM
 * work** — it emits {@link StreamRunEvent}s (in the inline loop's exact order) that
 * an adapter in `@aparte/core` turns into `targetElement.*` calls.
 *
 * Formerly the parity target of core's inline loop; now the one loop, its call
 * sequences pinned by core's `stream-parity` snapshots.
 * Scope: text · thinking · tool_use (+ HITL) · done · error · synthetic toolChoice
 * bypass. Tagged blocks in the text (`<artifact>`, `<cite>`…) are adapter-side: core's
 * parser reads the grammars registered on the config. The built-in `create_artifact`
 * left with the artifact (D7) — it is a registered tool now. The raw / XML artifact
 * modes and the multi-phase pipeline were removed (audit 2026-08-28, D2) — orchestration is the
 * product's, and a mode nothing in this repository emitted was a contract
 * maintained for nobody.
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

/** Default per-tool-call handler timeout — mirrors `TOOL_HANDLER_TIMEOUT_MS`. */
const DEFAULT_TOOL_TIMEOUT_MS = 5 * 60 * 1000;
/** Default global turn cap — mirrors `AparteClientOptions.maxTurns ?? 10`. */
const DEFAULT_MAX_TURNS = 10;

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
     *
     * One rule about the envelope: a turn's `tool_call` message is reported ONCE, when
     * its first call completes, and the calls that complete later in the same turn are
     * already in that same object's `toolCalls` — the array is shared by reference, not
     * copied. Hold the reference, not a snapshot, and every result you receive after it
     * is declared by it.
     */
    onHistoryAppend?: (message: StreamAgentMessage) => void;
    /**
     * Generates the ids the loop mints itself — today only the synthetic call of a
     * forced `toolChoice` (`prefix` is `'synthetic-tool'`). The default is a
     * deterministic per-run counter; core's client injects a crypto-based one. Tool
     * ids otherwise flow from the stream.
     */
    idGen?: (prefix: string) => string;
}

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

/**
 * Run the structured-stream agent loop. Resolves the last turn's usage (the
 * `done{usage}` last-write-wins, mirroring `_streamLoop`'s return), or
 * `undefined`. Throws on a stream `error` event or a non-abort tool failure —
 * the caller (adapter) routes that to its lifecycle-error handler, exactly as
 * `_handleSend`/`_handleRetry`/`_handleEdit` catch `_streamLoop`.
 *
 * This block has to stay ADJACENT to the function. It used to sit above
 * `warnUnknownStreamEvent`, six lines and a docblock away from what it describes, and a
 * docblock separated from its declaration is attached to nothing: TypeDoc took the
 * helper's comment as the neighbouring one and `@aparte/engine`'s reference page carried
 * the package's headline export with no description at all — the very export its own
 * frontmatter names. Same trap the custom-elements analyser has with a class docblock
 * pushed above an import.
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

    // Mutable history the loop enriches with tool_call/tool_result turns. Every
    // enrichment goes through `append`, so a caller owning its own transcript sees
    // the same turns in the same order (see `onHistoryAppend`).
    const messages: StreamAgentMessage[] = [...baseRequest.messages];
    const append = (message: StreamAgentMessage): void => {
        messages.push(message);
        opts.onHistoryAppend?.(message);
    };

    let continueLoop = true;
    let turns = 0;
    let lastUsage: StreamUsage | undefined;

    // Leading write before turn 1: mark the message streaming.
    emitter({ type: 'run-start' });

    // ── outer (turn) loop — one iteration = one transport call ────────────────
    while (continueLoop) {
        // Abort at the top of a turn: no stream open yet, so no cancel needed. The
        // `run-aborted` itself is emitted once, at the loop's exit (see below).
        if (signal.aborted) break;

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
            if (outcome.status === 'failed') {
                emitter({ type: 'tool-failed', toolCallId: syntheticId, error: errorText(outcome.error) });
                throw outcome.error;
            }
            emitter({ type: 'tool-resolved', toolCallId: syntheticId, result: outcome.content, structuredResult: outcome.structuredContent });
            append({ role: 'tool_call', content: '', toolCalls: [{ id: syntheticId, name: tc.name, input: tc.input }] });
            append({ role: 'tool_result', content: outcome.content, toolCallId: syntheticId });
            baseRequest = { ...baseRequest, toolChoice: 'none', tools: undefined };
        }

        // A stop that lands before the first event surfaces here as a REJECTION,
        // not as an `error` event — the fetch is aborted while still in flight, so
        // it never reaches the stream the loop reads. Letting it propagate made a
        // deliberate stop indistinguishable from a transport failure for anyone
        // driving this loop directly. (Core's `_streamTurn` has the mirror of this
        // guard; the browser suite is what found the path, after the two
        // event-level guards were already closed.)
        const request: StreamChatRequest = { ...baseRequest, messages };
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
                // (`run-aborted` is emitted once, at the loop's exit.)
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

        // Per-turn streaming state.
        let precedingText = '';
        const toolCallsThisTurn: StreamToolCall[] = [];
        // "Did this turn ask for tools" — a different question from "which calls are
        // declared" (`toolCallsThisTurn`, which now holds only committed ones).
        let sawToolUse = false;
        /**
         * The turn's ONE `tool_call` envelope, held by reference. Created — and
         * appended, so the host is notified once — the first time a call needs it;
         * every later call of the turn is already in the SAME `toolCalls` array, so a
         * `tool_result` appended afterwards is always declared by it.
         *
         * This replaces an id scan over `messages` that guessed whether the envelope
         * was already there. The `create_artifact` fast path pushed a fresh envelope
         * of its own; the scan then found the artifact's id in it, concluded "already
         * pushed", and the next tool's result went out with no call declaring it —
         * the P0 of the 2026-08-28 audit, a history an Anthropic-shaped API rejects
         * outright. A reference cannot be guessed wrong.
         */
        let envelope: StreamAgentMessage | null = null;
        /*
         * A call is DECLARED in the envelope only once it is committed to producing
         * a `tool_result` — at the three sites that append one right after. It used
         * to be pushed the moment the `tool_use` event was read, into the same array
         * the envelope holds by reference, so a call halted before its result (no
         * handler, turn limit, missing resolver, an abort during the wait) still
         * appeared in a history the host was told to hold by reference: a
         * `tool_call` declaring a call that never gets a result.
         */
        const declareCall = (call: StreamToolCall): void => {
            toolCallsThisTurn.push(call);
            if (envelope) return;
            envelope = { role: 'tool_call', content: '', toolCalls: toolCallsThisTurn, precedingText: precedingText.trim() || undefined };
            append(envelope);
        };

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
                sawToolUse = true;

                // No built-in tool of any name: `create_artifact` used to be dispatched
                // here, before the tool path, with no handler, no approval and its own
                // result. A tool is a tool — the app registers it (`@aparte/plugin-artifacts`
                // does), and it goes through tool-start, the gate, the handler and the
                // envelope like every other.
                emitter({ type: 'tool-start', toolCallId: event.id, name: event.name, input: event.input });

                const cfg = toolConfigLookup?.(event.name);

                // Per-tool maxTurns — the same arithmetic as the global cap (`>`), so one
                // number means one thing on both knobs. It was `>=`: `maxTurns: 1` on a
                // tool made it un-callable on the very first turn, and `maxTurns: N`
                // allowed N-1 calls against the global option's N.
                const effectiveMaxTurns = cfg?.maxTurns ?? maxTurns;
                if (turns > effectiveMaxTurns) {
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
                const gated = typeof cfg?.needsApproval === 'function'
                    ? cfg.needsApproval({ id: event.id, name: event.name, input: event.input as Record<string, unknown> })
                    : cfg?.needsApproval;
                if (gated) {
                    // Announced only when someone is actually being asked: a `'deny'` is a
                    // decision already made, and announcing a pause for it painted
                    // `awaiting-approval` on the row and raised `aparte-tool-approval-request`
                    // for a call nobody was ever going to be asked about.
                    if (gated !== 'deny') {
                        emitter({ type: 'tool-awaiting-approval', toolCallId: event.id, name: event.name, input: event.input });
                    }
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
                    /*
                     * A stop is not a refusal either. Core's built-in channel resolves
                     * `{ approved: false }` on abort, indistinguishable by value from an
                     * explicit Reject — so the signal is what tells them apart. No
                     * `tool_result`: an aborted call has nothing true to tell the model.
                     *
                     * Checked on three sides of the wait, because the stop can land on
                     * any of them: while the gate was being shown (a host that reacts to
                     * `awaiting-approval` synchronously — the panel's own Stop button),
                     * inside the resolver (a channel that rejects with an AbortError
                     * rather than resolving), or after it resolved. The first and second
                     * used to fall through to the run-level abort, which never marked the
                     * call: the segment stayed `awaiting-approval` for good.
                     */
                    let decision: Awaited<ReturnType<typeof approvalResolver>> | undefined;
                    if (!signal.aborted) {
                        try {
                            decision = await approvalResolver(
                                { id: event.id, name: event.name, input: event.input as Record<string, unknown> },
                                signal,
                            );
                        } catch (err) {
                            if (!signal.aborted && (err as { name?: string } | undefined)?.name !== 'AbortError') throw err;
                        }
                    }
                    if (signal.aborted || !decision) {
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
                        // Truthiness, like `instruction` beside it: an empty `reason` is no
                        // reason, not an empty tool_result.
                        const rejection = decision.reason?.trim()
                            || (decision.instruction
                                ? `The user rejected this tool call and said: ${decision.instruction}`
                                : 'Tool execution was rejected by the user.');
                        emitter({ type: 'tool-rejected', toolCallId: event.id, reason: rejection });
                        declareCall({ id: event.id, name: event.name, input: event.input });
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
                } else if (outcome.status === 'failed') {
                    // A crash is the handler's, and the run ends on it as before —
                    // but the row hears about it first, instead of spinning for good.
                    emitter({ type: 'tool-failed', toolCallId: event.id, error: errorText(outcome.error) });
                    throw outcome.error;
                } else {
                    emitter({ type: 'tool-resolved', toolCallId: event.id, result: outcome.content, structuredResult: outcome.structuredContent });
                    declareCall({ id: event.id, name: event.name, input: event.input });
                    append({ role: 'tool_result', content: outcome.content, toolCallId: event.id });
                }
            }

            // Turn boundary: finalize the parser (flush residual text). Mirrors
            // `_streamLoop`'s `textParser.finalize()` call — runs on normal
            // end AND abort-break, but NOT after a thrown `error` (which escapes
            // this try before reaching here, exactly like `_streamLoop`).
            emitter({ type: 'text-flush' });

        } finally {
            // Mirror `reader.releaseLock()` in the finally: settle the iterator.
            await iterator.return?.(undefined).catch(() => { /* best effort */ });
        }

        // No tool calls this turn → the final answer.
        if (!sawToolUse) continueLoop = false;
    }

    // Post-loop finalization runs on every exit path (normal / abort / maxTurns).
    //
    // `run-aborted` is decided HERE, once, from the signal — not at each site that
    // notices the abort. It used to be emitted at three of the six abort exits
    // (top of turn, transport rejection, mid-stream bail), and the three tool-level
    // ones — a Stop during a handler, during an approval wait, or with no resolver —
    // set `continueLoop = false` and fell through to `run-done` alone: no terminal
    // lifecycle event reached the host, so the typing indicator and the streaming
    // id were never cleared and the turn was never persisted. A tool TIMEOUT aborts
    // only the child controller, so `signal.aborted` stays false and that turn still
    // ends as done, unchanged.
    if (signal.aborted) emitter({ type: 'run-aborted' });
    emitter({ type: 'run-done', usage: lastUsage });
    return lastUsage;
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
): Promise<
    | { status: 'resolved'; content: string; structuredContent?: unknown }
    | { status: 'aborted' }
    /** The handler threw something that is not an abort: a crash, reported by the caller then re-thrown. */
    | { status: 'failed'; error: unknown }
> {
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
            handler(call, controller.signal).then((r) => ({ status: 'resolved' as const, content: r.content, structuredContent: r.structuredContent })),
            timedOut,
        ]);
        return result;
    } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError') return { status: 'aborted' };
        // Not thrown from here: the call was announced with `tool-start`, and the
        // loop's invariant is that an announced call gets exactly one terminal
        // event. Throwing from inside skipped it — the row spun "Running" for good
        // while the message showed an error card. The caller reports, then throws.
        return { status: 'failed', error: err };
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onParentAbort);
    }
}

/** The one-line text of a handler's crash, for the `tool-failed` event and the row. */
function errorText(error: unknown): string {
    if (error instanceof Error) return error.message || error.name;
    return typeof error === 'string' ? error : String(error);
}
