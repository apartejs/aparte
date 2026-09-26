// @vitest-environment jsdom
/**
 * The model remembers what its tools returned.
 *
 * The history a turn sends used to carry user and assistant TEXT only: a `read_file`
 * result was on screen and gone from the model's context one turn later, so "what did
 * the file say?" had no answer. Every call now goes out as an assistant envelope and a
 * `tool` answer, in the order the reply showed them.
 */
import { describe, it, expect } from 'vitest';
import { wireTurns, STOPPED_TOOL_TEXT } from '../wire-history.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

const text = (id: string, content: string) => ({ id, type: 'text', content }) as AparteSegment;
const call = (id: string, status: string, result?: string) =>
    ({ id: `tool-${id}`, type: 'tool_call', toolCall: { id, name: 'read_file', input: { path: id } }, status, ...(result ? { result } : {}) }) as AparteSegment;
const textOf = (segs: AparteSegment[]) => segs.map((s) => (s as { content?: string }).content ?? '').join('');
const msg = (segments: AparteSegment[]): AparteMessage =>
    ({ id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'completed', segments }) as AparteMessage;

describe('wireTurns', () => {
    it('sends a text-only reply as before', () => {
        expect(wireTurns(msg([text('t1', 'Hello.')]), textOf)).toEqual([{ role: 'assistant', content: 'Hello.' }]);
    });

    it('sends each call and its result, in the order the reply showed them', () => {
        const out = wireTurns(msg([
            text('t1', 'Reading.'), call('c1', 'resolved', 'A'), call('c2', 'resolved', 'B'),
            text('t2', 'Both read. Then:'), call('c3', 'resolved', 'C'), text('t3', 'Done.'),
        ]), textOf);
        expect(out).toEqual([
            { role: 'assistant', content: 'Reading.', toolCalls: [
                { id: 'c1', name: 'read_file', input: { path: 'c1' } }, { id: 'c2', name: 'read_file', input: { path: 'c2' } },
            ] },
            { role: 'tool', content: 'A', toolCallId: 'c1', toolName: 'read_file' },
            { role: 'tool', content: 'B', toolCallId: 'c2', toolName: 'read_file' },
            { role: 'assistant', content: 'Both read. Then:', toolCalls: [{ id: 'c3', name: 'read_file', input: { path: 'c3' } }] },
            { role: 'tool', content: 'C', toolCallId: 'c3', toolName: 'read_file' },
            { role: 'assistant', content: 'Done.' },
        ]);
    });

    it('answers every call, whatever it became — a provider rejects a call left unanswered', () => {
        const out = wireTurns(msg([
            call('r', 'rejected', 'Not that one.'), call('f', 'failed', 'ENOENT'),
            call('a', 'aborted'), call('p', 'awaiting-approval'), call('e', 'resolved'),
        ]), textOf);
        expect(out.filter((m) => m.role === 'tool').map((m) => m.content)).toEqual([
            'Not that one.', 'ENOENT', STOPPED_TOOL_TEXT, STOPPED_TOOL_TEXT, STOPPED_TOOL_TEXT,
        ]);
    });

    it('sends a user message as its text', () => {
        const user = { id: 'u1', role: 'user', content: 'Hi', timestamp: 1 } as AparteMessage;
        expect(wireTurns(user, textOf)).toEqual([{ role: 'user', content: 'Hi' }]);
    });

    it('sends nothing for a message with nothing to say', () => {
        expect(wireTurns(msg([]), textOf)).toEqual([]);
    });
});
