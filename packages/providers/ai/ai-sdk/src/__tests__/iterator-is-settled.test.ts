/**
 * The bridge must let go of the SDK's stream on EVERY exit, not only when the
 * consumer cancels.
 *
 * `cancel()` is wired precisely so the AI SDK iterator is told to stop — calling
 * `.return()` propagates cancellation the way breaking a `for await` loop would.
 * The two in-band terminals, `finish` and `error`, returned straight out of the
 * loop and skipped it, so after an error part the vendor call was left to drain on
 * its own.
 */
import { describe, it, expect, vi } from 'vitest';
import type { AparteStreamEvent } from '@aparte/core';
import { fullStreamToAparteEvents } from '../index';

type Part = { type: string } & Record<string, unknown>;

/** An iterable that records whether it was told to stop. */
function watched(parts: Part[]): { iterable: AsyncIterable<Part>; returned: ReturnType<typeof vi.fn> } {
    const returned = vi.fn();
    let i = 0;
    const iterable: AsyncIterable<Part> = {
        [Symbol.asyncIterator]: () => ({
            async next(): Promise<IteratorResult<Part>> {
                if (i < parts.length) return { done: false, value: parts[i++]! };
                return { done: true, value: undefined };
            },
            async return(): Promise<IteratorResult<Part>> {
                returned();
                return { done: true, value: undefined };
            },
        }),
    };
    return { iterable, returned };
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (; ;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

describe('fullStreamToAparteEvents settles the SDK iterator', () => {
    it('after a finish part', async () => {
        const { iterable, returned } = watched([
            { type: 'text-delta', text: 'hi' },
            {
                type: 'finish',
                totalUsage: {
                    inputTokens: { total: 5, noCache: 5, cacheRead: 3, cacheWrite: undefined },
                    outputTokens: { total: 2, text: 2, reasoning: undefined },
                },
            },
            { type: 'text-delta', text: 'never' },
        ]);
        const events = await collect(fullStreamToAparteEvents(iterable));
        expect(events.at(-1)?.type).toBe('done');
        expect(returned).toHaveBeenCalled();
    });

    it('after an error part', async () => {
        const { iterable, returned } = watched([{ type: 'error', error: new Error('boom') }]);
        const events = await collect(fullStreamToAparteEvents(iterable));
        expect(events).toEqual([{ type: 'error', message: 'boom' }]);
        expect(returned).toHaveBeenCalled();
    });

    it('and when the stream simply ends', async () => {
        const { iterable, returned } = watched([{ type: 'text-delta', text: 'hi' }]);
        await collect(fullStreamToAparteEvents(iterable));
        expect(returned).toHaveBeenCalled();
    });
});
