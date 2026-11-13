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
    StreamFinishReason,
    StreamDeferral,
    StreamDeferredCall,
    StreamDeferredReason,
    StreamRefusalOrigin,
    StreamAbortCause,
    StreamRunEvent,
    StreamToolRun,
    StreamAgentHandle,
    StreamAgentStatus,
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
     * Run the tool calls of one model step at the same time. Each call starts the moment
     * the model asks for it, and the rest of the model's reply goes on being read while it
     * runs; the next step waits until every call of this one is settled. `false` runs them
     * one after another, each finished before the next is read.
     *
     * What stays the same either way:
     * - **The history is in call order.** The assistant message lists the calls in the
     *   order the model made them, and their `tool` results follow in that order, whichever
     *   finished first.
     * - **A person is asked about one call at a time**, in call order. The calls that need
     *   nobody's approval run in the meantime.
     * - **A refusal runs nothing more of the step.** The calls already running finish; a
     *   call still waiting to be asked is not run, and its result says so
     *   (`by: 'earlier-refusal'`); the rest of the reply is not read. The model then reads
     *   the refusal.
     * - **A Stop, the turn limit, or a call that cannot run** (no handler, no resolver)
     *   stops every call of the step, as `tool-aborted` with the cause `'stopped'` for
     *   those still running, and the run ends.
     * - **With `deferral`**, a call that pauses does not stop the calls already running:
     *   the run is suspended once every call is settled or paused, and `run-suspended`
     *   lists every paused one. A call the model makes after the pause waits too.
     *
     * @default true
     */
    parallelTools?: boolean;
    /**
     * Called for every turn the loop appends to the history — the assistant message
     * carrying the turn's calls, each `tool` message answering one (resolved or
     * rejected), a pipeline phase's reply, and, when sub-agents started in the background
     * are back, what the model said while it waited (a plain assistant message, when it
     * said something) then the user message telling it how they ended — in order, and
     * always before the transport call that would carry it. Never called for the messages
     * you passed in `baseRequest`.
     *
     * For hosts that own their own transcript. The loop re-sends its `messages`
     * array every turn, which suits stateless message APIs but not a **prefix
     * cache** (llama.cpp slots, vLLM), where turn N+1 must EXTEND turn N byte for
     * byte. Such a host builds its own request in {@link transportCall} — ignoring
     * `request.messages` — and mirrors these notifications into its append-only
     * log, instead of reimplementing the loop's tool bookkeeping. Synchronous and
     * ordered, like {@link emitter}.
     *
     * Calls that run at the same time (see {@link parallelTools}) are reported in CALL
     * order: each once it and every call before it have completed.
     *
     * One rule about the envelope: a turn's assistant message is reported ONCE, when
     * its first call completes, and the calls that complete later in the same turn are
     * already in that same object's `toolCalls` — the array is shared by reference, not
     * copied. Hold the reference, not a snapshot, and every result you receive after it
     * is declared by it.
     *
     * Two of its fields are finalised after you are notified, then: `toolCalls` gains
     * the turn's later calls, and `content` is re-read at the turn's end (a provider
     * that emits `[tool, text]` streams the rest of the sentence after the envelope is
     * opened — see `syncEnvelopeText`). A host that must write BYTES at receipt — an
     * append-only log, which cannot hold a reference — should therefore treat the
     * envelope as provisional and write it only once the turn's last `tool` message
     * has arrived, or re-read the object it holds before serialising.
     *
     * `content` is the field that moved here, and the failure is louder than it was:
     * a snapshot no longer loses a trailing clause, it loses the whole sentence the
     * assistant said before it called anything.
     */
    onHistoryAppend?: (message: StreamAgentMessage) => void;
    /**
     * Generates the ids the loop mints itself — today only the synthetic call of a
     * forced `toolChoice` (`prefix` is `'synthetic-tool'`). The default is a
     * deterministic per-run counter; core's client injects a crypto-based one. Tool
     * ids otherwise flow from the stream.
     */
    idGen?: (prefix: string) => string;
    /**
     * Defer instead of block. With this set, a call the gate sends to a person is not
     * awaited on `approvalResolver`, and an `external` tool is not treated as missing:
     * each takes its answer from `outcomes`, and without one the call is DEFERRED —
     * declared on the turn's envelope with no `tool` answer. The rest of the model's
     * reply is still read to its end (its later calls pending too, nothing run after the
     * pause point), and the run ends on `run-suspended` instead of `run-done`.
     *
     * A run whose `baseRequest.messages` ends on an assistant envelope with unanswered
     * calls RESUMES: those calls go through the same `processCall` as a streamed one,
     * in order, before the first transport call. A call the gate denies is never
     * deferred — it is refused, through `approvalResolver`, as without this option.
     */
    deferral?: StreamDeferral;
    /**
     * The caller's provider id. Opaque to the loop, like `messageId`: a runner that
     * forwards the run elsewhere (a server) needs it.
     */
    providerId?: string;
    /**
     * The files the person attached to the message this run answers, as they were
     * picked. Opaque to the loop, like `providerId`: a runner that sends the turn
     * elsewhere and uploads files itself needs them (n8n's Chat Trigger takes them as
     * a form). A provider never sees them — it reads what the client inlined into
     * `baseRequest`, per its `rawFileInject` option. Set on a send only, never on a
     * retry or an edit, which do not carry files again.
     */
    files?: readonly File[];
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
        deferral,
        parallelTools = true,
    } = opts;

    // Reassignable: the synthetic-toolChoice bypass strips `toolChoice`/`tools`
    // from it after the forced turn-1 handler runs (mirrors `_streamLoop`'s
    // `baseRequest = { ...baseRequest, toolChoice: 'none', tools: undefined }`).
    let baseRequest = opts.baseRequest;

    let idSeq = 0;
    const idGen = opts.idGen ?? ((prefix: string) => `${prefix}-${idSeq++}`);

    // What every tool call of this run is handed as its `run` (see `createToolRun`). A run
    // that can pause, or has nobody to ask, cannot hold a sub-agent's question.
    // The sub-agents its tools start in the background: the run waits for them before it ends.
    const background = createBackground(emitter, idGen, signal, toolTimeoutMs);
    // One question at a time, in the order asked: the run's own calls take their turn in
    // `processCall`, and with calls running together, a sub-agent's ask takes one here too.
    const approvalTurn = createTurnstile();
    const runBase: ToolRunBase = {
        emitter, canAsk: !deferral && approvalResolver !== undefined, canBackground: !deferral,
        transportCall, toolLookup, toolConfigLookup,
        approvalResolver: parallelTools && approvalResolver ? inTurn(approvalTurn, approvalResolver) : approvalResolver,
        maxTurns, toolTimeoutMs, parallelTools, idGen,
        background,
    };

    // Mutable history the loop enriches with the assistant and `tool` turns of a tool round-trip. Every
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
    // The CURRENT model call's, reset at the top of every turn: a step that reports none
    // must not inherit the one before it ('tool-calls' from a tool turn would otherwise
    // stand as the reason the final answer ended).
    let lastFinishReason: StreamFinishReason | undefined;

    // Leading write before turn 1: mark the message streaming.
    emitter({ type: 'run-start' });

    try {
        return await runTurns();
    } finally {
        // A crash leaves by here too: nothing of a sub-agent may come after the run, and none
        // starts once it is over.
        background.close();
    }

    async function runTurns(): Promise<StreamUsage | undefined> {

    // ── Resume: answer what a previous run left pending, before asking the model ──
    // The envelope is already in `messages` (it came with the request), so a resumed
    // call is declared by it: nothing to declare again, and no `tool-start` either —
    // its row exists, from the run that paused.
    const tail = deferral ? unansweredTail(messages) : [];
    if (tail.length > 0) {
        const stillPending: StreamDeferredCall[] = [];
        const ctx: CallContext = { turns: 1, maxTurns, toolLookup, toolConfigLookup, approvalResolver, approvalTurn, emitter, signal, toolTimeoutMs, declareCall: () => {}, append, deferral, runBase };
        for (const [i, call] of tail.entries()) {
            if (stillPending.length > 0) {
                stillPending.push({ toolCallId: call.id, name: call.name, input: call.input, reason: queuedReason(call, toolConfigLookup) });
                continue;
            }
            let verdict: CallVerdict;
            try {
                verdict = await processCall(call, ctx);
            } catch (error) {
                // A crash ends the run like a `stop-run` below, and the calls after it
                // have rows too: each is told, then the run fails on the crash.
                for (const rest of tail.slice(i + 1)) emitter({ type: 'tool-aborted', toolCallId: rest.id });
                throw error;
            }
            if (typeof verdict === 'object') {
                stillPending.push({ toolCallId: call.id, name: call.name, input: call.input, reason: verdict.defer });
                continue;
            }
            // Unlike a streamed turn, a refusal does not skip the calls after it: each of
            // them is declared by the envelope, and a call left without a `tool` answer
            // makes the provider reject the next request. Each has its own outcome.
            if (verdict === 'stop-run') {
                // Unlike a streamed turn too, the calls after it have rows already, from
                // the run that paused: each is told it will not run, not left waiting.
                for (const rest of tail.slice(i + 1)) emitter({ type: 'tool-aborted', toolCallId: rest.id });
                continueLoop = false;
                break;
            }
        }
        if (stillPending.length > 0 && !signal.aborted) {
            // A paused run holds nothing: what works in the background stops first.
            background.stopAll();
            emitter({ type: 'run-suspended', pending: stillPending });
            return undefined;
        }
    }

    // ── outer (turn) loop — one iteration = one transport call ────────────────
    while (continueLoop) {
        // Abort at the top of a turn: no stream open yet, so no cancel needed. The
        // `run-aborted` itself is emitted once, at the loop's exit (see below).
        if (signal.aborted) break;

        turns++;
        lastFinishReason = undefined;
        if (turns > maxTurns) {
            emitter({ type: 'turn-limit-exceeded', scope: 'global', limit: maxTurns });
            break;
        }

        // ── Synthetic toolChoice bypass (mirrors _streamLoop) ──────
        // toolChoice = { name, input } (orchestrator-forced): skip the LLM for
        // turn 1, run the handler directly, inject its result as a `tool` message,
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
                emitter({ type: 'tool-aborted', toolCallId: syntheticId, cause: 'no-handler' });
                continueLoop = false;
                continue;
            }

            const outcome = await invokeToolHandler(handler, { id: syntheticId, name: tc.name, input: tc.input }, signal, toolTimeoutMs, runBase);
            if (outcome.status === 'aborted') {
                emitter(outcome.cause ? { type: 'tool-aborted', toolCallId: syntheticId, cause: outcome.cause } : { type: 'tool-aborted', toolCallId: syntheticId });
                continueLoop = false;
                continue;
            }
            if (outcome.status === 'failed') {
                emitter({ type: 'tool-failed', toolCallId: syntheticId, error: errorText(outcome.error) });
                throw outcome.error;
            }
            emitter({ type: 'tool-resolved', toolCallId: syntheticId, result: outcome.content, structuredResult: outcome.structuredContent });
            append({ role: 'assistant', content: '', toolCalls: [{ id: syntheticId, name: tc.name, input: tc.input }] });
            append({ role: 'tool', content: outcome.content, toolCallId: syntheticId, toolName: tc.name });
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
        /*
         * Forcing a tool is a TURN-1 instruction, and only the loop can lift it: the
         * request is rebuilt from `baseRequest` every turn, so a `toolChoice` object
         * left there was re-sent after the tool had already answered — the model was
         * made to call it again, every turn, until `maxTurns`, and the run ended on
         * `turn-limit-exceeded` instead of a reply. Every object shape, not only the
         * `{ name, input }` the synthetic bypass above strips for itself: `{ name }`
         * alone is what a consumer sets, and it never enters that branch.
         */
        const forced = baseRequest['toolChoice'];
        if (forced && typeof forced === 'object') baseRequest = { ...baseRequest, toolChoice: 'auto' };
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
            // A model call of its own, as the streamed one below: nothing of the call before
            // it (its parser, the sources it cited) carries over.
            emitter({ type: 'turn-start' });
            emitter({ type: 'text-delta', delta: response });
            emitter({ type: 'text-flush' });
            if (await reportBackground(response)) continue;
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
         * The turn's ONE assistant envelope, held by reference. Created — and
         * appended, so the host is notified once — the first time a call needs it;
         * every later call of the turn is already in the SAME `toolCalls` array, so a
         * `tool` message appended afterwards is always declared by it.
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
         * a `tool` message — at the three sites that append one right after. It used
         * to be pushed the moment the `tool_use` event was read, into the same array
         * the envelope holds by reference, so a call halted before its result (no
         * handler, turn limit, missing resolver, an abort during the wait) still
         * appeared in a history the host was told to hold by reference: an
         * assistant message declaring a call that never gets a result.
         */
        const declareCall = (call: StreamToolCall): void => {
            toolCallsThisTurn.push(call);
            if (envelope) return;
            envelope = { role: 'assistant', content: precedingText.trim(), toolCalls: toolCallsThisTurn };
            append(envelope);
        };
        /*
         * The envelope's text is a SNAPSHOT taken when the first call is declared, and
         * a turn can go on streaming afterwards — a provider that emits `[tool, text]`
         * in that order (`@aparte/provider-scenario` does; openai-compat flushes its
         * calls at the end of the stream and so cannot) had the sentence shown to the
         * user and dropped from the history, where nothing else carries it. Re-read at
         * the turn's end, through the closure: the envelope is held by reference for
         * exactly this reason, the way `toolCalls` is.
         */
        const syncEnvelopeText = (): void => {
            if (envelope) envelope.content = precedingText.trim();
        };
        /*
         * A call id must be unique WITHIN the turn: the transcript keys a row on it
         * (`tool-${id}`, and `updateSegment` takes the first match) and the history
         * files a `tool` message under it. A vendor that omits `id` used to give every
         * call of a turn the same one, so the second call's result was written onto the
         * first call's row and the pair could not be matched at all on the next turn.
         * A repeat is renamed rather than refused — the model asked for both.
         */
        const idsThisTurn = new Set<string>();
        const uniqueCallId = (raw: string): string => {
            let id = raw;
            for (let n = 2; idsThisTurn.has(id); n++) id = `${raw}#${n}`;
            idsThisTurn.add(id);
            return id;
        };

        // ── inner (SSE) loop — manual iteration so we can abort around each read.
        // Checked on BOTH sides of the read, and the second check is the one that
        // matters: the loop spends nearly all of its time parked on `next()`, so an
        // abort arriving while parked — the user pressing Stop while watching text
        // stream — is invisible to a check that only runs before the await. It also
        // covers both shapes a provider takes on abort: an `error` event or a quiet
        // close. Without it the `error` branch below throws and the caller reports a
        // deliberate stop as a failure. Mirrors `_streamLoop`'s `bailOnAbort`.
        // The calls this turn leaves for someone else to answer (see `deferral`).
        const pending: StreamDeferredCall[] = [];
        // Without the resume's answers: they were given for the calls a previous run left
        // pending, never for a new call that carries the same id — and a vendor that sends
        // no ids has them minted per stream, so the next turn reuses them.
        const callContext: CallContext = {
            turns, maxTurns, toolLookup, toolConfigLookup, approvalResolver, approvalTurn, emitter, signal, toolTimeoutMs, declareCall, append,
            deferral: deferral && { ...deferral, outcomes: undefined },
            runBase,
        };
        // The step's calls, when they run together (see `parallelTools`): each starts as it is
        // read, and the reading goes on.
        const step = parallelTools ? createParallelStep(callContext) : undefined;
        // A read the step's halt left waiting: the iterator is closed without waiting for it.
        let outstandingRead = false;

        const iterator = response[Symbol.asyncIterator]();
        const bailOnAbort = async (): Promise<boolean> => {
            if (!signal.aborted) return false;
            // Guarded like the `finally` below: a transport whose iterator throws on
            // the way out turned a deliberate Stop into a thrown run error, and core
            // paints an error card over the reply the user had just stopped. `try`,
            // not `.catch()`: a hand-written iterator throws BEFORE there is a promise
            // to reject, and one that returns a plain object has no `.catch` at all.
            try { await iterator.return?.(undefined); } catch { /* best effort */ }
            continueLoop = false;
            return true;
        };
        try {
            while (true) {
                if (await bailOnAbort()) break;
                // A call of the step stopped it (a refusal, a stop, a crash): nothing more
                // of the reply is read, as when the calls run one after another.
                if (step?.halted()) break;

                const read = iterator.next();
                let next: IteratorResult<StreamChatEvent>;
                if (step?.busy()) {
                    // Raced: a call still running can stop the step while the reading waits
                    // on the provider.
                    const first = await Promise.race([read, step.onHalt.then((): typeof HALTED => HALTED)]);
                    if (first === HALTED) {
                        outstandingRead = true;
                        Promise.resolve(read).catch(() => { /* nobody reads it any more */ });
                        break;
                    }
                    next = first;
                } else {
                    next = await read;
                }
                if (await bailOnAbort()) break;
                if (step?.halted()) break;
                if (next.done) break;
                const event = next.value;

                if (event.type === 'thinking') {
                    emitter({ type: 'thinking-delta', delta: event.delta });
                    continue;
                }

                if (event.type === 'text') {
                    precedingText += event.delta;
                    emitter({ type: 'text-delta', delta: event.delta });
                    continue;
                }

                if (event.type === 'sources') {
                    // Offsets are the provider's, into this call's text — the adapter's
                    // turn, since `turn-start` opens one per call. Passed on as they are.
                    emitter({ type: 'sources', sources: event.sources, ...(event.citations ? { citations: event.citations } : {}) });
                    continue;
                }

                if (event.type === 'step-start' || event.type === 'step-end') {
                    // Not the loop's to read: passed on for whoever shows the run.
                    emitter({ type: event.type, name: event.name });
                    continue;
                }

                if (event.type === 'done') {
                    if (event.usage) lastUsage = event.usage;
                    if (event.finishReason) lastFinishReason = event.finishReason;
                    continue;
                }

                if (event.type === 'error') {
                    // Mirror `_streamLoop`: throw; the caller's catch handles it. The code the
                    // provider named rides on the error, so the caller can act on it — an
                    // overflowing prompt is compacted and resent — without reading the prose.
                    throw event.code === undefined
                        ? new Error(event.message)
                        : Object.assign(new Error(event.message), { code: event.code });
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
                // From here the CALL's id, not the event's: see `uniqueCallId`. The
                // row, the handler, the approval and the history slot must all name
                // the same call, so the rename happens once, before the first emit.
                const callId = uniqueCallId(event.id);

                // No built-in tool of any name: `create_artifact` used to be dispatched
                // here, before the tool path, with no handler, no approval and its own
                // result. A tool is a tool — the app registers it (`@aparte/plugin-artifacts`
                // does), and it goes through tool-start, the gate, the handler and the
                // envelope like every other.
                emitter({ type: 'tool-start', toolCallId: callId, name: event.name, input: event.input });

                const call: StreamToolCall = { id: callId, name: event.name, input: event.input };
                if (step) {
                    step.start(call);
                    continue;
                }
                if (pending.length > 0) {
                    // Past the pause point nothing runs. The call is declared, and says what
                    // it waits for, so the client answers every call of the reply in ONE
                    // round trip rather than one per call.
                    declareCall(call);
                    const reason = queuedReason(call, toolConfigLookup);
                    if (reason === 'approval') {
                        emitter({ type: 'tool-awaiting-approval', toolCallId: call.id, name: call.name, input: call.input });
                    }
                    pending.push({ toolCallId: call.id, name: call.name, input: call.input, reason });
                    continue;
                }
                const verdict = await processCall(call, callContext);
                if (typeof verdict === 'object') {
                    declareCall(call);
                    pending.push({ toolCallId: call.id, name: call.name, input: call.input, reason: verdict.defer });
                    continue;
                }
                if (verdict === 'stop-run') { continueLoop = false; break; }
                // A refusal ends this turn's calls but not the run: see `processCall`.
                if (verdict === 'stop-turn') break;
            }

            // The step is over once every call of it is: its results enter the history in
            // call order, and what its calls decided is what the turn does next. Before the
            // flush below, so a step's events end before its text is finalised, as they do
            // when the calls run one after another.
            if (step) {
                const settled = await step.finish();
                if (settled.failure) throw settled.failure.error;
                pending.push(...settled.pending);
                if (settled.stopRun) continueLoop = false;
            }

            // Turn boundary: finalize the parser (flush residual text). Mirrors
            // `_streamLoop`'s `textParser.finalize()` call — runs on normal
            // end AND abort-break, but NOT after a thrown `error` (which escapes
            // this try before reaching here, exactly like `_streamLoop`).
            emitter({ type: 'text-flush' });
            // Everything this turn streamed belongs to the turn, including what came
            // after the call that opened the envelope.
            syncEnvelopeText();

        } finally {
            // Mirror `reader.releaseLock()` in the finally: settle the iterator,
            // however it fails on the way out (see `bailOnAbort`). Not awaited while a read
            // is still waiting on the provider: an async generator queues `return` behind it.
            try {
                const closing = iterator.return?.(undefined);
                if (outstandingRead) Promise.resolve(closing).catch(() => { /* best effort */ });
                else await closing;
            } catch { /* best effort */ }
            // A crash leaves by here too (a provider `error` while calls run): they are
            // stopped, and each says so, before the run fails.
            if (step) await step.abandon();
        }

        // Calls left pending: the run ends here, without `run-done` — the turn goes on
        // through the run that resumes them. (A Stop takes the abort exit instead.)
        if (pending.length > 0 && !signal.aborted) {
            background.stopAll();
            emitter({ type: 'run-suspended', pending, usage: lastUsage });
            return lastUsage;
        }

        // No tool calls this turn → the final answer, unless sub-agents are still at work in
        // the background: then it is what the model says while it waits, and it is asked again
        // once they are back.
        if (!sawToolUse && !(await reportBackground(precedingText))) continueLoop = false;
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
    // A turn limit, or a Stop: what still works in the background ends before the run does.
    background.stopAll();
    if (signal.aborted) emitter({ type: 'run-aborted' });
    emitter({ type: 'run-done', usage: lastUsage, ...(lastFinishReason ? { finishReason: lastFinishReason } : {}) });
    return lastUsage;
    }

    /**
     * The model has said its last word for now. When sub-agents it started in the background
     * are still at work, or are back and the model does not know it yet: wait for them, put
     * what it just said and what they answered in its history, and say so (`true`): the loop
     * asks it again. `false` when there is nothing to tell it, or the run was stopped.
     */
    async function reportBackground(said: string): Promise<boolean> {
        if (signal.aborted || !background.pending()) return false;
        // The model could not be asked again: they are stopped, and the run ends on the limit
        // rather than leave a question in its history nobody answers.
        if (turns >= maxTurns) {
            background.stopAll();
            emitter({ type: 'turn-limit-exceeded', scope: 'global', limit: maxTurns });
            return false;
        }
        await background.settled();
        if (signal.aborted) return false;
        const report = background.report();
        if (!report) return false;
        const text = said.trim();
        if (text) append({ role: 'assistant', content: text });
        append({ role: 'user', content: report });
        return true;
    }
}

