/**
 * A sub-agent's line is the row of the call that opened it (`parentToolCallId`). A call
 * streamed as chunks has no TOOL_CALL_END to start it, so `SUBAGENT_STARTED` starts it
 * first: the row exists before the sub-agent that hangs from it.
 */
import { describe, it, expect } from 'vitest';
import { agUi, finished, scripted, sse, started, turn } from './replay.js';

describe('a spawning call starts before its sub-agent', () => {
    it('starts a chunked call with no end before announcing the sub-agent it opened', async () => {
        const f = scripted(sse(
            started(),
            { type: 'TOOL_CALL_CHUNK', toolCallId: 'spawn', toolCallName: 'delegate', delta: '{"task":"sum up"}' },
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'summariser', description: 'Sums up a page.', parentToolCallId: 'spawn' },
            { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm', role: 'assistant', delta: 'Summed.', subagentRunId: 's1' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1', result: 'Summed.' },
            { type: 'TOOL_CALL_RESULT', messageId: 'r', toolCallId: 'spawn', content: 'Summed.' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'spawn', name: 'delegate', input: { task: 'sum up' } },
            { type: 'agent-start', agentId: 's1', name: 'summariser', description: 'Sums up a page.', toolCallId: 'spawn' },
            { type: 'text-delta', delta: 'Summed.', agentId: 's1' },
            { type: 'text-flush', agentId: 's1' },
            { type: 'agent-end', agentId: 's1', status: 'done', result: 'Summed.' },
            { type: 'tool-resolved', toolCallId: 'spawn', result: 'Summed.' },
            { type: 'run-done' },
        ]);
    });

    it('starts a sub-agent’s own spawning call under it, and names it as the parent of the one it opens', async () => {
        const f = scripted(sse(
            started(),
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'lead' },
            { type: 'TOOL_CALL_CHUNK', toolCallId: 'c1', toolCallName: 'delegate', delta: '{}', subagentRunId: 's1' },
            { type: 'SUBAGENT_STARTED', subagentRunId: 's2', name: 'helper', parentToolCallId: 'c1', parentSubagentRunId: 's1' },
            { type: 'SUBAGENT_ERROR', subagentRunId: 's2', message: 'no access' },
            { type: 'TOOL_CALL_RESULT', messageId: 'r', toolCallId: 'c1', content: 'failed', subagentRunId: 's1' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'agent-start', agentId: 's1', name: 'lead' },
            { type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {}, agentId: 's1' },
            { type: 'agent-start', agentId: 's2', name: 'helper', toolCallId: 'c1', parentAgentId: 's1' },
            { type: 'agent-end', agentId: 's2', status: 'failed', error: 'no access', parentAgentId: 's1' },
            { type: 'tool-resolved', toolCallId: 'c1', result: 'failed', agentId: 's1' },
            { type: 'agent-end', agentId: 's1', status: 'done' },
            { type: 'run-done' },
        ]);
    });
});
