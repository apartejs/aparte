/**
 * An activity is shown to a person and never read back by the model. It is named in the
 * serializer on purpose: the rule for a type core does not know sends its `content` when it
 * is a string, and an activity's content can be one.
 */
import { describe, it, expect } from 'vitest';
import { segmentsToWireText, wireMessages } from '../wire-history.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

const activity = (content: unknown): AparteSegment => ({ id: 'activity-p1', type: 'activity', activityId: 'p1', activityType: 'search-progress', content });

describe('an activity never reaches the model', () => {
    it('leaves no text in the reply read back, whatever its content', () => {
        const text: AparteSegment = { id: 't1', type: 'text', content: 'All read.' };
        expect(segmentsToWireText([activity('3 of 5 sources read'), text])).toBe('All read.');
        expect(segmentsToWireText([activity({ read: 3 }), text])).toBe('All read.');
    });

    it('leaves nothing in a turn with tool calls either', () => {
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'Search.', timestamp: 1 },
            {
                id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed',
                segments: [
                    activity('reading'),
                    { id: 'tool-c1', type: 'tool_call', status: 'resolved', toolCall: { id: 'c1', name: 'search', input: {} }, result: 'ok' },
                    activity('still reading'),
                    { id: 't1', type: 'text', content: 'Found it.' },
                ],
            },
        ];
        const wire = JSON.stringify(wireMessages(messages));
        expect(wire).not.toContain('reading');
        expect(wire).toContain('Found it.');
    });

    it('a reply made only of an activity sends nothing', () => {
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'Go.', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed', segments: [activity('half way')] },
        ];
        expect(wireMessages(messages)).toEqual([{ role: 'user', content: 'Go.' }]);
    });
});
