/**
 * A sub-agent's loop is a run of its own, and its run-level events stay inside it: the host
 * hears one `run-start` and one `run-done`, the run's own. A sub-agent that fails does not
 * fail the run either — its tool answers, and the parent goes on.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamToolHandler } from '../stream-events';
import { agentIdOf, ask, done, recorder, scripted, text, toolUse } from './sub-agent-script';

const RUN_LEVEL = ['run-start', 'run-done', 'run-aborted', 'run-suspended'];

describe('a sub-agent never ends the run', () => {
    it('no run-level event of the sub-agent reaches the host', async () => {
        let answer: Awaited<ReturnType<typeof runSubAgent>> | undefined;
        const delegate: StreamToolHandler = async (_call, signal, run) => {
            answer = await runSubAgent(run!, { request: ask('child') }, signal);
            return { content: answer.text };
        };
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Done.'), done]],
            child: [[text('ok'), { type: 'done', usage: { inputTokens: 3, outputTokens: 1 } }]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });

        expect(events.filter((e) => RUN_LEVEL.includes(e.type)).map((e) => e.type)).toEqual(['run-start', 'run-done']);
        expect(events[0]).toEqual({ type: 'run-start' });
        expect(events.at(-1)).toMatchObject({ type: 'run-done' });
        for (const e of events.filter((x) => RUN_LEVEL.includes(x.type))) expect(agentIdOf(e)).toBeUndefined();
        // What the run-done would have told the host comes back to the tool instead.
        expect(answer).toEqual({ status: 'done', text: 'ok', usage: { inputTokens: 3, outputTokens: 1 } });
    });

    it('a sub-agent that fails answers its tool, and the run goes on', async () => {
        let answer: Awaited<ReturnType<typeof runSubAgent>> | undefined;
        const delegate: StreamToolHandler = async (_call, signal, run) => {
            answer = await runSubAgent(run!, { request: ask('child') }, signal);
            return { content: answer.status === 'failed' ? `failed: ${answer.error}` : answer.text };
        };
        const { transportCall } = scripted({
            parent: [[toolUse('c1', 'delegate'), done], [text('Recovered.'), done]],
            child: [[text('half'), { type: 'error', message: 'model down' }]],
        });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => delegate, emitter, signal: new AbortController().signal,
        });

        expect(answer).toEqual({ status: 'failed', text: 'half', error: 'model down' });
        expect(events.find((e) => e.type === 'agent-end')).toMatchObject({ status: 'failed', error: 'model down' });
        expect(events.find((e) => e.type === 'tool-resolved')).toMatchObject({ toolCallId: 'c1', result: 'failed: model down' });
        expect(events.filter((e) => e.type === 'run-done')).toHaveLength(1);
    });

    it('a run already stopped opens no sub-agent', async () => {
        const controller = new AbortController();
        controller.abort();
        const { transportCall, requests } = scripted({ child: [[text('never'), done]] });
        // A run of the parent's shape, handed by hand: what a tool sees once the Stop landed.
        const run = {
            canAsk: true, canBackground: true, transportCall, toolLookup: () => undefined, maxTurns: 10, toolTimeoutMs: 1000,
            idGen: (p: string) => `${p}-0`,
            startAgent: () => { throw new Error('must not open'); },
        };
        const answer = await runSubAgent(run, { request: ask('child') }, controller.signal);
        expect(answer).toEqual({ status: 'stopped', text: '' });
        expect(requests, 'no model was asked').toEqual([]);
    });
});
