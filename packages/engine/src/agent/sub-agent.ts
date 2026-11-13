/**
 * sub-agent.ts — a tool's sub-agent: a nested `runStreamAgent` whose events reach the host
 * as the sub-agent's.
 *
 * A tool opens one through the `run` it is handed. The nested loop is a run of its own, with
 * its own conversation, but its run-level events never leave it — a sub-agent does not start
 * or end the run — and everything else it emits carries its `agentId`. It is announced with
 * `agent-start` and closed with `agent-end`, once, whatever happens to it: an answer, a
 * failure (returned, never thrown, so the tool decides what the model reads), or a Stop or a
 * timeout of the call that opened it.
 *
 * Two ways to run one. `runSubAgent` holds the call until the sub-agent is back: the model
 * waits, and reads its answer as the call's result. `startSubAgent` starts it in the
 * background: the call answers at once, the model goes on, and the run tells it how the
 * sub-agent ended once the model has nothing more to say.
 */

import { runStreamAgent, type StreamRunOptions } from './stream-run.js';
import { relayApprovalResolver } from './approval-turn.js';
import type {
    StreamAgentHandle,
    StreamAgentStatus,
    StreamChatRequest,
    StreamRunEvent,
    StreamToolRun,
    StreamUsage,
} from './stream-events.js';

/**
 * Run a sub-agent from inside a tool handler: `run` is the handler's third argument, and
 * `signal` its second. `request` is the sub-agent's own conversation — the parent's is not
 * handed on. `transportCall`, `toolLookup`, `toolConfigLookup` and `maxTurns` default to the
 * run's; the tool timeout and the id generator are always the run's.
 *
 * The sub-agent can ask for a decision only where the run can wait for one (`run.canAsk`):
 * in a run that pauses instead (a server loop), its gated calls end with the cause
 * `no-resolver`. It never pauses itself.
 *
 * Resolves `{ status, text }`, `text` being what the sub-agent wrote last: `'done'`, or
 * `'failed'` with `error` (the model or a tool of its own failed), or `'stopped'`. Never
 * rejects for a sub-agent that failed; rejects with a `TypeError` when `run` is missing (a
 * handler called outside the loop has nothing to open a sub-agent from).
 */
export async function runSubAgent(
    run: StreamToolRun,
    opts: { name?: string; description?: string; detached?: boolean; request: StreamChatRequest }
        & Partial<Pick<StreamRunOptions, 'transportCall' | 'toolLookup' | 'toolConfigLookup' | 'maxTurns'>>,
    signal: AbortSignal,
): Promise<{ status: StreamAgentStatus; text: string; usage?: StreamUsage; error?: string }> {
    // A handler called outside a loop — a browser tool answering a paused server run — has
    // no run, and reading `startAgent` off `undefined` named nothing a reader could act on.
    if (!run || typeof run.startAgent !== 'function') {
        throw new TypeError(
            "runSubAgent() needs the run its tool was called in (the handler's third argument, or `context.run`), "
            + 'and this call has none: a handler run outside the agent loop cannot open a sub-agent.',
        );
    }
    if (signal.aborted) return { status: 'stopped', text: '' };

    const agent = run.startAgent({ name: opts.name, description: opts.description, detached: opts.detached });
    // The handle already ends with its call; this covers a signal of the tool's own.
    const onAbort = (): void => agent.end('stopped');
    signal.addEventListener('abort', onAbort, { once: true });
    try {
        return await drive(agent, run, opts, signal);
    } finally {
        signal.removeEventListener('abort', onAbort);
    }
}

/**
 * Start a sub-agent in the background, from inside a tool handler: `run` is the handler's
 * third argument. The handler answers at once (say what it started, so the model knows to
 * wait for it), and the model goes on writing and calling tools while the sub-agent works.
 * The run does not end before it is back: once the model has nothing more to say, the run
 * waits for every sub-agent still at work, tells the model how each ended in one message,
 * and asks it again.
 *
 * It gets a line of its own (it names no call), and it is stopped by a Stop of the run, by the
 * turn limit (the model cannot be asked again), by the tool time limit counted from its start,
 * and by a crash. Its gated calls ask like `runSubAgent`'s. Returns its id and its `signal`,
 * aborted when it must stop: what a `transportCall` of the caller's own listens to.
 *
 * Not in a run that can pause (`run.canBackground` is false: a server loop): it throws there,
 * since the run would end at the pause without what the sub-agent answered. Use `runSubAgent`.
 */
