// @vitest-environment jsdom
/**
 * A compaction reads a failed turn the way the next request sends it (core's
 * `withoutAbandonedTurns`): a message whose reply failed for good — too long for the
 * window, refused by the provider's policy — is in no later request, so it neither weighs
 * on the cut nor reaches the summary. One whose reply failed on the network goes with the
 * next message, so it is summarised, with the line saying the turn failed.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { AparteErrorCode, contentToText, type AparteMessage } from '@aparte/core';
import { disposeAll, makeConfig, makeTarget, setup } from './helpers.js';

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { disposeAll(); vi.restoreAllMocks(); });

const turn = (id: string, role: 'user' | 'assistant', content: string, timestamp: number): AparteMessage =>
    ({ id, role, content, timestamp, status: 'completed' });

const failed = (id: string, code: AparteErrorCode, timestamp: number): AparteMessage => ({
    id, role: 'assistant', content: '', timestamp, status: 'error',
    segments: [{ id: `error-${id}`, type: 'error', content: 'The turn failed.', code }],
});

const transcriptWith = (code: AparteErrorCode, asked = 'the message that failed'): AparteMessage[] => [
    turn('u1', 'user', 'first question', 1), turn('a1', 'assistant', 'first answer', 2),
    turn('u2', 'user', asked, 3), failed('a2', code, 4),
    turn('u3', 'user', 'third question', 5), turn('a3', 'assistant', 'third answer', 6),
    turn('u4', 'user', 'fourth question', 7), turn('a4', 'assistant', 'fourth answer', 8),
];

const dropFirstSix = (m: AparteMessage[]) => ({ keep: m.slice(6), drop: m.slice(0, 6) });

describe('a failed turn is compacted as the next request sends it', () => {
    it('leaves a message whose reply failed for good out of the summary', async () => {
        const target = makeTarget(transcriptWith(AparteErrorCode.PROVIDER_POLICY));
        const { cfg, last } = makeConfig();

        await setup({ selector: dropFirstSix, resolveTarget: () => target, listen: false }, cfg).compact();

        const read = last().request.messages.map((m) => contentToText(m.content)).join('\n');
        expect(read).not.toContain('the message that failed');
        expect(read).toContain('first question');
        expect(read).toContain('third question');
    });

    it('summarises a message whose reply failed on the network, as the next request sent it', async () => {
        const target = makeTarget(transcriptWith(AparteErrorCode.NET_ERROR));
        const { cfg, last } = makeConfig();

        await setup({ selector: dropFirstSix, resolveTarget: () => target, listen: false }, cfg).compact();

        const read = last().request.messages.map((m) => contentToText(m.content)).join('\n');
        expect(read).toContain('the message that failed');
    });

    it('does not weigh a message whose reply failed for good when it chooses the cut', async () => {
        // The one big message is in no later request: without it, everything fits the window.
        const huge = 'word '.repeat(150_000);
        const target = makeTarget(transcriptWith(AparteErrorCode.USAGE_CONTEXT_EXCEEDED, huge));
        const { cfg, calls } = makeConfig('SUMMARY', 128_000);

        const outcome = await setup({ resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toMatchObject({ ok: true, skipped: true });
        expect(calls).toHaveLength(0);
    });
});
