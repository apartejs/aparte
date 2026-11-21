/**
 * A tool has its own time limit, and a limit too large for a timer is no limit.
 *
 * `toolTimeoutMs` was one bound for every tool of the run: a tool that runs a whole sub-agent on a
 * slow local model, or a command with its own ten-minute limit, was cut at five minutes like a
 * lookup, and the run stopped with it. A host raised the run's bound to hours to spare one tool,
 * and lost the bound for all the others. And `Infinity`, the natural way to say "no limit", fired
 * at once: `setTimeout` reads any delay above 2^31-1 ms as zero.
 */
import { describe, it, expect } from 'vitest';
import { runStreamAgent } from '../stream-run';
import type { StreamRunEvent, StreamToolConfig, StreamToolHandler } from '../stream-events';
import { ask, done, scripted, toolUse } from './sub-agent-script';

/** Answers after `ms`, whatever its signal says: a tool slower than a short bound. */
const after = (ms: number): StreamToolHandler => () => new Promise((resolve) => setTimeout(() => resolve({ content: 'answered' }), ms));

async function run(toolTimeoutMs: number, config: (name: string) => StreamToolConfig | undefined = () => undefined) {
    const events: StreamRunEvent[] = [];
    const { transportCall } = scripted({ parent: [[toolUse('a', 'slow')], [done]] });
    await runStreamAgent({
        messageId: 'm1', baseRequest: ask('parent'), transportCall,
        toolLookup: () => after(40),
        toolConfigLookup: config,
        toolTimeoutMs,
        emitter: (e) => { events.push(e); },
        signal: new AbortController().signal,
    });
    return events.filter((e) => e.type === 'tool-resolved' || e.type === 'tool-aborted').map((e) => e.type);
}

describe('a tool call\'s time limit', () => {
    it('Infinity for the run is no limit, not an immediate one', async () => {
        expect(await run(Number.POSITIVE_INFINITY)).toEqual(['tool-resolved']);
    });

    it('a delay above what a timer holds is no limit either', async () => {
        expect(await run(2 ** 31)).toEqual(['tool-resolved']);
    });

    it('a tool\'s own limit wins over the run\'s', async () => {
        expect(await run(10, () => ({ timeoutMs: 1000 }))).toEqual(['tool-resolved']);
        expect(await run(10, () => ({ timeoutMs: Number.POSITIVE_INFINITY }))).toEqual(['tool-resolved']);
    });

    it('a tool with no limit of its own keeps the run\'s', async () => {
        expect(await run(10)).toEqual(['tool-aborted']);
        expect(await run(1000, () => ({ timeoutMs: 10 }))).toEqual(['tool-aborted']);
    });
});
