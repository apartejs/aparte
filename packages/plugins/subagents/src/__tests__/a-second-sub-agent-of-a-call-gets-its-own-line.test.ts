/**
 * A second sub-agent of a call gets its own line.
 *
 * A call's row can be one sub-agent's line, not two. The first sub-agent a call opens is that
 * call; a second (a tool that fans out) gets a `subagent` segment of its own, beside it, and
 * their conversations stay apart however their events interleave.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig } from '@aparte/core';
import { setupSubagents, subagentOf } from '../index.js';
import { as, callIn, chat, shown, textOfAll } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

describe('a second sub-agent of a call', () => {
    it('gets its own line, and the two lanes stay apart', () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'fan_out', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Left', toolCallId: 'c1' },
            { type: 'agent-start', agentId: 'a2', name: 'Right', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'From the left. ' }),
            ...as('a2', { type: 'turn-start' }, { type: 'text-delta', delta: 'From the right. ' }),
            ...as('a1', { type: 'text-delta', delta: 'Left again.' }, { type: 'text-flush' }),
            ...as('a2', { type: 'text-delta', delta: 'Right again.' }, { type: 'text-flush' }),
            { type: 'agent-end', agentId: 'a1', status: 'done' },
            { type: 'agent-end', agentId: 'a2', status: 'done' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'both' },
            { type: 'run-done' },
        );
        expect(c.segments().map((s) => s.id)).toEqual(['tool-c1', 'subagent-a2']);
        const left = subagentOf(callIn(c.segments(), 'c1')!)!;
        const right = subagentOf(c.segment('subagent-a2')!)!;
        expect(left.id).toBe('a1');
        expect(right.id).toBe('a2');
        expect(textOfAll(left.segments)).toBe('From the left. Left again.');
        expect(textOfAll(right.segments)).toBe('From the right. Right again.');
        expect(shown(c.row('tool-c1'), 'name')).toBe('Left');
        expect(shown(c.row('subagent-a2'), 'name')).toBe('Right');
        expect(c.host.querySelectorAll('.aparte-segment-tool-call')).toHaveLength(2);
    });

    it('a call held back for a sub-agent announced before it is written once the call starts', async () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            // Announced first, its call after: an agent that streams out of order.
            { type: 'agent-start', agentId: 'a1', name: 'Early', toolCallId: 'c1' },
            ...as('a1', { type: 'turn-start' }, { type: 'text-delta', delta: 'Before my call.' }),
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
        );
        // Not a second line: the call it names is its line, once it exists.
        await Promise.resolve();
        expect(c.segments().map((s) => s.id)).toEqual(['tool-c1']);
        expect(textOfAll(subagentOf(callIn(c.segments(), 'c1')!)!.segments)).toBe('Before my call.');
        expect(shown(c.row('tool-c1'), 'name')).toBe('Early');
    });
});
