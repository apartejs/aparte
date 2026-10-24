import { describe, it, expect } from 'vitest';
import { runStreamAgent, type StreamRunOptions } from '../stream-run';
import type { StreamChatEvent, StreamRunEvent } from '../stream-events';

// "Stopped" covered four causes, and a missing handler — a developer's bug — read on the
// row as something the person did. Each terminal abort now says which it was.

async function* streamOf(events: StreamChatEvent[]): AsyncIterable<StreamChatEvent> {
    for (const e of events) yield e;
}

async function abortOf(over: Partial<StreamRunOptions>): Promise<StreamRunEvent | undefined> {
    const events: StreamRunEvent[] = [];
    let i = 0;
    const streams: StreamChatEvent[][] = [[{ type: 'tool_use', id: 'c1', name: 'work', input: {} }, { type: 'done' }]];
    await runStreamAgent({
        messageId: 'm1',
        baseRequest: { modelId: 'm', messages: [{ role: 'user', content: 'hi' }] },
        transportCall: async () => streamOf(streams[i++] ?? [{ type: 'done' }]),
        toolLookup: () => undefined,
        emitter: (e) => events.push(e),
        signal: new AbortController().signal,
        ...over,
    }).catch(() => undefined);
    return events.find((e) => e.type === 'tool-aborted');
}

describe('tool-aborted says why', () => {
    it('no handler for the tool here', async () => {
        expect(await abortOf({})).toEqual({ type: 'tool-aborted', toolCallId: 'c1', cause: 'no-handler' });
    });

    it('a gated call with nobody to ask', async () => {
        const aborted = await abortOf({
            toolLookup: () => async () => ({ content: 'ran' }),
            toolConfigLookup: () => ({ needsApproval: true }),
        });
        expect(aborted).toMatchObject({ cause: 'no-resolver' });
    });

    it('a handler that outlived its timeout', async () => {
        const aborted = await abortOf({
            toolLookup: () => () => new Promise(() => { /* deaf */ }),
            toolTimeoutMs: 5,
        });
        expect(aborted).toMatchObject({ cause: 'timeout' });
    });

    it('a Stop pressed while the handler ran', async () => {
        const controller = new AbortController();
        const aborted = await abortOf({
            signal: controller.signal,
            toolLookup: () => () => {
                queueMicrotask(() => controller.abort());
                return new Promise(() => { /* deaf */ });
            },
        });
        expect(aborted).toMatchObject({ cause: 'stopped' });
    });

    it('a Stop pressed while the person was being asked', async () => {
        const controller = new AbortController();
        const aborted = await abortOf({
            signal: controller.signal,
            toolLookup: () => async () => ({ content: 'ran' }),
            toolConfigLookup: () => ({ needsApproval: true }),
            // A resolver honours its signal (core's channel resolves `{ approved: false }` on it).
            approvalResolver: (_call, signal) => new Promise((resolve) => {
                signal.addEventListener('abort', () => resolve({ approved: false }));
                queueMicrotask(() => controller.abort());
            }),
        });
        expect(aborted).toMatchObject({ cause: 'stopped' });
    });

    it('a handler that rejects with its own AbortError when the signal fired is a stop too', async () => {
        const controller = new AbortController();
        const aborted = await abortOf({
            signal: controller.signal,
            toolLookup: () => (_call, signal) => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
                queueMicrotask(() => controller.abort());
            }),
        });
        expect(aborted).toMatchObject({ cause: 'stopped' });
    });

    it('a handler that throws an AbortError of its own, with no Stop and no timeout, gives no cause', async () => {
        // Nobody stopped it and it did not run out of time: "Stopped" would say the person did.
        const aborted = await abortOf({
            toolLookup: () => async () => { throw Object.assign(new Error('fetch aborted'), { name: 'AbortError' }); },
        });
        expect(aborted).toEqual({ type: 'tool-aborted', toolCallId: 'c1' });
    });
});
