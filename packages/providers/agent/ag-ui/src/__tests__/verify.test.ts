/**
 * The stream rules the conformance corpus does not reach on its own: the closing half of
 * each open/close pair, and what reading an older peer relaxes — its run framing — and
 * what it keeps.
 */
import { describe, it, expect } from 'vitest';
import { createVerifier } from '../verify.js';

type Event = { type: string } & Record<string, unknown>;

const feed = (older: boolean, events: Event[]) => () => {
    const verify = createVerifier(older);
    for (const event of events) verify(event);
};
const started = { type: 'RUN_STARTED' };

describe('createVerifier', () => {
    it('refuses a close for what was never opened', () => {
        expect(feed(false, [started, { type: 'TEXT_MESSAGE_END', messageId: 'm' }])).toThrow('no open text message');
        expect(feed(false, [started, { type: 'REASONING_MESSAGE_END', messageId: 'r' }])).toThrow('no open reasoning message');
        expect(feed(false, [started, { type: 'TOOL_CALL_ARGS', toolCallId: 'c', delta: '{}' }])).toThrow('no open tool call');
        expect(feed(false, [started, { type: 'TOOL_CALL_END', toolCallId: 'c' }])).toThrow('no open tool call');
    });

    it('takes a tool result for a call from an earlier run: results answer, they do not open', () => {
        expect(feed(false, [started, { type: 'TOOL_CALL_RESULT', toolCallId: 'earlier', content: 'ok' }, { type: 'RUN_FINISHED' }])).not.toThrow();
    });

    it('reads an older peer by its own framing: a result before RUN_STARTED, a RUN_FINISHED per step', () => {
        expect(feed(true, [
            { type: 'TOOL_CALL_RESULT', toolCallId: 'c0', content: 'resumed' },
            started,
            { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'search' },
            { type: 'TOOL_CALL_END', toolCallId: 'c1' },
            { type: 'RUN_FINISHED' },
            { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'next step' },
            { type: 'TEXT_MESSAGE_END', messageId: 'm' },
            { type: 'RUN_FINISHED' },
        ])).not.toThrow();
    });

    it('still holds an older peer to the rest: content needs an open message', () => {
        expect(feed(true, [started, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: 'x' }])).toThrow('no open text message');
    });

    // RUN_ERROR "ends whatever was still open along with the run. A new run starts with nothing open."
    it('lets a RUN_ERROR end what was open, so the next run starts clean', () => {
        expect(feed(false, [
            started,
            { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'half' },
            { type: 'RUN_ERROR', message: 'failed' },
            started,
            { type: 'RUN_FINISHED' },
        ])).not.toThrow();
    });

    it('takes nothing after a RUN_ERROR but a new RUN_STARTED', () => {
        expect(feed(false, [started, { type: 'RUN_ERROR', message: 'failed' }, { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' }]))
            .toThrow('after the run ended');
    });

    // RUN_FINISHED "requires everything the run opened to be closed already".
    it('refuses a RUN_FINISHED while a tool call or a step is still open', () => {
        expect(feed(false, [started, { type: 'TOOL_CALL_START', toolCallId: 'c1', toolCallName: 'ask_user' }, { type: 'TOOL_CALL_ARGS', toolCallId: 'c1', delta: '{"q":"Wh' }, { type: 'RUN_FINISHED' }]))
            .toThrow('tool call "c1" still running at RUN_FINISHED');
        expect(feed(false, [started, { type: 'STEP_STARTED', stepName: 'plan' }, { type: 'RUN_FINISHED' }]))
            .toThrow('step "plan" still running at RUN_FINISHED');
    });

    it('holds a relaxed run framing to it at the end of the stream instead', () => {
        const verify = createVerifier(true);
        for (const event of [started, { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' }, { type: 'RUN_FINISHED' }]) verify(event);
        expect(() => verify.end()).toThrow('text message "m1" still running at the end of the stream');
    });

    // "Steps are per-owner: a parent and a subagent MAY each have a step of the same name open at once."
    it('keeps each owner its own steps', () => {
        expect(feed(false, [
            started,
            { type: 'STEP_STARTED', stepName: 'plan' },
            { type: 'STEP_STARTED', stepName: 'plan', subagentRunId: 's1' },
            { type: 'STEP_FINISHED', stepName: 'plan', subagentRunId: 's1' },
            { type: 'STEP_FINISHED', stepName: 'plan' },
            { type: 'RUN_FINISHED' },
        ])).not.toThrow();
    });

    // "MUST NOT close one invocation's entities because another invocation ended."
    it('keeps each invocation its own chunk stream, through another one ending', () => {
        expect(feed(false, [
            started,
            { type: 'SUBAGENT_STARTED', subagentRunId: 's1', name: 'a' },
            { type: 'SUBAGENT_STARTED', subagentRunId: 's2', name: 'b' },
            { type: 'TEXT_MESSAGE_CHUNK', messageId: 'm1', role: 'assistant', delta: 'one ', subagentRunId: 's1' },
            { type: 'TOOL_CALL_CHUNK', toolCallId: 'c2', toolCallName: 'search', delta: '{}', subagentRunId: 's2' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's2' },
            { type: 'TEXT_MESSAGE_CHUNK', delta: 'two', subagentRunId: 's1' },
            { type: 'SUBAGENT_FINISHED', subagentRunId: 's1' },
            { type: 'RUN_FINISHED' },
        ])).not.toThrow();
    });

    it('rejects a known field of the wrong type, and a missing identity', () => {
        expect(feed(false, [started, { type: 'TOOL_CALL_START', toolCallId: 1, toolCallName: 'x' }])).toThrow('"toolCallId" must be a string');
        expect(feed(false, [started, { type: 'TEXT_MESSAGE_START', messageId: 'm', role: 'assistant' }, { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm' }]))
            .toThrow('TEXT_MESSAGE_CONTENT needs "delta"');
    });
});
