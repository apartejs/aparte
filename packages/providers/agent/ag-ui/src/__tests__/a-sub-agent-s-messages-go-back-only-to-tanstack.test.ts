/**
 * A resume hands the paused run's sub-agents' own messages back only to the agent that needs
 * them: TanStack AI, which resumes a paused sub-agent from its own messages, tagged with its
 * `subagentRunId` (its `SUBAGENT_STARTED` carried TanStack's `metadata.tanstack`). Any other
 * AG-UI agent (LangGraph, Agno, Mastra…) keeps its sub-agents' work itself, and its resume
 * carries exactly the page's history and the answers, as it did before the runner kept them.
 *
 * And the answer to a browser tool a TanStack sub-agent called goes with that sub-agent's
 * messages, after the assistant message that declares the call, tagged like them — never as a
 * top-level `tool` message ahead of the call it answers.
 */
import { describe, it, expect } from 'vitest';
import { agUi, finished, scripted, sse, started, turn } from './replay.js';

type Message = Record<string, unknown>;

const history = {
    messages: [
        { role: 'user', content: 'tidy up' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'spawn', name: 'delegate', input: {} }] },
    ],
    modelId: 'x',
    stream: true,
};

/** A sub-agent that writes, calls a tool, and pauses on an approval of it. */
const pausing = (metadata?: object) => sse(
    started('r1', 'conv'),
    { type: 'TOOL_CALL_START', toolCallId: 'spawn', toolCallName: 'delegate' },
    { type: 'TOOL_CALL_END', toolCallId: 'spawn' },
    { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'cleaner', parentToolCallId: 'spawn', ...(metadata ? { metadata } : {}) },
    { type: 'TEXT_MESSAGE_START', messageId: 'sm', role: 'assistant', subagentRunId: 's1' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'sm', delta: 'Deleting it.' },
    { type: 'TEXT_MESSAGE_END', messageId: 'sm' },
    { type: 'TOOL_CALL_START', toolCallId: 'd1', toolCallName: 'delete_file', subagentRunId: 's1' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'd1', delta: '{"path":"/x"}' },
    { type: 'TOOL_CALL_END', toolCallId: 'd1' },
    { type: 'SUBAGENT_FINISHED', subagentRunId: 's1', outcome: { type: 'suspended', interruptIds: ['i1'] } },
    finished({ outcome: { type: 'interrupt', interrupts: [{ id: 'i1', reason: 'tool_call', toolCallId: 'd1', subagentRunId: 's1' }] } }, 'r1', 'conv'),
);

async function resumeAfter(first: Response, outcomes: Record<string, object>, tools: object[] = []) {
    const f = scripted(first, sse(started('r2', 'conv'), finished({}, 'r2', 'conv')));
    const runner = agUi(f.fetch, { threadId: 'conv' });
    const request = { ...history, tools };
    const paused = await turn(runner, { baseRequest: request } as never);
    const ticket = String(paused.events.at(-1)!['ticket']);
    const resumed = await turn(runner, { baseRequest: request, deferral: { token: ticket, outcomes } } as never);
    expect(resumed.error).toBeUndefined();
    return { first: f.bodies[0]!['messages'] as Message[], sent: f.bodies[1]!['messages'] as Message[] };
}

describe('a sub-agent’s messages go back only to TanStack', () => {
    it('sends a LangGraph-like agent’s resume no sub-agent message: the history and the answers, as before', async () => {
        const { first, sent } = await resumeAfter(pausing(), { d1: { kind: 'decision', approved: true } });
        expect(sent.some((m) => 'subagentRunId' in m)).toBe(false);
        expect(sent).toEqual(first);
    });

    it('sends TanStack’s resume the sub-agent’s own messages, tagged, its card on the first', async () => {
        const { sent } = await resumeAfter(pausing({ tanstack: { subagentInput: { prompt: 'Clean.' } } }), { d1: { kind: 'decision', approved: true } });
        const own = sent.filter((m) => m['subagentRunId'] === 's1');
        expect(own.map((m) => m['role'])).toEqual(['assistant']);
        expect(own[0]).toMatchObject({
            content: 'Deleting it.',
            toolCalls: [{ id: 'd1', function: { name: 'delete_file', arguments: '{"path":"/x"}' } }],
            metadata: { tanstack: { subagent: { name: 'cleaner', status: 'suspended', interruptIds: ['i1'] } } },
        });
    });
});

describe('the answer to a TanStack sub-agent’s browser tool', () => {
    /** The sub-agent calls a tool of the page's; the run ends with it left to the page. */
    const callsTheBrowser = sse(
        started('r1', 'conv'),
        { type: 'TOOL_CALL_START', toolCallId: 'spawn', toolCallName: 'delegate' },
        { type: 'TOOL_CALL_END', toolCallId: 'spawn' },
        { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'painter', parentToolCallId: 'spawn', metadata: { tanstack: { subagentInput: { prompt: 'Paint.' } } } },
        { type: 'TOOL_CALL_START', toolCallId: 'b1', toolCallName: 'pick_color', subagentRunId: 's1' },
        { type: 'TOOL_CALL_END', toolCallId: 'b1' },
        { type: 'SUBAGENT_FINISHED', subagentRunId: 's1', outcome: { type: 'suspended', interruptIds: [] } },
        finished({ outcome: { type: 'success', pendingToolCallIds: ['b1'] } }, 'r1', 'conv'),
    );
    const pickColor = { name: 'pick_color', description: 'Ask the person for a colour.', inputSchema: { type: 'object', properties: {} } };

    it('follows the sub-agent’s assistant message that declares the call, tagged like it', async () => {
        const { first, sent } = await resumeAfter(callsTheBrowser, { b1: { kind: 'result', content: 'blue' } }, [pickColor]);
        const tail = sent.slice(first.length);
        expect(tail.map((m) => [m['role'], m['subagentRunId'], (m['toolCalls'] as Array<{ id: string }> | undefined)?.map((c) => c.id) ?? m['toolCallId']]))
            .toEqual([['assistant', 's1', ['b1']], ['tool', 's1', 'b1']]);
        expect(tail[1]).toMatchObject({ role: 'tool', toolCallId: 'b1', content: 'blue' });
    });
});
