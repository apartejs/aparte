/**
 * A call waiting for a person holds the calls made after it in the same step.
 *
 * While a call is put to someone (or to the approval policy) and has no answer yet, the calls
 * made after it in the step do not start; the calls made before it go on running. An approval
 * lets them start; a refusal skips them all, as not run after an earlier refusal. So nothing the
 * model asked for after a call overtakes it while it waits — issue #202: `edit_file` is put to
 * the person, `run_command` is allowed, and the command must not run on the file as it was.
 *
 * Every order here is driven by promises the test settles by hand, never by a clock.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run';
import type { StreamAgentMessage, StreamRunEvent, StreamToolConfig, StreamToolHandler } from '../stream-events';
import { ask, done, recorder, scripted, text, toolUse } from './sub-agent-script';

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

/** Handlers keyed by call id, each answering once the test releases it; and what started. */
function heldCalls() {
    const started: string[] = [];
    const running = new Set<string>();
    const releases = new Map<string, (content: string) => void>();
    const handler: StreamToolHandler = async (call) => {
        started.push(call.id);
        running.add(call.id);
        const content = await new Promise<string>((resolve) => { releases.set(call.id, resolve); });
        running.delete(call.id);
        return { content };
    };
    const release = async (id: string) => {
        releases.get(id)!(id.toUpperCase());
        await settle();
    };
    return { handler, started, running, release };
}

function run(opts: Partial<StreamRunOptions> & Pick<StreamRunOptions, 'transportCall' | 'toolLookup'>) {
    const { events, emitter } = recorder();
    const history: StreamAgentMessage[] = [];
    const abort = new AbortController();
    const finished = runStreamAgent({
        messageId: 'm1', baseRequest: ask('parent'), emitter, signal: abort.signal,
        onHistoryAppend: (m) => history.push(m),
        ...opts,
    });
    return { done: finished, events, history, abort };
}

const of = (events: StreamRunEvent[], type: StreamRunEvent['type'], id?: string) =>
    events.filter((e) => e.type === type && (id === undefined || (e as { toolCallId?: string }).toolCallId === id));
const ids = (history: StreamAgentMessage[]) => history.map((m) =>
    m.role === 'tool' ? `tool:${m.toolCallId}` : `${m.role}:${m.toolCalls?.map((c) => c.id).join(',') ?? ''}`);

/** The issue's step: the edit is put to the person, the command is allowed. */
const editThenCommand = [toolUse('e', 'edit_file', { path: 'a.ts' }), toolUse('c', 'run_command', { cmd: 'npm test' }), done];