/**
 * Run a tool handler with a per-call timeout, linked to the run's abort signal.
 * Resolves `{ status: 'resolved', content }` on success, or `{ status: 'aborted' }`
 * if the handler aborts (timeout OR parent abort); any other error is re-thrown so
 * the caller routes it to lifecycle-error, exactly as `_streamLoop` does. Shared
 * by the generic tool path and the synthetic-toolChoice bypass (mirrors the
 * AbortController + `TOOL_HANDLER_TIMEOUT_MS` dance both use in `_streamLoop`).
 */
/**
 * The calls a history leaves unanswered: those of its LAST assistant envelope that no
 * following `tool` message answers, in declaration order. A resumed run answers them
 * first; a server checks them against the ticket it signed when the run paused.
 */
export function unansweredTail(messages: readonly StreamAgentMessage[]): StreamToolCall[] {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]!;
        if (m.role === 'assistant') {
            if (!m.toolCalls?.length) return [];
            const answered = new Set(messages.slice(i + 1).filter((x) => x.role === 'tool').map((x) => x.toolCallId));
            return m.toolCalls.filter((c) => !answered.has(c.id));
        }
        if (m.role !== 'tool') return [];
    }
    return [];
}

/** Why a call after the pause point waits: what the client must answer, or nothing. */
function queuedReason(call: StreamToolCall, lookup: StreamRunOptions['toolConfigLookup']): StreamDeferredReason {
    const cfg = lookup?.(call.name);
    if (cfg?.external) return 'external';
    const gated = typeof cfg?.needsApproval === 'function'
        ? cfg.needsApproval({ id: call.id, name: call.name, input: call.input as Record<string, unknown> })
        : cfg?.needsApproval;
    return gated && gated !== 'deny' ? 'approval' : 'queued';
}

