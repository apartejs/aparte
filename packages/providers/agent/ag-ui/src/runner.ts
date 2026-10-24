import { AparteError, AparteErrorCode, uuid } from '@aparte/core';
import type {
    AparteChatRequest,
    AparteStreamRunEvent,
    AparteStreamRunner,
    AparteStreamRunOptions,
} from '@aparte/core';
import { toAgUiMessages, toAgUiTools } from './messages.js';
import { enforce } from './enforce.js';
import { applyStateDelta } from './state.js';
import { createTranslator } from './translate.js';
import { createVerifier } from './verify.js';
import { readAgUiEvents } from './wire.js';
import type { AgUiInterrupt, AgUiMessage, AgUiResumeItem, AgUiRunAgentInput } from './wire.js';

type Suspended = Extract<AparteStreamRunEvent, { type: 'run-suspended' }>;
type PendingCall = Suspended['pending'][number];
type Usage = NonNullable<Extract<AparteStreamRunEvent, { type: 'run-done' }>['usage']>;
type Outcome = NonNullable<NonNullable<AparteStreamRunOptions['deferral']>['outcomes']>[string];

export interface AgUiRunnerOptions {
    /** The agent's AG-UI endpoint, e.g. Agno's `/agui`, or a TanStack AI chat route. */
    endpoint: string;
    /** Sent with every request; a function is called per request (a fresh token each time). */
    headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
    /** @default the global `fetch` */
    fetch?: typeof fetch;
    /** For a cross-origin endpoint that authenticates by cookie. */
    credentials?: RequestCredentials;
    /**
     * The AG-UI thread a turn runs in. Give the conversation's id when the agent keeps
     * state per thread (Agno's session); a function receives the run's options. A paused
     * run is always resumed in its own thread, whatever this returns.
     * @default a new thread per turn — the agent gets the whole history every time
     */
    threadId?: string | ((opts: AparteStreamRunOptions) => string);
    /** `RunAgentInput.forwardedProps`: settings your agent reads from the request. */
    forwardedProps?: Record<string, unknown>;
    /** `RunAgentInput.context`: extra context entries for the agent. */
    context?: { description: string; value: string }[];
    /**
     * The AG-UI version the agent speaks, when it is older than 1.0 and does not say so
     * itself, e.g. `'0.0.47'`. The protocol forbids guessing a peer's age, so an older
     * agent has to be named here. The runner then reads its stream with that version's
     * rules (its run framing, its retired shapes) and leaves `protocolVersion` out of the
     * request, a field that agent predates.
     * @default the agent speaks 1.0
     */
    peerProtocolVersion?: string;
    /**
     * Read a stream whose runs are framed otherwise than AG-UI 1.0 frames them: a
     * `RUN_FINISHED` per model step with more events after it, or a resume answered before
     * its `RUN_STARTED`. TanStack AI does both, so its routes need this; every other rule
     * of the protocol still holds. By default such a stream is rejected, as 1.0 asks.
     * @default false
     */
    relaxedRunFraming?: boolean;
    /**
     * Told what the runner dropped or could not read in the agent's stream — an event
     * type it does not know, a translation that lost something. For the developer, not
     * the person chatting.
     * @default `console.warn`
     */
    onWarning?: (message: string) => void;
}

/** The AG-UI version this runner speaks, and declares on every request. */
const PROTOCOL_VERSION = '1.0';

/** A version identifier as numbers, compared component by component; undefined when it is not one. */
function versionParts(version: string): number[] | undefined {
    return /^\d+(\.\d+)*$/.test(version) ? version.split('.').map(Number) : undefined;
}

/** Negative, zero or positive, as `a` is older than, equal to or newer than `b`. */
function compareVersions(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
}

/**
 * What a paused run hands the page and gets back with the answers — `deferral.token`.
 * Opaque to the client; the runner reads it to resume in the same thread, after the
 * run it continues, with the interrupts it must answer.
 */
