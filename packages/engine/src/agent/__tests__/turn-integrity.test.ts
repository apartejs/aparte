/**
 * Three things a turn owes whoever reads it afterwards — the transcript, the
 * history, and the person who pressed Stop. All three come from the 2026-09-05
 * audit, and all three are only reachable through a provider that is a little
 * unusual, which is why the loop's own suite never saw them.
 *
 *  - Two calls in one turn must be two calls. A vendor that sends no `id` used to
 *    produce two of them with the SAME id, and everything downstream keys on it.
 *  - Text streamed AFTER a tool call in the same turn must reach the history.
 *  - A Stop must stay a Stop, even when the transport's iterator throws on the way
 *    out.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run';
import type { StreamChatEvent, StreamRunEvent, StreamChatRequest, StreamToolHandler } from '../stream-events';

async function* streamOf(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

function scriptedTransport(streams: StreamChatEvent[][]): {
    calls: StreamChatRequest[];
    transportCall: StreamRunOptions['transportCall'];
} {
    const calls: StreamChatRequest[] = [];
    let i = 0;
    return {
        calls,
        transportCall: async (request) => {
            calls.push({ ...request, messages: request.messages.map(m => ({ ...m })) });
            return streamOf(streams[i++] ?? []);
        },
    };
}

function baseOpts(over: Partial<StreamRunOptions>): StreamRunOptions {
    return {
        messageId: 'm1',
        baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }] },
        transportCall: async () => streamOf([{ type: 'done' }]),
        toolLookup: () => undefined,
        emitter: () => { /* no-op */ },
        signal: new AbortController().signal,
        ...over,
    };
}

describe('two calls in one turn are two calls', () => {
    it('a duplicate id is made unique — one row and one history slot each', async () => {
        // A vendor that omits `id` yields `id: ''` for every call (the parser mints
        // one now, but any provider can repeat an id). The transcript keys a segment
        // on `tool-${id}` and `updateSegment` takes the FIRST match, so the second
        // call's result was written onto the first call's row; the history carried one
        // envelope declaring two calls with the same id and two results an
        // OpenAI-shaped endpoint rejects on the next turn.
        const t = scriptedTransport([
            [
                { type: 'tool_use', id: '', name: 'search', input: { q: 'x' } },
                { type: 'tool_use', id: '', name: 'lookup', input: { q: 'y' } },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ]);
        const seen: StreamRunEvent[] = [];
        const handler: StreamToolHandler = async (call) => ({ content: `R-${call.name}` });
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall,
            emitter: (e) => seen.push(e),
            toolLookup: () => handler,
        }));

        const history = t.calls[1]!.messages;
        const declared = history.find(m => m.role === 'assistant' && m.toolCalls)!.toolCalls!;
        expect(declared).toHaveLength(2);
        expect(declared[0]!.id).not.toBe(declared[1]!.id);

        // Every result names exactly one declared call.
        const results = history.filter(m => m.role === 'tool');
        expect(results.map(r => r.toolCallId).sort()).toEqual(declared.map(c => c.id).sort());

        // And the transcript rows are addressed apart, from `tool-start` onward.
        const starts = seen.filter((e): e is Extract<StreamRunEvent, { type: 'tool-start' }> => e.type === 'tool-start');
        expect(starts.map(s => s.toolCallId)).toEqual(declared.map(c => c.id));
    });

    it('a handler is told the id its result will be filed under', async () => {
        const t = scriptedTransport([
            [
                { type: 'tool_use', id: 'dup', name: 'a', input: {} },
                { type: 'tool_use', id: 'dup', name: 'b', input: {} },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ]);
        const given: string[] = [];
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall,
            toolLookup: () => async (call) => { given.push(call.id); return { content: 'ok' }; },
        }));
        expect(new Set(given).size).toBe(2);
        expect(t.calls[1]!.messages.filter(m => m.role === 'tool').map(m => m.toolCallId)).toEqual(given);
    });

    it('leaves distinct ids alone', async () => {
        const t = scriptedTransport([
            [
                { type: 'tool_use', id: 'c1', name: 'a', input: {} },
                { type: 'tool_use', id: 'c2', name: 'b', input: {} },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ]);
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall,
            toolLookup: () => async () => ({ content: 'ok' }),
        }));
        expect(t.calls[1]!.messages.find(m => m.role === 'assistant' && m.toolCalls)!.toolCalls!.map(c => c.id)).toEqual(['c1', 'c2']);
    });
});

describe('the text of a turn that also called a tool', () => {
    it('keeps what was streamed AFTER the call, not only before it', async () => {
        // The envelope snapshotted the text at declare time and the loop kept
        // appending to a local string nothing else read, so a sentence the user had
        // watched arrive was never sent back to the model. `openai-compat` is immune
        // (it flushes its calls at the end of the stream); a provider that emits
        // `[tool, text]` in that order — `@aparte/provider-scenario` does — reaches it.
        const t = scriptedTransport([
            [
                { type: 'text', delta: 'Let me check.' },
                { type: 'tool_use', id: 'c1', name: 'search', input: {} },
                { type: 'text', delta: ' One moment.' },
                { type: 'done' },
            ],
            [{ type: 'done' }],
        ]);
        await runStreamAgent(baseOpts({
            transportCall: t.transportCall,
            toolLookup: () => async () => ({ content: 'r' }),
        }));
        expect(t.calls[1]!.messages.find(m => m.role === 'assistant' && m.toolCalls)!.content)
            .toBe('Let me check. One moment.');
    });
});

describe('a Stop stays a Stop', () => {
    it('survives a transport iterator whose return() rejects', async () => {
        // The `finally` settles the iterator with `.catch(() => {})`; the abort path
        // did not, so a host driving the loop with an iterator of its own turned a
        // deliberate Stop into a thrown run error — and core paints an error card
        // over the reply it just streamed.
        const controller = new AbortController();
        const hostile: AsyncIterable<StreamChatEvent> = {
            [Symbol.asyncIterator]: () => ({
                async next() {
                    controller.abort();
                    return { done: false, value: { type: 'text', delta: 'x' } as StreamChatEvent };
                },
                async return(): Promise<IteratorResult<StreamChatEvent>> { throw new Error('return blew up'); },
            }),
        };
        const seen: StreamRunEvent[] = [];
        await expect(runStreamAgent(baseOpts({
            transportCall: async () => hostile,
            emitter: (e) => seen.push(e),
            signal: controller.signal,
        }))).resolves.toBeUndefined();
        expect(seen.map(e => e.type)).toContain('run-aborted');
    });

    it('survives a transport iterator whose return() throws synchronously', async () => {
        // `.catch()` only sees a rejected promise. A hand-written iterator — the
        // shape a host that drives the loop itself is most likely to pass — throws
        // before there is a promise to reject, and the Stop came back to the caller
        // as a run error.
        const controller = new AbortController();
        const hostile: AsyncIterable<StreamChatEvent> = {
            [Symbol.asyncIterator]: () => ({
                async next() {
                    controller.abort();
                    return { done: false, value: { type: 'text', delta: 'x' } as StreamChatEvent };
                },
                return(): Promise<IteratorResult<StreamChatEvent>> { throw new Error('return blew up'); },
            }),
        };
        const seen: StreamRunEvent[] = [];
        await expect(runStreamAgent(baseOpts({
            transportCall: async () => hostile,
            emitter: (e) => seen.push(e),
            signal: controller.signal,
        }))).resolves.toBeUndefined();
        expect(seen.map(e => e.type)).toContain('run-aborted');
    });
});
