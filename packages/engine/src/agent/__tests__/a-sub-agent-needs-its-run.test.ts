/**
 * A sub-agent is opened from the run its tool was called in. A handler called outside the
 * loop — a browser tool answering a paused server run — has none, and is told so in words
 * it can act on, rather than "cannot read properties of undefined".
 */
import { describe, it, expect } from 'vitest';
import { runSubAgent } from '../sub-agent';
import type { StreamToolRun } from '../stream-events';
import { ask } from './sub-agent-script';

describe('a sub-agent needs its run', () => {
    it('rejects with a clear error when the handler was given none', async () => {
        const opened = runSubAgent(undefined as unknown as StreamToolRun, { request: ask('child') }, new AbortController().signal);
        await expect(opened).rejects.toThrow(TypeError);
        await expect(opened).rejects.toThrow(/needs the run its tool was called in/);
    });
});
