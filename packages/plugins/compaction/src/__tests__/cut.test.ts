/**
 * Where a checkpoint sits, and the first request a summary carries beside the model's words.
 */
import { describe, it, expect } from 'vitest';
import { cutAtUser, firstRequestBlock, FIRST_REQUEST_LINE, FIRST_REQUEST_MAX, splitFirstRequest } from '../cut.js';

const roles = (s: string) => [...s].map((c) => ({ role: c === 'u' ? 'user' : 'assistant' }));

describe('cutAtUser', () => {
    it('keeps the boundary when it already lands on a user message', () => {
        expect(cutAtUser(roles('uauaua'), 2)).toBe(2);
    });

    it('moves toward the older end until the first kept message is the user\'s', () => {
        // The selector kept only the last reply: the checkpoint cannot sit on it.
        expect(cutAtUser(roles('uauaua'), 5)).toBe(4);
        expect(cutAtUser(roles('uauaua'), 3)).toBe(2);
    });

    it('moves toward the newer end when going older would summarise nothing', () => {
        // Only message 0 is a user message at or before the boundary, and cutting at 0 drops nothing.
        expect(cutAtUser(roles('uaaua'), 2)).toBe(3);
    });

    it('never goes past the last message — a kept message has to exist to carry the checkpoint', () => {
        // A selector that dropped everything: the checkpoint sits on the last user message.
        expect(cutAtUser(roles('uauau'), 5)).toBe(4);
    });

    it('is null when there is no user message to sit on, or nothing to cut', () => {
        expect(cutAtUser(roles('uaaa'), 2)).toBeNull();
        expect(cutAtUser(roles('u'), 1)).toBeNull();
        expect(cutAtUser([], 0)).toBeNull();
    });
});

describe('the first request', () => {
    it('is appended under a fixed line, verbatim', () => {
        expect(firstRequestBlock('Build me a CLI')).toBe(`\n\n${FIRST_REQUEST_LINE}\nBuild me a CLI`);
    });

    it('is clipped at 1 500 characters with an ellipsis', () => {
        const block = firstRequestBlock('z'.repeat(FIRST_REQUEST_MAX + 200));
        expect(block.endsWith(`${'z'.repeat(FIRST_REQUEST_MAX)}…`)).toBe(true);
        expect(firstRequestBlock('z'.repeat(FIRST_REQUEST_MAX)).endsWith('…')).toBe(false);
    });

    it('is taken off a stored summary before the model updates it, and can be put back as it was', () => {
        const stored = `Goal: a CLI.${firstRequestBlock('Build me a CLI')}`;
        const { base, block } = splitFirstRequest(stored);
        expect(base).toBe('Goal: a CLI.');
        expect(base + block).toBe(stored);
        expect(splitFirstRequest('Goal: a CLI.')).toEqual({ base: 'Goal: a CLI.', block: '' });
    });
});
