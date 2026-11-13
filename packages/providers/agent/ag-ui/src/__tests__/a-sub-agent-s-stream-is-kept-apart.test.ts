/**
 * Two sub-agents and the parent interleave on one AG-UI stream: attribution is the only
 * thing that tells them apart (AG-UI 1.0, subagents). Each event the runner emits comes out
 * under its owner's `agentId` — the event's `subagentRunId`, else the owner of the message
 * or the call it continues — and the parent's stay bare. One owner's text, step and calls
 * never close another's.
 */
import { describe, it, expect } from 'vitest';
import { agUi, finished, scripted, sse, started, turn } from './replay.js';

const a = 'sub-a';
const b = 'sub-b';

describe('a sub-agent’s stream is kept apart', () => {
    it('gives every event its owner, and one owner’s end of text or tool start never flushes another’s text', async () => {
        const f = scripted(sse(
            started(),
            { type: 'TEXT_MESSAGE_START', messageId: 'p1', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'p1', delta: 'Asking two helpers.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'p1' },
            { type: 'TOOL_CALL_START', toolCallId: 'spawn-a', toolCallName: 'research' },
            { type: 'TOOL_CALL_END', toolCallId: 'spawn-a' },
            { type: 'SUBAGENT_STARTED', subagentRunId: a, name: 'researcher', parentToolCallId: 'spawn-a' },
            { type: 'TOOL_CALL_START', toolCallId: 'spawn-b', toolCallName: 'review' },
            { type: 'TOOL_CALL_END', toolCallId: 'spawn-b' },
            { type: 'SUBAGENT_STARTED', subagentRunId: b, name: 'reviewer', parentToolCallId: 'spawn-b' },
            { type: 'TEXT_MESSAGE_START', messageId: 'ma', role: 'assistant', subagentRunId: a },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'ma', delta: 'Found ', subagentRunId: a },
            { type: 'REASONING_MESSAGE_START', messageId: 'rb', role: 'reasoning', subagentRunId: b },
            // Untagged continuations continue whatever their opener owns.
            { type: 'REASONING_MESSAGE_CONTENT', messageId: 'rb', delta: 'Checking.' },
            { type: 'REASONING_MESSAGE_END', messageId: 'rb' },
            { type: 'TEXT_MESSAGE_CHUNK', messageId: 'mb', role: 'assistant', delta: 'Looks ', subagentRunId: b },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'ma', delta: 'two papers.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'ma' },
            { type: 'TOOL_CALL_CHUNK', toolCallId: 'cb', toolCallName: 'lint', delta: '{"file":', subagentRunId: b },
            { type: 'TOOL_CALL_START', toolCallId: 'ca', toolCallName: 'search', subagentRunId: a },
            // A chunk with no id continues the last call of ITS owner, not the last call of the stream.
            { type: 'TOOL_CALL_CHUNK', delta: '"x.ts"}', subagentRunId: b },
            { type: 'TOOL_CALL_ARGS', toolCallId: 'ca', delta: '{"q":"ai"}' },
            { type: 'TOOL_CALL_END', toolCallId: 'ca', subagentRunId: a },
            { type: 'TOOL_CALL_RESULT', messageId: 'ra', toolCallId: 'ca', content: 'two hits' },
            { type: 'TEXT_MESSAGE_CHUNK', messageId: 'mb', delta: 'fine.', subagentRunId: b },
            { type: 'TEXT_MESSAGE_START', messageId: 'ma2', role: 'assistant', subagentRunId: a },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'ma2', delta: 'Done.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'ma2' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: a, result: 'Two papers.' },
            { type: 'TOOL_CALL_RESULT', messageId: 'rsa', toolCallId: 'spawn-a', content: 'Two papers.' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: b, result: [{ type: 'text', text: 'Fine.' }] },
            { type: 'TOOL_CALL_RESULT', messageId: 'rsb', toolCallId: 'spawn-b', content: 'Fine.' },
            { type: 'TEXT_MESSAGE_START', messageId: 'p2', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'p2', delta: 'Both agree.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'p2' },
            finished(),
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect(error).toBeUndefined();
        expect(events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Asking two helpers.' },
            { type: 'text-flush' },
            { type: 'tool-start', toolCallId: 'spawn-a', name: 'research', input: {} },
            { type: 'agent-start', agentId: a, name: 'researcher', toolCallId: 'spawn-a' },
            { type: 'tool-start', toolCallId: 'spawn-b', name: 'review', input: {} },
            { type: 'agent-start', agentId: b, name: 'reviewer', toolCallId: 'spawn-b' },
            { type: 'text-delta', delta: 'Found ', agentId: a },
            { type: 'thinking-delta', delta: 'Checking.', agentId: b },
            { type: 'text-delta', delta: 'Looks ', agentId: b },
            { type: 'text-delta', delta: 'two papers.', agentId: a },
            // a's message ends: a's text is flushed, b's stays open.
            { type: 'text-flush', agentId: a },
            { type: 'tool-start', toolCallId: 'ca', name: 'search', input: { q: 'ai' }, agentId: a },
            { type: 'tool-resolved', toolCallId: 'ca', result: 'two hits', agentId: a },
            { type: 'text-delta', delta: 'fine.', agentId: b },
            // a's step ended on its call; b's did not.
            { type: 'turn-start', agentId: a },
            { type: 'text-delta', delta: 'Done.', agentId: a },
            { type: 'text-flush', agentId: a },
            { type: 'agent-end', agentId: a, status: 'done', result: 'Two papers.' },
            { type: 'tool-resolved', toolCallId: 'spawn-a', result: 'Two papers.' },
            // b's terminal closes b's text and starts the call b streamed without an end.
            { type: 'text-flush', agentId: b },
            { type: 'tool-start', toolCallId: 'cb', name: 'lint', input: { file: 'x.ts' }, agentId: b },
            { type: 'agent-end', agentId: b, status: 'done', result: 'Fine.' },
            { type: 'tool-resolved', toolCallId: 'spawn-b', result: 'Fine.' },
            { type: 'turn-start' },
            { type: 'text-delta', delta: 'Both agree.' },
            { type: 'text-flush' },
            // Nobody answered b's call: its row stops waiting, under b.
            { type: 'tool-aborted', toolCallId: 'cb', agentId: b },
            { type: 'run-done' },
        ]);
    });

    it('takes a call’s owner from the message that held it', async () => {
        const f = scripted(sse(
            started(),
            { type: 'TEXT_MESSAGE_START', messageId: 'ma', role: 'assistant', subagentRunId: a },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'ma', delta: 'Searching.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'ma' },
            { type: 'TOOL_CALL_START', toolCallId: 'ca', toolCallName: 'search', parentMessageId: 'ma' },
            { type: 'TOOL_CALL_END', toolCallId: 'ca' },
            { type: 'TOOL_CALL_RESULT', messageId: 'r', toolCallId: 'ca', content: 'hit' },
            finished(),
        ));
        const { events } = await turn(agUi(f.fetch));
        expect(events.filter((e) => e.type.startsWith('tool-'))).toEqual([
            { type: 'tool-start', toolCallId: 'ca', name: 'search', input: {}, agentId: a },
            { type: 'tool-resolved', toolCallId: 'ca', result: 'hit', agentId: a },
        ]);
    });

    it('stops each owner’s unanswered calls under it when the run fails, and fails the sub-agents still open', async () => {
        const f = scripted(sse(
            started(),
            { type: 'TOOL_CALL_START', toolCallId: 'spawn', toolCallName: 'research' },
            { type: 'TOOL_CALL_END', toolCallId: 'spawn' },
            { type: 'SUBAGENT_STARTED', subagentRunId: a, name: 'researcher', parentToolCallId: 'spawn' },
            { type: 'TOOL_CALL_START', toolCallId: 'ca', toolCallName: 'search', subagentRunId: a },
            { type: 'TOOL_CALL_END', toolCallId: 'ca', subagentRunId: a },
            { type: 'TEXT_MESSAGE_START', messageId: 'ma', role: 'assistant', subagentRunId: a },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'ma', delta: 'half' },
            { type: 'RUN_ERROR', message: 'boom' },
        ));
        const { events, error } = await turn(agUi(f.fetch));
        expect((error as Error).message).toBe('boom');
        expect(events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'tool-start', toolCallId: 'spawn', name: 'research', input: {} },
            { type: 'agent-start', agentId: a, name: 'researcher', toolCallId: 'spawn' },
            { type: 'tool-start', toolCallId: 'ca', name: 'search', input: {}, agentId: a },
            { type: 'turn-start', agentId: a },
            { type: 'text-delta', delta: 'half', agentId: a },
            { type: 'tool-aborted', toolCallId: 'spawn' },
            { type: 'tool-aborted', toolCallId: 'ca', agentId: a },
            { type: 'text-flush', agentId: a },
            { type: 'agent-end', agentId: a, status: 'failed', error: 'boom' },
        ]);
    });

    it('fails the sub-agents a superseded run left open, before the new run draws', async () => {
        const warnings: string[] = [];
        const f = scripted(sse(
            started(),
            { type: 'SUBAGENT_STARTED', subagentRunId: a, name: 'researcher' },
            { type: 'TOOL_CALL_START', toolCallId: 'ca', toolCallName: 'search', subagentRunId: a },
            { type: 'TOOL_CALL_END', toolCallId: 'ca', subagentRunId: a },
            { type: 'RUN_ERROR', message: 'first failed' },
            started('r2'),
            { type: 'TEXT_MESSAGE_START', messageId: 'p', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'p', delta: 'Recovered.' },
            { type: 'TEXT_MESSAGE_END', messageId: 'p' },
            finished({}, 'r2'),
        ));
        const { events, error } = await turn(agUi(f.fetch, { onWarning: (m) => { warnings.push(m); } }));
        expect(error).toBeUndefined();
        expect(warnings.join()).toContain('first failed');
        expect(events).toEqual([
            { type: 'run-start' },
            { type: 'turn-start' },
            { type: 'agent-start', agentId: a, name: 'researcher' },
            { type: 'tool-start', toolCallId: 'ca', name: 'search', input: {}, agentId: a },
            { type: 'tool-aborted', toolCallId: 'ca', agentId: a },
            { type: 'agent-end', agentId: a, status: 'failed', error: 'first failed' },
            { type: 'text-delta', delta: 'Recovered.' },
            { type: 'text-flush' },
            { type: 'run-done' },
        ]);
    });
});
