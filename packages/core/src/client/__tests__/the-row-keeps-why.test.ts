// @vitest-environment jsdom
/**
 * A tool row keeps WHY it ended, not only that it did.
 *
 * `result` is the sentence the model reads ("The user rejected this tool call…"), and it
 * was all a row had: who refused, what the person typed, and whether "Stopped" was a Stop,
 * a timeout or a missing handler were gone by the time anything drew the row. The segment
 * now carries `refusal` and `abortCause`, persisted with it, beside the model's sentence.
 */
import { describe, it, expect } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteSegment } from '../../types/index.js';

function emitter() {
    const updates: [string, Partial<AparteSegment>][] = [];
    const t = {
        addSegment: () => {},
        updateSegment: (id: string, u: Partial<AparteSegment>) => { updates.push([id, u]); },
        updateMessage: () => {},
        dispatchEvent: () => true,
    };
    const emit = createStreamAdapter({ target: t, config: aparteGlobalConfig, messageId: 'm1' });
    emit({ type: 'run-start' });
    emit({ type: 'turn-start' });
    emit({ type: 'tool-start', toolCallId: 'c1', name: 'write', input: {} });
    return { emit, last: () => updates.at(-1)?.[1] };
}

describe('the tool segment keeps why it ended', () => {
    it('a refusal keeps who refused and the person\'s words; result stays the model\'s sentence', () => {
        const { emit, last } = emitter();
        emit({ type: 'tool-rejected', toolCallId: 'c1', reason: 'The user rejected this tool call and said: not now', by: 'person', instruction: 'not now' });
        expect(last()).toEqual({
            status: 'rejected',
            result: 'The user rejected this tool call and said: not now',
            refusal: { by: 'person', instruction: 'not now' },
        });
    });

    it('a policy refusal keeps its origin', () => {
        const { emit, last } = emitter();
        emit({ type: 'tool-rejected', toolCallId: 'c1', reason: 'Plan mode.', by: 'policy' });
        expect(last()).toEqual({ status: 'rejected', result: 'Plan mode.', refusal: { by: 'policy' } });
    });

    it('a runner that says nothing of the origin leaves the row as it was', () => {
        const { emit, last } = emitter();
        emit({ type: 'tool-rejected', toolCallId: 'c1', reason: 'Tool execution was rejected by the user.' });
        expect(last()).toEqual({ status: 'rejected', result: 'Tool execution was rejected by the user.' });
    });

    it('an abort keeps its cause', () => {
        const { emit, last } = emitter();
        emit({ type: 'tool-aborted', toolCallId: 'c1', cause: 'timeout' });
        expect(last()).toEqual({ status: 'aborted', abortCause: 'timeout' });
    });

    it('an abort with no cause stays a bare abort', () => {
        const { emit, last } = emitter();
        emit({ type: 'tool-aborted', toolCallId: 'c1' });
        expect(last()).toEqual({ status: 'aborted' });
    });

    it('a call stopped by its own turn limit says so', () => {
        const { emit, last } = emitter();
        emit({ type: 'turn-limit-exceeded', scope: 'tool', limit: 3, toolCallId: 'c1' });
        expect(last()).toEqual({ status: 'aborted', abortCause: 'turn-limit' });
    });
});
