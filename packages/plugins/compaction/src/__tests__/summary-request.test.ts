// @vitest-environment jsdom
/**
 * The summarisation request and the summary that comes back: the request must alternate roles
 * (a strict chat template refuses two user turns in a row), and an inline reasoning block must
 * not become the summary.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { contentToText, type AparteMessage } from '@aparte/core';
import { checkpointOf, disposeAll, makeConfig, makeTarget, setup } from './helpers.js';

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { disposeAll(); vi.restoreAllMocks(); });

const turn = (id: string, role: 'user' | 'assistant', content: string, timestamp: number): AparteMessage =>
    ({ id, role, content, timestamp, status: 'completed' });

const dropFirstFour = (m: AparteMessage[]) => ({ keep: m.slice(4), drop: m.slice(0, 4) });

describe('the request alternates roles', () => {
    it('merges the user turns an empty reply leaves side by side', async () => {
        // a1 was stopped before its first token: it says nothing, and u1, u2 would be adjacent.
        const target = makeTarget([
            turn('u1', 'user', 'first question', 1), turn('a1', 'assistant', '', 2),
            turn('u2', 'user', 'second question', 3), turn('a2', 'assistant', 'second answer', 4),
            turn('u3', 'user', 'third question', 5), turn('a3', 'assistant', 'third answer', 6),
        ]);
        const { cfg, last } = makeConfig();

        await setup({ selector: dropFirstFour, resolveTarget: () => target, listen: false }, cfg).compact();

        const { messages } = last().request;
        expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
        expect(contentToText(messages[0]!.content)).toBe('first question\n\nsecond question');
    });

    it('puts the ask on the user turn that ends the transcript instead of after it', async () => {
        // The last turn dropped is an empty reply: the transcript ends on the user's turn.
        const target = makeTarget([
            turn('u1', 'user', 'first question', 1), turn('a1', 'assistant', 'first answer', 2),
            turn('u2', 'user', 'second question', 3), turn('a2', 'assistant', '', 4),
            turn('u3', 'user', 'third question', 5), turn('a3', 'assistant', 'third answer', 6),
        ]);
        const { cfg, last } = makeConfig();

        await setup({ selector: dropFirstFour, resolveTarget: () => target, listen: false }, cfg).compact();

        const { messages } = last().request;
        expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
        const closing = contentToText(messages[2]!.content);
        expect(closing).toContain('second question');
        expect(closing).toContain('Please summarize the conversation above.');
    });

    it('does the same when the summary so far opens the request', async () => {
        const target = makeTarget([
            { ...turn('u1', 'user', 'first question', 1), contextSummary: { summary: 'OLD', count: 2, createdAt: 1 } },
            turn('a1', 'assistant', '', 2),
            turn('u2', 'user', 'second question', 3), turn('a2', 'assistant', 'second answer', 4),
            turn('u3', 'user', 'third question', 5), turn('a3', 'assistant', 'third answer', 6),
        ]);
        const { cfg, last } = makeConfig();

        await setup({ selector: (m) => ({ keep: m.slice(4), drop: m.slice(0, 4) }), resolveTarget: () => target, listen: false }, cfg).compact();

        const roles = last().request.messages.map((m) => m.role);
        expect(roles).toEqual(['user', 'assistant', 'user']);
    });
});

describe('an inline reasoning block is not the summary', () => {
    const conversation = (): AparteMessage[] => [
        turn('u1', 'user', 'a long first question '.repeat(10), 1), turn('a1', 'assistant', 'a long first answer '.repeat(10), 2),
        turn('u2', 'user', 'a long second question '.repeat(10), 3), turn('a2', 'assistant', 'a long second answer '.repeat(10), 4),
        turn('u3', 'user', 'third', 5), turn('a3', 'assistant', 'third answer', 6),
    ];
    const summaryFor = async (reply: string) => {
        const target = makeTarget(conversation());
        const { cfg } = makeConfig(reply);
        const outcome = await setup({ selector: dropFirstFour, resolveTarget: () => target, listen: false }, cfg).compact();
        return { outcome, target };
    };

    it('strips a <think> block before the answer', async () => {
        const { outcome, target } = await summaryFor('<think>let me plan how to write this</think>\n\nThe goal was X.');

        expect(outcome).toMatchObject({ ok: true, skipped: false });
        const stored = checkpointOf(target.messages)!.contextSummary!.summary;
        expect(stored.startsWith('The goal was X.')).toBe(true);
        expect(stored).not.toContain('think');
    });

    it('strips a block left open, to the end', async () => {
        const { target } = await summaryFor('The goal was X.<think>and then I ran out of room while');

        expect(checkpointOf(target.messages)!.contextSummary!.summary.startsWith('The goal was X.')).toBe(true);
        expect(checkpointOf(target.messages)!.contextSummary!.summary).not.toContain('ran out');
    });

    it('strips the reasoning of a template that opens the block in the prompt', async () => {
        const { target } = await summaryFor('reasoning that was never opened</think>The goal was X.');

        const stored = checkpointOf(target.messages)!.contextSummary!.summary;
        expect(stored.startsWith('The goal was X.')).toBe(true);
        expect(stored).not.toContain('never opened');
    });

    it('is an empty summary, refused, when nothing but reasoning came back', async () => {
        const { outcome, target } = await summaryFor('<think>only thinking</think>');

        expect(outcome).toMatchObject({ ok: false, error: 'Empty summary returned by model' });
        expect(checkpointOf(target.messages)).toBeUndefined();
    });

    it('leaves a summary that merely mentions the word alone', async () => {
        const { target } = await summaryFor('We think the plan is X.');

        expect(checkpointOf(target.messages)!.contextSummary!.summary.startsWith('We think the plan is X.')).toBe(true);
    });
});
