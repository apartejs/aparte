/**
 * What core reads as the AI's words. A human who joins the conversation writes on the
 * assistant's side too, and a notice ("Marie joined") sits there by convention: neither
 * is a reply of the model, so nothing that looks for the AI's reply may take them for one.
 */
import { describe, it, expect } from 'vitest';
import { isModelReply, authorTypeOf } from '../is-model-reply.js';
import type { AparteMessage } from '../../types/index.js';

type Shape = Pick<AparteMessage, 'role' | 'kind' | 'author'>;

describe('isModelReply', () => {
    it.each<[string, Shape, boolean]>([
        ['an assistant message with no author', { role: 'assistant' }, true],
        ['an assistant message an AI wrote', { role: 'assistant', author: { name: 'Bot', type: 'ai' } }, true],
        ['an assistant message with a name and no type', { role: 'assistant', author: { name: 'Researcher' } }, true],
        ['a human on the assistant side', { role: 'assistant', author: { name: 'Marie', type: 'human' } }, false],
        ['a notice', { role: 'assistant', kind: 'notice' }, false],
        ["the person's message", { role: 'user' }, false],
    ])('%s → %s', (_label, message, expected) => {
        expect(isModelReply(message)).toBe(expected);
    });
});

describe('authorTypeOf', () => {
    it('reads the user side as human and the assistant side as AI by default', () => {
        expect(authorTypeOf({ role: 'user' })).toBe('human');
        expect(authorTypeOf({ role: 'assistant' })).toBe('ai');
    });

    it('takes the type the author states', () => {
        expect(authorTypeOf({ role: 'assistant', author: { name: 'Marie', type: 'human' } })).toBe('human');
        expect(authorTypeOf({ role: 'user', author: { name: 'Relay', type: 'ai' } })).toBe('ai');
    });
});
