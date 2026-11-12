/**
 * An approved call of a sub-agent runs on its line.
 *
 * A paused run hands a sub-agent's browser tool to the page, which asks the person. Approved,
 * the page says so with `tool-approved` carrying the sub-agent's `agentId` — the row that waits
 * is in the sub-agent's lane, not in the reply — and the lane's row leaves "awaiting-approval"
 * while the page runs the tool, as a reply's own row does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { aparteGlobalConfig, type AparteStreamRunEvent } from '@aparte/core';
import { setupSubagents, subagentOf, subagentStatus } from '../index.js';
import { as, callIn, chat } from './harness.js';

let stop: (() => void) | undefined;
afterEach(() => {
    document.body.innerHTML = '';
    stop?.();
    aparteGlobalConfig.reset();
});

describe("an approved call of a sub-agent's", () => {
    it("leaves awaiting-approval in the sub-agent's lane, and the reply gains no row", () => {
        stop = setupSubagents();
        const c = chat();
        c.run(
            { type: 'run-start' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 'a1', name: 'Writer', toolCallId: 'c1' },
            ...as('a1',
                { type: 'turn-start' },
                { type: 'tool-start', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' } },
                // What the page says when its own gate asks about the browser tool.
                { type: 'tool-awaiting-approval', toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' } },
            ),
            { type: 'run-suspended', pending: [{ toolCallId: 'w1', name: 'write_file', input: { path: 'a.ts' }, reason: 'external', agentId: 'a1' }] },
        );
        const lane = () => subagentOf(callIn(c.segments(), 'c1')!)!;
        expect(callIn(lane().segments, 'w1')!.status).toBe('awaiting-approval');
        expect(subagentStatus(callIn(c.segments(), 'c1')!)).toBe('waiting');

        // The client's row events for the pause: an adapter of its own on the same reply.
        const rowEvents = c.again();
        rowEvents({ type: 'tool-approved', toolCallId: 'w1', agentId: 'a1' } as AparteStreamRunEvent);

        expect(callIn(lane().segments, 'w1')!.status).toBe('pending');
        expect(subagentStatus(callIn(c.segments(), 'c1')!)).toBe('running');
        expect(callIn(c.segments(), 'w1')).toBeUndefined();
    });
});