/** What the caller does after a call: next event, end this turn's stream, end the run. */
type CallVerdict = 'continue' | 'stop-turn' | 'stop-run' | { defer: 'approval' | 'external' };

interface CallContext {
    turns: number;
    maxTurns: number;
    toolLookup: StreamRunOptions['toolLookup'];
    toolConfigLookup: StreamRunOptions['toolConfigLookup'];
    approvalResolver: StreamRunOptions['approvalResolver'];
    /** The run's one question at a time: taken before a person is asked, given back once they answered. */
    approvalTurn: Turnstile;
    emitter: StreamRunEmitter;
    signal: AbortSignal;
    toolTimeoutMs: number;
    /** Declares the call on the turn's envelope. */
    declareCall: (call: StreamToolCall) => void;
    append: (message: StreamAgentMessage) => void;
    deferral: StreamDeferral | undefined;
    runBase: ToolRunBase;
    /**
     * Told the call's verdict the moment it is reached, before `processCall`'s promise
     * settles: a parallel step must know at once that a call paused or stopped the step, so
     * that the next `tool_use` it reads is treated as it would be one call after another.
     * Not told `'continue'`.
     */
    decided?: (verdict: Exclude<CallVerdict, 'continue'>) => void;
    /** Whether a call of the same step was refused while this one waited to be asked. */
    stepRefused?: () => boolean;
}

