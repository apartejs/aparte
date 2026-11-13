/**
 * The run's one-question-at-a-time lock is given back however a question ends — including
 * when announcing it throws (an emitter, or an observer behind it, that crashes on
 * `tool-awaiting-approval`). Held for good, every later gated call waits on it and the step
 * never settles: the run hangs instead of failing.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import type { StreamRunEvent } from '../stream-events';
import { ask, done, scripted, text, toolUse } from './sub-agent-script';

const within = <T>(promise: Promise<T>, ms: number): Promise<T | 'hung'> =>
    Promise.race([promise, new Promise<'hung'>((r) => setTimeout(() => r('hung'), ms))]);

describe('an observer that throws on a question does not hang the run', () => {
    it.each([true, false])('parallelTools: %s — the run fails on the throw, in bounded time', async (parallelTools) => {
        // Three calls queue for the question; the observer crashes on the SECOND announcement,
        // while the third still waits its turn behind it.
        const { transportCall } = scripted({ parent: [[toolUse('g1', 'gated'), toolUse('g2', 'gated'), toolUse('g3', 'gated'), done], [text('Done.'), done]] });
        let announced = 0;
        const outcome = runStreamAgent({
            messageId: 'm1', baseRequest: ask('parent'), transportCall, parallelTools,
            toolLookup: () => async () => ({ content: 'ran' }),
            toolConfigLookup: () => ({ needsApproval: true }),
            approvalResolver: () => new Promise((resolve) => setTimeout(() => resolve({ approved: true }), 5)),
            emitter: (e: StreamRunEvent) => {
                if (e.type === 'tool-awaiting-approval' && ++announced === 2) throw new Error('observer crashed');
            },
            signal: new AbortController().signal,
        }).then(() => 'ended', (error: Error) => error.message);
        expect(await within(outcome, 500)).toBe('observer crashed');
    });
});
