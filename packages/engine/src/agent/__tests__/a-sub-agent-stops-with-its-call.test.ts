/**
 * A sub-agent stops with the call that opened it. On a Stop or the call's timeout, the host
 * hears `agent-end { stopped }` BEFORE the call's `tool-aborted` — so a row that says
 * "stopped" never follows one that still says "running" — and nothing of the sub-agent
 * after it, however long its own loop takes to unwind.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamRunEvent, StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, indexOf, recorder, scripted, text, toolUse } from './sub-agent-script';

/** A tool whose sub-agent is held in `settled`, so a test can wait for it to unwind. */
function delegating() {
    const settled: Promise<Awaited<ReturnType<typeof runSubAgent>>>[] = [];
    const handler: StreamToolHandler = async (_call, signal, run) => {
        const answer = runSubAgent(run!, { name: 'slow', request: ask('child') }, signal);
        settled.push(answer);
        return { content: (await answer).text };
    };
    return { handler, settled };
}

/** The sub-agent's events from its `agent-end` on, the end included. */
function fromTheEnd(events: StreamRunEvent[]): StreamRunEvent[] {
    const end = indexOf(events, (e) => e.type === 'agent-end');
    return events.slice(end).filter((e) => agentIdOf(e) !== undefined);
}

describe('a sub-agent stops with its call', () => {
    it('a Stop ends the sub-agent before its call, and nothing of it follows', async () => {
        const controller = new AbortController();
        const { handler, settled } = delegating();
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('never'), done]],
            child: [[text('partial'), { wait: 30 }, text(' late'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => handler,
            emitter: (e) => {
                emitter(e);
                if (e.type === 'text-delta' && agentIdOf(e)) queueMicrotask(() => controller.abort());
            },
            signal: controller.signal,
        });
        const answer = await settled[0]!;

        const end = indexOf(events, (e) => e.type === 'agent-end');
        const aborted = indexOf(events, (e) => e.type === 'tool-aborted' && e.toolCallId === 'c1');
        expect(events[end]).toEqual({ type: 'agent-end', agentId: expect.any(String), status: 'stopped' });
        expect(events[aborted]).toMatchObject({ cause: 'stopped' });
        expect(end).toBeLessThan(aborted);
        expect(fromTheEnd(events), 'nothing of the sub-agent after its end').toEqual([events[end]]);
        expect(events.some((e) => e.type === 'text-delta' && e.delta === ' late')).toBe(false);
        expect(answer.status).toBe('stopped');
    });

    it('the call\'s timeout ends the sub-agent before its call, and nothing of it follows', async () => {
        const { handler, settled } = delegating();
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Answered without it.'), done]],
            child: [[text('partial'), { wait: 80 }, text(' late'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => handler, emitter, signal: new AbortController().signal,
            toolTimeoutMs: 30,
        });
        const answer = await settled[0]!;

        const end = indexOf(events, (e) => e.type === 'agent-end');
        const aborted = indexOf(events, (e) => e.type === 'tool-aborted' && e.toolCallId === 'c1');
        expect(events[end]).toMatchObject({ status: 'stopped' });
        expect(events[aborted]).toMatchObject({ cause: 'timeout' });
        expect(end).toBeLessThan(aborted);
        expect(fromTheEnd(events)).toEqual([events[end]]);
        expect(answer.status).toBe('stopped');
        // A timeout is the call's, not the run's: the run ends as it did before.
        expect(events.filter((e) => e.type === 'agent-end')).toHaveLength(1);
        expect(events.at(-1)).toMatchObject({ type: 'run-done' });
    });

    it('a sub-agent announced by hand is stopped with its call too', async () => {
        const controller = new AbortController();
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'manual'), done]] });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => async (_call, _signal, run) => {
                const agent = run!.startAgent({ name: 'by hand' });
                agent.emit({ type: 'text-delta', delta: 'working' });
                queueMicrotask(() => controller.abort());
                await new Promise((r) => setTimeout(r, 20));
                agent.emit({ type: 'text-delta', delta: 'late' });
                agent.end('done');
                return { content: 'never read' };
            },
            emitter, signal: controller.signal,
        });
        await new Promise((r) => setTimeout(r, 30));

        const end = indexOf(events, (e) => e.type === 'agent-end');
        expect(events[end]).toMatchObject({ status: 'stopped' });
        expect(end).toBeLessThan(indexOf(events, (e) => e.type === 'tool-aborted'));
        expect(fromTheEnd(events)).toEqual([events[end]]);
    });
});
