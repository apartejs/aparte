import { describe, it, expect } from 'vitest';
import { isAwaitingReply } from '../is-awaiting-reply.js';
import type { AparteMessage } from '../../types/index.js';

const m = (extra: Partial<AparteMessage> = {}): AparteMessage =>
    ({ id: 'x', role: 'assistant', timestamp: 0, ...extra }) as AparteMessage;

describe('isAwaitingReply', () => {
    it('is true when the message says so', () => {
        expect(isAwaitingReply(m({ status: 'pending' }))).toBe(true);
        expect(isAwaitingReply(m({ status: 'streaming', content: 'partial' }))).toBe(true);
    });

    it('is true for an empty assistant message with NO status — the reported case', () => {
        // `appendMessage({ role: 'assistant', content: '' })` from a hand-rolled
        // loop: an empty shell a token stream is about to fill. Without this it
        // rendered as a finished reply, complete with copy/retry.
        expect(isAwaitingReply(m({ content: '' }))).toBe(true);
        expect(isAwaitingReply(m())).toBe(true);
        expect(isAwaitingReply(m({ content: '   \n ' }))).toBe(true);
    });

    it('is false once there is anything to show', () => {
        expect(isAwaitingReply(m({ content: 'hello' }))).toBe(false);
        expect(isAwaitingReply(m({ segments: [{ id: 's', type: 'text', content: '' }] as never }))).toBe(false);
    });

    it('is false when a status is stated, even on an empty message', () => {
        // An explicit status is the app talking: believe it. Only silence is
        // interpreted, so a deliberately empty finished message stays finished.
        for (const status of ['completed', 'error', 'idle', 'success'] as const) {
            expect(isAwaitingReply(m({ status, content: '' })), status).toBe(false);
        }
    });

    it('never infers it for a user message — but still believes an explicit status', () => {
        // The inference is assistant-only: an empty user bubble is a user bubble.
        expect(isAwaitingReply(m({ role: 'user', content: '' }))).toBe(false);
        // The explicit clause is role-agnostic on purpose: it is exactly the
        // condition every call site used before this helper existed, so no
        // existing behaviour shifts.
        expect(isAwaitingReply(m({ role: 'user', status: 'pending' }))).toBe(true);
    });
});
