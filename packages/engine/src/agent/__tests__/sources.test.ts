/**
 * Sources a provider sends beside the text are passed on to the adapter, as they came:
 * their offsets are into the text of the model call, which is the adapter's turn.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run';
import type { StreamChatEvent, StreamRunEvent } from '../stream-events';

async function* streamOf(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

function run(streams: StreamChatEvent[][]): Promise<StreamRunEvent[]> {
    const events: StreamRunEvent[] = [];
    let i = 0;
    const opts: StreamRunOptions = {
        messageId: 'm1',
        baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }] },
        transportCall: async () => streamOf(streams[i++] ?? []),
        toolLookup: (name) => (name === 'search' ? async () => ({ content: 'results' }) : undefined),
        emitter: (e) => events.push(e),
        signal: new AbortController().signal,
    };
    return runStreamAgent(opts).then(() => events);
}

describe('sources from the provider', () => {
    it('reach the adapter inside the turn they belong to, before the turn is flushed', async () => {
        const sources = [{ id: 's1', url: 'https://en.wikipedia.org/wiki/Sky', title: 'Sky' }];
        const events = await run([[
            { type: 'text', delta: 'The sky is blue.' },
            { type: 'sources', sources, citations: [{ end: 16, sources: ['s1'] }] },
            { type: 'done' },
        ]]);
        expect(events.map((e) => e.type)).toEqual(['run-start', 'turn-start', 'text-delta', 'sources', 'text-flush', 'run-done']);
        expect(events[3]).toEqual({ type: 'sources', sources, citations: [{ end: 16, sources: ['s1'] }] });
    });

    it('stay in their own model call when a tool call splits the reply in two', async () => {
        const events = await run([
            [{ type: 'tool_use', id: 'c1', name: 'search', input: {} }, { type: 'done' }],
            [{ type: 'text', delta: 'Found it.' }, { type: 'sources', sources: [{ id: 'a' }] }, { type: 'done' }],
        ]);
        const types = events.map((e) => e.type);
        // The second call's `turn-start` comes first: the adapter counts offsets from there.
        expect(types.lastIndexOf('turn-start')).toBeLessThan(types.indexOf('sources'));
        expect(events.find((e) => e.type === 'sources')).toEqual({ type: 'sources', sources: [{ id: 'a' }] });
    });
});
