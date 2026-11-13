/**
 * An interrupt raised inside a sub-agent (AG-UI 1.0: an interrupt tagged with a
 * `subagentRunId` was raised inside that invocation, and the paused invocation still
 * closes, `suspended`). The approval is asked under the sub-agent, the pending call says
 * whose it is, and the resume settles the call's row under that same sub-agent — the
 * row lives in the sub-agent's conversation, the parent has none for it. A producer may
 * continue the invocation under the same id on the resuming run (LangGraph does): that
 * is the same agent going on, announced again.
 */
import { describe, it, expect } from 'vitest';
import { agUi, finished, scripted, sse, started, turn } from './replay.js';
import type { Event } from './replay.js';

const pausing = (tagged: boolean) => sse(
    started('r1', 'conv'),
    { type: 'TOOL_CALL_START', toolCallId: 'spawn', toolCallName: 'delegate' },
    { type: 'TOOL_CALL_END', toolCallId: 'spawn' },
    { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'cleaner', parentToolCallId: 'spawn' },
    { type: 'TOOL_CALL_START', toolCallId: 'd1', toolCallName: 'delete_file', subagentRunId: 's1' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'd1', delta: '{"path":"/x"}' },
    { type: 'TOOL_CALL_END', toolCallId: 'd1' },
    { type: 'SUBAGENT_FINISHED', subagentRunId: 's1', outcome: { type: 'suspended', interruptIds: ['i1'] } },
    finished({
        outcome: { type: 'interrupt', interrupts: [{ id: 'i1', reason: 'tool_call', toolCallId: 'd1', ...(tagged ? { subagentRunId: 's1' } : {}) }] },
    }, 'r1', 'conv'),
);

const history = {
    messages: [
        { role: 'user', content: 'tidy up' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'spawn', name: 'delegate', input: {} }, { id: 'd1', name: 'delete_file', input: { path: '/x' } }] },
    ],
    modelId: 'x',
    stream: true,
};

describe('a sub-agent’s pause is answered under it', () => {
    it('ends the sub-agent waiting, asks under it, and names it on the pending call and in the ticket', async () => {
        const f = scripted(pausing(true));
        const { events } = await turn(agUi(f.fetch, { threadId: 'conv' }));
        expect(events.slice(0, -1)).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'spawn', name: 'delegate', input: {} },
            { type: 'agent-start', agentId: 's1', name: 'cleaner', toolCallId: 'spawn' },
            { type: 'tool-start', toolCallId: 'd1', name: 'delete_file', input: { path: '/x' }, agentId: 's1' },
            { type: 'agent-end', agentId: 's1', status: 'waiting' },
            { type: 'tool-awaiting-approval', toolCallId: 'd1', name: 'delete_file', input: { path: '/x' }, agentId: 's1' },
        ]);
        const suspended = events.at(-1)!;
        expect(suspended.type).toBe('run-suspended');
        expect(suspended['pending']).toEqual([{ toolCallId: 'd1', name: 'delete_file', input: { path: '/x' }, reason: 'approval', agentId: 's1' }]);
        expect(JSON.parse(String(suspended['ticket']))).toMatchObject({ interrupts: [{ id: 'i1', toolCallId: 'd1', kind: 'approval' }], agents: { d1: 's1' } });
    });

    it('takes an untagged interrupt’s owner from its call', async () => {
        const f = scripted(pausing(false));
        const { events } = await turn(agUi(f.fetch, { threadId: 'conv' }));
        expect(events.find((e) => e.type === 'tool-awaiting-approval')).toMatchObject({ toolCallId: 'd1', agentId: 's1' });
        expect((events.at(-1)!['pending'] as Event[])[0]).toMatchObject({ toolCallId: 'd1', agentId: 's1' });
    });

    it('settles the approved call under the sub-agent on resume, and reads its id announced again as the same agent going on', async () => {
        const first = scripted(pausing(true));
        const paused = await turn(agUi(first.fetch, { threadId: 'conv' }));
        const ticket = String(paused.events.at(-1)!['ticket']);

        const second = scripted(sse(
            started('r2', 'conv'),
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'cleaner', parentToolCallId: 'spawn' },
            { type: 'TOOL_CALL_RESULT', messageId: 'r', toolCallId: 'd1', content: 'deleted' },
            { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant', subagentRunId: 's1' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'Deleted.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'm' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1', result: 'Deleted /x.' },
            { type: 'TOOL_CALL_RESULT', messageId: 'rs', toolCallId: 'spawn', content: 'Deleted /x.' },
            { type: 'TEXT_MESSAGE_START', messageId: 'p', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'p', delta: 'Done.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'p' },
            finished({}, 'r2', 'conv'),
        ));
        const resumed = await turn(agUi(second.fetch, { threadId: 'conv' }), {
            baseRequest: history,
            deferral: { token: ticket, outcomes: { d1: { kind: 'decision', approved: true } } },
        } as never);
        expect(second.bodies[0]).toMatchObject({ resume: [{ interruptId: 'i1', status: 'resolved', payload: { approved: true } }] });
        expect(resumed.error).toBeUndefined();
        expect(resumed.events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'tool-approved', toolCallId: 'd1', agentId: 's1' },
            { type: 'agent-start', agentId: 's1', name: 'cleaner', toolCallId: 'spawn' },
            { type: 'tool-resolved', toolCallId: 'd1', result: 'deleted', agentId: 's1' },
            // What the sub-agent says after its answered call is its next model step.
            { type: 'turn-start', agentId: 's1' },
            { type: 'text-delta', delta: 'Deleted.', agentId: 's1' },
            { type: 'text-flush', agentId: 's1' },
            { type: 'agent-end', agentId: 's1', status: 'done', result: 'Deleted /x.' },
            { type: 'tool-resolved', toolCallId: 'spawn', result: 'Deleted /x.' },
            { type: 'text-delta', delta: 'Done.' },
            { type: 'text-flush' },
            { type: 'run-done' },
        ]);
    });

    it('marks a refusal on the sub-agent’s row', async () => {
        const first = scripted(pausing(true));
        const paused = await turn(agUi(first.fetch, { threadId: 'conv' }));
        const second = scripted(sse(
            started('r2', 'conv'),
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'cleaner', parentToolCallId: 'spawn' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1', result: 'Left it.' },
            finished({}, 'r2', 'conv'),
        ));
        const resumed = await turn(agUi(second.fetch, { threadId: 'conv' }), {
            baseRequest: history,
            deferral: { token: String(paused.events.at(-1)!['ticket']), outcomes: { d1: { kind: 'decision', approved: false, by: 'user' } } },
        } as never);
        expect(resumed.events.find((e) => e.type === 'tool-rejected')).toMatchObject({ toolCallId: 'd1', agentId: 's1' });
    });
});
