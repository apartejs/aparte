/**
 * A tool call keeps its place in its step unless its tool says `parallel: true`.
 *
 * A call of a tool that says nothing starts once every call made before it in the same step
 * has settled, and the calls made after it start once it has: the order every tool had until
 * 1.7.0. Calls of tools that say `parallel: true` run together, between the calls that keep
 * their place — the rule coding agents follow: reads together, writes and commands one at a
 * time. `parallelTools: false` runs every call one after another, whatever its tool says.
 *
 * Every order here is driven by promises the test settles by hand, never by a clock.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamAgentMessage, StreamRunEvent, StreamToolConfig, StreamToolHandler } from '../stream-events';
import { ask, done, recorder, scripted, text, toolUse } from './sub-agent-script';

/** Lets the loop, its stream and its handlers move as far as they can without the test. */
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

/** `read_*` tools say `parallel: true`; every other tool says nothing. */
const readsRunTogether = (name: string): StreamToolConfig | undefined => (name.startsWith('read') ? { parallel: true } : undefined);

const labels = (events: StreamRunEvent[]) => events.map((e) => {
    const id = (e as { toolCallId?: string }).toolCallId;
    return id ? `${e.type}:${id}` : e.type;
});
const ids = (history: StreamAgentMessage[]) => history.map((m) =>
    m.role === 'tool' ? `tool:${m.toolCallId}` : `${m.role}:${m.toolCalls?.map((c) => c.id).join(',') ?? ''}`);

describe('a tool that says nothing keeps its place in its step', () => {
    it('runs the calls of a step one after another when no tool says parallel, the second row queued until the first is done', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[toolUse('a', 'edit_file'), toolUse('b', 'run_command'), done], [text('Both.'), done]] });
        const r = run({ transportCall, toolLookup: () => held.handler });

        await settle();
        expect(held.started).toEqual(['a']);
        await held.release('a');
        expect(held.started).toEqual(['a', 'b']);
        await held.release('b');
        await r.done;

        // Both rows as they are read, `b`'s queued; `b` goes on once `a` is over.
        expect(labels(r.events)).toEqual([
            'run-start', 'turn-start',
            'tool-start:a', 'tool-start:b', 'tool-resolved:a',
            'tool-running:b', 'tool-resolved:b',
            'text-flush',
            'turn-start', 'text-delta', 'text-flush',
            'run-done',
        ]);
        expect(r.events.find((e) => e.type === 'tool-start' && e.toolCallId === 'a')).not.toHaveProperty('queued');
        expect(r.events.find((e) => e.type === 'tool-start' && e.toolCallId === 'b')).toMatchObject({ queued: true });
        expect(ids(r.history)).toEqual(['assistant:a,b', 'tool:a', 'tool:b']);
    });

    it('shows what the model wrote after a queued call after its row, before the call goes on', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[toolUse('w1', 'edit_file'), toolUse('w2', 'run_command'), text('then the tests'), done], [text('Done.'), done]] });
        const r = run({ transportCall, toolLookup: () => held.handler });

        await settle();
        // Read on while `w2` waits: row, text, and only then does it go on.
        expect(labels(r.events).filter((l) => l !== 'run-start' && l !== 'turn-start')).toEqual(['tool-start:w1', 'tool-start:w2', 'text-delta']);
        await held.release('w1');
        expect(labels(r.events).slice(-2)).toEqual(['tool-resolved:w1', 'tool-running:w2']);
        await held.release('w2');
        await r.done;
        expect(r.history[0]).toMatchObject({ content: 'then the tests' });
    });

    it('starts only once every earlier call has settled, and holds the calls after it until it has', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[toolUse('r1', 'read_file'), toolUse('w', 'edit_file'), toolUse('r2', 'read_file'), done], [text('Done.'), done]] });
        const r = run({ transportCall, toolLookup: () => held.handler, toolConfigLookup: readsRunTogether });

        await settle();
        // `r2` could run beside `r1`, but `edit_file` comes between them.
        expect(held.started).toEqual(['r1']);
        await held.release('r1');
        expect(held.started).toEqual(['r1', 'w']);
        await held.release('w');
        expect(held.started).toEqual(['r1', 'w', 'r2']);
        await held.release('r2');
        await r.done;

        expect(labels(r.events).filter((l) => l.startsWith('tool-'))).toEqual([
            'tool-start:r1', 'tool-start:w', 'tool-start:r2', 'tool-resolved:r1',
            'tool-running:w', 'tool-resolved:w',
            'tool-running:r2', 'tool-resolved:r2',
        ]);
        expect(ids(r.history)).toEqual(['assistant:r1,w,r2', 'tool:r1', 'tool:w', 'tool:r2']);
    });

    it('keeps two writes in order, even when the second one would finish first', async () => {
        const held = heldCalls();
        const instant: StreamToolHandler = async (call) => { held.started.push(call.id); return { content: 'written' }; };
        const { transportCall } = scripted({ parent: [[toolUse('w1', 'edit_file'), toolUse('w2', 'write_file'), done], [text('Done.'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'edit_file' ? held.handler : instant) });

        await settle();
        expect(held.started).toEqual(['w1']);
        await held.release('w1');
        await r.done;
        expect(held.started).toEqual(['w1', 'w2']);
        expect(labels(r.events).filter((l) => l.startsWith('tool-resolved'))).toEqual(['tool-resolved:w1', 'tool-resolved:w2']);
    });
});

