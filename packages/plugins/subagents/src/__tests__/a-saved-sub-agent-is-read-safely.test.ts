/**
 * A saved sub-agent is read safely.
 *
 * `subagentOf` reads what a conversation stored, which may come from an older version, a
 * hand-written backend or a store that dropped a field: a segment that stands for no
 * sub-agent reads as none, an unknown state as stopped, and missing segments as none.
 */
import { describe, it, expect } from 'vitest';
import type { AparteSegment } from '@aparte/core';
import { subagentOf, subagentStatus } from '../index.js';
import { callStatusOf, statusOfCall } from '../status.js';

const call = (subagent: unknown, status = 'resolved'): AparteSegment =>
    ({ id: 'tool-c1', type: 'tool_call', status, toolCall: { id: 'c1', name: 'delegate', input: {} }, subagent } as unknown as AparteSegment);

describe('a saved sub-agent', () => {
    it('is none when there is nothing that names one', () => {
        expect(subagentOf(call(undefined))).toBeUndefined();
        expect(subagentOf(call('a1'))).toBeUndefined();
        expect(subagentOf(call({ name: 'no id' }))).toBeUndefined();
        expect(subagentOf({ id: 't', type: 'text', content: 'x', subagent: { id: 'a1' } } as unknown as AparteSegment)).toBeUndefined();
        expect(subagentStatus(call(undefined))).toBe('stopped');
    });

    it('reads an unknown state as stopped, and missing segments as none', () => {
        expect(subagentOf(call({ id: 'a1', status: 'exploded' }))).toEqual({ id: 'a1', status: 'stopped', segments: [] });
    });

    it("maps every call state to a sub-agent's, and back", () => {
        expect(['pending', 'awaiting-approval', 'resolved', 'failed', 'aborted', 'rejected', undefined].map((s) => statusOfCall(s as never)))
            .toEqual(['running', 'waiting', 'done', 'failed', 'stopped', 'stopped', 'running']);
        expect((['running', 'waiting', 'done', 'failed', 'stopped'] as const).map(callStatusOf))
            .toEqual(['pending', 'awaiting-approval', 'resolved', 'failed', 'aborted']);
    });
});