describe('a call waiting for a person (#202)', () => {
    it('runs the command only once the person has answered about the edit, and after the edit', async () => {
        const held = heldCalls();
        const decision = deferred<{ approved: boolean }>();
        const { transportCall } = scripted({ parent: [editThenCommand, [text('Tests pass.'), done]] });
        const r = run({
            transportCall, toolLookup: () => held.handler,
            toolConfigLookup: (n) => (n === 'edit_file' ? { needsApproval: true } : undefined),
            approvalResolver: () => decision.promise,
        });

        await settle();
        expect(of(r.events, 'tool-awaiting-approval', 'e')).toHaveLength(1);
        expect(held.started).toEqual([]);
        // Both rows are there, where the model wrote them; the command's says it waits.
        expect(of(r.events, 'tool-start').map((e) => [(e as { toolCallId: string }).toolCallId, (e as { queued?: true }).queued])).toEqual([['e', undefined], ['c', true]]);
        expect(of(r.events, 'tool-running')).toHaveLength(0);

        decision.resolve({ approved: true });
        await settle();
        // The edit runs; the command still waits for it, its tool saying nothing.
        expect(held.started).toEqual(['e']);
        expect(of(r.events, 'tool-running')).toHaveLength(0);
        await held.release('e');
        expect(held.started).toEqual(['e', 'c']);
        expect(r.events.indexOf(of(r.events, 'tool-running', 'c')[0]!)).toBeGreaterThan(r.events.indexOf(of(r.events, 'tool-resolved', 'e')[0]!));
        await held.release('c');
        await r.done;
        expect(ids(r.history)).toEqual(['assistant:e,c', 'tool:e', 'tool:c']);
    });

    it('shows what the model wrote after both calls after both rows, while the command waits', async () => {
        const held = heldCalls();
        const decision = deferred<{ approved: boolean }>();
        const { transportCall } = scripted({ parent: [[...editThenCommand.slice(0, 2), text('Running the tests next.'), done], [text('Tests pass.'), done]] });
        const r = run({
            transportCall, toolLookup: () => held.handler,
            toolConfigLookup: (n) => (n === 'edit_file' ? { needsApproval: true } : undefined),
            approvalResolver: () => decision.promise,
        });

        await settle();
        // The reply is read on while the command waits: its text is there, after both rows.
        const said = r.events.findIndex((e) => e.type === 'text-delta' && e.delta === 'Running the tests next.');
        expect(said).toBeGreaterThan(r.events.indexOf(of(r.events, 'tool-start', 'c')[0]!));
        expect(of(r.events, 'tool-running')).toHaveLength(0);
        decision.resolve({ approved: true });
        await settle();
        await held.release('e');
        await held.release('c');
        await r.done;
        expect(r.history[0]).toMatchObject({ content: 'Running the tests next.' });
    });

    it('skips the command when the edit is refused, as not run after an earlier refusal', async () => {
        const held = heldCalls();
        const decision = deferred<{ approved: boolean }>();
        const { transportCall, requests } = scripted({ parent: [editThenCommand, [text('Understood.'), done]] });
        const r = run({
            transportCall, toolLookup: () => held.handler,
            toolConfigLookup: (n) => (n === 'edit_file' ? { needsApproval: true } : undefined),
            approvalResolver: () => decision.promise,
        });

        await settle();
        decision.resolve({ approved: false });
        await r.done;

        expect(held.started).toEqual([]);
        expect(of(r.events, 'tool-rejected', 'e')[0]).toMatchObject({ by: 'person' });
        expect(of(r.events, 'tool-rejected', 'c')[0]).toMatchObject({ by: 'earlier-refusal' });
        expect(ids(r.history)).toEqual(['assistant:e,c', 'tool:e', 'tool:c']);
        expect(r.history[2]!.content).toBe('Not run: an earlier call of the same step was refused.');
        expect(requests).toHaveLength(2);
    });

    it('holds the command even when both tools say parallel: true, then runs it beside the approved edit', async () => {
        const held = heldCalls();
        const decision = deferred<{ approved: boolean }>();
        const { transportCall } = scripted({ parent: [editThenCommand, [text('Tests pass.'), done]] });
        const r = run({
            transportCall, toolLookup: () => held.handler,
            toolConfigLookup: (n): StreamToolConfig => (n === 'edit_file' ? { needsApproval: true, parallel: true } : { parallel: true }),
            approvalResolver: () => decision.promise,
        });

        await settle();
        expect(held.started).toEqual([]);
        decision.resolve({ approved: true });
        await settle();
        // Answered: nothing holds the command any more, and it runs beside the edit.
        expect([...held.running].sort()).toEqual(['c', 'e']);
        const approved = r.events.indexOf(of(r.events, 'tool-approved', 'e')[0]!);
        expect(of(r.events, 'tool-start', 'c')[0]).toMatchObject({ queued: true });
        expect(r.events.indexOf(of(r.events, 'tool-running', 'c')[0]!)).toBeGreaterThan(approved);
        await held.release('c');
        await held.release('e');
        await r.done;
        expect(ids(r.history)).toEqual(['assistant:e,c', 'tool:e', 'tool:c']);
    });
});

describe('the calls around a call waiting for a person', () => {
    const parallel = (n: string): StreamToolConfig => (n === 'gated' ? { needsApproval: true, parallel: true } : { parallel: true });

    it('lets the calls made before it run, and holds those made after it', async () => {
        const held = heldCalls();
        const decision = deferred<{ approved: boolean }>();
        const { transportCall } = scripted({ parent: [[toolUse('r', 'read'), toolUse('g', 'gated'), toolUse('f', 'read'), done], [text('Done.'), done]] });
        const r = run({ transportCall, toolLookup: () => held.handler, toolConfigLookup: parallel, approvalResolver: () => decision.promise });

        await settle();
        expect(held.started).toEqual(['r']);
        expect(of(r.events, 'tool-awaiting-approval', 'g')).toHaveLength(1);
        await held.release('r');
        expect(held.started).toEqual(['r']);
        decision.resolve({ approved: true });
        await settle();
        expect([...held.running].sort()).toEqual(['f', 'g']);
        await held.release('g');
        await held.release('f');
        await r.done;
        expect(ids(r.history)).toEqual(['assistant:r,g,f', 'tool:r', 'tool:g', 'tool:f']);
    });

    it('holds and skips the calls after one the policy refuses without asking', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[toolUse('g', 'write'), toolUse('f', 'read'), done], [text('Read-only, then.'), done]] });
        const r = run({
            transportCall, toolLookup: () => held.handler,
            toolConfigLookup: (n): StreamToolConfig => (n === 'write' ? { needsApproval: () => 'deny', parallel: true } : { parallel: true }),
            approvalResolver: async () => { await settle(); return { approved: false, reason: 'Read-only mode.', by: 'policy' }; },
        });
        await r.done;

        expect(held.started).toEqual([]);
        expect(of(r.events, 'tool-awaiting-approval')).toHaveLength(0);
        expect(of(r.events, 'tool-rejected', 'g')[0]).toMatchObject({ by: 'policy', reason: 'Read-only mode.' });
        expect(of(r.events, 'tool-rejected', 'f')[0]).toMatchObject({ by: 'earlier-refusal' });
    });

    it('ends the calls a Stop finds held as stopped, and asks nobody about them', async () => {
        const asked: string[] = [];
        const ran: string[] = [];
        const { transportCall } = scripted({ parent: [[toolUse('g1', 'gated'), toolUse('g2', 'gated'), toolUse('f', 'read'), done]] });
        const r = run({
            transportCall,
            toolLookup: () => async (call) => { ran.push(call.id); return { content: 'ran' }; },
            toolConfigLookup: parallel,
            // As core's own channel does: a Stop answers the open question with a no.
            approvalResolver: (call, signal) => {
                asked.push(call.id);
                return new Promise((resolve) => signal.addEventListener('abort', () => resolve({ approved: false }), { once: true }));
            },
        });

        await settle();
        expect(asked).toEqual(['g1']);
        r.abort.abort();
        await r.done;

        expect(asked).toEqual(['g1']);
        expect(ran).toEqual([]);
        expect(of(r.events, 'tool-start').map((e) => [(e as { toolCallId: string }).toolCallId, (e as { queued?: true }).queued])).toEqual([['g1', undefined], ['g2', true], ['f', true]]);
        expect(of(r.events, 'tool-running')).toHaveLength(0);
        // Each row has its end, in call order.
        expect(of(r.events, 'tool-aborted').map((e) => [(e as { toolCallId: string }).toolCallId, (e as { cause?: string }).cause]))
            .toEqual([['g1', 'stopped'], ['g2', 'stopped'], ['f', 'stopped']]);
        expect(r.events.slice(-2).map((e) => e.type)).toEqual(['run-aborted', 'run-done']);
        expect(r.history).toEqual([]);
    });
});