/** Hands a verdict back, telling the step first (see {@link CallContext.decided}). */
function told<V extends Exclude<CallVerdict, 'continue'>>(ctx: CallContext, verdict: V): V {
    ctx.decided?.(verdict);
    return verdict;
}

/**
 * What a refusal says, and to whom. `reason` is the sentence the model reads: the refuser's
 * own when it gave one, else the person's words quoted, else the fixed sentence. `by` and
 * `instruction` are for the row, which tells a person who refused in their own language —
 * a reason with no origin is a policy's, as {@link StreamApprovalResolver} defines it.
 *
 * Exported so a runner that answers an agent elsewhere writes the same sentence.
 */
export function toolRefusal(decision: { reason?: string; instruction?: string; by?: StreamRefusalOrigin }): {
    reason: string;
    by: StreamRefusalOrigin;
    instruction?: string;
} {
    // Truthiness, like `instruction` beside it: an empty `reason` is no reason, not an
    // empty `tool` message.
    const reason = decision.reason?.trim();
    const by = decision.by ?? (reason ? 'policy' : 'person');
    // Without a reason of its own, the sentence follows the origin: a policy's refusal
    // never tells the model "the user rejected this".
    const sentence = reason
        || (by === 'policy' ? 'Tool execution was refused by the approval policy.'
            : by === 'earlier-refusal' ? 'Not run: an earlier call of the same step was refused.'
            : decision.instruction
                ? `The user rejected this tool call and said: ${decision.instruction}`
                : 'Tool execution was rejected by the user.');
    return decision.instruction ? { reason: sentence, by, instruction: decision.instruction } : { reason: sentence, by };
}

