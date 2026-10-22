/**
 * What the summariser reads of each message: the text the model would have read, then one
 * line per tool call and per error — clipped, so one huge tool result cannot fill the
 * summary request on its own.
 */
import { describe, it, expect } from 'vitest';
import type { AparteMessage } from '@aparte/core';
import { messageText, transcriptForSummary } from '../transcript.js';

const reply = (segments: unknown[], content = ''): AparteMessage =>
    ({ id: 'a1', role: 'assistant', content, timestamp: 1, segments } as unknown as AparteMessage);

describe('messageText', () => {
    it('keeps a code block as a fence, with its language', () => {
        expect(messageText(reply([{ id: 's', type: 'code', language: 'ts', content: 'const x = 1;' }])))
            .toBe('```ts\nconst x = 1;\n```');
    });

    it('reads a segment type it does not know by its content, else its fallback', () => {
        expect(messageText(reply([{ id: 's', type: 'weather', content: 'Lille, 12°C' }]))).toBe('Lille, 12°C');
        expect(messageText(reply([{ id: 's', type: 'chart', fallback: 'A bar chart of sales' }]))).toBe('A bar chart of sales');
    });

    it('falls back to the message content when the segments say nothing', () => {
        expect(messageText(reply([{ id: 's', type: 'thinking', content: 'hmm' }], 'The answer.'))).toBe('The answer.');
    });
});

describe('transcriptForSummary', () => {
    it('clips a long tool input at 300 characters and a long result at 600', () => {
        const line = transcriptForSummary(reply([{
            id: 't', type: 'tool_call', status: 'resolved',
            toolCall: { id: 'c1', name: 'read_file', input: { path: 'x'.repeat(400) } },
            result: 'y'.repeat(800),
        }]));
        const [, input, outcome] = /^\[tool read_file\] (\S+) → (\S+)$/.exec(line)!;
        expect(input!.length).toBe(301);   // 300 characters and the ellipsis
        expect(outcome!.length).toBe(601);
        expect(input!.endsWith('…')).toBe(true);
    });

    it('says how a call ended when it has no result', () => {
        expect(transcriptForSummary(reply([{ id: 't', type: 'tool_call', status: 'rejected', toolCall: { id: 'c1', name: 'delete_file', input: {} } }])))
            .toBe('[tool delete_file] {} (rejected)');
    });

    it('does not throw on an input it cannot serialise', () => {
        const input: Record<string, unknown> = {};
        input['self'] = input;
        expect(() => transcriptForSummary(reply([{ id: 't', type: 'tool_call', status: 'pending', toolCall: { id: 'c1', name: 'loop', input } }])))
            .not.toThrow();
    });

    it('adds an error segment as an [error] line', () => {
        expect(transcriptForSummary(reply([{ id: 'e', type: 'error', content: 'The model timed out.' }])))
            .toBe('[error] The model timed out.');
    });
});
