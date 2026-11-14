/**
 * A server loop (`deferral`) whose step has a call that stops the run (here a timeout) and a
 * sibling that paused for an approval. One call after another, the stop comes first and the
 * sibling is never read: the run ends. Running together, the sibling has already paused when
 * the stop lands — and the run must still END, not suspend on a call it will never resume.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import type { StreamAgentMessage, StreamRunEvent, StreamToolHandler } from '../stream-events';
import { ask, done, scripted, toolUse } from './sub-agent-script';

/** A handler that never answers on its own, and rejects when its signal fires. */
const hangs: StreamToolHandler = (_call, signal) => new Promise((_, reject) => {
    const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
});

async function runWith(parallelTools: boolean) {
    const events: StreamRunEvent[] = [];
    const history: StreamAgentMessage[] = [];
    const { transportCall, requests } = scripted({ parent: [[toolUse('a', 'slow'), toolUse('b', 'gated'), done]] });
    await runStreamAgent({
        messageId: 'm1', baseRequest: ask('parent'), transportCall,
        parallelTools,
        toolLookup: (n) => (n === 'slow' ? hangs : async () => ({ content: 'ran' })),
        toolConfigLookup: (n) => (n === 'gated' ? { needsApproval: true } : undefined),
        toolTimeoutMs: 20,
        deferral: {},
        emitter: (e) => { events.push(e); },
        onHistoryAppend: (m) => history.push(m),
        signal: new AbortController().signal,
    });
    return { events, history, requests };
}

const runLevel = (events: StreamRunEvent[]) =>
    events.filter((e) => e.type.startsWith('run-') || e.type === 'text-flush').map((e) => e.type);

describe('a call that stops the run ends it even when a sibling paused', () => {
    it.each([false, true])('parallelTools: %s — the run ends, it does not suspend', async (parallelTools) => {
        const r = await runWith(parallelTools);
        expect(runLevel(r.events)).toEqual(['run-start', 'text-flush', 'run-done']);
        expect(r.events.find((e) => e.type === 'tool-aborted' && e.toolCallId === 'a')).toMatchObject({ cause: 'timeout' });
        // The model is not asked again, and nothing is left declared without an answer.
        expect(r.requests).toHaveLength(1);
        expect(r.history).toEqual([]);
    });

    it('ends a sibling that already paused as stopped, like any call the stop cut short', async () => {
        const r = await runWith(true);
        const started = r.events.filter((e) => e.type === 'tool-start').map((e) => (e as { toolCallId: string }).toolCallId);
        expect(started).toEqual(['a', 'b']);
        expect(r.events.filter((e) => e.type === 'tool-aborted').map((e) => [(e as { toolCallId: string }).toolCallId, (e as { cause?: string }).cause]))
            .toEqual([['a', 'timeout'], ['b', 'stopped']]);
    });
});
