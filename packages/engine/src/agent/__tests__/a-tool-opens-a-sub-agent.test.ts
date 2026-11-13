/**
 * A tool opens a sub-agent through the run it is handed, and everything the sub-agent does
 * reaches the host as the sub-agent's: `agent-start` names the call that opened it, each
 * inner event carries its `agentId`, and `agent-end` lands before the call resolves.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamRunEvent, StreamToolHandler, StreamToolRun } from '../stream-events';
import { agentIdOf, ask, done, indexOf, recorder, scripted, text, toolUse } from './sub-agent-script';

const research: StreamToolHandler = async (_call, signal, run) => {
    const answer = await runSubAgent(run!, { name: 'researcher', description: 'Looks things up', request: ask('child') }, signal);
    return { content: answer.text };
};

describe('a tool opens a sub-agent', () => {
    it('agent-start carries the call that opened it, and every inner event the agent id', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'research'), done], [text('Summary.'), done]],
            child: [[toolUse('k1', 'lookup'), done], [text('Found '), text('it.'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1',
            baseRequest: ask('parent'),
            transportCall,
            toolLookup: (name) => name === 'research' ? research : async () => ({ content: 'a page' }),
            emitter,
            signal: new AbortController().signal,
        });

        const start = events.find((e) => e.type === 'agent-start');
        expect(start).toEqual({
            type: 'agent-start', agentId: expect.any(String), name: 'researcher', description: 'Looks things up', toolCallId: 'c1',
        });
        const agentId = agentIdOf(start!)!;
        const from = events.indexOf(start!);
        const to = indexOf(events, (e) => e.type === 'agent-end');
        const inner = events.slice(from + 1, to);
        expect(inner.map((e) => e.type)).toEqual([
            'turn-start', 'tool-start', 'tool-resolved', 'text-flush',
            'turn-start', 'text-delta', 'text-delta', 'text-flush',
        ]);
        for (const e of inner) expect(agentIdOf(e), `${e.type} is the sub-agent's`).toBe(agentId);
        // Its own tool row too: the call `k1` is the sub-agent's, not the reply's.
        expect(inner.find((e) => e.type === 'tool-start')).toMatchObject({ toolCallId: 'k1', name: 'lookup', agentId });

        // Outside the sub-agent, nothing carries an agent id.
        const outside = events.filter((e, i) => i < from || i > to);
        for (const e of outside) expect(agentIdOf(e), `${e.type} is the run's own`).toBeUndefined();
    });

    it('agent-end comes before the call resolves, with what the sub-agent answered', async () => {
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'research'), done], [text('Summary.'), done]],
            child: [[text('Found it.'), done]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => research, emitter, signal: new AbortController().signal,
        });

        const end = indexOf(events, (e) => e.type === 'agent-end');
        const resolved = indexOf(events, (e) => e.type === 'tool-resolved' && e.toolCallId === 'c1');
        expect(events[end]).toEqual({ type: 'agent-end', agentId: expect.any(String), status: 'done', result: 'Found it.' });
        expect(end).toBeGreaterThan(-1);
        expect(end).toBeLessThan(resolved);
        expect(events[resolved]).toMatchObject({ result: 'Found it.' });
    });

    it('the sub-agent reads its own conversation, not the parent\'s', async () => {
        const { transportCall, requests } = scripted({
            parent: [[toolUse('c1', 'research'), done], [done]],
            child: [[text('ok'), done]],
        });
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent', 'the parent question'), transportCall,
            toolLookup: () => research, emitter: () => {}, signal: new AbortController().signal,
        });
        const childRequest = requests.find((r) => r.modelId === 'child')!;
        expect(childRequest.messages).toEqual([{ role: 'user', content: 'go' }]);
    });

    it('the forced-tool path hands the handler a run too', async () => {
        const { transportCall } = scripted({ parent: [[text('Answer.'), done]], child: [[text('ok'), done]] });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1',
            baseRequest: { ...ask('parent'), toolChoice: { name: 'research', input: {} } },
            transportCall,
            toolLookup: () => research,
            emitter,
            signal: new AbortController().signal,
        });
        const synthetic = events.find((e) => e.type === 'tool-start')!;
        expect(events.find((e) => e.type === 'agent-start')).toMatchObject({ toolCallId: (synthetic as { toolCallId: string }).toolCallId });
        expect(events.find((e) => e.type === 'agent-end')).toMatchObject({ status: 'done', result: 'ok' });
    });

    it('a handler written with two parameters works as before', async () => {
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'plain'), done], [text('Done.'), done]] });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => async (call, signal) => ({ content: `${call.name}:${signal.aborted}` }),
            emitter, signal: new AbortController().signal,
        });
        expect(events.find((e) => e.type === 'tool-resolved')).toMatchObject({ result: 'plain:false' });
        expect(events.some((e) => e.type === 'agent-start')).toBe(false);
    });

    it('a tool can announce a sub-agent by hand: emit stamps it, end ends it once', async () => {
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'manual'), done], [done]] });
        const { events, emitter } = recorder();
        let seen: StreamToolRun | undefined;
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => async (_call, _signal, run) => {
                seen = run;
                const agent = run!.startAgent({ name: 'manual' });
                agent.emit({ type: 'text-delta', delta: 'x' });
                agent.emit({ type: 'run-done' });
                agent.end('done', { result: 'x' });
                agent.end('failed', { error: 'too late' });
                agent.emit({ type: 'text-delta', delta: 'late' });
                return { content: 'x' };
            },
            emitter, signal: new AbortController().signal,
        });

        expect(seen?.maxTurns).toBe(10);
        const mine = events.filter((e) => agentIdOf(e) !== undefined);
        expect(mine).toEqual<StreamRunEvent[]>([
            { type: 'agent-start', agentId: expect.any(String), name: 'manual', toolCallId: 'c1' },
            { type: 'text-delta', delta: 'x', agentId: expect.any(String) },
            { type: 'agent-end', agentId: expect.any(String), status: 'done', result: 'x' },
        ]);
        expect(new Set(mine.map(agentIdOf)).size).toBe(1);
        expect(events.filter((e) => e.type === 'run-done')).toHaveLength(1);
    });
});
