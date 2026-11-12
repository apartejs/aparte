/**
 * AG-UI 1.0 lets a producer tag work with a `subagentRunId` without ever reporting the
 * invocation's lifecycle, and a consumer must accept it. The runner still hands the
 * client a whole sub-agent: an `agent-start` at its first attributed event, and an
 * `agent-end` before the run ends.
 */
import { describe, it, expect } from 'vitest';
import { agUi, finished, scripted, sse, started, turn } from './replay.js';

describe('a sub-agent never announced is still one', () => {
    it('opens at its first attributed event and ends, done, before the run does', async () => {
        const f = scripted(sse(
            started(),
            { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant', subagentRunId: 's1' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'delegated ', subagentRunId: 's1' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'answer' },
            { type: 'TEXT_MESSAGE_END', messageId: 'm', subagentRunId: 's1' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'agent-start', agentId: 's1' },
            { type: 'text-delta', delta: 'delegated ', agentId: 's1' },
            { type: 'text-delta', delta: 'answer', agentId: 's1' },
            { type: 'text-flush', agentId: 's1' },
            { type: 'agent-end', agentId: 's1', status: 'done' },
            { type: 'run-done' },
        ]);
    });

    it('ends waiting when the run pauses on one of its calls', async () => {
        const f = scripted(sse(
            started(),
            { type: 'TOOL_CALL_START', toolCallId: 'd1', toolCallName: 'delete_file', subagentRunId: 's1' },
            { type: 'TOOL_CALL_END', toolCallId: 'd1' },
            finished({ outcome: { type: 'interrupt', interrupts: [{ id: 'i1', reason: 'tool_call', toolCallId: 'd1' }] } }),
        ));
        const { events } = await turn(agUi(f.fetch));
        expect(events.map((e) => e.type)).toEqual(['run-start', 'turn-start', 'agent-start', 'tool-start', 'tool-awaiting-approval', 'agent-end', 'run-suspended']);
        expect(events.find((e) => e.type === 'agent-end')).toEqual({ type: 'agent-end', agentId: 's1', status: 'waiting' });
    });
});