/**
 * A refused call: the row says so and the model reads why (see {@link toolRefusal}).
 * Answers `'stop-turn'`: the turn's other calls must not run, but the loop takes another
 * turn so the model reads it.
 */
function refuse(
    ctx: CallContext,
    call: StreamToolCall,
    decision: { reason?: string; instruction?: string; by?: StreamRefusalOrigin },
): 'stop-turn' {
    const refusal = toolRefusal(decision);
    ctx.emitter({ type: 'tool-rejected', toolCallId: call.id, ...refusal });
    ctx.declareCall(call);
    ctx.append({ role: 'tool', content: refusal.reason, toolCallId: call.id, toolName: call.name });
    return told(ctx, 'stop-turn');
}

/**
 * One call, from its gate to its `tool` message: the ONLY place the loop decides what a
 * call does. The stream reader calls it for each `tool_use` as it arrives; one function,
 * so no second path can drift from it the way core's two loops did before D1.
 */
async function processCall(call: StreamToolCall, ctx: CallContext): Promise<CallVerdict> {
    const { signal } = ctx;
    const input = call.input as Record<string, unknown>;
    const cfg = ctx.toolConfigLookup?.(call.name);

    // The answer a resumed run was handed for this call, if any.
    const answer = ctx.deferral?.outcomes?.[call.id];
    // A refusal it carries settles the call, whatever the call is: the person's decision on a
    // gated one, and on any other the page refusing an earlier call of the same pause, which
    // ends the calls after it there as in a run in the page. Refusing runs nothing, so a
    // missing handler or a spent turn limit has nothing to stop — checked before them, the
    // refusal still reaches the model, and the model still takes its turn.
    if (answer?.kind === 'decision' && !answer.approved) return refuse(ctx, call, answer);

    // Per-tool maxTurns — the same arithmetic as the global cap (`>`), so one
    // number means one thing on both knobs. It was `>=`: `maxTurns: 1` on a
    // tool made it un-callable on the very first turn, and `maxTurns: N`
    // allowed N-1 calls against the global option's N.
    const effectiveMaxTurns = cfg?.maxTurns ?? ctx.maxTurns;
    if (ctx.turns > effectiveMaxTurns) {
        ctx.emitter({ type: 'turn-limit-exceeded', scope: 'tool', limit: effectiveMaxTurns, toolCallId: call.id });
        return told(ctx, 'stop-run');
    }

    // Known to the model, run elsewhere: its result comes back in the answer, and
    // until it does the call waits. Before the handler lookup, because there is no
    // handler here by definition — without `deferral` it is aborted like a missing one.
    // The page gates a browser tool as it would in its own loop (its `needsApproval`,
    // its policy), so an approval is no result yet, and a refusal was answered above.
    if (cfg?.external) {
        if (!ctx.deferral) {
            ctx.emitter({ type: 'tool-aborted', toolCallId: call.id, cause: 'no-handler' });
            return told(ctx, 'stop-run');
        }
        if (!answer || answer.kind === 'decision') return told(ctx, { defer: 'external' });
        if (answer.kind === 'failed') {
            // Like a crashing handler: the row hears it, then the run ends on it.
            ctx.emitter({ type: 'tool-failed', toolCallId: call.id, error: answer.error });
            throw new Error(answer.error);
        }
        ctx.emitter({ type: 'tool-resolved', toolCallId: call.id, result: answer.content, structuredResult: answer.structuredContent });
        ctx.declareCall(call);
        ctx.append({ role: 'tool', content: answer.content, toolCallId: call.id, toolName: call.name });
        return 'continue';
    }

    const handler = ctx.toolLookup(call.name);
    if (!handler) {
        ctx.emitter({ type: 'tool-aborted', toolCallId: call.id, cause: 'no-handler' });
        return told(ctx, 'stop-run');
    }

    let effectiveInput = call.input;

    // ── HITL approval gate ────────────────────────────────────────
    const gated = typeof cfg?.needsApproval === 'function'
        ? cfg.needsApproval({ id: call.id, name: call.name, input })
        : cfg?.needsApproval;
    if (gated) {
        // A decision a resumed run was handed answers the gate: nobody is asked again.
        // Never a `'deny'`: that one is decided here, and an answer that came back with
        // the resume — the page's, for a call queued behind a pause — cannot overrule it.
        const provided = answer?.kind === 'decision' && gated !== 'deny' ? answer : undefined;
        /*
         * One question at a time, in call order. The turn is taken BEFORE the call is
         * announced, so a second call of the step shows no question while the first is still
         * open; the calls that need nobody run meanwhile. Free, it is handed over at once, so
         * a call that waits for nobody announces in the same tick as before.
         */
        let release: (() => void) | undefined;
        if (!provided && ctx.approvalResolver && !(ctx.deferral && gated !== 'deny')) {
            const turn = ctx.approvalTurn();
            if (typeof turn === 'function') {
                release = turn;
            } else {
                release = await turn;
                // It waited behind an earlier call's question: what happened meanwhile decides.
                if (signal.aborted) {
                    release();
                    ctx.emitter({ type: 'tool-aborted', toolCallId: call.id, cause: 'stopped' });
                    return told(ctx, 'stop-run');
                }
                if (ctx.stepRefused?.()) {
                    release();
                    return refuse(ctx, call, { by: 'earlier-refusal' });
                }
            }
        }
        // Announced only when someone is actually being asked: a `'deny'` is a
        // decision already made, and announcing a pause for it painted
        // `awaiting-approval` on the row and raised `aparte-tool-approval-request`
        // for a call nobody was ever going to be asked about.
        if (gated !== 'deny' && !provided) {
            ctx.emitter({ type: 'tool-awaiting-approval', toolCallId: call.id, name: call.name, input: call.input });
        }
        // Nobody here can be asked (the run is not in the page): the call waits for a
        // decision a later run will carry. A `'deny'` is never deferred — it is
        // already decided, and refused below as without `deferral`.
        if (!provided && ctx.deferral && gated !== 'deny') return told(ctx, { defer: 'approval' });
        /*
         * Nothing can ask, so nothing may answer.
         *
         * The default was `async () => ({ approved: false })`, which sent the
         * loop into the refusal branch and appended "rejected by the user" —
         * a host that forgot to wire a resolver had not refused anything, and
         * the model was told a person had. A misconfiguration is an aborted
         * call, not a decision.
         */
        if (!provided && !ctx.approvalResolver) {
            ctx.emitter({ type: 'tool-aborted', toolCallId: call.id, cause: 'no-resolver' });
            return told(ctx, 'stop-run');
        }
        /*
         * A stop is not a refusal either. Core's built-in channel resolves
         * `{ approved: false }` on abort, indistinguishable by value from an
         * explicit Reject — so the signal is what tells them apart. No
         * `tool` message: an aborted call has nothing true to tell the model.
         *
         * Checked on three sides of the wait, because the stop can land on
         * any of them: while the gate was being shown (a host that reacts to
         * `awaiting-approval` synchronously — the panel's own Stop button),
         * inside the resolver (a channel that rejects with an AbortError
         * rather than resolving), or after it resolved. The first and second
         * used to fall through to the run-level abort, which never marked the
         * call: the segment stayed `awaiting-approval` for good.
         */
        let decision: Awaited<ReturnType<StreamApprovalResolver>> | undefined = provided;
        try {
            if (!decision && !signal.aborted && ctx.approvalResolver) {
                try {
                    decision = await ctx.approvalResolver(
                        { id: call.id, name: call.name, input },
                        signal,
                    );
                } catch (err) {
                    if (!signal.aborted && (err as { name?: string } | undefined)?.name !== 'AbortError') throw err;
                }
            }
        } finally {
            // Answered (or stopped): the next call of the step may be asked.
            release?.();
        }
        if (signal.aborted || !decision) {
            // No decision without an abort is a resolver that threw an AbortError: a stop too.
            ctx.emitter({ type: 'tool-aborted', toolCallId: call.id, cause: 'stopped' });
            return told(ctx, 'stop-run');
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
            refuse(ctx, call, decision);
            /*
             * `'stop-turn'`, not `'stop-run'`, and the asymmetry is the point.
             * The remaining tool calls of this turn must not run — the
             * model asked for several and refusing one cannot license the
             * others — but the loop takes another turn, so the sentence just
             * appended actually reaches the model. It never did: the turn
             * ended here, and telling the assistant what you wanted instead
             * meant retyping it as a new message it read out of order.
             *
             * Core's twin returns `'respond'` for exactly this, and the parity
             * suite asserts the two agree.
             */
            return 'stop-turn';
        }
        if (decision.payload && typeof decision.payload === 'object' && !Array.isArray(decision.payload)) {
            effectiveInput = { ...input, ...(decision.payload as Record<string, unknown>) };
        }
        ctx.emitter({ type: 'tool-approved', toolCallId: call.id });
    }

    // ── handler invocation with per-call timeout ──────────────────
    const outcome = await invokeToolHandler(
        handler,
        { id: call.id, name: call.name, input: effectiveInput },
        signal,
        ctx.toolTimeoutMs,
        ctx.runBase,
    );
    if (outcome.status === 'aborted') {
        // Same rule as the rejection / turn-limit / missing-handler
        // exits above, which this branch was missing: a stopped turn
        // must not go on running the tool calls that follow it.
        ctx.emitter(outcome.cause ? { type: 'tool-aborted', toolCallId: call.id, cause: outcome.cause } : { type: 'tool-aborted', toolCallId: call.id });
        return told(ctx, 'stop-run');
    } else if (outcome.status === 'failed') {
        // A crash is the handler's, and the run ends on it as before —
        // but the row hears about it first, instead of spinning for good.
        ctx.emitter({ type: 'tool-failed', toolCallId: call.id, error: errorText(outcome.error) });
        throw outcome.error;
    } else {
        ctx.emitter({ type: 'tool-resolved', toolCallId: call.id, result: outcome.content, structuredResult: outcome.structuredContent });
        ctx.declareCall(call);
        ctx.append({ role: 'tool', content: outcome.content, toolCallId: call.id, toolName: call.name });
    }
    return 'continue';
}

