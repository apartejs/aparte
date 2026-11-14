/**
 * A provider that rejects on Stop ends the run as stopped.
 *
 * Stop aborts the run's signal, and a provider reading a fetch on that signal sees its stream
 * fail: the read the loop is parked on REJECTS (an `AbortError`, or whatever the cut socket
 * says) instead of closing quietly. That is still a Stop, not a provider failure: the run ends
 * exactly as when the stream closes — a call still running is told it was stopped, then
 * `run-aborted`, then `run-done` — and `runStreamAgent` resolves. A provider that fails while
 * nobody stopped the run still fails it.
 *
 * Both ways of running a step's calls: at the same time, where the reply is read while a call
 * runs, and one after another, where it is not.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import type { StreamChatEvent, StreamRunEvent, StreamToolHandler } from '../stream-events';
import { ask, done, recorder, text, toolUse } from './sub-agent-script';

/** How the reply's next event ends once the run is stopped: it closes, or it rejects. */
type Ending = 'quiet' | 'abort-error' | 'other-error';

/**
 * One step of a turn: an event; `'hold'`, a read that waits until the run is stopped and then
 * ends as `ending` says; or `'fail'`, a read that rejects at once, nobody having stopped anything.
 */
type Step = StreamChatEvent | 'hold' | 'fail';

/** A hand-written provider: each transport call plays the next turn. */
function provider(signal: AbortSignal, turns: Step[][], ending: Ending) {
    let calls = 0;
    let parked = false;
    const transportCall = async () => {
        const steps = turns[calls++] ?? [done];
        let i = 0;
        const iterator: AsyncIterator<StreamChatEvent> = {
            next: () => {
                const step = steps[i++];
                if (step === undefined) return Promise.resolve({ done: true, value: undefined });
                if (step === 'fail') return Promise.reject(new Error('connection reset'));
                if (step !== 'hold') return Promise.resolve({ done: false, value: step });
                parked = true;
                return new Promise<IteratorResult<StreamChatEvent>>((resolve, reject) => {
                    const end = () => {
                        if (ending === 'quiet') resolve({ done: true, value: undefined });
                        else if (ending === 'abort-error') reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
                        else reject(new Error('socket hang up'));
                    };
                    if (signal.aborted) end();
                    else signal.addEventListener('abort', end, { once: true });
                });
            },
            return: async () => ({ done: true, value: undefined }),
        };
        return { [Symbol.asyncIterator]: () => iterator };
    };
    return { transportCall, parked: () => parked };
}

/** Lets the loop, its stream and its handlers move as far as they can without the test. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A handler that says when it started, never answers, and rejects when its signal fires. */
function hangingTool() {
    let started!: () => void;
    const startedP = new Promise<void>((r) => { started = r; });
    const handler: StreamToolHandler = (_call, signal) => new Promise((_, reject) => {
        started();
        const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (signal.aborted) fail();
        else signal.addEventListener('abort', fail, { once: true });
    });
    return { handler, started: startedP };
}

const quick: StreamToolHandler = async () => ({ content: 'A' });

/**
 * Where the Stop lands. `mid-step`: while a call of the step runs and the reply has more to
 * say. `between steps`: the first step's call answered, the model's next reply has begun, and
 * nothing runs.
 */
const scenarios = {
    'mid-step, with a call running': {
        turns: [[text('Looking. '), toolUse('a', 'slow'), 'hold']] as Step[][],
        running: 'a' as string | undefined,
    },
    'between steps, with nothing running': {
        turns: [[toolUse('a', 'quick'), done], [text('Here is '), 'hold']] as Step[][],
        running: undefined as string | undefined,
    },
};

async function stopped(scenario: keyof typeof scenarios, ending: Ending, parallelTools: boolean) {
    const { turns } = scenarios[scenario];
    const abort = new AbortController();
    const p = provider(abort.signal, turns, ending);
    const slow = hangingTool();
    const { events, emitter } = recorder();
    const run = runStreamAgent({
        messageId: 'm1', baseRequest: ask('model'), emitter, signal: abort.signal, parallelTools,
        transportCall: p.transportCall,
        toolLookup: (name) => (name === 'slow' ? slow.handler : quick),
    });
    let rejection: unknown;
    const settled = run.then(() => 'resolved', (error: unknown) => { rejection = error; return 'rejected'; });
    if (scenarios[scenario].running) await slow.started;
    await settle();
    abort.abort();
    return { outcome: await settled, rejection, events, parked: p.parked() };
}

const of = (events: StreamRunEvent[], type: StreamRunEvent['type']) => events.filter((e) => e.type === type);

describe.each([
    ['at the same time', true],
    ['one after another', false],
] as const)('a provider that rejects on Stop ends the run as stopped, calls run %s', (_mode, parallelTools) => {
    describe.each(Object.keys(scenarios) as (keyof typeof scenarios)[])('%s', (scenario) => {
        it.each([
            ['an AbortError', 'abort-error'],
            ['another error, raised once the signal aborted', 'other-error'],
        ] as const)('ends as a quiet close does when the read rejects with %s', async (_label, ending) => {
            const quiet = await stopped(scenario, 'quiet', parallelTools);
            const rejecting = await stopped(scenario, ending, parallelTools);

            // The run is not failed: it resolves, as it does when the stream closes.
            expect(rejecting.rejection).toBeUndefined();
            expect(rejecting.outcome).toBe('resolved');
            // Everything it said is what it says for a quiet close, in the same order.
            expect(rejecting.events).toEqual(quiet.events);
            expect(rejecting.events.slice(-2).map((e) => e.type)).toEqual(['run-aborted', 'run-done']);

            const running = scenarios[scenario].running;
            if (running) {
                // The call still at work is told it was stopped, once.
                expect(of(rejecting.events, 'tool-aborted')).toEqual([{ type: 'tool-aborted', toolCallId: running, cause: 'stopped' }]);
            } else {
                expect(of(rejecting.events, 'tool-aborted')).toEqual([]);
            }
            // At the same time, the reply is read while a call runs, so the Stop finds the loop
            // parked on the provider; one after another, it is not read until the call is over.
            expect(rejecting.parked).toBe(parallelTools || !running);
        });
    });

    it('still fails the run when the provider fails and nobody stopped it', async () => {
        for (const turns of [[[text('Hel'), 'fail']], [[toolUse('a', 'quick'), 'fail']]] as Step[][][]) {
            const abort = new AbortController();
            const p = provider(abort.signal, turns, 'abort-error');
            const { events, emitter } = recorder();
            await expect(runStreamAgent({
                messageId: 'm1', baseRequest: ask('model'), emitter, signal: abort.signal, parallelTools,
                transportCall: p.transportCall, toolLookup: () => quick,
            })).rejects.toThrow('connection reset');
            expect(of(events, 'run-aborted')).toEqual([]);
            expect(of(events, 'run-done')).toEqual([]);
        }
    });
});