interface Ticket {
    v: 1;
    threadId: string;
    runId: string;
    /** `unanswerable`: an interrupt the page could not answer, cancelled in this batch. */
    interrupts: { id: string; toolCallId: string; kind: 'approval' | 'external' | 'unanswerable' }[];
}

function readTicket(token: string | undefined): Ticket | undefined {
    if (!token) return undefined;
    try {
        const ticket = JSON.parse(token) as Ticket;
        return ticket && ticket.v === 1 && typeof ticket.threadId === 'string' && typeof ticket.runId === 'string'
            && Array.isArray(ticket.interrupts) ? ticket : undefined;
    } catch {
        return undefined;
    }
}

/** An interrupt's reason, as what the page must do about its call. */
function interruptKind(interrupt: AgUiInterrupt): 'approval' | 'external' | undefined {
    if (interrupt.reason === 'tool_call' || interrupt.reason === 'confirmation') return 'approval';
    if (/client_tool/.test(interrupt.reason)) return 'external';
    return undefined;
}

/**
 * Usage as AG-UI agents report it — an object, or TanStack AI's array of model steps — as
 * the LAST step's report. That is what the page's own loop reports for a run of several
 * turns, and what the context gauge reads: the size of the conversation the model last saw.
 * Summed, a three-step run read as three times the context it used.
 */
function readUsage(value: unknown): Usage | undefined {
    const entries = (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [])
        .filter((u): u is Record<string, unknown> => Boolean(u) && typeof u === 'object');
    const last = entries.at(-1);
    if (!last) return undefined;
    const num = (key: string): number => (typeof last[key] === 'number' ? last[key] as number : 0);
    const cached = num('cachedInputTokens');
    return {
        inputTokens: num('inputTokens'),
        outputTokens: num('outputTokens'),
        totalTokens: num('totalTokens') || undefined,
        ...(cached ? { cacheReadTokens: cached } : {}),
    } as Usage;
}

/** A call's streamed arguments as its input: `{}` for none, the raw text when not JSON. */
function parseArgs(args: string): unknown {
    if (!args.trim()) return {};
    try { return JSON.parse(args); } catch { return { arguments: args }; }
}

/** A tool result as the row shows it: text as is, the text of content parts, anything else as JSON. */
function resultText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (content === undefined || content === null) return '';
    if (Array.isArray(content)) {
        const text = content
            .filter((part): part is { type: 'text'; text: string } => (part as { type?: unknown })?.type === 'text' && typeof (part as { text?: unknown }).text === 'string')
            .map((part) => part.text);
        if (text.length) return text.join('\n');
    }
    return JSON.stringify(content);
}

/** What the model reads about a refusal: the person's words, else core's fixed sentence. */
function rejectionText(decision: { reason?: string; instruction?: string }): string {
    return decision.reason?.trim()
        || (decision.instruction ? `The user rejected this tool call and said: ${decision.instruction}` : 'Tool execution was rejected by the user.');
}

/** The answer a resumed interrupt carries, in the shape AG-UI (and TanStack AI) reads. */
function resumeItem(interrupt: Ticket['interrupts'][number], outcome: Outcome | undefined): AgUiResumeItem {
    if (!outcome) return { interruptId: interrupt.id, status: 'cancelled' };
    if (outcome.kind === 'decision' && interrupt.kind === 'external' && !outcome.approved) {
        // A client tool the page refused to run (its `needsApproval`, its policy). An
        // execution interrupt answered `{ approved: false }` reads as a successful OUTPUT —
        // TanStack AI's `clientToolResult` takes any resolved payload without the error
        // state as `output-available` — so the model would read the decision as the tool's
        // result and lose the reason. It goes back as the tool's error, with the sentence.
        return {
            interruptId: interrupt.id,
            status: 'resolved',
            payload: { error: rejectionText(outcome) },
            metadata: { tanstack: { state: 'output-error' } },
        };
    }
    if (outcome.kind === 'decision') {
        return { interruptId: interrupt.id, status: 'resolved', payload: { approved: outcome.approved } };
    }
    if (outcome.kind === 'failed') {
        return {
            interruptId: interrupt.id,
            status: 'resolved',
            payload: { error: outcome.error },
            metadata: { tanstack: { state: 'output-error' } },
        };
    }
    return {
        interruptId: interrupt.id,
        status: 'resolved',
        payload: outcome.structuredContent !== undefined ? outcome.structuredContent : outcome.content,
    };
}