/** What a raced read resolves to when the step stopped first. */
const HALTED: unique symbol = Symbol('halted');

/** One call of a parallel step, and what it leaves for the history until its turn to enter it. */
interface StepCall {
    call: StreamToolCall;
    declared: boolean;
    messages: StreamAgentMessage[];
    pending?: StreamDeferredCall;
    settled: boolean;
}

/**
 * The calls of one model step, run at the same time (see `StreamRunOptions.parallelTools`).
 *
 * Each call goes through the same `processCall` as one call after another, with three
 * differences. Its history is held back, and enters the turn's in CALL order: a call's
 * declaration and `tool` message once it and every call before it are settled, so the
 * history equals the sequential one whatever finished first. Its signal is the step's, so a
 * call that stops the run (a Stop, the turn limit, no handler, a crash) stops the others
 * still running. And its verdict is known the moment it is reached (`decided`), so a call
 * read after a pause or a stop is treated as it would be one after another.
 */
function createParallelStep(turn: CallContext) {
    const controller = new AbortController();
    const forwardStop = (): void => controller.abort();
    if (turn.signal.aborted) controller.abort();
    else turn.signal.addEventListener('abort', forwardStop, { once: true });

    const calls: StepCall[] = [];
    const running: Promise<void>[] = [];
    let flushed = 0;
    let paused = false;
    let refused = false;
    let stopRun = false;
    let failure: { error: unknown } | undefined;
    let wake!: () => void;
    const onHalt = new Promise<void>((resolve) => { wake = resolve; });

    // The longest settled prefix enters the history.
    const flush = (): void => {
        while (flushed < calls.length && calls[flushed]!.settled) {
            const entry = calls[flushed++]!;
            if (entry.declared) turn.declareCall(entry.call);
            for (const message of entry.messages) turn.append(message);
        }
    };
    const stopAll = (): void => {
        stopRun = true;
        controller.abort();
        wake();
    };
    const settledAll = async (): Promise<void> => {
        await Promise.all(running);
        turn.signal.removeEventListener('abort', forwardStop);
        flush();
    };

    return {
        /** Resolves once a call stopped the step: the reply is read no further. */
        onHalt,
        halted: (): boolean => refused || stopRun,
        /** Whether a call is still running: only then can the step stop while the reply is read. */
        busy: (): boolean => flushed < calls.length,
        start(call: StreamToolCall): void {
            const entry: StepCall = { call, declared: false, messages: [], settled: false };
            calls.push(entry);
            if (paused) {
                // Past the pause point nothing runs, as one call after another: the call is
                // declared, and says what it waits for.
                const reason = queuedReason(call, turn.toolConfigLookup);
                if (reason === 'approval') {
                    turn.emitter({ type: 'tool-awaiting-approval', toolCallId: call.id, name: call.name, input: call.input });
                }
                entry.declared = true;
                entry.pending = { toolCallId: call.id, name: call.name, input: call.input, reason };
                entry.settled = true;
                flush();
                return;
            }
            const ctx: CallContext = {
                ...turn,
                signal: controller.signal,
                declareCall: () => { entry.declared = true; },
                append: (message) => { entry.messages.push(message); },
                decided: (verdict) => {
                    if (typeof verdict === 'object') paused = true;
                    else if (verdict === 'stop-run') stopAll();
                    else { refused = true; wake(); }
                },
                stepRefused: () => refused,
            };
            running.push(processCall(call, ctx).then(
                (verdict) => {
                    if (typeof verdict !== 'object') return;
                    entry.declared = true;
                    entry.pending = { toolCallId: call.id, name: call.name, input: call.input, reason: verdict.defer };
                },
                // A crash: the first one fails the run, once the others are stopped.
                (error: unknown) => {
                    failure ??= { error };
                    stopAll();
                },
            ).finally(() => {
                entry.settled = true;
                flush();
            }));
        },
        /** Waits for every call, and says what the step decided. */
        async finish(): Promise<{ failure?: { error: unknown }; stopRun: boolean; pending: StreamDeferredCall[] }> {
            await settledAll();
            return {
                ...(failure ? { failure } : {}),
                stopRun,
                pending: calls.flatMap((entry) => (entry.pending ? [entry.pending] : [])),
            };
        },
        /** The turn failed on its own: the calls still running are stopped, and waited for. */
        async abandon(): Promise<void> {
            controller.abort();
            await settledAll();
        },
    };
}

