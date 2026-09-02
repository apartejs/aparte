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
// The engine's own event type: this suite needs nothing from core.
import type { StreamChatEvent as AparteStreamEvent } from '../stream-events.js';

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
            emitter: (e: { type: string }) => { events.push(e.type); },
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
            toolLookup: () => async (_call: unknown, signal: AbortSignal) => {
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

/**
 * A Stop is not a timeout.
 *
 * The race above made `toolTimeoutMs` true, but the PARENT signal stayed merely
 * signalled: `onParentAbort` aborted the child controller and a deaf handler
 * ignored it exactly as before, so a Stop pressed during a tool call did nothing
 * visible until the timeout budget expired — five minutes by default. The parent
 * abort has to be a racer too.
 */
describe('a Stop is raced as well', () => {
    it('a Stop unwinds the run even when the handler ignores its signal', async () => {
        const controller = new AbortController();
        const events: string[] = [];
        let handlerSettled = false;

        const run = runStreamAgent({
            messageId: 'a1',
            baseRequest: { modelId: 'm', messages: [] } as never,
            transportCall: toolCallOnce() as never,
            // Deaf on purpose, and slower than anything this test will wait for.
            // The Stop lands once the handler is in flight, which is the case the
            // child controller alone could never answer.
            toolLookup: () => async () => {
                setTimeout(() => controller.abort(), 0);
                await new Promise((r) => setTimeout(r, 60_000));
                handlerSettled = true;
                return { content: 'too late' };
            },
            toolConfigLookup: () => undefined,
            approvalResolver: async () => ({ approved: true }),
            emitter: (e: { type: string }) => { events.push(e.type); },
            signal: controller.signal,
            // A minute: far beyond this test's own budget, so only the parent
            // abort can end this run.
            toolTimeoutMs: 60_000,
        } as never);

        await run;

        expect(events, 'the announced call got its terminal event').toContain('tool-aborted');
        expect(events, 'and the run ended as aborted').toContain('run-aborted');
        expect(handlerSettled, 'the run did not wait for the deaf handler').toBe(false);
    });

    it('a handler that resolves after the Stop appends no tool result', async () => {
        const controller = new AbortController();
        const events: string[] = [];
        const appended: { role?: string }[] = [];
        let release: (() => void) | undefined;

        const run = runStreamAgent({
            messageId: 'a1',
            baseRequest: { modelId: 'm', messages: [] } as never,
            transportCall: toolCallOnce() as never,
            toolLookup: () => async () => {
                setTimeout(() => controller.abort(), 0);
                await new Promise<void>((r) => { release = r; });
                return { content: 'late content' };
            },
            toolConfigLookup: () => undefined,
            approvalResolver: async () => ({ approved: true }),
            onHistoryAppend: (m: { role?: string }) => { appended.push(m); },
            emitter: (e: { type: string }) => { events.push(e.type); },
            signal: controller.signal,
            toolTimeoutMs: 60_000,
        } as never);

        await run;
        // The handler settles only now — after the run is already over.
        release?.();
        await Promise.resolve();

        expect(events, 'no result was announced').not.toContain('tool-resolved');
        expect(appended.some((m) => m.role === 'tool_result'), 'and none was appended to the history').toBe(false);
    });
});
