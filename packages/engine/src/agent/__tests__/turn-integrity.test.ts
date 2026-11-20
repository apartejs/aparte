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

describe('two calls of one reply are two calls, whichever model call made them', () => {
    // A vendor that sends no id has one minted per stream (openai-compat), so every model call
    // starts again at `aparte-call-1`; a server that numbers its ids per response does the same.
    // The transcript keys a row on the id for the whole reply: the second call's result went onto
    // the first call's row, the second row stayed pending, and the history filed both answers
    // under one id.
    const weather = (): StreamToolHandler => async (call) => ({ content: `${(call.input as { city: string }).city} weather` });
    const starts = (events: StreamRunEvent[]) => events.filter((e) => e.type === 'tool-start').map((e) => (e as { toolCallId: string }).toolCallId);

    it('an id a later model call repeats is renamed, and each answer is filed under its own call', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'aparte-call-1', name: 'get_weather', input: { city: 'Lille' } }, { type: 'done' }],
            [{ type: 'tool_use', id: 'aparte-call-1', name: 'get_weather', input: { city: 'Paris' } }, { type: 'done' }],
            [{ type: 'text', delta: 'Done.' }, { type: 'done' }],
        ]);
        const events: StreamRunEvent[] = [];
        await runStreamAgent(baseOpts({ transportCall: t.transportCall, toolLookup: weather, emitter: (e) => events.push(e) }));
        const ids = starts(events);
        expect(new Set(ids).size, 'two rows').toBe(2);
        const history = t.calls[2]!.messages;
        for (const city of ['Lille', 'Paris']) {
            const call = history.flatMap((m) => m.toolCalls ?? []).find((c) => (c.input as { city: string }).city === city)!;
            expect(history.find((m) => m.role === 'tool' && m.toolCallId === call.id)?.content, city).toBe(`${city} weather`);
        }
    });

    it('a resumed run does not reuse an id the reply used before the pause', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'aparte-call-1', name: 'get_weather', input: { city: 'Paris' } }, { type: 'done' }],
            [{ type: 'done' }],
        ]);
        const events: StreamRunEvent[] = [];
        await runStreamAgent(baseOpts({
            baseRequest: { modelId: 'm', messages: [
                { role: 'user', content: 'weather?' },
                { role: 'assistant', content: '', toolCalls: [{ id: 'aparte-call-1', name: 'get_weather', input: { city: 'Lille' } }] },
                { role: 'tool', content: 'Lille weather', toolCallId: 'aparte-call-1', toolName: 'get_weather' },
            ] },
            transportCall: t.transportCall, toolLookup: weather, emitter: (e) => events.push(e),
        }));
        expect(starts(events)).not.toContain('aparte-call-1');
    });

    it('an id an EARLIER reply used is left alone', async () => {
        const t = scriptedTransport([
            [{ type: 'tool_use', id: 'aparte-call-1', name: 'get_weather', input: { city: 'Paris' } }, { type: 'done' }],
            [{ type: 'done' }],
        ]);
        const events: StreamRunEvent[] = [];
        await runStreamAgent(baseOpts({
            baseRequest: { modelId: 'm', messages: [
                { role: 'user', content: 'weather in Lille?' },
                { role: 'assistant', content: '', toolCalls: [{ id: 'aparte-call-1', name: 'get_weather', input: { city: 'Lille' } }] },
                { role: 'tool', content: 'Lille weather', toolCallId: 'aparte-call-1', toolName: 'get_weather' },
                { role: 'assistant', content: 'Mild.' },
                { role: 'user', content: 'and Paris?' },
            ] },
            transportCall: t.transportCall, toolLookup: weather, emitter: (e) => events.push(e),
        }));
        expect(starts(events)).toEqual(['aparte-call-1']);
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