describe('the calls of tools that say parallel: true', () => {
    it('run together between two calls that keep their place', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[
            toolUse('w1', 'edit_file'), toolUse('r1', 'read_file'), toolUse('r2', 'read_dir'), toolUse('w2', 'run_command'), done,
        ], [text('Done.'), done]] });
        const r = run({ transportCall, toolLookup: () => held.handler, toolConfigLookup: readsRunTogether });

        await settle();
        expect(held.started).toEqual(['w1']);
        await held.release('w1');
        // Both reads at work, and the command waits for them.
        expect([...held.running].sort()).toEqual(['r1', 'r2']);
        expect(held.started).not.toContain('w2');
        await held.release('r2');
        expect(held.started).not.toContain('w2');
        await held.release('r1');
        expect(held.started).toEqual(['w1', 'r1', 'r2', 'w2']);
        await held.release('w2');
        await r.done;

        expect(labels(r.events).filter((l) => l.startsWith('tool-resolved'))).toEqual(['tool-resolved:w1', 'tool-resolved:r2', 'tool-resolved:r1', 'tool-resolved:w2']);
        expect(ids(r.history)).toEqual(['assistant:w1,r1,r2,w2', 'tool:w1', 'tool:r1', 'tool:r2', 'tool:w2']);
    });

    it('run one after another with parallelTools: false', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[toolUse('r1', 'read_file'), toolUse('r2', 'read_file'), done], [text('Done.'), done]] });
        const r = run({ transportCall, toolLookup: () => held.handler, toolConfigLookup: readsRunTogether, parallelTools: false });

        await settle();
        expect(held.started).toEqual(['r1']);
        await held.release('r1');
        expect(held.started).toEqual(['r1', 'r2']);
        await held.release('r2');
        await r.done;
        expect(ids(r.history)).toEqual(['assistant:r1,r2', 'tool:r1', 'tool:r2']);
    });
});

describe('a sub-agent\'s run', () => {
    const delegate: StreamToolHandler = async (call, signal, runCtx) => {
        const out = await runSubAgent(runCtx!, { name: 'worker', request: ask('worker') }, signal);
        return { content: out.text };
    };

    it('keeps the place of a tool that says nothing, as its run does', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({
            parent: [[toolUse('t', 'delegate'), done], [text('Merged.'), done]],
            worker: [[toolUse('w1', 'edit_file'), toolUse('w2', 'run_command'), done], [text('worker done'), done]],
        });
        const r = run({ transportCall, toolLookup: (n) => (n === 'delegate' ? delegate : held.handler) });

        await settle();
        expect(held.started).toEqual(['w1']);
        await held.release('w1');
        expect(held.started).toEqual(['w1', 'w2']);
        await held.release('w2');
        await r.done;
        expect(r.history.at(-1)!.content).toBe('worker done');
    });

    it('runs the calls of parallel tools together, as its run does', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({
            parent: [[toolUse('t', 'delegate'), done], [text('Merged.'), done]],
            worker: [[toolUse('r1', 'read_file'), toolUse('r2', 'read_file'), done], [text('worker done'), done]],
        });
        const r = run({ transportCall, toolLookup: (n) => (n === 'delegate' ? delegate : held.handler), toolConfigLookup: readsRunTogether });

        await settle();
        expect([...held.running].sort()).toEqual(['r1', 'r2']);
        await held.release('r1');
        await held.release('r2');
        await r.done;
        expect(r.history.at(-1)!.content).toBe('worker done');
    });
});

describe('a step left halfway', () => {
    it('ends the calls a Stop finds waiting their place as stopped, and keeps them out of the history', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[toolUse('w1', 'edit_file'), toolUse('w2', 'run_command'), done]] });
        const hangs: StreamToolHandler = (call, signal) => new Promise((_, reject) => {
            held.started.push(call.id);
            signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
        });
        const r = run({ transportCall, toolLookup: () => hangs });

        await settle();
        expect(held.started).toEqual(['w1']);
        r.abort.abort();
        await r.done;

        // `w2` never went on: its row ends stopped, after the call the Stop cut short.
        expect(held.started).toEqual(['w1']);
        expect(labels(r.events).filter((l) => l.startsWith('tool-'))).toEqual(['tool-start:w1', 'tool-start:w2', 'tool-aborted:w1', 'tool-aborted:w2']);
        expect(r.events.find((e) => e.type === 'tool-aborted' && e.toolCallId === 'w2')).toMatchObject({ cause: 'stopped' });
        expect(r.events.slice(-2).map((e) => e.type)).toEqual(['run-aborted', 'run-done']);
        expect(r.history).toEqual([]);
    });

    it('fails on a crash of the call that keeps its place, and runs none of the calls after it', async () => {
        const held = heldCalls();
        const crash: StreamToolHandler = async (call) => { held.started.push(call.id); await settle(); throw new Error('disk on fire'); };
        const { transportCall } = scripted({ parent: [[toolUse('w1', 'edit_file'), toolUse('w2', 'run_command'), done]] });
        const r = run({ transportCall, toolLookup: (n) => (n === 'edit_file' ? crash : held.handler) });

        await expect(r.done).rejects.toThrow('disk on fire');
        expect(held.started).toEqual(['w1']);
        expect(labels(r.events).filter((l) => l.startsWith('tool-'))).toEqual(['tool-start:w1', 'tool-start:w2', 'tool-failed:w1', 'tool-aborted:w2']);
    });

    it('fails on an emitter that throws when a held call goes on, and runs that call never', async () => {
        const held = heldCalls();
        const { transportCall } = scripted({ parent: [[toolUse('w1', 'edit_file'), toolUse('w2', 'run_command'), done]] });
        const r = run({
            transportCall, toolLookup: () => held.handler,
            emitter: (e) => { if (e.type === 'tool-running' && e.toolCallId === 'w2') throw new Error('the observer broke'); },
        });

        const failed = expect(r.done).rejects.toThrow('the observer broke');
        await settle();
        await held.release('w1');
        await failed;
        expect(held.started).toEqual(['w1']);
    });
});
