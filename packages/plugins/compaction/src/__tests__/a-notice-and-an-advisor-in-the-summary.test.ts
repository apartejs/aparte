/**
 * What the summariser reads of a human takeover.
 *
 * A notice ("Marie joined the conversation") is shown, never said to the model: it does not
 * reach the summariser either. An advisor's message is sent as `assistant`, the service's
 * voice: the summary transcript names who wrote it, or the summary would put the advisor's
 * promises in the AI's mouth.
 */
import { describe, it, expect } from 'vitest';
import type { AparteMessage } from '@aparte/core';
import { transcriptForSummary } from '../transcript.js';

describe('a takeover in the summary transcript', () => {
    it('leaves a notice out', () => {
        const notice: AparteMessage = { id: 'n1', role: 'assistant', kind: 'notice', content: 'Marie joined the conversation', timestamp: 1 };
        expect(transcriptForSummary(notice)).toBe('');
    });

    it("names the author of an advisor's message", () => {
        const advisor: AparteMessage = { id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'It ships today.', timestamp: 1 };
        expect(transcriptForSummary(advisor)).toBe('Marie: It ships today.');
    });

    it('leaves the AI and the person as they were', () => {
        expect(transcriptForSummary({ id: 'a1', role: 'assistant', content: 'Hello.', timestamp: 1 })).toBe('Hello.');
        expect(transcriptForSummary({ id: 'u1', role: 'user', content: 'Hi.', timestamp: 1 })).toBe('Hi.');
    });
});
