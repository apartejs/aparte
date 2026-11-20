/**
 * A sub-agent's reasoning that comes after its block was settled is a block of its own, in its
 * transcript as in the reply.
 *
 * Each sub-agent has its own stream adapter (a lane), fed its events without their `agentId`.
 * A sub-agent that reasoned, answered, then reasoned again in the same turn (or a server that
 * sent its `turn-start` once per run, apartejs/aparte#272) grew its first block, which read
 * "Thought for" while it grew, above the calls made since.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

describe("a sub-agent's later reasoning", () => {
    it('after it answered, with no turn-start between: a block of its own, the first one left as it was', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Reader', toolCallId: 'c1' },
            ...as('a1',
                { type: 'turn-start' },
                { type: 'thinking-delta', delta: 'The changelog first.' },
                { type: 'tool-start', toolCallId: 's1', name: 'read_file', input: {} },
                { type: 'tool-resolved', toolCallId: 's1', result: '## 0.16.11' },
                { type: 'thinking-delta', delta: 'Now the notes.' },
            ),
        );
        const segments = subagentOf(callIn(c.segments(), 'c1')!)!.segments;
        const thinking = segments.filter((s) => s.type === 'thinking') as { content: string; isStreaming?: boolean }[];
        expect(thinking.map((s) => s.content)).toEqual(['The changelog first.', 'Now the notes.']);
        expect(thinking[0]!.isStreaming).toBe(false);
        // In the order it happened: the first thought, the call, the second thought.
        expect(segments.map((s) => s.type)).toEqual(['thinking', 'tool_call', 'thinking']);
    });
});
