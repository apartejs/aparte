// @vitest-environment node
/**
 * A Stop on a stream that has already failed leaves no unhandled rejection.
 *
 * An aborted `fetch` errors its body stream, and the abort listener then cancels the
 * reader. `reader.cancel()` returns a PROMISE, which rejects on an errored stream; the
 * listener wrapped it in `try { void … }`, which catches nothing asynchronous, so every
 * Stop at the wrong moment printed an uncaught `AbortError`. Vitest fails a run on an
 * unhandled rejection, which is what this file leans on.
 */
import { describe, it, expect } from 'vitest';
import { readableToAsyncIterable } from '../stream-adapter.js';
import type { AparteStreamEvent } from '../../types/index.js';

describe('readableToAsyncIterable on abort', () => {
    it('swallows the cancel of a stream the abort already errored', async () => {
        const controller = new AbortController();
        // Like a fetch body: the abort errors the stream BEFORE our listener cancels it.
        const stream = new ReadableStream<AparteStreamEvent>({
            start(c) { controller.signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); },
        });
        const iterator = readableToAsyncIterable(stream, controller.signal)[Symbol.asyncIterator]();
        const next = iterator.next();
        controller.abort();
        await expect(next).rejects.toThrow('aborted');
        // Let the cancel's rejection surface, if nothing handled it.
        await new Promise((resolve) => setTimeout(resolve, 10));
    });
});
