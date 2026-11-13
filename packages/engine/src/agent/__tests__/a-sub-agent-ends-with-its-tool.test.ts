/**
 * A sub-agent ends with the tool that opened it.
 *
 * A handler that opens a sub-agent and then throws, or returns without ending it, or leaves a
 * `runSubAgent` un-awaited, used to leave a line that started and never stopped: the call got
 * its `tool-failed` / `tool-resolved`, the sub-agent no `agent-end`, and an un-awaited one went
 * on emitting after its call — after the run's own end. Now the call's end closes what it
 * opened: `failed` with the handler's message when it threw, `stopped` otherwise, BEFORE the
 * call's own terminal event, and nothing of it comes out afterwards.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamAgentHandle, StreamRunEvent } from '../stream-events';
import { agentIdOf, ask, done, indexOf, recorder, scripted, text, toolUse } from './sub-agent-script';

/** Every event of the sub-agent after its `agent-end`, the end excluded. */
const afterTheEnd = (events: StreamRunEvent[]): StreamRunEvent[] => {
    const end = indexOf(events, (e) => e.type === 'agent-end');
    return events.slice(end + 1).filter((e) => agentIdOf(e) !== undefined);
};

describe('a sub-agent ends with its tool', () => {
    it('a tool that throws after opening one ends it as failed, with its message, before the call fails', async () => {
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'boom'), done]] });
        const { events, emitter } = recorder();
        await expect(runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => async (_call, _signal, run) => {
                run!.startAgent({ name: 'helper' });
                throw new Error('boom');
            },
            emitter, signal: new AbortController().signal,
        })).rejects.toThrow('boom');

        const end = indexOf(events, (e) => e.type === 'agent-end');
        const failed = indexOf(events, (e) => e.type === 'tool-failed' && e.toolCallId === 'c1');
        expect(events[end]).toEqual({ type: 'agent-end', agentId: expect.any(String), status: 'failed', error: 'boom' });
        expect(failed).toBeGreaterThan(end);
    });

    it('a tool that returns without ending one ends it as stopped, before the call resolves, and its handle goes quiet', async () => {
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'forgetful'), done], [text('Answered.'), done]] });
        const { events, emitter } = recorder();
        let kept: StreamAgentHandle | undefined;
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => async (_call, _signal, run) => {
                kept = run!.startAgent({ name: 'helper' });
                kept.emit({ type: 'text-delta', delta: 'working' });
                return { content: 'returned early' };
            },
            emitter, signal: new AbortController().signal,
        });
        kept!.emit({ type: 'text-delta', delta: 'late' });
        kept!.end('done');

        const end = indexOf(events, (e) => e.type === 'agent-end');
        const resolved = indexOf(events, (e) => e.type === 'tool-resolved' && e.toolCallId === 'c1');
        expect(events[end]).toEqual({ type: 'agent-end', agentId: expect.any(String), status: 'stopped' });
        expect(resolved).toBeGreaterThan(end);
        expect(events.filter((e) => e.type === 'agent-end')).toHaveLength(1);
        expect(afterTheEnd(events)).toEqual([]);
        expect(events.at(-1)).toMatchObject({ type: 'run-done' });
    });

    it('an un-awaited runSubAgent is stopped with its call, and its late events never come out', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'fire-and-forget'), done], [text('Answered.'), done]],
            child: [[text('partial'), { wait: 30 }, text(' late'), done]],
        });
        const { events, emitter } = recorder();
        const settled: Promise<unknown>[] = [];
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => async (_call, signal, run) => {
                settled.push(runSubAgent(run!, { name: 'background', request: ask('child') }, signal));
                return { content: 'started' };
            },
            emitter, signal: new AbortController().signal,
        });
        await Promise.all(settled);

        const end = indexOf(events, (e) => e.type === 'agent-end');
        const resolved = indexOf(events, (e) => e.type === 'tool-resolved' && e.toolCallId === 'c1');
        expect(events[end]).toMatchObject({ status: 'stopped' });
        expect(resolved).toBeGreaterThan(end);
        expect(afterTheEnd(events)).toEqual([]);
        expect(events.some((e) => e.type === 'text-delta' && e.delta === ' late')).toBe(false);
        expect(events.at(-1)).toMatchObject({ type: 'run-done' });
    });

    it('a sub-agent the tool ended itself is not ended twice', async () => {
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'tidy'), done]] });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => async (_call, _signal, run) => {
                run!.startAgent({ name: 'helper' }).end('done', { result: 'ok' });
                return { content: 'ok' };
            },
            emitter, signal: new AbortController().signal,
        });
        expect(events.filter((e) => e.type === 'agent-end')).toEqual([{ type: 'agent-end', agentId: expect.any(String), status: 'done', result: 'ok' }]);
    });
});
