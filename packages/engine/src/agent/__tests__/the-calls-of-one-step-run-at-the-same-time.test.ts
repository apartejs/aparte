/**
 * The tool calls of one model step whose tools say `parallel: true` run at the same time.
 *
 * Each such call starts the moment its `tool_use` arrives, and the model's stream goes on
 * being read while it runs. The step ends once every call of it is settled. What a host keeps
 * does not depend on which call finished first: the history lists the calls, and their
 * results, in the order the model made them. A person is asked about one call at a time, in
 * that order; a refusal lets the calls already running finish and runs none of the others.
 *
 * Every tool here says `parallel: true` (a tool that says nothing keeps its place: see
 * `a-tool-call-keeps-its-place-unless-its-tool-says-parallel`). `parallelTools: false` puts
 * the loop back to one call after another, whatever the tools say.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamAgentMessage, StreamChatEvent, StreamChatRequest, StreamRunEvent, StreamToolConfig, StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, indexOf, recorder, scripted, text, toolUse } from './sub-agent-script';

/** Every tool runs beside the others; `gated` asks first. */
const together = (name: string): StreamToolConfig => (name === 'gated' ? { needsApproval: true, parallel: true } : { parallel: true });

/** A promise the test settles by hand. */
function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

/** Lets the loop, its stream and its handlers move as far as they can without the test. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A handler that answers once the test says so, and says when it started. */
function heldTool() {
    const started = deferred();
    const release = deferred<string>();
    let running = false;
    let ended = false;
    const handler: StreamToolHandler = async () => {
        running = true;
        started.resolve();
        const content = await release.promise;
        running = false;
        ended = true;
        return { content };
    };
    return { handler, started: started.promise, release: release.resolve, isRunning: () => running, hasEnded: () => ended };
}

/** A handler that never answers on its own, and rejects when its signal fires. */
const hangs: StreamToolHandler = (_call, signal) => new Promise((_, reject) => {
    const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
});

function run(opts: Partial<StreamRunOptions> & Pick<StreamRunOptions, 'transportCall' | 'toolLookup'>) {
    const { events, emitter } = recorder();
    const history: StreamAgentMessage[] = [];
    const abort = new AbortController();
    const done = runStreamAgent({
        messageId: 'm1', baseRequest: ask('parent'), emitter, signal: abort.signal,
        onHistoryAppend: (m) => history.push(m),
        toolConfigLookup: together,
        ...opts,
    });
    return { done, events, history, abort };
}

const of = (events: StreamRunEvent[], type: StreamRunEvent['type'], id?: string) =>
    events.filter((e) => e.type === type && (id === undefined || (e as { toolCallId?: string }).toolCallId === id));
const ids = (history: StreamAgentMessage[]) => history.map((m) =>
    m.role === 'tool' ? `tool:${m.toolCallId}` : `${m.role}:${m.toolCalls?.map((c) => c.id).join(',') ?? ''}`);

