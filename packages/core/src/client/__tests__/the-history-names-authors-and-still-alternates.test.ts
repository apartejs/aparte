/**
 * The history carries a message's author as `name`, and still alternates.
 *
 * Strict chat templates (Gemma, Mistral, llama.cpp `--jinja`, vLLM) refuse two messages of
 * the same role in a row, and then every later turn. An advisor's message goes out as
 * `assistant` (the service's voice) and may follow the AI's reply, or another advisor
 * message; two people may write in a row. So same-role neighbours are merged — `assistant`
 * ones too, unless they carry tool calls — and the merged message keeps `name` only when
 * every part had the same author. When they had different authors, one `name` cannot say
 * it: each named author's words open with their name, or the model would read an advisor's
 * words as its own.
 */
import { describe, it, expect } from 'vitest';
import { mergeAdjacentMessages, wireMessages } from '../wire-history.js';
import type { AparteChatMessage, AparteMessage, AparteSegment } from '../../types/index.js';

const wire = (messages: AparteMessage[]): AparteChatMessage[] => mergeAdjacentMessages(wireMessages(messages));
const user = (id: string, content: string, author?: string): AparteMessage =>
    ({ id, role: 'user', content, timestamp: 1, ...(author ? { author: { name: author } } : {}) });
const ai = (id: string, content: string): AparteMessage => ({ id, role: 'assistant', content, status: 'completed', timestamp: 1 });
const advisor = (id: string, content: string, name = 'Marie'): AparteMessage =>
    ({ id, role: 'assistant', content, timestamp: 1, author: { name, type: 'human' } });

describe('the history and the authors', () => {
    it('names the author of a message that stands alone', () => {
        expect(wire([user('u1', 'hi'), advisor('h1', 'Marie here.')])).toEqual([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'Marie here.', name: 'Marie' },
        ]);
    });

    it("merges the AI's reply and an advisor's message that follows it, the advisor named in the text", () => {
        expect(wire([user('u1', 'hi'), ai('a1', 'Hello.'), advisor('h1', 'Marie here.')])).toEqual([
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'Hello.\n\nMarie: Marie here.' },
        ]);
    });

    it('keeps the name when the same advisor wrote twice in a row', () => {
        expect(wire([user('u1', 'hi'), advisor('h1', 'One.'), advisor('h2', 'Two.')]).at(-1))
            .toEqual({ role: 'assistant', content: 'One.\n\nTwo.', name: 'Marie' });
    });

    it('merges two people who wrote in a row, each named in the text', () => {
        expect(wire([user('u1', 'me first', 'Alex'), user('u2', 'me too', 'Bo')])).toEqual([
            { role: 'user', content: 'Alex: me first\n\nBo: me too' },
        ]);
    });

    it('names an author in front of parts too, and keeps naming as more messages join', () => {
        expect(mergeAdjacentMessages([
            { role: 'user', content: 'a', name: 'Alex' },
            { role: 'user', content: [{ type: 'text', text: 'b' }], name: 'Bo' },
        ])).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Alex: a' }, { type: 'text', text: '\n\n' }, { type: 'text', text: 'Bo: ' }, { type: 'text', text: 'b' }] }]);
        expect(wire([user('u1', 'hi'), ai('a1', 'Hello.'), advisor('h1', 'One.'), advisor('h2', 'Two.')]).at(-1))
            .toEqual({ role: 'assistant', content: 'Hello.\n\nMarie: One.\n\nMarie: Two.' });
    });

    it('alternates after a compaction summary and an authored message', () => {
        const summary: AparteMessage = { id: 's', role: 'user', content: 'Summary of before.', compaction: true, timestamp: 1 };
        const merged = wire([summary, user('u1', 'and now?', 'Alex')]);
        expect(merged.map((m) => m.role)).toEqual(['user']);
        expect(merged[0]!.name).toBeUndefined();
    });

    it('never merges a reply that called tools, and never names a tool result', () => {
        const withCall: AparteMessage = {
            id: 'a1', role: 'assistant', content: '', status: 'completed', timestamp: 1, author: { name: 'Researcher' },
            segments: [{ id: 't1', type: 'tool_call', status: 'resolved', toolCall: { id: 'c1', name: 'get_weather', input: {} }, result: 'sunny' } as AparteSegment],
        };
        const out = wire([user('u1', 'weather?'), withCall, advisor('h1', 'Marie here.')]);
        expect(out.find((m) => m.toolCalls)).toBeDefined();
        expect(out.filter((m) => m.role === 'tool').every((m) => m.name === undefined)).toBe(true);
        for (let i = 1; i < out.length; i++) {
            const twoPlainAssistants = out[i]!.role === 'assistant' && out[i - 1]!.role === 'assistant' && !out[i]!.toolCalls && !out[i - 1]!.toolCalls;
            expect(twoPlainAssistants).toBe(false);
        }
    });
});
