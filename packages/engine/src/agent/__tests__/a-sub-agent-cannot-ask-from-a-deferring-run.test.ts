/**
 * A run that can pause (it was given a `deferral`: a server loop) cannot hold a sub-agent's
 * question: the sub-agent's loop is nested inside one tool call, and that call has to
 * answer before the run can pause. So the sub-agent gets nobody to ask, and its gated call
 * ends with the cause `no-resolver` — the page's setup, said as such — rather than a
 * question nobody could answer.
 */
import { describe, it, expect, vi } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamToolHandler, StreamToolRun } from '../stream-events';
import { ask, done, recorder, scripted, text, toolUse } from './sub-agent-script';

function setup() {
    const runs: StreamToolRun[] = [];
    const delegate: StreamToolHandler = async (_call, signal, run) => {
        runs.push(run!);
        return { content: (await runSubAgent(run!, { request: ask('child') }, signal)).text };
    };
    const { transportCall } = scripted({
        parent: [[toolUse('c1', 'delegate'), done], [text('Done.'), done]],
        child: [[toolUse('w1', 'write'), done], [text('written'), done]],
    });
    const approvalResolver = vi.fn(async () => ({ approved: true }));
    const { events, emitter } = recorder();
    const options = {
        messageId: 'm1',
        baseRequest: ask('parent'),
        transportCall,
        toolLookup: (name: string) => name === 'delegate' ? delegate : async () => ({ content: 'ok' }),
        toolConfigLookup: (name: string) => name === 'write' ? { needsApproval: true } : undefined,
        approvalResolver,
        emitter,
        signal: new AbortController().signal,
    };
    return { runs, approvalResolver, events, options };
}

describe('a sub-agent cannot ask from a deferring run', () => {
    it('its gated call ends with the cause no-resolver, and nobody is asked', async () => {
        const { runs, approvalResolver, events, options } = setup();
        await runStreamAgent({ ...options, deferral: {} });

        expect(runs[0]!.canAsk).toBe(false);
        expect(approvalResolver).not.toHaveBeenCalled();
        expect(events.find((e) => e.type === 'tool-aborted')).toEqual({
            type: 'tool-aborted', toolCallId: 'w1', cause: 'no-resolver', agentId: expect.any(String),
        });
        // The parent's call is answered, so the run does not pause on its sub-agent's question.
        expect(events.at(-1)).toMatchObject({ type: 'run-done' });
        expect(events.some((e) => e.type === 'run-suspended')).toBe(false);
    });

    it('a run that does not defer lets its sub-agent ask the same resolver', async () => {
        const { runs, approvalResolver, events, options } = setup();
        await runStreamAgent(options);

        expect(runs[0]!.canAsk).toBe(true);
        expect(approvalResolver).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1', name: 'write' }), expect.anything());
        expect(events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'w1')).toMatchObject({ agentId: expect.any(String) });
    });

    it('a run with no resolver cannot ask either', async () => {
        const { runs, options } = setup();
        await runStreamAgent({ ...options, approvalResolver: undefined });
        expect(runs[0]!.canAsk).toBe(false);
    });
});
