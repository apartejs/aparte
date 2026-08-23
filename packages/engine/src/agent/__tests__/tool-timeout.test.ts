/**
 * `toolTimeoutMs` must actually time a handler out.
 *
 * All three copies of this dance — two inline in core, one here — did
 * `setTimeout(() => controller.abort(), ms)` and then `await handler(call, signal)`,
 * with no race. Aborting a controller is a REQUEST the handler is free to ignore,
 * and the default shape of a consumer tool ignores it:
 * `async () => ({ content: await fetch(...).then(r => r.text()) })` never reads its
 * signal. So the timeout fired, nothing rejected, and the loop waited forever on an
 * option whose JSDoc promises a timeout.
 *
 * The handler below is that default shape, written to be deliberately deaf: it
 * never looks at the signal.
 */
import { describe, it, expect, vi } from 'vitest';
import { runStreamAgent } from '../stream-run.js';
import type { AparteStreamEvent } from '@aparte/core';

/** A transport that asks for one tool call and then stops. */
function toolCallOnce() {
    let turn = 0;
    return async () => {
        turn++;
        if (turn === 1) {
            return new ReadableStream<AparteStreamEvent>({
                start(c) {
                    c.enqueue({ type: 'tool_use', id: 'c1', name: 'slow', input: {} } as AparteStreamEvent);
                    c.enqueue({ type: 'done' } as AparteStreamEvent);
                    c.close();
                },
            });
        }
        return new ReadableStream<AparteStreamEvent>({
            start(c) {
                c.enqueue({ type: 'text', delta: 'done then' } as AparteStreamEvent);
                c.enqueue({ type: 'done' } as AparteStreamEvent);
                c.close();
            },
        });
    };
}

describe('the tool timeout is raced, not merely signalled', () => {
    it('a handler that ignores its signal is still timed out', async () => {
        let handlerSettled = false;
        const events: string[] = [];

        const run = runStreamAgent({
            messageId: 'a1',
            baseRequest: { modelId: 'm', messages: [] } as never,
            transportCall: toolCallOnce() as never,
            // Deaf on purpose: no `signal` anywhere. This is what a consumer writes.
            toolLookup: () => async () => {
                await new Promise((r) => setTimeout(r, 5_000));
                handlerSettled = true;
                return { content: 'too late' };
            },
            toolConfigLookup: () => undefined,
            approvalResolver: async () => ({ approved: true }),
            emitter: (e) => { events.push(e.type); },
            signal: new AbortController().signal,
            toolTimeoutMs: 30,
        } as never);

        // The assertion is that it SETTLES. `runStreamAgent` resolves to
        // `AparteUsage | undefined`, so the value proves nothing; without the race
        // this never returns and the test dies on its own timeout instead.
        await run;
        expect(handlerSettled, 'the run finished without waiting for the deaf handler').toBe(false);
        expect(events, 'and the turn continued afterwards').toContain('run-done');
    });

    it('a handler that finishes inside the budget is unaffected', async () => {
        const run = runStreamAgent({
            messageId: 'a1',
            baseRequest: { modelId: 'm', messages: [] } as never,
            transportCall: toolCallOnce() as never,
            toolLookup: () => async () => ({ content: 'in time' }),
            toolConfigLookup: () => undefined,
            approvalResolver: async () => ({ approved: true }),
            emitter: () => { /* not asserted here */ },
            signal: new AbortController().signal,
            toolTimeoutMs: 5_000,
        } as never);

        await run;
    });

    it('the timeout does not fire for a handler that honours its signal first', async () => {
        let sawSignal = false;
        const run = runStreamAgent({
            messageId: 'a1',
            baseRequest: { modelId: 'm', messages: [] } as never,
            transportCall: toolCallOnce() as never,
            toolLookup: () => async (_call, signal) => {
                // A well-behaved handler rejects on its own terms — which is why the
                // signal is still fired before the race resolves.
                await new Promise((_res, rej) => {
                    signal.addEventListener('abort', () => {
                        sawSignal = true;
                        rej(Object.assign(new Error('aborted'), { name: 'AbortError' }));
                    }, { once: true });
                });
                return { content: 'unreachable' };
            },
            toolConfigLookup: () => undefined,
            approvalResolver: async () => ({ approved: true }),
            emitter: () => { /* not asserted here */ },
            signal: new AbortController().signal,
            toolTimeoutMs: 30,
        } as never);

        await run;
        await vi.waitFor(() => expect(sawSignal, 'the handler was given the chance to abort itself').toBe(true));
    });
});