describe('the calls of one step run at the same time', () => {
    it('starts the second call while the first one is still running', async () => {
        const a = heldTool();
        const b = heldTool();
        const { transportCall } = scripted({ parent: [[toolUse('a', 'a'), toolUse('b', 'b'), done], [text('Both.'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'a' ? a.handler : b.handler) });

        await a.started;
        await Promise.race([b.started, settle()]);
        // Both are at work, and neither has answered.
        expect(a.isRunning() && b.isRunning()).toBe(true);
        expect(of(r.events, 'tool-resolved')).toHaveLength(0);

        b.release('B');
        a.release('A');
        await r.done;
        expect(of(r.events, 'tool-resolved').map((e) => (e as { toolCallId: string }).toolCallId)).toEqual(['b', 'a']);
        expect(r.events.at(-1)?.type).toBe('run-done');
    });

    it('keeps the history in call order when the second call finishes first', async () => {
        const a = heldTool();
        const b = heldTool();
        const { transportCall, requests } = scripted({ parent: [[text('Looking.'), toolUse('a', 'a'), toolUse('b', 'b'), done], [text('Both.'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'a' ? a.handler : b.handler) });

        await a.started;
        await b.started;
        b.release('B');
        await settle();
        a.release('A');
        await r.done;

        expect(ids(r.history)).toEqual(['assistant:a,b', 'tool:a', 'tool:b']);
        expect(r.history[0]).toMatchObject({ content: 'Looking.' });
        expect(r.history.slice(1).map((m) => m.content)).toEqual(['A', 'B']);
        // What the model reads next is that same history.
        expect(ids(requests[1]!.messages.slice(1))).toEqual(['assistant:a,b', 'tool:a', 'tool:b']);
    });

    it('reads the rest of the stream while a call runs', async () => {
        const a = heldTool();
        const b = heldTool();
        const { transportCall } = scripted({ parent: [[toolUse('a', 'a'), text('and also '), toolUse('b', 'b'), done], [text('Both.'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'a' ? a.handler : b.handler) });

        await a.started;
        await Promise.race([b.started, settle()]);
        await settle();
        // `a` has not answered, and what came after it has already been read.
        expect(of(r.events, 'text-delta').map((e) => (e as { delta: string }).delta)).toContain('and also ');
        expect(of(r.events, 'tool-start', 'b')).toHaveLength(1);
        expect(a.hasEnded()).toBe(false);

        a.release('A');
        b.release('B');
        await r.done;
        expect(r.events.at(-1)?.type).toBe('run-done');
    });

    it('asks about one call at a time, in call order, while a call made before them that needs no approval runs', async () => {
        const free = heldTool();
        const asked: string[] = [];
        const decisions: Record<string, ReturnType<typeof deferred<{ approved: boolean }>>> = {
            g1: deferred(), g2: deferred(),
        };
        // `f` first: a call made AFTER a waiting one waits for its answer (see
        // `a-call-waiting-for-a-person-holds-the-calls-after-it`).
        const { transportCall } = scripted({ parent: [[toolUse('f', 'free'), toolUse('g1', 'gated'), toolUse('g2', 'gated'), done], [text('Done.'), done]] });
        const r = run({
            transportCall,
            toolLookup: (n) => (n === 'free' ? free.handler : async (c) => ({ content: `ran ${c.id}` })),
            approvalResolver: (call) => { asked.push(call.id); return decisions[call.id]!.promise; },
        });

        await free.started;
        await settle();
        expect(asked).toEqual(['g1']);
        expect(of(r.events, 'tool-awaiting-approval').map((e) => (e as { toolCallId: string }).toolCallId)).toEqual(['g1']);

        // The call that needs nobody answers while the first question is still open.
        free.release('F');
        await settle();
        expect(of(r.events, 'tool-resolved', 'f')).toHaveLength(1);
        expect(asked).toEqual(['g1']);

        decisions['g1']!.resolve({ approved: true });
        await settle();
        expect(asked).toEqual(['g1', 'g2']);
        const awaiting = of(r.events, 'tool-awaiting-approval', 'g2')[0]!;
        expect(r.events.indexOf(awaiting)).toBeGreaterThan(r.events.indexOf(of(r.events, 'tool-approved', 'g1')[0]!));

        decisions['g2']!.resolve({ approved: true });
        await r.done;
        expect(ids(r.history)).toEqual(['assistant:f,g1,g2', 'tool:f', 'tool:g1', 'tool:g2']);
    });

    it('lets the calls already running finish after a refusal, and runs none of the others', async () => {
        const slow = heldTool();
        const asked: string[] = [];
        const { transportCall, requests } = scripted({ parent: [[toolUse('s', 'slow'), toolUse('g1', 'gated'), toolUse('g2', 'gated'), done], [text('Understood.'), done]] });
        const gatedRuns: string[] = [];
        const refusal = deferred<{ approved: boolean }>();
        const r = run({
            transportCall,
            toolLookup: (n) => (n === 'slow' ? slow.handler : async (c) => { gatedRuns.push(c.id); return { content: 'ran' }; }),
            approvalResolver: (call) => { asked.push(call.id); return refusal.promise; },
        });

        await slow.started;
        await settle();
        // Read, and held behind `g1`'s question: its row says it waits.
        expect(of(r.events, 'tool-start', 'g1')).toHaveLength(1);
        expect(of(r.events, 'tool-start', 'g2')[0]).toMatchObject({ queued: true });
        refusal.resolve({ approved: false });
        await settle();
        // `g1` was refused; `g2` was waiting its turn to be asked, so nobody is asked about it.
        expect(asked).toEqual(['g1']);
        expect(of(r.events, 'tool-rejected', 'g1')[0]).toMatchObject({ by: 'person' });
        expect(of(r.events, 'tool-rejected', 'g2')[0]).toMatchObject({ by: 'earlier-refusal' });
        expect(slow.isRunning()).toBe(true);

        slow.release('S');
        await r.done;
        expect(gatedRuns).toEqual([]);
        expect(of(r.events, 'tool-resolved', 's')).toHaveLength(1);
        expect(ids(r.history)).toEqual(['assistant:s,g1,g2', 'tool:s', 'tool:g1', 'tool:g2']);
        expect(r.history[3]!.content).toBe('Not run: an earlier call of the same step was refused.');
        // The model takes its turn and reads the refusal.
        expect(requests).toHaveLength(2);
    });

    it('aborts every running call on a Stop', async () => {
        const started: string[] = [];
        const tracked: StreamToolHandler = (call, signal, runCtx) => { started.push(call.id); return hangs(call, signal, runCtx); };
        const { transportCall } = scripted({ parent: [[toolUse('a', 'x'), toolUse('b', 'x'), done]] });
        const r = run({ transportCall, toolLookup: () => tracked });

        await settle();
        expect(started).toEqual(['a', 'b']);
        r.abort.abort();
        await r.done;

        expect(of(r.events, 'tool-aborted').map((e) => [(e as { toolCallId: string }).toolCallId, (e as { cause?: string }).cause]))
            .toEqual([['a', 'stopped'], ['b', 'stopped']]);
        expect(r.events.slice(-2).map((e) => e.type)).toEqual(['run-aborted', 'run-done']);
        expect(r.history).toEqual([]);
    });

    it('ends a call still waiting its turn to be asked when a Stop lands, and nobody is asked about it', async () => {
        const asked: string[] = [];
        // A tool that asks the person itself, through its run: the question it holds open is
        // not a gate of the step, so `g` starts, and waits its turn to be asked.
        const asksItself: StreamToolHandler = async (_call, signal, runCtx) => {
            const decision = await runCtx!.approvalResolver!({ id: 'own', name: 'charge_card', input: {} }, signal);
            return { content: decision.approved ? 'charged' : 'not charged' };
        };
        const { transportCall } = scripted({ parent: [[toolUse('t', 'asks'), toolUse('g', 'gated'), done]] });
        const r = run({
            transportCall,
            toolLookup: (n) => (n === 'asks' ? asksItself : async () => ({ content: 'ran' })),
            // As core's own channel does: a Stop answers the open question with a no.
            approvalResolver: (call, signal) => {
                asked.push(call.id);
                return new Promise((resolve) => signal.addEventListener('abort', () => resolve({ approved: false }), { once: true }));
            },
        });

        await settle();
        expect(asked).toEqual(['own']);
        expect(of(r.events, 'tool-start', 'g')).toHaveLength(1);
        r.abort.abort();
        await r.done;

        // `g` was next in line: once the tool gives its turn back, the Stop is what it finds.
        expect(asked).toEqual(['own']);
        expect(of(r.events, 'tool-awaiting-approval')).toHaveLength(0);
        // Both end stopped, the running tool and the call that waited its turn behind it.
        expect(of(r.events, 'tool-aborted').map((e) => `${(e as { toolCallId: string }).toolCallId}:${(e as { cause?: string }).cause}`).sort())
            .toEqual(['g:stopped', 't:stopped']);
        expect(of(r.events, 'tool-rejected')).toHaveLength(0);
        expect(r.events.slice(-2).map((e) => e.type)).toEqual(['run-aborted', 'run-done']);
        expect(r.history).toEqual([]);
    });

    it('stops reading the reply the moment a call is refused, without waiting for the model to write again', async () => {
        const refusal = deferred<{ approved: boolean }>();
        // After its call the model goes quiet, and what it would say next never comes.
        let goesAway!: (error: Error) => void;
        const quiet = new Promise<never>((_, reject) => { goesAway = reject; });
        const requests: StreamChatRequest[] = [];
        const transportCall = async (request: StreamChatRequest): Promise<AsyncIterable<StreamChatEvent>> => {
            requests.push(request);
            if (requests.length > 1) return (async function* () { yield text('Understood.'); yield done; })();
            return (async function* () {
                yield toolUse('g', 'gated');
                await quiet;
                yield toolUse('late', 'gated');
            })();
        };
        const r = run({
            transportCall,
            toolLookup: () => async () => ({ content: 'ran' }),
            toolConfigLookup: () => ({ needsApproval: true }),
            approvalResolver: () => refusal.promise,
        });

        await settle();
        refusal.resolve({ approved: false });
        // Waiting on the model's next word, the run would never end.
        await r.done;

        expect(of(r.events, 'tool-rejected', 'g')).toHaveLength(1);
        expect(ids(r.history)).toEqual(['assistant:g', 'tool:g']);
        // The model is asked again at once, and reads the refusal.
        expect(requests).toHaveLength(2);
        expect(ids(requests[1]!.messages.slice(1))).toEqual(['assistant:g', 'tool:g']);
        expect(r.events.at(-1)?.type).toBe('run-done');

        // The read nobody waits for any more fails afterwards: nothing of it reaches the run.
        const seen = r.events.length;
        goesAway(new Error('connection reset'));
        await settle();
        expect(r.events).toHaveLength(seen);
    });

    it('stops the calls already running when another call of the step stops the run', async () => {
        const { transportCall, requests } = scripted({ parent: [[toolUse('a', 'x'), toolUse('b', 'missing'), toolUse('c', 'x'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'x' ? hangs : undefined) });
        await r.done;

        expect(of(r.events, 'tool-aborted').map((e) => [(e as { toolCallId: string }).toolCallId, (e as { cause?: string }).cause]))
            .toEqual([['b', 'no-handler'], ['a', 'stopped']]);
        // What came after the stop was never read.
        expect(of(r.events, 'tool-start', 'c')).toHaveLength(0);
        expect(requests).toHaveLength(1);
        expect(r.events.at(-1)?.type).toBe('run-done');
        expect(of(r.events, 'run-aborted')).toHaveLength(0);
    });

    it('stops the calls still running when one crashes, then fails on the crash', async () => {
        const crash: StreamToolHandler = async () => { await settle(); throw new Error('disk on fire'); };
        const { transportCall } = scripted({ parent: [[toolUse('a', 'x'), toolUse('b', 'crash'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'x' ? hangs : crash) });

        await expect(r.done).rejects.toThrow('disk on fire');
        expect(r.events.filter((e) => e.type === 'tool-failed' || e.type === 'tool-aborted').map((e) => `${e.type}:${(e as { toolCallId: string }).toolCallId}`))
            .toEqual(['tool-failed:b', 'tool-aborted:a']);
    });

    it('stops the calls still running when the provider fails mid-reply, then fails on it', async () => {
        const { transportCall } = scripted({ parent: [[toolUse('a', 'x'), { wait: 5 }, { type: 'error', message: 'upstream exploded' }]] });
        const r = run({ transportCall, toolLookup: () => hangs });

        await expect(r.done).rejects.toThrow('upstream exploded');
        expect(of(r.events, 'tool-aborted', 'a')).toHaveLength(1);
    });
});

describe('the questions of sub-agents running at the same time', () => {
    it('are asked one at a time too', async () => {
        const delegate: StreamToolHandler = async (call, signal, runCtx) => {
            const model = (call.input as { model: string }).model;
            const out = await runSubAgent(runCtx!, { name: model, request: ask(model) }, signal);
            return { content: out.text };
        };
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate', { model: 'a' }), toolUse('c2', 'delegate', { model: 'b' }), done], [text('Merged.'), done]],
            a: [[toolUse('xa', 'gated'), done], [text('a done'), done]],
            b: [[toolUse('xb', 'gated'), done], [text('b done'), done]],
        });
        const open: Array<{ id: string; answer: (d: { approved: boolean }) => void }> = [];
        const r = run({
            transportCall,
            toolLookup: (n) => (n === 'delegate' ? delegate : async () => ({ content: 'ran' })),
            approvalResolver: (call) => new Promise((resolve) => { open.push({ id: call.id, answer: resolve }); }),
        });

        await settle();
        expect(open.map((q) => q.id)).toEqual(['xa']);
        open[0]!.answer({ approved: true });
        await settle();
        expect(open.map((q) => q.id)).toEqual(['xa', 'xb']);
        open[1]!.answer({ approved: true });
        await r.done;
        expect(r.history.slice(1).map((m) => m.content)).toEqual(['a done', 'b done']);
    });
});

describe('a question a tool asks through its run', () => {
    /** A tool that asks the person itself, through its run, before it charges anything. */
    const charges: StreamToolHandler = async (_call, signal, runCtx) => {
        try {
            const decision = await runCtx!.approvalResolver!({ id: 'charge', name: 'charge_card', input: { amount: 5 } }, signal);
            return { content: decision.approved ? 'charged' : 'not charged' };
        } catch {
            return { content: 'could not ask' };
        }
    };
    const lookups = {
        toolLookup: (n: string): StreamToolHandler => (n === 'charges' ? charges : async () => ({ content: 'ran' })),
        toolConfigLookup: together,
    };

    it('waits for the question already open, and is asked once it is answered', async () => {
        const asked: string[] = [];
        const decisions: Record<string, ReturnType<typeof deferred<{ approved: boolean }>>> = { g: deferred(), charge: deferred() };
        const { transportCall } = scripted({ parent: [[toolUse('g', 'gated'), toolUse('t', 'charges'), done], [text('Done.'), done]] });
        const r = run({
            transportCall, ...lookups,
            approvalResolver: (call) => { asked.push(call.id); return decisions[call.id]!.promise; },
        });

        await settle();
        expect(asked).toEqual(['g']);
        decisions['g']!.resolve({ approved: true });
        await settle();
        expect(asked).toEqual(['g', 'charge']);
        decisions['charge']!.resolve({ approved: true });
        await r.done;
        expect(r.history.slice(1).map((m) => m.content)).toEqual(['ran', 'charged']);
    });

    it('gives its turn back when the asking fails, so the next question is still asked', async () => {
        const asked: string[] = [];
        const { transportCall } = scripted({ parent: [[toolUse('t', 'charges'), toolUse('g', 'gated'), done], [text('Done.'), done]] });
        const r = run({
            transportCall, ...lookups,
            approvalResolver: async (call) => {
                asked.push(call.id);
                if (call.id === 'charge') throw new Error('the channel closed');
                return { approved: true };
            },
        });

        await r.done;
        expect(asked).toEqual(['charge', 'g']);
        expect(r.history.slice(1).map((m) => m.content)).toEqual(['could not ask', 'ran']);
        expect(r.events.at(-1)?.type).toBe('run-done');
    });
});

describe('a paused call does not stop the calls already running', () => {
    const lookups = (read: StreamToolHandler) => ({
        toolLookup: (n: string) => (n === 'read_file' ? read : n === 'delete_file' ? (async () => ({ content: 'deleted' })) : undefined),
        toolConfigLookup: (n: string): StreamToolConfig => (n === 'delete_file' ? { needsApproval: true, parallel: true } : n === 'ask_user' ? { external: true, parallel: true } : { parallel: true }),
    });

    it('suspends once every call is settled or paused, with every paused call listed, and resumes', async () => {
        const read = heldTool();
        const { transportCall } = scripted({ parent: [[toolUse('r', 'read_file'), toolUse('d', 'delete_file'), toolUse('q', 'ask_user'), done]] });
        const first = run({ transportCall, ...lookups(read.handler), deferral: {} });

        await read.started;
        await settle();
        // Paused calls do not end the run while `read_file` still works.
        expect(of(first.events, 'run-suspended')).toHaveLength(0);
        read.release('file body');
        await first.done;

        const suspended = first.events.at(-1) as Extract<StreamRunEvent, { type: 'run-suspended' }>;
        expect(suspended.type).toBe('run-suspended');
        expect(suspended.pending.map((p) => [p.toolCallId, p.reason])).toEqual([['d', 'approval'], ['q', 'external']]);
        expect(of(first.events, 'tool-resolved', 'r')).toHaveLength(1);
        expect(ids(first.history)).toEqual(['assistant:r,d,q', 'tool:r']);

        // The resume answers what was left, and the model goes on.
        const again = scripted({ parent: [[text('All done.'), done]] });
        const second = runStreamAgent({
            messageId: 'm1',
            baseRequest: { modelId: 'parent', messages: [...ask('parent').messages, ...first.history] },
            transportCall: again.transportCall, ...lookups(read.handler),
            emitter: () => {}, signal: new AbortController().signal,
            deferral: { outcomes: { d: { kind: 'decision', approved: true }, q: { kind: 'result', content: 'yes' } } },
        });
        await second;
        expect(ids(again.requests[0]!.messages.slice(1))).toEqual(['assistant:r,d,q', 'tool:r', 'tool:d', 'tool:q']);
    });
});

describe('sub-agents of two calls of one step', () => {
    it('run at the same time, each under its own id, and each ends before its own call', async () => {
        const delegate: StreamToolHandler = async (call, signal, runCtx) => {
            const model = (call.input as { model: string }).model;
            const out = await runSubAgent(runCtx!, { name: model, request: ask(model) }, signal);
            return { content: out.text };
        };
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate', { model: 'a' }), toolUse('c2', 'delegate', { model: 'b' }), done], [text('Merged.'), done]],
            a: [[text('a1'), { wait: 5 }, text('a2'), { wait: 5 }, text('a3'), done]],
            b: [[{ wait: 2 }, text('b1'), { wait: 5 }, text('b2'), { wait: 5 }, text('b3'), done]],
        });
        const r = run({ transportCall, toolLookup: () => delegate });
        await r.done;

        const starts = r.events.filter((e): e is Extract<StreamRunEvent, { type: 'agent-start' }> => e.type === 'agent-start');
        expect(starts.map((s) => [s.name, s.toolCallId])).toEqual([['a', 'c1'], ['b', 'c2']]);
        const idOf = Object.fromEntries(starts.map((s) => [s.name!, s.agentId]));
        expect(idOf['a']).not.toBe(idOf['b']);

        const deltas = r.events.filter((e): e is Extract<StreamRunEvent, { type: 'text-delta' }> => e.type === 'text-delta' && agentIdOf(e) !== undefined);
        for (const d of deltas) expect(agentIdOf(d), d.delta).toBe(idOf[d.delta[0]!]);
        const order = deltas.map((d) => d.delta);
        expect(order.indexOf('b1')).toBeGreaterThan(order.indexOf('a1'));
        expect(order.indexOf('b1')).toBeLessThan(order.indexOf('a3'));

        for (const [name, callId] of [['a', 'c1'], ['b', 'c2']] as const) {
            const end = indexOf(r.events, (e) => e.type === 'agent-end' && e.agentId === idOf[name]);
            const resolved = indexOf(r.events, (e) => e.type === 'tool-resolved' && e.toolCallId === callId);
            expect(end).toBeGreaterThan(-1);
            expect(end).toBeLessThan(resolved);
        }
        expect(ids(r.history)).toEqual(['assistant:c1,c2', 'tool:c1', 'tool:c2']);
        expect(r.history.slice(1).map((m) => m.content)).toEqual(['a1a2a3', 'b1b2b3']);
    });
});

describe('parallelTools: false', () => {
    it('runs the calls of one step one after another, with the events in that order, though their tools say parallel', async () => {
        const after = (ms: number, content: string): StreamToolHandler => async () => {
            await new Promise((r) => setTimeout(r, ms));
            return { content };
        };
        const step: StreamChatEvent[] = [toolUse('a', 'slow'), toolUse('b', 'fast'), done];
        const { transportCall } = scripted({ parent: [step, [text('Both.'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'slow' ? after(10, 'A') : after(0, 'B')), parallelTools: false });
        await r.done;

        expect(r.events.map((e) => `${e.type}${(e as { toolCallId?: string }).toolCallId ? `:${(e as { toolCallId: string }).toolCallId}` : ''}`)).toEqual([
            'run-start', 'turn-start',
            'tool-start:a', 'tool-resolved:a',
            'tool-start:b', 'tool-resolved:b',
            'text-flush',
            'turn-start', 'text-delta', 'text-flush',
            'run-done',
        ]);
        expect(ids(r.history)).toEqual(['assistant:a,b', 'tool:a', 'tool:b']);
    });

    it('is not what the loop does by default for tools that say parallel: the faster call answers first', async () => {
        const after = (ms: number, content: string): StreamToolHandler => async () => {
            await new Promise((r) => setTimeout(r, ms));
            return { content };
        };
        const { transportCall } = scripted({ parent: [[toolUse('a', 'slow'), toolUse('b', 'fast'), done], [text('Both.'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'slow' ? after(10, 'A') : after(0, 'B')) });
        await r.done;

        expect(r.events.slice(0, 7).map((e) => `${e.type}${(e as { toolCallId?: string }).toolCallId ? `:${(e as { toolCallId: string }).toolCallId}` : ''}`)).toEqual([
            'run-start', 'turn-start',
            'tool-start:a', 'tool-start:b',
            'tool-resolved:b', 'tool-resolved:a',
            'text-flush',
        ]);
        expect(ids(r.history)).toEqual(['assistant:a,b', 'tool:a', 'tool:b']);
    });
});
