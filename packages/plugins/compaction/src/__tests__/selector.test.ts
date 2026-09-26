import { describe, it, expect } from 'vitest';
import { createCompactionSelector } from '../selector.js';

/** The shape core's `AparteMessage` has, as far as the selector reads it. */
interface Message {
    id: string;
    role: 'user' | 'assistant';
    content?: string;
    timestamp: number;
    segments?: { id: string; type: string; content?: string }[];
}

/** A budget with no reserves: the window IS the context window minus the system prompt. */
const BARE = { reservedThinking: 0, reservedGeneration: 0, autocompactBufferPct: 0, safetyMargin: 0, summaryRatio: 0, ragHistRatio: 0, minHistoryBudget: 0 };

/** 200 characters ≈ 50 tokens, by the compactor's own heuristic. */
const message = (i: number, chars = 200): Message => ({
    id: `m${i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: 'x'.repeat(chars),
    timestamp: i,
});

describe('createCompactionSelector', () => {
    it('counts what a tool call sends the model: its arguments and its result', () => {
        // A reply's calls go on the wire (the call's input and a `tool` message with its
        // result), so a message whose only segment is a call with a 400-character result
        // is not free: it costs about what 400 characters of text do.
        // 150: the two text messages (53 tokens each) fit with room to spare, the call does not.
        const select = createCompactionSelector({ contextWindow: 150, config: BARE });
        const call = {
            id: 'm0', role: 'assistant' as const, timestamp: 0,
            segments: [{ id: 's', type: 'tool_call', toolCall: { id: 'c', name: 'read_file', input: { path: 'a' } }, result: 'y'.repeat(400) }],
        } as unknown as Message;
        const { drop } = select([call, message(1), message(2)]);
        expect(drop.map((m) => m.id)).toEqual(['m0']);
    });

    it('keeps the newest messages that fit the window and drops the older ones', () => {
        const select = createCompactionSelector({ contextWindow: 100, config: BARE });
        const messages = Array.from({ length: 6 }, (_, i) => message(i));
        const { keep, drop } = select(messages);
        expect(keep.map((m) => m.id)).toEqual(['m4', 'm5']);
        expect(drop.map((m) => m.id)).toEqual(['m0', 'm1', 'm2', 'm3']);
    });

    it('drops nothing when everything fits — compact() then reports skipped', () => {
        const select = createCompactionSelector({ contextWindow: 10_000, config: BARE });
        const messages = Array.from({ length: 6 }, (_, i) => message(i));
        expect(select(messages)).toEqual({ keep: messages, drop: [] });
    });

    it('never summarises fewer than minKeep of the newest, even over budget', () => {
        const select = createCompactionSelector({ contextWindow: 100, config: BARE, minKeep: 4 });
        const { keep, drop } = select(Array.from({ length: 6 }, (_, i) => message(i)));
        expect(keep).toHaveLength(4);
        expect(drop).toHaveLength(2);
    });

    it('reads the window and the system prompt through getters, at each call', () => {
        // Starts unknown, becomes known: the getter must be read at each call, not once.
        let capacity: number | undefined = undefined;
        const select = createCompactionSelector({ contextWindow: () => capacity, systemPrompt: () => 'y'.repeat(200), config: BARE });
        const messages = Array.from({ length: 4 }, (_, i) => message(i));
        // No window known: nothing to be over.
        expect(select(messages).drop).toHaveLength(0);
        // 100 tokens minus a 50-token system prompt leaves room for one message.
        capacity = 100;
        expect(select(messages).keep.map((m) => m.id)).toEqual(['m2', 'm3']);
    });

    it('costs a message by its segments when it carries no content', () => {
        const select = createCompactionSelector({ contextWindow: 100, config: BARE });
        const rich: Message = { id: 'r', role: 'assistant', timestamp: 9, segments: [{ id: 's', type: 'text', content: 'z'.repeat(800) }] };
        const { keep, drop } = select([message(0), message(1), rich]);
        expect(keep.map((m) => m.id)).toEqual(['m1', 'r']);
        expect(drop.map((m) => m.id)).toEqual(['m0']);
    });
});