/** Hands out one turn at a time, in the order asked; a free turn is handed over at once. */
type Turnstile = () => (() => void) | Promise<() => void>;

function createTurnstile(): Turnstile {
    const waiting: Array<() => void> = [];
    let held = false;
    // Handed straight to the next in line, so nobody arriving in between can jump the queue.
    const handOver = (): void => {
        const next = waiting.shift();
        if (next) next();
        else held = false;
    };
    const releaser = (): (() => void) => {
        let released = false;
        return () => {
            if (released) return;
            released = true;
            handOver();
        };
    };
    return () => {
        if (!held) {
            held = true;
            return releaser();
        }
        return new Promise((resolve) => { waiting.push(() => resolve(releaser())); });
    };
}

/** A resolver that waits its turn: a sub-agent's question, asked through its run's. */
function inTurn(turnstile: Turnstile, resolver: StreamApprovalResolver): StreamApprovalResolver {
    return async (call, signal) => {
        const turn = turnstile();
        const release = typeof turn === 'function' ? turn : await turn;
        try {
            return await resolver(call, signal);
        } finally {
            release();
        }
    };
}

async function invokeToolHandler(
    handler: StreamToolHandler,
    call: StreamToolCall,
    signal: AbortSignal,
    toolTimeoutMs: number,
    runBase: ToolRunBase,
): Promise<
    | { status: 'resolved'; content: string; structuredContent?: unknown }
    /** `cause` is absent for a handler that aborted itself, with no Stop and no timeout. */
    | { status: 'aborted'; cause?: Extract<StreamAbortCause, 'stopped' | 'timeout'> }
    /** The handler threw something that is not an abort: a crash, reported by the caller then re-thrown. */
    | { status: 'failed'; error: unknown }
> {
    // If the run was already aborted before we got here, don't invoke the
    // handler at all: a past 'abort' event will never re-fire on the listener
    // below, so the handler would otherwise run to completion despite cancel.
    if (signal.aborted) return { status: 'aborted', cause: 'stopped' };

    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    signal.addEventListener('abort', onParentAbort, { once: true });

    /*
     * The parent abort is RACED for the same reason the timeout is.
     *
     * `onParentAbort` above only forwards the Stop to the child controller, and a
     * deaf handler ignores that exactly as it ignores the timeout's. So a Stop
     * pressed during a tool call unwound nothing: the loop stayed parked on the
     * handler until `toolTimeoutMs` expired — five minutes by default — with the
     * typing indicator still up and the stop button already pressed. The signal is
     * still fired first, so a handler that honours it gets to reject on its own
     * terms; this racer is what makes the Stop true when it does not.
     */
    let onParentAbortRace: (() => void) | undefined;
    const parentAborted = new Promise<{ status: 'aborted'; cause: 'stopped' }>((resolve) => {
        onParentAbortRace = () => resolve({ status: 'aborted', cause: 'stopped' });
        signal.addEventListener('abort', onParentAbortRace, { once: true });
    });

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
    let expired = false;
    const timedOut = new Promise<{ status: 'aborted'; cause: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => {
            expired = true;
            controller.abort();
            resolve({ status: 'aborted', cause: 'timeout' });
        }, toolTimeoutMs);
    });

    // The call's own signal, not the run's: a sub-agent the handler opens ends with the
    // call, on a Stop and on this timeout alike.
    const { run, closeOpen } = createToolRun(runBase, call.id, controller.signal);
    // What the handler threw, when it crashed: the sub-agents it left open end `failed` with it.
    let crash: { error: unknown } | undefined;

    try {
        const result = await Promise.race([
            handler(call, controller.signal, run).then((r) => ({ status: 'resolved' as const, content: r.content, structuredContent: r.structuredContent })),
            timedOut,
            parentAborted,
        ]);
        return result;
    } catch (err: unknown) {
        // A handler that honoured the signal rejects with its own AbortError: whichever
        // fired it is the cause.
        if ((err as { name?: string })?.name === 'AbortError') {
            if (signal.aborted) return { status: 'aborted', cause: 'stopped' };
            if (expired) return { status: 'aborted', cause: 'timeout' };
            // Its own abort — nobody pressed Stop and it did not run out of time.
            return { status: 'aborted' };
        }
        // Not thrown from here: the call was announced with `tool-start`, and the
        // loop's invariant is that an announced call gets exactly one terminal
        // event. Throwing from inside skipped it — the row spun "Running" for good
        // while the message showed an error card. The caller reports, then throws.
        crash = { error: err };
        return { status: 'failed', error: err };
    } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onParentAbort);
        if (onParentAbortRace) signal.removeEventListener('abort', onParentAbortRace);
        /*
         * The call is over, so is every sub-agent it opened. A Stop or the timeout closed them
         * already (the call's signal); a handler that threw, returned, or left a `runSubAgent`
         * un-awaited did not, and its line started and never stopped — an un-awaited one went
         * on emitting after its call, after the run itself. Here, before the caller emits the
         * call's own `tool-failed` / `tool-resolved`, as `agent-end` precedes `tool-aborted`.
         */
        closeOpen(crash ? 'failed' : 'stopped', crash ? { error: errorText(crash.error) } : undefined);
    }
}

/** What a run hands each of its tool calls, before the call's own id and signal. */
interface ToolRunBase extends Omit<StreamToolRun, 'startAgent'> {
    emitter: StreamRunEmitter;
    background: Background;
}

/** The four events that begin and end a run: never a sub-agent's to send. */
type RunLevelEvent = Extract<StreamRunEvent, { type: 'run-start' | 'run-done' | 'run-aborted' | 'run-suspended' }>;
const RUN_LEVEL = new Set<string>(['run-start', 'run-done', 'run-aborted', 'run-suspended']);
const isRunLevel = (event: StreamRunEvent): event is RunLevelEvent => RUN_LEVEL.has(event.type);

/**
 * The `run` one tool call is handed: the run's parts, and a sub-agent tied to this call. And
 * `closeOpen`, which ends the sub-agents the call opened that are still open, the latest first
 * (ending one that is closed already does nothing).
 */