/**
 * An `AparteStreamRunner` for an agent served over AG-UI — Agno, LangGraph, Mastra,
 * CrewAI, Pydantic AI, CopilotKit's runtime, TanStack AI. The agent runs on its server,
 * with its own tools; this runner turns its event stream into the rows, text and
 * approvals `AparteClient` draws.
 *
 * ```ts
 * const client = new AparteClient({ streamRunner: createAgUiRunner({ endpoint: '/agui' }) });
 * ```
 *
 * Tools the PAGE registers go to the agent as AG-UI frontend tools. When the agent calls
 * one — or pauses on a call that needs a person (an AG-UI interrupt) — the run ends on
 * `run-suspended`; the client runs the tool or asks through its approval panel, then
 * calls this runner again with the answers, which go back as `tool` messages or as one
 * `resume` batch for the interrupts.
 */
export function createAgUiRunner(options: AgUiRunnerOptions): AparteStreamRunner {
    const warn = options.onWarning ?? ((message: string) => console.warn(`[aparte] AG-UI: ${message}`));
    const peer = options.peerProtocolVersion ? versionParts(options.peerProtocolVersion) : undefined;
    // A peer configured older than 1.0 predates `RunAgentInput.protocolVersion`, and its
    // run framing is read with the older rules.
    const declare = !peer || compareVersions(peer, [1, 0]) >= 0;
    // A peer of 0.0.39 or older takes a user message's content as text only.
    const flatten = peer !== undefined && compareVersions(peer, [0, 0, 39]) <= 0;
    // The agent's state, per thread: what its last snapshot and deltas left, sent back as
    // the next run's `state`. A thread minted for one turn is forgotten when the turn ends
    // — only a resume reuses it.
    const states = new Map<string, unknown>();
    const stableThread = options.threadId !== undefined;
    /** Interrupts a finished run left that the page could not answer, per thread: cancelled on its next run. */
    const unanswered = new Map<string, string[]>();
    return async (opts) => {
        const doFetch = options.fetch ?? fetch;
        const headers = typeof options.headers === 'function' ? await options.headers() : options.headers ?? {};
        const request = opts.baseRequest as AparteChatRequest;
        const ticket = readTicket(opts.deferral?.token);
        const outcomes = opts.deferral?.outcomes ?? {};
        const threadId = ticket?.threadId
            ?? (typeof options.threadId === 'function' ? options.threadId(opts) : options.threadId)
            ?? `aparte-${uuid()}`;
        const runId = `aparte-run-${uuid()}`;
        const interrupted = new Set((ticket?.interrupts ?? []).map((i) => i.toolCallId));

        // Answers to calls the agent left to the browser without an interrupt go back as
        // `tool` messages after the history; answers to interrupts go in one `resume`
        // batch, since the protocol refuses a partial one.
        const messages: AgUiMessage[] = toAgUiMessages(request.messages, flatten, warn);
        for (const [toolCallId, outcome] of Object.entries(outcomes)) {
            if (interrupted.has(toolCallId)) continue;
            // A page tool the page refused (its `needsApproval`, its policy): the refusal is
            // the call's result, the sentence the model reads. An approval needs no message.
            if (outcome.kind === 'decision' && outcome.approved) continue;
            messages.push({
                id: `aparte-result-${toolCallId}`,
                role: 'tool',
                toolCallId,
                content: outcome.kind === 'failed' ? `Error: ${outcome.error}`
                    : outcome.kind === 'decision' ? rejectionText(outcome)
                    : outcome.content,
            });
        }
        const left = ticket ? [] : (unanswered.get(threadId) ?? []);
        unanswered.delete(threadId);
        const resume = ticket?.interrupts.length
            ? ticket.interrupts.map((interrupt) => resumeItem(interrupt, interrupt.kind === 'unanswerable' ? undefined : outcomes[interrupt.toolCallId]))
            : left.length ? left.map((interruptId): AgUiResumeItem => ({ interruptId, status: 'cancelled' })) : undefined;

        const body: AgUiRunAgentInput = {
            threadId,
            runId,
            ...(declare ? { protocolVersion: PROTOCOL_VERSION } : {}),
            ...(ticket ? { parentRunId: ticket.runId } : {}),
            state: states.has(threadId) ? states.get(threadId) : {},
            messages,
            tools: toAgUiTools(request.tools),
            context: options.context ?? [],
            forwardedProps: options.forwardedProps ?? {},
            ...(resume ? { resume } : {}),
        };
        const response = await doFetch(options.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...headers },
            body: JSON.stringify(body),
            signal: opts.signal,
            ...(options.credentials ? { credentials: options.credentials } : {}),
        });
        if (!response.ok || !response.body) {
            const text = await response.text().catch(() => '');
            throw new AparteError(
                text.trim().slice(0, 300) || `The agent endpoint answered HTTP ${response.status}.`,
                AparteError.codeForStatus(response.status) ?? AparteErrorCode.PROVIDER_ERROR,
                undefined, undefined, response.status,
            );
        }

        // Calls the history already declares: a resumed run answers them, it does not
        // start them again (no second row).
        const history = new Map(request.messages.flatMap((m) => (m.toolCalls ?? []).map((c) => [c.id, { name: c.name, input: c.input ?? {} }] as const)));
        const known = new Set(history.keys());
        const browserTools = new Set((request.tools ?? []).map((t) => t.name));
        const calls = new Map<string, { name: string; args: string }>();
        const started = new Map<string, { name: string; input: unknown }>();
        const answered = new Set<string>();
        const rejected = new Set<string>();
        const settledByPage = new Set<string>();
        let textOpen = false;
        let runError: AparteError | undefined;
        let usage: Usage | undefined;
        let finished: { runId: string; outcome?: { type?: string; interrupts?: AgUiInterrupt[] } } | undefined;
        const emit = opts.emitter;

        const startTool = (toolCallId: string) => {
            const call = calls.get(toolCallId);
            if (!call || started.has(toolCallId) || known.has(toolCallId)) return;
            const input = parseArgs(call.args);
            started.set(toolCallId, { name: call.name, input });
            if (textOpen) { emit({ type: 'text-flush' }); textOpen = false; }
            emit({ type: 'tool-start', toolCallId, name: call.name, input });
            stepEnded = true;
        };

        // A model step ends on a tool call, or on a RUN_FINISHED (TanStack AI closes each
        // step with one). What the next step draws, its reasoning or its text, opens a new
        // turn, the way the in-page loop opens one per model call. Drawn into the old turn,
        // a second step's reasoning landed in the first step's thinking block, above the
        // tool row.
        let stepEnded = false;
        const nextStep = () => {
            if (!stepEnded) return;
            stepEnded = false;
            if (textOpen) { emit({ type: 'text-flush' }); textOpen = false; }
            emit({ type: 'turn-start' });
        };

        /** The call an interrupt is about: started in this run, else in the history, else as the interrupt describes it. */
        const callOf = (interrupt: AgUiInterrupt & { toolCallId: string }): { name: string; input: unknown } => {
            const here = started.get(interrupt.toolCallId) ?? history.get(interrupt.toolCallId);
            if (here) return here;
            const streamed = calls.get(interrupt.toolCallId);
            if (streamed) return { name: streamed.name, input: parseArgs(streamed.args) };
            // TanStack AI describes the call on the interrupt itself.
            const meta = interrupt.metadata as { toolName?: unknown; input?: unknown } | undefined;
            return { name: typeof meta?.toolName === 'string' ? meta.toolName : '', input: meta?.input ?? {} };
        };

        // A stream that closes between two steps is cut, not finished: TanStack AI sends a
        // RUN_FINISHED per step, so having seen one says nothing about the last.
        let endedOnFinish = false;

        // The run opens on its FIRST event, whatever it is: a resumed TanStack AI run sends
        // the approved call's TOOL_CALL_RESULT before RUN_STARTED, and settling that row
        // after its result put it back to pending. The answers this run carries settle
        // their rows before anything else.
        let begun = false;
        const begin = () => {
            if (begun) return;
            begun = true;
            emit({ type: 'run-start' });
            emit({ type: 'turn-start' });
            for (const [toolCallId, outcome] of Object.entries(outcomes)) {
                // A tool the PAGE ran: its row settles here, with the result the page holds —
                // a plain AG-UI agent never echoes a frontend tool's result, so nothing
                // else would, and an echo that does come is not drawn twice.
                if (outcome.kind === 'result') {
                    emit({
                        type: 'tool-resolved',
                        toolCallId,
                        result: outcome.content,
                        ...(outcome.structuredContent !== undefined ? { structuredResult: outcome.structuredContent } : {}),
                    });
                    settledByPage.add(toolCallId);
                    continue;
                }
                if (outcome.kind === 'failed') {
                    emit({ type: 'tool-failed', toolCallId, error: outcome.error });
                    settledByPage.add(toolCallId);
                    continue;
                }
                if (outcome.approved) {
                    emit({ type: 'tool-approved', toolCallId });
                } else {
                    emit({ type: 'tool-rejected', toolCallId, reason: rejectionText(outcome) });
                    rejected.add(toolCallId);
                }
            }
        };

        const verify = createVerifier(!declare || options.relaxedRunFraming === true);
        const translate = createTranslator(peer, warn);
        // Older shapes are translated first; then what 1.0 does not describe is dropped or
        // stripped, with a warning — the order the protocol requires of a consumer.
        async function* incoming(body: ReadableStream<Uint8Array>, contentType: string | null) {
            for await (const raw of readAgUiEvents(body, contentType)) {
                for (const translated of translate(raw)) {
                    const event = enforce(translated, warn);
                    if (event) yield event;
                }
            }
        }
        for await (const event of incoming(response.body, response.headers.get('content-type'))) {
            // A stream 1.0 says to reject is rejected before its event is drawn; what was
            // drawn before it stays, and the error lands below it.
            verify(event);
            begin();
            if (/^(TEXT_MESSAGE|REASONING|TOOL_CALL)_/.test(event.type)) endedOnFinish = false;
            switch (event.type) {
                case 'RUN_STARTED': {
                    // The producer's own version. Newer, or not a version at all: proceed
                    // under 1.0's rules and say so, as the protocol asks of a consumer.
                    const declared = event['protocolVersion'];
                    if (typeof declared === 'string') {
                        const parts = versionParts(declared);
                        if (!parts) warn(`the agent declares protocol version "${declared}", which this runner cannot interpret; reading its stream as ${PROTOCOL_VERSION}.`);
                        else if (compareVersions(parts, versionParts(PROTOCOL_VERSION)!) > 0) warn(`the agent speaks AG-UI ${declared}, newer than the ${PROTOCOL_VERSION} this runner speaks; reading its stream as ${PROTOCOL_VERSION}.`);
                    }
                    break;
                }
                case 'TEXT_MESSAGE_START':
                case 'REASONING_START':
                case 'REASONING_MESSAGE_START':
                    nextStep();
                    break;
                case 'TEXT_MESSAGE_CONTENT':
                case 'TEXT_MESSAGE_CHUNK': {
                    const delta = typeof event['delta'] === 'string' ? event['delta'] : '';
                    if (delta) { nextStep(); emit({ type: 'text-delta', delta }); textOpen = true; }
                    break;
                }
                case 'TEXT_MESSAGE_END': {
                    if (textOpen) { emit({ type: 'text-flush' }); textOpen = false; }
                    break;
                }
                case 'REASONING_MESSAGE_CONTENT':
                case 'REASONING_MESSAGE_CHUNK': {
                    const delta = typeof event['delta'] === 'string' ? event['delta'] : '';
                    if (delta) { nextStep(); emit({ type: 'thinking-delta', delta }); }
                    break;
                }
                case 'TOOL_CALL_START': {
                    const id = String(event['toolCallId']);
                    calls.set(id, { name: String(event['toolCallName'] ?? ''), args: '' });
                    break;
                }
                case 'TOOL_CALL_ARGS': {
                    const call = calls.get(String(event['toolCallId']));
                    if (call && typeof event['delta'] === 'string') call.args += event['delta'];
                    break;
                }
                case 'TOOL_CALL_CHUNK': {
                    const id = typeof event['toolCallId'] === 'string' ? event['toolCallId'] : [...calls.keys()].at(-1);
                    if (!id) break;
                    const call = calls.get(id) ?? { name: '', args: '' };
                    if (typeof event['toolCallName'] === 'string' && event['toolCallName']) call.name = event['toolCallName'];
                    if (typeof event['delta'] === 'string') call.args += event['delta'];
                    calls.set(id, call);
                    break;
                }
                case 'TOOL_CALL_END': {
                    startTool(String(event['toolCallId']));
                    break;
                }
                case 'TOOL_CALL_RESULT': {
                    const toolCallId = String(event['toolCallId']);
                    startTool(toolCallId);
                    if (rejected.has(toolCallId) || settledByPage.has(toolCallId)) break; // already settled
                    answered.add(toolCallId);
                    const content = resultText(event['content']);
                    const meta = event['metadata'] as { tanstack?: { state?: unknown } } | undefined;
                    if (meta?.tanstack?.state === 'output-error') {
                        emit({ type: 'tool-failed', toolCallId, error: content });
                    } else {
                        // A result in content parts keeps them for a renderer; the model reads their text.
                        const parts = Array.isArray(event['content']) ? { structuredResult: event['content'] } : {};
                        emit({ type: 'tool-resolved', toolCallId, result: content, ...parts });
                    }
                    break;
                }
                case 'RUN_ERROR': {
                    // The agent reporting its own failure does not end the stream: a
                    // RUN_STARTED may follow and run again, and a late one can come after a
                    // run that finished. What was drawn stays; the failure is said once the
                    // stream is over, and core appends it below the reply.
                    runError = new AparteError(
                        typeof event['message'] === 'string' && event['message'] ? event['message'] : 'The agent run failed.',
                        AparteErrorCode.PROVIDER_ERROR,
                        { agUi: 'run-error', ...(typeof event['code'] === 'string' ? { code: event['code'] } : {}) },
                    );
                    break;
                }
                case 'STATE_SNAPSHOT':
                    states.set(threadId, event['snapshot']);
                    break;
                case 'STATE_DELTA':
                    states.set(threadId, applyStateDelta(states.has(threadId) ? states.get(threadId) : {}, event['delta'], warn));
                    break;
                case 'RUN_FINISHED': {
                    // Not the end of the stream: TanStack AI closes each model step with a
                    // RUN_FINISHED of its own (`finishReason: tool_calls`), then streams the
                    // tool results and the next step. The LAST one says how the run ended.
                    for (const id of calls.keys()) startTool(id);
                    if (textOpen) { emit({ type: 'text-flush' }); textOpen = false; }
                    usage = readUsage(event['usage']) ?? usage;   // the last step's report wins
                    stepEnded = true;
                    endedOnFinish = true;
                    finished = {
                        runId: typeof event['runId'] === 'string' ? event['runId'] : runId,
                        outcome: event['outcome'] as { type?: string; interrupts?: AgUiInterrupt[] } | undefined,
                    };
                    break;
                }
                default:
                    // STEP_*, STATE_*, MESSAGES_SNAPSHOT, ACTIVITY_*, RAW, CUSTOM, SUBAGENT_*:
                    // agent state aparté does not draw.
                    break;
            }
        }
        if (opts.signal.aborted) return usage;
        if (runError) {
            for (const [toolCallId] of started) if (!answered.has(toolCallId)) emit({ type: 'tool-aborted', toolCallId });
            if (textOpen) emit({ type: 'text-flush' });
            throw runError;
        }
        if (!finished) {
            throw new AparteError('The agent stream ended without RUN_FINISHED.', AparteErrorCode.PROVIDER_ERROR);
        }
        if (!endedOnFinish) {
            throw new AparteError('The agent stream was cut: it ended in the middle of a step, after a RUN_FINISHED.', AparteErrorCode.PROVIDER_ERROR);
        }
        if (textOpen) emit({ type: 'text-flush' });

        const pending: PendingCall[] = [];
        const interrupts: Ticket['interrupts'] = [];
        // Interrupts the page has no way to answer — no call to approve or run, or a reason
        // it does not know. The run ends without failing; they are answered `cancelled`
        // in the next resume of the thread, which a paused thread needs to continue.
        const unanswerable: string[] = [];
        if (finished.outcome?.type === 'interrupt') {
            for (const interrupt of finished.outcome.interrupts ?? []) {
                const kind = interruptKind(interrupt);
                if (!kind || !interrupt.toolCallId) {
                    unanswerable.push(interrupt.id);
                    continue;
                }
                // A resumed run can pause again on a call an earlier run started (TanStack AI
                // asks to approve a client tool, then to run it): its name comes from there.
                const call = callOf(interrupt as AgUiInterrupt & { toolCallId: string });
                if (kind === 'approval') {
                    emit({ type: 'tool-awaiting-approval', toolCallId: interrupt.toolCallId, name: call.name, input: call.input });
                }
                interrupts.push({ id: interrupt.id, toolCallId: interrupt.toolCallId, kind });
                pending.push({ toolCallId: interrupt.toolCallId, name: call.name, input: call.input, reason: kind });
            }
        } else {
            // Plain AG-UI: the calls left to the browser are the ones the agent names
            // (`pendingToolCallIds`, AG-UI 1.0), else the page's own tools nobody answered.
            // Any other call without a result has nobody left to answer it: its row stops
            // waiting rather than spinning after the run. A cancelled run leaves nothing.
            const outcome = finished.outcome as { type?: string; pendingToolCallIds?: unknown } | undefined;
            const named = Array.isArray(outcome?.pendingToolCallIds)
                ? new Set(outcome.pendingToolCallIds.filter((id): id is string => typeof id === 'string'))
                : undefined;
            for (const [toolCallId, call] of started) {
                if (answered.has(toolCallId)) continue;
                const forPage = outcome?.type !== 'cancelled' && (named ? named.has(toolCallId) : browserTools.has(call.name));
                if (forPage) pending.push({ toolCallId, name: call.name, input: call.input, reason: 'external' });
                else emit({ type: 'tool-aborted', toolCallId });
            }
        }
        if (pending.length > 0) {
            const cancelled = unanswerable.map((id) => ({ id, toolCallId: '', kind: 'unanswerable' as const }));
            const next: Ticket = { v: 1, threadId, runId: finished.runId, interrupts: [...interrupts, ...cancelled] };
            emit({ type: 'run-suspended', pending, ...(usage ? { usage } : {}), ticket: JSON.stringify(next) } as Suspended);
        } else {
            if (unanswerable.length && stableThread) unanswered.set(threadId, unanswerable);
            if (!stableThread) states.delete(threadId);
            emit({ type: 'run-done', ...(usage ? { usage } : {}) });
        }
        return usage;
    };
}
