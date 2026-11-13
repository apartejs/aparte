/**
 * An `activity` segment (an agent's progress: a plan, a search's count) is shown to a person and
 * never read back by the model — core's history serializer skips it by name. The summariser
 * reads what the model would have read, so it skips it too: a string content would otherwise
 * pass for the reply's text under the "unknown type: its content" rule.
 */
import { describe, it, expect } from 'vitest';
import type { AparteMessage } from '@aparte/core';
import { messageText, transcriptForSummary } from '../transcript.js';

const reply = (segments: unknown[], content = ''): AparteMessage =>
    ({ id: 'a1', role: 'assistant', content, timestamp: 1, segments } as unknown as AparteMessage);

describe('an activity never reaches the summariser', () => {
    it('leaves an activity with a string content out of the message text', () => {
        const message = reply([
            { id: 'activity-p', type: 'activity', activityId: 'p', activityType: 'progress', content: '3 of 5 sources read' },
            { id: 't', type: 'text', content: 'Here is what I found.' },
        ]);
        expect(messageText(message)).toBe('Here is what I found.');
        expect(transcriptForSummary(message)).not.toContain('sources read');
    });
});
