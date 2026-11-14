// @vitest-environment jsdom
/**
 * A call waiting its turn shows where the model wrote it, queued.
 *
 * The engine announces every call of a step as it reads it, `queued: true` when the call
 * cannot go on yet (a call before it keeps its place and still runs, or waits for a person),
 * and says `tool-running` when it does. The adapter puts the row in place at once, marked
 * `queued`, and takes the mark off when the call goes on or ends. The mark is live only: a
 * restored conversation never carries it. A step where nothing waits writes exactly what it
 * wrote before — no `queued` key anywhere.
 */
import { describe, it, expect } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import { adoptSegment } from '../../utils/segments.js';
import type { AparteMessage, AparteSegment, AparteToolCallSegment } from '../../types/index.js';

function target() {
    const added: AparteSegment[] = [];
    const updates: [string, Partial<AparteSegment>][] = [];
    return {
        added, updates,
        addSegment: (s: AparteSegment) => { added.push(s); },
        updateSegment: (id: string, u: Partial<AparteSegment>) => { updates.push([id, u]); },
        updateMessage: (_id: string, _u: Partial<AparteMessage>) => {},
        dispatchEvent: () => true,
    };
}

const adapter = () => {
    const t = target();
    const emit = createStreamAdapter({ target: t, config: aparteGlobalConfig, messageId: 'm1' });
    emit({ type: 'run-start' });
    emit({ type: 'turn-start' });
    return { t, emit };
};

describe('the adapter', () => {
    it('adds a queued call\'s row at once, marked queued, and unmarks it when the call goes on', () => {
        const { t, emit } = adapter();
        emit({ type: 'tool-start', toolCallId: 'e', name: 'edit_file', input: {} });
        emit({ type: 'tool-start', toolCallId: 'c', name: 'run_command', input: {}, queued: true });
        emit({ type: 'text-delta', delta: 'Running the tests next.' });
        emit({ type: 'text-flush' });

        // Both rows, then the text, in the order the model wrote them.
        expect(t.added.map((s) => s.type)).toEqual(['tool_call', 'tool_call', 'text']);
        expect(t.added[0]).not.toHaveProperty('queued');
        expect(t.added[1]).toMatchObject({ id: 'tool-c', status: 'pending', queued: true });

        emit({ type: 'tool-resolved', toolCallId: 'e', result: 'edited' });
        expect(t.updates.at(-1)).toEqual(['tool-e', { status: 'resolved', result: 'edited' }]);
        emit({ type: 'tool-running', toolCallId: 'c' });
        expect(t.updates.at(-1)).toEqual(['tool-c', { queued: undefined }]);
        emit({ type: 'tool-resolved', toolCallId: 'c', result: 'ok' });
        expect(t.updates.at(-1)).toEqual(['tool-c', { status: 'resolved', result: 'ok' }]);
    });

    it('unmarks a queued call that ends without going on: refused after an earlier refusal, or stopped', () => {
        const { t, emit } = adapter();
        emit({ type: 'tool-start', toolCallId: 'a', name: 'edit_file', input: {} });
        emit({ type: 'tool-start', toolCallId: 'b', name: 'run_command', input: {}, queued: true });
        emit({ type: 'tool-start', toolCallId: 'c', name: 'run_command', input: {}, queued: true });
        emit({ type: 'tool-rejected', toolCallId: 'b', reason: 'Not run.', by: 'earlier-refusal' });
        emit({ type: 'tool-aborted', toolCallId: 'c', cause: 'stopped' });

        expect(t.updates).toContainEqual(['tool-b', { status: 'rejected', result: 'Not run.', refusal: { by: 'earlier-refusal' }, queued: undefined }]);
        expect(t.updates).toContainEqual(['tool-c', { status: 'aborted', abortCause: 'stopped', queued: undefined }]);
    });

    it('unmarks a queued call a pause asks about, or leaves waiting', () => {
        const { t, emit } = adapter();
        emit({ type: 'tool-start', toolCallId: 'w', name: 'edit_file', input: {} });
        emit({ type: 'tool-start', toolCallId: 'd', name: 'delete_file', input: {}, queued: true });
        emit({ type: 'tool-start', toolCallId: 'q', name: 'run_command', input: {}, queued: true });
        emit({ type: 'tool-awaiting-approval', toolCallId: 'd', name: 'delete_file', input: {} });
        emit({ type: 'run-suspended', pending: [
            { toolCallId: 'd', name: 'delete_file', input: {}, reason: 'approval' },
            { toolCallId: 'q', name: 'run_command', input: {}, reason: 'queued' },
        ] });

        expect(t.updates).toContainEqual(['tool-d', { status: 'awaiting-approval', queued: undefined }]);
        expect(t.updates).toContainEqual(['tool-q', { deferred: { reason: 'queued' }, queued: undefined }]);
        expect(t.updates).toContainEqual(['tool-d', { deferred: { reason: 'approval' } }]);
    });

    it('writes no queued key at all for a step where nothing waits', () => {
        const { t, emit } = adapter();
        emit({ type: 'tool-start', toolCallId: 'a', name: 'read_file', input: {} });
        emit({ type: 'tool-start', toolCallId: 'b', name: 'read_file', input: {} });
        emit({ type: 'tool-resolved', toolCallId: 'b', result: 'B' });
        emit({ type: 'tool-resolved', toolCallId: 'a', result: 'A' });

        for (const s of t.added) expect(s).not.toHaveProperty('queued');
        for (const [, u] of t.updates) expect(u).not.toHaveProperty('queued');
    });
});

describe('a restored conversation', () => {
    it('never keeps queued', () => {
        const saved = {
            id: 'tool-c', type: 'tool_call', status: 'pending', queued: true,
            toolCall: { id: 'c', name: 'run_command', input: {} },
        } as AparteToolCallSegment;
        expect(adoptSegment([], saved, 'm1', true)).not.toHaveProperty('queued');
        expect(adoptSegment([], saved, 'm1')).not.toHaveProperty('queued');
    });
});
