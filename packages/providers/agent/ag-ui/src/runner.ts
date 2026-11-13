import { AparteError, AparteErrorCode, toolRefusal, uuid } from '@aparte/core';
import type {
    AparteChatRequest,
    AparteStreamRunEvent,
    AparteStreamRunner,
    AparteStreamRunOptions,
} from '@aparte/core';
import { toAgUiMessages, toAgUiTools } from './messages.js';
import { enforce } from './enforce.js';
import { applyActivityDelta, applyStateDelta } from './state.js';
import { createSubagentHistory, subagentMessages } from './subagent-history.js';
import type { SubagentRecord } from './subagent-history.js';
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
    /**
     * The sub-agent each pending call belongs to, by call id — absent for the run's own.
     * The resume settles those rows under it: the row lives in the sub-agent's conversation.
     */
    agents?: Record<string, string>;
    /** The paused run's sub-agents, their own messages included: the resume hands them back (`subagentMessages`). */
    subagents?: SubagentRecord[];
    /**
     * A TanStack AI router's plan card as the paused run left it: its id, so the resumed run
     * (a new run id) patches the same card, and what it had ticked, which a resume does not
     * announce again (a sub-agent that finished is not re-run).
     */
    plan?: { id: string; steps: string[][]; status: Record<string, string> };
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

/** What a run leaves the turn that ran it: its thread, whether it paused, how to close its steps. */
interface Track {
    threadId?: string;
    suspended: boolean;
    closeSteps?: () => void;
}

/** The run's own events. */
const PARENT = '';

/** What an event says of its owner: nothing for the run's own, its `agentId` for a sub-agent's. */
function by(owner: string): { agentId?: string } {
    return owner ? { agentId: owner } : {};
}

/**
 * TanStack AI's router plan, as its `withPlan` puts it on each DIRECT child's
 * `SUBAGENT_STARTED`: `metadata.tanstack.subagentPlan`, `{ steps: [{ names, order? }] }` — the
 * agents of each step, in order. `undefined` for anything else.
 */
function routerPlanOf(event: { [key: string]: unknown }): string[][] | undefined {
    const tanstack = (event['metadata'] as { tanstack?: { subagentPlan?: { steps?: unknown } } } | undefined)?.tanstack;
    const steps = tanstack?.subagentPlan?.steps;
    if (!Array.isArray(steps)) return undefined;
    const names = steps
        .map((step) => (Array.isArray((step as { names?: unknown })?.names) ? (step as { names: unknown[] }).names.filter((n): n is string => typeof n === 'string' && n !== '') : []))
        .filter((step) => step.length > 0);
    return names.length ? names : undefined;
}

/** An interrupt's reason, as what the page must do about its call. */
function interruptKind(interrupt: AgUiInterrupt): 'approval' | 'external' | undefined {
    if (interrupt.reason === 'tool_call' || interrupt.reason === 'confirmation' || interrupt.reason === 'approval_required') return 'approval';
    if (/client_tool/.test(interrupt.reason)) return 'external';
    return undefined;
}

/**
 * Usage as AG-UI agents report it — an object, or TanStack AI's array of model steps — as
 * the LAST step's report. That is what the page's own loop reports for a run of several
 * turns, and what the context gauge reads: the size of the conversation the model last saw.
 * Summed, a three-step run read as three times the context it used.
 *
 * `first` when the run's sub-agents ran: TanStack AI then puts their calls on the run's
 * terminal too (`withChildUsage`, as AG-UI 1.0 asks: "calls made by its subagents included"),
 * AFTER the run's own report, so the last entry is a sub-agent's model call, not the run's.
 */