describe('a call that pauses the run (deferral)', () => {
    it('queues the calls after it with the pause, and the resume runs them in call order', async () => {
        const held = heldCalls();
        const ranOnResume: string[] = [];
        const { transportCall } = scripted({ parent: [[toolUse('w1', 'edit_file'), toolUse('d', 'delete_file'), toolUse('w2', 'run_command'), done]] });
        const config = (n: string): StreamToolConfig | undefined => (n === 'delete_file' ? { needsApproval: true } : undefined);
        const first = run({ transportCall, toolLookup: () => held.handler, toolConfigLookup: config, deferral: {} });

        await settle();
        // `delete_file` keeps its place: it waits for the edit before it pauses anything.
        expect(held.started).toEqual(['w1']);
        expect(of(first.events, 'tool-awaiting-approval')).toHaveLength(0);
        await held.release('w1');
        await first.done;

        const suspended = first.events.at(-1) as Extract<StreamRunEvent, { type: 'run-suspended' }>;
        expect(suspended.type).toBe('run-suspended');
        expect(suspended.pending.map((p) => [p.toolCallId, p.reason])).toEqual([['d', 'approval'], ['w2', 'queued']]);
        expect(held.started).toEqual(['w1']);
        expect(ids(first.history)).toEqual(['assistant:w1,d,w2', 'tool:w1']);

        const again = scripted({ parent: [[text('All done.'), done]] });
        await runStreamAgent({
            messageId: 'm1',
            baseRequest: { modelId: 'parent', messages: [...ask('parent').messages, ...first.history] },
            transportCall: again.transportCall,
            toolLookup: () => async (call) => { ranOnResume.push(call.id); return { content: `ran ${call.id}` }; },
            toolConfigLookup: config,
            emitter: () => {}, signal: new AbortController().signal,
            deferral: { outcomes: { d: { kind: 'decision', approved: true } } },
        });
        expect(ranOnResume).toEqual(['d', 'w2']);
        expect(ids(again.requests[0]!.messages.slice(1))).toEqual(['assistant:w1,d,w2', 'tool:w1', 'tool:d', 'tool:w2']);
    });

    it('lets a parallel call made before it finish, and runs nothing made after it', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[toolUse('r', 'read_file'), toolUse('d', 'delete_file'), toolUse('f', 'read_file'), done]] });
        const first = run({
            transportCall, toolLookup: () => held.handler, deferral: {},
            toolConfigLookup: (n): StreamToolConfig => (n === 'delete_file' ? { needsApproval: true, parallel: true } : { parallel: true }),
        });

        await settle();
        expect(held.started).toEqual(['r']);
        expect(of(first.events, 'run-suspended')).toHaveLength(0);
        await held.release('r');
        await first.done;

        const suspended = first.events.at(-1) as Extract<StreamRunEvent, { type: 'run-suspended' }>;
        expect(suspended.pending.map((p) => [p.toolCallId, p.reason])).toEqual([['d', 'approval'], ['f', 'queued']]);
        expect(held.started).toEqual(['r']);
    });
});