export function startSubAgent(
    run: StreamToolRun,
    opts: { name?: string; description?: string; request: StreamChatRequest }
        & Partial<Pick<StreamRunOptions, 'transportCall' | 'toolLookup' | 'toolConfigLookup' | 'maxTurns'>>,
): { agentId: string; signal: AbortSignal } {
    if (!run || typeof run.startAgent !== 'function') {
        throw new TypeError(
            "startSubAgent() needs the run its tool was called in (the handler's third argument, or `context.run`), "
            + 'and this call has none: a handler run outside the agent loop cannot start a sub-agent.',
        );
    }
    if (run.canBackground === false) {
        throw new TypeError(
            'startSubAgent() cannot run a sub-agent in the background of a run that can pause (a server loop): '
            + 'the run would end at the pause without what it answered. Use runSubAgent() there, which holds the call until it is back.',
        );
    }
    const agent = run.startAgent({ name: opts.name, description: opts.description, background: true });
    // Its first model call after this returns: a caller reads `signal` before the work starts.
    void Promise.resolve().then(() => drive(agent, run, opts, agent.signal));
    return { agentId: agent.agentId, signal: agent.signal };
}

/** The sub-agent's nested loop, from its start to its `agent-end`. Never rejects. */
async function drive(
    agent: StreamAgentHandle,
    run: StreamToolRun,
    opts: { name?: string; request: StreamChatRequest }
        & Partial<Pick<StreamRunOptions, 'transportCall' | 'toolLookup' | 'toolConfigLookup' | 'maxTurns'>>,
    signal: AbortSignal,
): Promise<{ status: StreamAgentStatus; text: string; usage?: StreamUsage; error?: string }> {

    // The text of the sub-agent's latest model call: its own events only, never those of a
    // sub-agent of its own, which arrive here already carrying their `agentId`.
    let text = '';
    const emitter = (event: StreamRunEvent): void => {
        if ((event as { agentId?: string }).agentId === undefined) {
            if (event.type === 'turn-start') text = '';
            else if (event.type === 'text-delta') text += event.delta;
        }
        agent.emit(event);
    };

    // The nested loop asks through the parent's resolver, saying whose call it is. A call
    // that already names an agent is a sub-agent's of this one: the innermost one asks.
    const parentResolver = run.canAsk ? run.approvalResolver : undefined;
    const self = { id: agent.agentId, ...(opts.name !== undefined ? { name: opts.name } : {}) };
    // Relayed, not wrapped: the run's place in line goes with it, so the nested loop waits for
    // it before it announces a call (see `approval-turn.ts`).
    const approvalResolver: StreamRunOptions['approvalResolver'] = parentResolver
        && relayApprovalResolver(parentResolver, (call) => (call.agent ? call : { ...call, agent: self }));

    try {
        const usage = await runStreamAgent({
            messageId: agent.agentId,
            baseRequest: opts.request,
            transportCall: opts.transportCall ?? run.transportCall,
            toolLookup: opts.toolLookup ?? run.toolLookup,
            toolConfigLookup: opts.toolConfigLookup ?? run.toolConfigLookup,
            // No `deferral`, ever: the nested loop lives inside one call, which must answer.
            approvalResolver,
            emitter,
            signal,
            maxTurns: opts.maxTurns ?? run.maxTurns,
            toolTimeoutMs: run.toolTimeoutMs,
            ...(run.parallelTools !== undefined ? { parallelTools: run.parallelTools } : {}),
            idGen: run.idGen,
        });
        if (signal.aborted) {
            agent.end('stopped');
            return { status: 'stopped', text };
        }
        agent.end('done', { result: text });
        return { status: 'done', text, ...(usage ? { usage } : {}) };
    } catch (error) {
        if (signal.aborted) {
            agent.end('stopped');
            return { status: 'stopped', text };
        }
        const message = error instanceof Error ? error.message || error.name : String(error);
        agent.end('failed', { error: message });
        return { status: 'failed', text, error: message };
    }
}