function createToolRun(base: ToolRunBase, toolCallId: string, callSignal: AbortSignal): {
    run: StreamToolRun;
    closeOpen: StreamAgentHandle['end'];
} {
    const { emitter, background, ...parts } = base;
    const opened: StreamAgentHandle[] = [];
    return {
        run: {
            ...parts,
            startAgent: (info) => {
                // Not this call's: it outlives it, and the run ends it.
                if (info.background) return background.open(info);
                const handle = openAgent(emitter, base.idGen('agent'), info.detached ? undefined : toolCallId, info, callSignal);
                opened.push(handle);
                return handle;
            },
        },
        closeOpen: (status, detail) => {
            for (const handle of opened.reverse()) handle.end(status, detail);
            opened.length = 0;
        },
    };
}

/**
 * Announce a sub-agent and return its handle. It ends with `stopped` the moment its call's
 * signal aborts — a listener, so synchronously, before the loop's race moves on to the
 * call's `tool-aborted` — and once ended it drops every event: what a sub-agent's loop
 * still emits while it unwinds is late, and belongs to nobody.
 */
function openAgent(
    emitter: StreamRunEmitter,
    agentId: string,
    toolCallId: string | undefined,
    info: { name?: string; description?: string },
    callSignal: AbortSignal,
    onEnd?: (status: StreamAgentStatus, detail?: { result?: string; error?: string }) => void,
): StreamAgentHandle {
    // A call already stopped opens nothing: its `tool-aborted` may be out already.
    let open = !callSignal.aborted;
    /*
     * The sub-agents of this one still running, with the parent their start named. Ended
     * with this one, first: once this one is closed their own ends would be dropped, and a
     * host would be left with a line that started and never stopped.
     */
    const nested = new Map<string, string | undefined>();
    const end: StreamAgentHandle['end'] = (status, detail) => {
        if (!open) return;
        open = false;
        callSignal.removeEventListener('abort', onAbort);
        for (const [id, parentAgentId] of [...nested].reverse()) {
            emitter({ type: 'agent-end', agentId: id, status: 'stopped', ...(parentAgentId ? { parentAgentId } : {}) });
        }
        nested.clear();
        emitter({
            type: 'agent-end', agentId, status,
            ...(detail?.result !== undefined ? { result: detail.result } : {}),
            ...(detail?.error !== undefined ? { error: detail.error } : {}),
        });
        onEnd?.(status, detail);
    };
    const onAbort = (): void => end('stopped');
    if (open) {
        emitter({
            type: 'agent-start', agentId,
            ...(info.name !== undefined ? { name: info.name } : {}),
            ...(info.description !== undefined ? { description: info.description } : {}),
            ...(toolCallId !== undefined ? { toolCallId } : {}),
        });
        callSignal.addEventListener('abort', onAbort, { once: true });
    }
    return {
        agentId,
        signal: callSignal,
        emit(event) {
            if (!open || isRunLevel(event)) return;
            if (event.type === 'agent-start' || event.type === 'agent-end') {
                // A sub-agent of this one: already attributed, it gains its parent.
                const stamped = event.parentAgentId ? event : { ...event, parentAgentId: agentId };
                if (stamped.type === 'agent-start') nested.set(stamped.agentId, stamped.parentAgentId);
                else nested.delete(stamped.agentId);
                emitter(stamped);
                return;
            }
            emitter(event.agentId ? event : { ...event, agentId });
        },
        end,
    };
}

/** One sub-agent in the background, and how it ended once it has. */
interface BackgroundAgent {
    handle: StreamAgentHandle;
    name?: string;
    description?: string;
    stop: AbortController;
    ended?: { status: StreamAgentStatus; result?: string; error?: string };
    told: boolean;
}

/** The run's sub-agents in the background: opened by its tools, waited for and stopped by it. */
interface Background {
    open(info: { name?: string; description?: string }): StreamAgentHandle;
    /** Stop every one at work, and refuse any opened afterwards: the run is over. */
    close(): void;
    /** Whether one is still at work, or is back and the model has not been told. */
    pending(): boolean;
    /** Resolves once none is at work. */
    settled(): Promise<void>;
    /** What the model is told about the ones back since it was last told: `''` for none. */
    report(): string;
    /** Stop every one still at work, now (each ends `stopped`, synchronously). */
    stopAll(): void;
}

function createBackground(emitter: StreamRunEmitter, idGen: (prefix: string) => string, runSignal: AbortSignal, timeoutMs: number): Background {
    const agents: BackgroundAgent[] = [];
    let wake: (() => void) | null = null;
    let closed = false;
    const atWork = (): boolean => agents.some((a) => !a.ended);
    return {
        open(info) {
            const stop = new AbortController();
            // A run that is over, or stopped, starts nothing: a handle closed from the start,
            // with nothing to wait for and nothing to tell (no event, no model call).
            if (closed || runSignal.aborted) {
                stop.abort();
                return openAgent(emitter, idGen('agent'), undefined, info, stop.signal);
            }
            // Stopped by a Stop of the run, not of the call that started it; and by the tool
            // time limit, which bounds a sub-agent held by its call the same way.
            const onRunAbort = (): void => stop.abort();
            runSignal.addEventListener('abort', onRunAbort, { once: true });
            const timer = setTimeout(() => stop.abort(), timeoutMs);
            const agent: BackgroundAgent = { handle: undefined as unknown as StreamAgentHandle, name: info.name, description: info.description, stop, told: false };
            agent.handle = openAgent(emitter, idGen('agent'), undefined, info, stop.signal, (status, detail) => {
                clearTimeout(timer);
                runSignal.removeEventListener('abort', onRunAbort);
                agent.ended = { status, ...detail };
                if (!atWork()) wake?.();
            });
            agents.push(agent);
            return agent.handle;
        },
        close() {
            closed = true;
            for (const a of agents) if (!a.ended) a.stop.abort();
        },
        pending: () => agents.some((a) => !a.ended || !a.told),
        settled: () => (atWork() ? new Promise<void>((resolve) => { wake = () => { wake = null; resolve(); }; }) : Promise.resolve()),
        report() {
            const back = agents.filter((a) => a.ended && !a.told);
            for (const a of back) a.told = true;
            if (back.length === 0) return '';
            const lines = back.map((a) => {
                const who = `Sub-agent "${a.name ?? a.handle.agentId}"${a.description ? ` (${a.description})` : ''}`;
                const ended = a.ended!;
                if (ended.status === 'done') return `${who} is done:\n${ended.result?.trim() || '(it wrote nothing)'}`;
                if (ended.status === 'failed') return `${who} failed: ${ended.error ?? 'no reason given'}`;
                return `${who} was stopped before it answered.`;
            });
            return `${back.length === 1 ? 'A sub-agent you started is back.' : 'The sub-agents you started are back.'}\n\n${lines.join('\n\n')}`;
        },
        stopAll() {
            for (const a of agents) if (!a.ended) a.stop.abort();
        },
    };
}

/** The one-line text of a handler's crash, for the `tool-failed` event and the row. */
function errorText(error: unknown): string {
    if (error instanceof Error) return error.message || error.name;
    return typeof error === 'string' ? error : String(error);
}
