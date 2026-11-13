/**
 * An `activity` run event becomes ONE `activity` segment per id: placed in the reply where the
 * activity first arrived, then updated in place — whole — by every later event with that id.
 * Never a second segment. The text it interrupts ends before it, and what follows is written
 * after it, as around a tool call.
 */
import { describe, it, expect } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { AparteConfig } from '../../config/aparte-config.js';
import type { AparteSegment } from '../../types/index.js';

function recorded() {
    const calls: { op: 'add' | 'update'; id: string; data: Partial<AparteSegment> }[] = [];
    const segments: AparteSegment[] = [];
    const emit = createStreamAdapter({
        target: {
            addSegment: (s: AparteSegment) => { calls.push({ op: 'add', id: s.id, data: s }); segments.push({ ...s }); },
            updateSegment: (id: string, u: Partial<AparteSegment>) => {
                calls.push({ op: 'update', id, data: u });
                const at = segments.findIndex((s) => s.id === id);
                if (at >= 0) segments[at] = { ...segments[at], ...u } as AparteSegment;
            },
            updateMessage: () => {},
            dispatchEvent: () => true,
        },
        config: new AparteConfig(),
        messageId: 'm1',
        observe: false,
    });
    return { calls, segments, emit };
}

describe('an activity is one segment, updated in place', () => {
    it('the first event adds it, the next ones update it whole', () => {
        const { calls, segments, emit } = recorded();
        emit({ type: 'run-start' });
        emit({ type: 'turn-start' });
        emit({ type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 0, of: 5 } });
        emit({ type: 'activity', id: 'a1', activityType: 'search-progress', content: { read: 3, of: 5 } });
        emit({ type: 'run-done' });
        expect(calls.filter((c) => c.id === 'activity-a1').map((c) => c.op)).toEqual(['add', 'update']);
        expect(segments).toEqual([
            { id: 'activity-a1', type: 'activity', activityId: 'a1', activityType: 'search-progress', content: { read: 3, of: 5 } },
        ]);
    });

    it('stays one segment across the model calls of the reply', () => {
        const { segments, emit } = recorded();
        emit({ type: 'turn-start' });
        emit({ type: 'activity', id: 'a1', activityType: 'progress', content: 1 });
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'search', input: {} });
        emit({ type: 'tool-resolved', toolCallId: 'c1', result: 'ok' });
        emit({ type: 'turn-start' });
        emit({ type: 'activity', id: 'a1', activityType: 'progress', content: 2 });
        expect(segments.filter((s) => s.type === 'activity')).toEqual([
            expect.objectContaining({ id: 'activity-a1', content: 2 }),
        ]);
    });

    it('two ids are two segments', () => {
        const { segments, emit } = recorded();
        emit({ type: 'turn-start' });
        emit({ type: 'activity', id: 'a1', activityType: 'progress', content: 1 });
        emit({ type: 'activity', id: 'a2', activityType: 'progress', content: 2 });
        expect(segments.map((s) => s.id)).toEqual(['activity-a1', 'activity-a2']);
    });

    it('is placed where it first arrived: the text before it ends there, the text after it follows it', () => {
        const { segments, emit } = recorded();
        emit({ type: 'turn-start' });
        emit({ type: 'text-delta', delta: 'Reading the sources. ' });
        emit({ type: 'activity', id: 'a1', activityType: 'progress', content: 1 });
        emit({ type: 'text-delta', delta: 'All read.' });
        emit({ type: 'activity', id: 'a1', activityType: 'progress', content: 2 });
        emit({ type: 'text-flush' });
        expect(segments.map((s) => [s.type, (s as { content?: unknown }).content])).toEqual([
            ['text', 'Reading the sources. '],
            ['activity', 2],
            ['text', 'All read.'],
        ]);
    });
});
