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
});
