/**
 * A sub-agent its tool stops reads as stopped, not failed.
 *
 * A tool can stop the sub-agent it opened with a signal of its own (its own deadline, say)
 * and answer with what the sub-agent wrote so far. A model whose stream is a fetch body
 * does not end quietly on that stop: the read the sub-agent's loop is waiting on rejects
 * with an `AbortError`, and the nested loop throws it. That is still a stop the tool asked
 * for, and `runSubAgent` says so: `stopped`, with the text so far and no error.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import { runSubAgent } from '../sub-agent';
import type { StreamChatEvent, StreamToolHandler } from '../stream-events';
import { ask, done, recorder, scripted, text, toolUse } from './sub-agent-script';

/** A model that writes `first`, then waits for more and rejects once `signal` fires. */
function streamThatRejectsOn(signal: AbortSignal, first: string): AsyncIterable<StreamChatEvent> {
    return (async function* () {
        yield text(first);
        await new Promise((_, reject) => {
            const fail = () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
            if (signal.aborted) fail();
            else signal.addEventListener('abort', fail, { once: true });
        });
    })();
}

describe('a sub-agent its tool stops reads as stopped', () => {
    it("even when its model's stream rejects on the stop", async () => {
        const handler: StreamToolHandler = async (_call, _signal, run) => {
            // The tool gives its sub-agent 10 ms, then answers with what it has.
            const deadline = new AbortController();
            setTimeout(() => deadline.abort(), 10);
            const out = await runSubAgent(run!, {
                name: 'reader',
                request: ask('child'),
                transportCall: async () => streamThatRejectsOn(deadline.signal, 'partial'),
            }, deadline.signal);
            return { content: `${out.status}: ${out.text}${out.error ? ` (${out.error})` : ''}` };
        };
        const { transportCall } = scripted({ parent: [[toolUse('c1', 'delegate'), done], [text('Read it.'), done]] });
        const { events, emitter } = recorder();
        await runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall,
            toolLookup: () => handler, emitter, signal: new AbortController().signal,
        });

        expect(events.find((e) => e.type === 'tool-resolved' && e.toolCallId === 'c1')).toMatchObject({ result: 'stopped: partial' });
        expect(events.filter((e) => e.type === 'agent-end')).toEqual([{ type: 'agent-end', agentId: expect.any(String), status: 'stopped' }]);
        // The tool stopped its sub-agent, not the run: the model answers with what it got.
        expect(events.some((e) => e.type === 'run-aborted')).toBe(false);
        expect(events.at(-1)).toMatchObject({ type: 'run-done' });
    });
});