function readUsage(value: unknown, pick: 'first' | 'last' = 'last'): Usage | undefined {
    const entries = (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [])
        .filter((u): u is Record<string, unknown> => Boolean(u) && typeof u === 'object');
    const last = pick === 'first' ? entries[0] : entries.at(-1);
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

/** What the model reads about a refusal: the sentence core's loop writes (`toolRefusal`). */
function rejectionText(decision: Parameters<typeof toolRefusal>[0]): string {
    return toolRefusal(decision).reason;
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
        const instruction = !outcome.approved && outcome.instruction ? { instruction: outcome.instruction } : {};
        return { interruptId: interrupt.id, status: 'resolved', payload: { approved: outcome.approved, ...instruction } };
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
 *
 * A sub-agent's work (AG-UI's `SUBAGENT_*` and the `subagentRunId` on its events) is kept
 * apart from the reply: its start and end become `agent-start` / `agent-end`, and every
 * event drawn from its content carries its `agentId` — the event's own tag, else the owner
 * of the message or call it continues. Its text, its model steps and its calls are tracked
 * per owner, so interleaved sub-agents never close each other's text, and a pause inside
 * one is asked, and answered on resume, under it.
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
    const runOnce = async (opts: AparteStreamRunOptions, track: Track): Promise<Usage | undefined> => {
        const doFetch = options.fetch ?? fetch;
        const headers = typeof options.headers === 'function' ? await options.headers() : options.headers ?? {};
        const request = opts.baseRequest as AparteChatRequest;
        const ticket = readTicket(opts.deferral?.token);
        const outcomes = opts.deferral?.outcomes ?? {};
        const threadId = ticket?.threadId
            ?? (typeof options.threadId === 'function' ? options.threadId(opts) : options.threadId)
            ?? `aparte-${uuid()}`;
        track.threadId = threadId;
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
        // The paused run's sub-agents, as they wrote and ran, after the history: the page's
        // history holds none of it (their lines draw it), and the agent resumes a paused
        // sub-agent from its own messages (TanStack AI refuses the answer otherwise).
        const pausedAgents = Array.isArray(ticket?.subagents) ? ticket.subagents : [];
        messages.push(...subagentMessages(pausedAgents));
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
        // Every call carries its OWNER: the run itself (PARENT) or the sub-agent invocation
        // whose work it is. The events drawn for it carry that owner's `agentId`.
        const calls = new Map<string, { name: string; args: string; owner: string }>();
        const started = new Map<string, { name: string; input: unknown; owner: string }>();
        const answered = new Set<string>();
        const rejected = new Set<string>();
        const settledByPage = new Set<string>();
        let runError: AparteError | undefined;
        let usage: Usage | undefined;
        let finished: { runId: string; outcome?: { type?: string; interrupts?: AgUiInterrupt[] } } | undefined;
        const emit = opts.emitter;

        // AG-UI 1.0 lets sub-agents stream at once, their events interleaved: what is open is
        // tracked per owner, as `verify` tracks it. A lane is one owner's open text and
        // whether its model step ended.
        const lanes = new Map<string, { textOpen: boolean; stepEnded: boolean }>();
        const lane = (owner: string) => {
            let at = lanes.get(owner);
            if (!at) { at = { textOpen: false, stepEnded: false }; lanes.set(owner, at); }
            return at;
        };
        /** The owner of each message, set by the event that opened it: an untagged continuation continues it. */
        const messageOwners = new Map<string, string>();
        /** The message an id-less chunk continues, per chunk type and tag, as `verify` keys a chunk stream. */
        const chunkMessages = new Map<string, string>();
        /** The last call opened under each tag: what an id-less TOOL_CALL_CHUNK continues. */
        const lastCall = new Map<string, string>();
        /** A sub-agent's calls the paused run handed the page: their outcomes settle under it. */
        const ticketAgents = new Map(Object.entries(ticket?.agents ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
        /** This run's sub-agents: announced by SUBAGENT_STARTED or met first in an attributed event, and whether still open. */
        const agents = new Map<string, { open: boolean; parent?: string; name?: string }>();
        /** What each sub-agent wrote and ran, kept for the ticket if the run pauses. */
        const transcripts = createSubagentHistory(pausedAgents);
        /** Whether the run's own model has spoken since the last RUN_FINISHED: `readUsage` reads its report then. */
        let ownStep = false;

        const tagOf = (event: { [key: string]: unknown }): string | undefined =>
            (typeof event['subagentRunId'] === 'string' ? event['subagentRunId'] : undefined);
        /** A message event's owner: whoever opened its message, else its own tag, else the run. */
        const messageOwner = (event: { type: string; [key: string]: unknown }): string => {
            let id = typeof event['messageId'] === 'string' ? event['messageId'] : undefined;
            if (event.type.endsWith('_CHUNK')) {
                const key = `${event.type}\u0000${tagOf(event) ?? PARENT}`;
                if (id !== undefined) chunkMessages.set(key, id);
                else id = chunkMessages.get(key);
            }
            const opened = id !== undefined ? messageOwners.get(id) : undefined;
            if (opened !== undefined) return opened;
            const owner = tagOf(event) ?? PARENT;
            if (id !== undefined) messageOwners.set(id, owner);
            return owner;
        };
        /** A new call's owner: its tag, else the owner of the message that holds it, else the run. */
        const newCallOwner = (event: { [key: string]: unknown }): string => tagOf(event)
            ?? (typeof event['parentMessageId'] === 'string' ? messageOwners.get(event['parentMessageId']) : undefined)
            ?? PARENT;
        /** A known call's owner: streamed in this run, else named by the ticket of the run it resumes. */
        const callOwner = (toolCallId: string): string | undefined => calls.get(toolCallId)?.owner ?? ticketAgents.get(toolCallId);

        const flush = (owner: string) => {
            const at = lanes.get(owner);
            if (at?.textOpen) { emit({ type: 'text-flush', ...by(owner) }); at.textOpen = false; }
        };
        /** A sub-agent the stream attributes work to before (or without) announcing it still starts, once. */
        const meet = (agentId: string) => {
            if (agents.has(agentId)) return;
            agents.set(agentId, { open: true });
            emit({ type: 'agent-start', agentId });
        };
        /** The steps open, in the order they opened, each with its owner (`''` for the run's own). */
        const openSteps: { owner: string; name: string }[] = [];
        /** Close what is still open — one owner's, or everyone's — the latest first, so nothing is left lit. */
        const closeSteps = (owner?: string) => {
            for (let i = openSteps.length - 1; i >= 0; i -= 1) {
                const step = openSteps[i]!;
                if (owner !== undefined && step.owner !== owner) continue;
                openSteps.splice(i, 1);
                emit({ type: 'step-end', name: step.name, ...by(step.owner) });
            }
        };
        track.closeSteps = closeSteps;
        /**
         * Each activity's type, content and owner as it stands, by its message id: a delta is
         * applied here and the page receives the whole result. A patch never changes the
         * object it reads (it works on a copy), so content already handed on stays as it was.
         */
        const activities = new Map<string, { activityType: string; content: unknown; owner: string }>();
        const showActivity = (id: string, at: { activityType: string; content: unknown; owner: string }) => {
            activities.set(id, at);
            emit({ type: 'activity', id, activityType: at.activityType, content: at.content, ...by(at.owner) });
        };
        /**
         * A TanStack AI router's plan of its sub-agents (`routerPlanOf`): the reply's own `plan`
         * activity — it is the parent's plan, not a sub-agent's, and the same on every child — a
         * step per agent in the router's order, ticked from each agent's start and end. It is sent
         * once, so the statuses are the runner's: a router starts a step only once the steps
         * before it finished, so those are done (a resumed run does not start them again).
         */
        // Its card is the reply's, not the run's: a resumed run (a new run id, the plan sent
        // again with the sub-agent it re-announces) patches the card the paused run drew, and
        // keeps what that one had ticked.
        const paused = ticket?.plan;
        let routerPlan: { steps: string[][]; status: Map<string, string> } | undefined = paused && Array.isArray(paused.steps)
            ? { steps: paused.steps, status: new Map(Object.entries(paused.status ?? {})) }
            : undefined;
        const planId = typeof paused?.id === 'string' ? paused.id : `router-plan:${runId}`;
        const tickRouterPlan = (name: string | undefined, status: 'in-progress' | 'done' | 'failed' | 'blocked') => {
            const at = name === undefined ? -1 : routerPlan?.steps.findIndex((step) => step.includes(name)) ?? -1;
            if (!routerPlan || at < 0) return;
            if (status === 'in-progress') {
                for (const before of routerPlan.steps.slice(0, at).flat()) if (routerPlan.status.get(before) !== 'failed') routerPlan.status.set(before, 'done');
            }
            routerPlan.status.set(name!, status);
            const steps = routerPlan.steps.flat().map((title) => ({ title, status: routerPlan!.status.get(title) ?? 'pending' }));
            showActivity(planId, { activityType: 'plan', content: { steps }, owner: PARENT });
        };
        const endAgent = (agentId: string, status: 'done' | 'failed' | 'waiting', detail: { result?: string; error?: string } = {}) => {
            // Its steps end with it: its line would otherwise say one it is no longer on.
            closeSteps(agentId);
            const agent = agents.get(agentId);
            if (agent) agent.open = false;
            emit({ type: 'agent-end', agentId, status, ...detail, ...(agent?.parent ? { parentAgentId: agent.parent } : {}) });
            if (agent && !agent.parent) tickRouterPlan(agent.name, status === 'waiting' ? 'blocked' : status);
        };
        /** Fail the sub-agents still open, the latest first (a nested one before the one that opened it). */
        const failOpenAgents = (error: string) => {
            for (const [agentId, agent] of [...agents].reverse()) {
                if (!agent.open) continue;
                flush(agentId);
                endAgent(agentId, 'failed', { error });
            }
        };

        const startTool = (toolCallId: string) => {
            const call = calls.get(toolCallId);
            if (!call || started.has(toolCallId) || known.has(toolCallId)) return;
            const input = parseArgs(call.args);
            started.set(toolCallId, { name: call.name, input, owner: call.owner });
            flush(call.owner);
            emit({ type: 'tool-start', toolCallId, name: call.name, input, ...by(call.owner) });
            lane(call.owner).stepEnded = true;
        };

        // A model step ends on a tool call, or on a RUN_FINISHED (TanStack AI closes each
        // step with one). What the next step draws, its reasoning or its text, opens a new
        // turn, the way the in-page loop opens one per model call. Drawn into the old turn,
        // a second step's reasoning landed in the first step's thinking block, above the
        // tool row. Each owner has its own steps: a sub-agent's call ends its step, not the parent's.
        const nextStep = (owner: string) => {
            const at = lane(owner);
            if (!at.stepEnded) return;
            at.stepEnded = false;
            flush(owner);
            emit({ type: 'turn-start', ...by(owner) });
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
                // A sub-agent's call settles under it, and what it says next is its next step.
                const owner = ticketAgents.get(toolCallId) ?? PARENT;
                if (owner) lane(owner).stepEnded = true;
                // A tool the PAGE ran: its row settles here, with the result the page holds —
                // a plain AG-UI agent never echoes a frontend tool's result, so nothing
                // else would, and an echo that does come is not drawn twice.
                if (outcome.kind === 'result') {
                    emit({
                        type: 'tool-resolved',
                        toolCallId,
                        result: outcome.content,
                        ...(outcome.structuredContent !== undefined ? { structuredResult: outcome.structuredContent } : {}),
                        ...by(owner),
                    });
                    settledByPage.add(toolCallId);
                    continue;
                }
                if (outcome.kind === 'failed') {
                    emit({ type: 'tool-failed', toolCallId, error: outcome.error, ...by(owner) });
                    settledByPage.add(toolCallId);
                    continue;
                }
                if (outcome.approved) {
                    emit({ type: 'tool-approved', toolCallId, ...by(owner) });
                } else {
                    // Who refused and what they said ride along for the row; `reason` is the agent's.
                    emit({ type: 'tool-rejected', toolCallId, ...toolRefusal(outcome), ...by(owner) });
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
            // A sub-agent the stream attributes work to without having announced it is one
            // all the same (AG-UI 1.0 accepts unannounced attribution): it starts here.
            const tag = tagOf(event);
            if (tag !== undefined && !event.type.startsWith('SUBAGENT_')) meet(tag);
            switch (event.type) {
                case 'RUN_STARTED': {
                    // A run after a failed one supersedes it: the stream ran again, and the new
                    // run decides how the reply ends. The failure is the developer's to know;
                    // the calls the failed run left are stopped, nobody will answer them, and
                    // the sub-agents it left open failed with it.
                    if (runError) {
                        warn(`the agent's run failed ("${runError.message}") and the stream ran it again; the reply shows the new run.`);
                        for (const [toolCallId, call] of started) {
                            if (answered.has(toolCallId)) continue;
                            emit({ type: 'tool-aborted', toolCallId, ...by(call.owner) });
                            answered.add(toolCallId);
                        }
                        failOpenAgents(runError.message);
                        runError = undefined;
                    }
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
                case 'REASONING_MESSAGE_START': {
                    const owner = messageOwner(event);
                    if (owner === PARENT) ownStep = true;
                    nextStep(owner);
                    break;
                }
                case 'TEXT_MESSAGE_CONTENT':
                case 'TEXT_MESSAGE_CHUNK': {
                    const owner = messageOwner(event);
                    const delta = typeof event['delta'] === 'string' ? event['delta'] : '';
                    if (owner === PARENT) ownStep = true;
                    if (delta) { nextStep(owner); emit({ type: 'text-delta', delta, ...by(owner) }); lane(owner).textOpen = true; }
                    const id = typeof event['messageId'] === 'string' ? event['messageId'] : chunkMessages.get(`${event.type}\u0000${tag ?? PARENT}`);
                    if (owner !== PARENT && delta && id !== undefined) transcripts.text(owner, id, delta);
                    break;
                }
                case 'TEXT_MESSAGE_END':
                    flush(messageOwner(event));
                    break;
                case 'REASONING_MESSAGE_CONTENT':
                case 'REASONING_MESSAGE_CHUNK': {
                    const owner = messageOwner(event);
                    const delta = typeof event['delta'] === 'string' ? event['delta'] : '';
                    if (delta) { nextStep(owner); emit({ type: 'thinking-delta', delta, ...by(owner) }); }
                    break;
                }
                case 'TOOL_CALL_START': {
                    const id = String(event['toolCallId']);
                    if (!calls.has(id)) lastCall.set(tag ?? PARENT, id);
                    const owner = newCallOwner(event);
                    const name = String(event['toolCallName'] ?? '');
                    calls.set(id, { name, args: '', owner });
                    if (owner === PARENT) ownStep = true;
                    else transcripts.call(owner, id, name);
                    break;
                }
                case 'TOOL_CALL_ARGS': {
                    const id = String(event['toolCallId']);
                    const call = calls.get(id);
                    if (call && typeof event['delta'] === 'string') {
                        call.args += event['delta'];
                        if (call.owner !== PARENT) transcripts.args(call.owner, id, event['delta']);
                    }
                    break;
                }
                case 'TOOL_CALL_CHUNK': {
                    // An id-less chunk continues the last call of its own owner's chunk stream:
                    // another sub-agent's call may have opened since.
                    const id = typeof event['toolCallId'] === 'string' ? event['toolCallId'] : lastCall.get(tag ?? PARENT);
                    if (!id) break;
                    let call = calls.get(id);
                    if (!call) {
                        call = { name: '', args: '', owner: newCallOwner(event) };
                        calls.set(id, call);
                        lastCall.set(tag ?? PARENT, id);
                    }
                    if (typeof event['toolCallName'] === 'string' && event['toolCallName']) call.name = event['toolCallName'];
                    if (typeof event['delta'] === 'string') call.args += event['delta'];
                    if (call.owner === PARENT) {
                        ownStep = true;
                    } else {
                        transcripts.call(call.owner, id, call.name);
                        if (typeof event['delta'] === 'string') transcripts.args(call.owner, id, event['delta']);
                    }
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
                    // The row is where its call was started; a result's own tag is the fallback.
                    const owner = callOwner(toolCallId) ?? tag ?? PARENT;
                    const content = resultText(event['content']);
                    if (owner !== PARENT) transcripts.result(owner, typeof event['messageId'] === 'string' ? event['messageId'] : undefined, toolCallId, content);
                    const meta = event['metadata'] as { tanstack?: { state?: unknown } } | undefined;
                    if (meta?.tanstack?.state === 'output-error') {
                        emit({ type: 'tool-failed', toolCallId, error: content, ...by(owner) });
                    } else {
                        // A result in content parts keeps them for a renderer; the model reads their text.
                        const parts = Array.isArray(event['content']) ? { structuredResult: event['content'] } : {};
                        emit({ type: 'tool-resolved', toolCallId, result: content, ...parts, ...by(owner) });
                    }
                    break;
                }
                case 'SUBAGENT_STARTED': {
                    const agentId = String(event['subagentRunId']);
                    const toolCallId = typeof event['parentToolCallId'] === 'string' ? event['parentToolCallId'] : undefined;
                    const parent = typeof event['parentSubagentRunId'] === 'string' ? event['parentSubagentRunId'] : undefined;
                    // The sub-agent's line is the row of the call that opened it: a call still
                    // buffered (chunks, no TOOL_CALL_END) starts first, so that row exists.
                    if (toolCallId) startTool(toolCallId);
                    // An id met before, or announced again by a resumed run (LangGraph continues a
                    // suspended invocation under its id), is the same agent going on: announced
                    // again with what this event says, never an error.
                    const name = String(event['name']);
                    agents.set(agentId, { open: true, name, ...(parent ? { parent } : {}) });
                    const metadata = event['metadata'];
                    transcripts.start(agentId, {
                        name,
                        ...(typeof event['description'] === 'string' ? { description: event['description'] } : {}),
                        ...(toolCallId ? { parentToolCallId: toolCallId } : {}),
                        ...(parent ? { parentSubagentRunId: parent } : {}),
                        ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { metadata: metadata as Record<string, unknown> } : {}),
                    });
                    // A router's plan comes with its direct children; a nested router's never does.
                    // It is ticked BEFORE the agent is announced: the plan's card is placed where
                    // it first arrives, so it stands above the agents' lines rather than between
                    // the first and the second.
                    if (!parent) {
                        if (!routerPlan) {
                            const steps = routerPlanOf(event);
                            if (steps) routerPlan = { steps, status: new Map() };
                        }
                        tickRouterPlan(name, 'in-progress');
                    }
                    emit({
                        type: 'agent-start',
                        agentId,
                        name,
                        ...(typeof event['description'] === 'string' ? { description: event['description'] } : {}),
                        ...(toolCallId ? { toolCallId } : {}),
                        ...(parent ? { parentAgentId: parent } : {}),
                    });
                    break;
                }
                case 'SUBAGENT_FINISHED':
                case 'SUBAGENT_ERROR': {
                    // Its terminal closes what it left open: its text, then the calls it streamed
                    // without an end, then the agent itself.
                    const agentId = String(event['subagentRunId']);
                    flush(agentId);
                    for (const [id, call] of calls) if (call.owner === agentId) startTool(id);
                    const outcome = event['outcome'] as { type?: unknown; interruptIds?: unknown } | undefined;
                    if (event.type === 'SUBAGENT_ERROR') {
                        transcripts.end(agentId, 'error');
                        endAgent(agentId, 'failed', { error: typeof event['message'] === 'string' && event['message'] ? event['message'] : 'The sub-agent failed.' });
                    } else if (outcome?.type === 'suspended') {
                        // Paused on an interrupt of its own or of a descendant: the run's outcome says which.
                        const ids = Array.isArray(outcome.interruptIds) ? outcome.interruptIds.filter((id): id is string => typeof id === 'string') : [];
                        transcripts.end(agentId, 'suspended', ids);
                        endAgent(agentId, 'waiting');
                    } else {
                        transcripts.end(agentId, 'finished');
                        endAgent(agentId, 'done', event['result'] !== undefined ? { result: resultText(event['result']) } : {});
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
                // State is run-scoped in AG-UI 1.0: a sub-agent's STATE_* updates the run's state
                // exactly as the parent's does — its `subagentRunId` is provenance, and the
                // protocol forbids withholding the update because a sub-agent sent it.
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
                    for (const owner of lanes.keys()) flush(owner);
                    // The last step's report wins. With sub-agents, the run's own report is the
                    // first entry, and a run whose own model never spoke (a router that only
                    // delegated) has none: what is listed is its sub-agents'.
                    if (agents.size === 0) usage = readUsage(event['usage']) ?? usage;
                    else if (ownStep) usage = readUsage(event['usage'], 'first') ?? usage;
                    ownStep = false;
                    lane(PARENT).stepEnded = true;
                    for (const at of lanes.values()) at.stepEnded = true;   // every owner's step ends
                    endedOnFinish = true;
                    finished = {
                        runId: typeof event['runId'] === 'string' ? event['runId'] : runId,
                        outcome: event['outcome'] as { type?: string; interrupts?: AgUiInterrupt[] } | undefined,
                    };
                    break;
                }
                // A step is a name with a start and an end, its owner's: shown while it lasts
                // (the waiting indicator, a sub-agent's line). Steps may nest and overlap, and
                // one ends the latest open step of its name under the same owner.
                case 'STEP_STARTED': {
                    const owner = tag ?? PARENT;
                    const name = String(event['stepName'] ?? '');
                    openSteps.push({ owner, name });
                    emit({ type: 'step-start', name, ...by(owner) });
                    break;
                }
                case 'STEP_FINISHED': {
                    const owner = tag ?? PARENT;
                    const name = String(event['stepName'] ?? '');
                    for (let i = openSteps.length - 1; i >= 0; i -= 1) {
                        if (openSteps[i]!.owner !== owner || openSteps[i]!.name !== name) continue;
                        openSteps.splice(i, 1);
                        emit({ type: 'step-end', name, ...by(owner) });
                        break;
                    }
                    break;
                }
                // An activity is structured progress, drawn by the renderer the app registered for
                // its type. A snapshot overwrites it unless it says `replace: false` (AG-UI 1.0:
                // "only an explicit false asks a consumer to leave what is already there") — its
                // type included; a delta patches what is held. Either way the page gets it whole.
                case 'ACTIVITY_SNAPSHOT': {
                    const id = String(event['messageId'] ?? '');
                    const held = activities.get(id);
                    if (held && event['replace'] === false) break;
                    showActivity(id, { activityType: String(event['activityType'] ?? ''), content: event['content'], owner: held?.owner ?? tag ?? PARENT });
                    break;
                }
                case 'ACTIVITY_DELTA': {
                    const id = String(event['messageId'] ?? '');
                    const held = activities.get(id);
                    // Skipped, never failed, and nothing invented from the delta (the corpus's
                    // `activity-delta-missing-target-tolerated`); the specification asks for a warning.
                    if (!held) { warn(`ACTIVITY_DELTA for "${id}", an activity no ACTIVITY_SNAPSHOT created: skipped.`); break; }
                    const content = applyActivityDelta(held.content, event['patch'], warn);
                    if (content !== held.content) showActivity(id, { ...held, content });
                    break;
                }
                default:
                    // MESSAGES_SNAPSHOT, RAW, CUSTOM: agent state aparté does not draw.
                    break;
            }
        }
        closeSteps();
        if (opts.signal.aborted) return usage;
        if (runError) {
            for (const [toolCallId, call] of started) if (!answered.has(toolCallId)) emit({ type: 'tool-aborted', toolCallId, ...by(call.owner) });
            for (const owner of lanes.keys()) flush(owner);
            failOpenAgents(runError.message);
            throw runError;
        }
        if (!finished) {
            throw new AparteError('The agent stream ended without RUN_FINISHED.', AparteErrorCode.PROVIDER_ERROR);
        }
        if (!endedOnFinish) {
            throw new AparteError('The agent stream was cut: it ended in the middle of a step, after a RUN_FINISHED.', AparteErrorCode.PROVIDER_ERROR);
        }
        verify.end();
        for (const owner of lanes.keys()) flush(owner);

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
                // Raised inside a sub-agent: asked, and answered, under it — the row is in its
                // conversation. An untagged one is its call's owner's.
                const owner = interrupt.subagentRunId ?? callOwner(interrupt.toolCallId) ?? PARENT;
                if (kind === 'approval') {
                    emit({ type: 'tool-awaiting-approval', toolCallId: interrupt.toolCallId, name: call.name, input: call.input, ...by(owner) });
                }
                interrupts.push({ id: interrupt.id, toolCallId: interrupt.toolCallId, kind });
                pending.push({ toolCallId: interrupt.toolCallId, name: call.name, input: call.input, reason: kind, ...by(owner) });
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
                if (forPage) pending.push({ toolCallId, name: call.name, input: call.input, reason: 'external', ...by(call.owner) });
                else emit({ type: 'tool-aborted', toolCallId, ...by(call.owner) });
            }
        }
        // A sub-agent met only through attribution has no terminal of its own: it ends with
        // the run, waiting when the run pauses on one of its calls.
        for (const [agentId, agent] of [...agents].reverse()) {
            if (agent.open) endAgent(agentId, pending.some((p) => p.agentId === agentId) ? 'waiting' : 'done');
        }
        if (pending.length > 0) {
            const cancelled = unanswerable.map((id) => ({ id, toolCallId: '', kind: 'unanswerable' as const }));
            const owned = pending.filter((p) => p.agentId).map((p) => [p.toolCallId, p.agentId!] as const);
            const next: Ticket = {
                v: 1,
                threadId,
                runId: finished.runId,
                interrupts: [...interrupts, ...cancelled],
                ...(owned.length ? { agents: Object.fromEntries(owned) } : {}),
                ...(transcripts.records().length ? { subagents: transcripts.records() } : {}),
                ...(routerPlan ? { plan: { id: planId, steps: routerPlan.steps, status: Object.fromEntries(routerPlan.status) } } : {}),
            };
            track.suspended = true;
            emit({ type: 'run-suspended', pending, ...(usage ? { usage } : {}), ticket: JSON.stringify(next) } as Suspended);
        } else {
            if (unanswerable.length && stableThread) unanswered.set(threadId, unanswerable);
            emit({ type: 'run-done', ...(usage ? { usage } : {}) });
        }
        return usage;
    };
    return async (opts) => {
        const track: Track = { suspended: false };
        try {
            return await runOnce(opts, track);
        } finally {
            // A thread minted for one turn is forgotten when the turn ends, however it ends —
            // done, failed or stopped — unless it paused, since only a resume reuses it.
            if (track.threadId && !stableThread && !track.suspended) states.delete(track.threadId);
            // A stream refused or cut mid-way: the steps it left open go out with it.
            track.closeSteps?.();
        }
    };
}
