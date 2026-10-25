// @vitest-environment jsdom
/**
 * Where a compaction lands, with the plugin's DEFAULT selector: every other policy test passes a
 * selector of its own, which is how a threshold the default never reached, a heuristic that
 * undercounts and a long new message nobody made room for all went unseen. The numbers are real
 * ones: a 128K window for the threshold, an 8K one for the turn being prepared.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { measureContext, type AparteMessage } from '@aparte/core';
import { checkpointOf, disposeAll, exchange, makeConfig, makeTarget, setup } from './helpers.js';

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { disposeAll(); vi.restoreAllMocks(); });

/** `n` exchanges whose every message is `chars` characters long, ids u1 a1 … un an. */
const sized = (n: number, chars: number, from = 1): AparteMessage[] =>
    Array.from({ length: n }, (_, i) => exchange(from + i, 'x'.repeat(chars))).flat()
        .map((m) => ({ ...m, content: 'x'.repeat(chars) }));

/** The last reply reports an input `k` times the estimate recorded when it was sent: the heuristic undercounts by `k`. */
const undercounted = (messages: AparteMessage[], k: number): AparteMessage[] =>
    messages.map((m, i) => (i === messages.length - 1
        ? { ...m, contextEstimate: 1000, usage: { inputTokens: 1000 * k, outputTokens: 10, totalTokens: 1000 * k + 10 } }
        : m));

const turnEnded = (): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { targetId: 'c', messageId: 'a1', role: 'assistant' } }));
};
const used = (messages: AparteMessage[], cfg: ReturnType<typeof makeConfig>['cfg'], window: number): number =>
    measureContext({ messages, config: cfg, windowOverride: window }).used;

const W = 128_000;

describe('the default selector aims below the threshold', () => {
    it('a turn that ends at 82 % of a 128K window writes a checkpoint, and lands well under the threshold', async () => {
        // 40 messages of 10 000 characters: about 105 000 tokens. The selector used to keep all
        // of it, its budget being about 88 % of the window, and the turn ended with nothing done.
        const target = makeTarget(sized(20, 10_000));
        const { cfg } = makeConfig('SUMMARY', W);
        expect(used(target.messages, cfg, W) / W).toBeGreaterThan(0.8);
        setup({ resolveTarget: () => target }, cfg);

        turnEnded();

        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());
        // A fifth of the window below the threshold, so the next turns have room.
        expect(used(target.messages, cfg, W) / W).toBeLessThan(0.65);
    });

    it('threshold 0.7 acts at 72 %', async () => {
        const target = makeTarget(sized(20, 8750));
        const { cfg } = makeConfig('SUMMARY', W);
        const share = used(target.messages, cfg, W) / W;
        expect(share).toBeGreaterThan(0.7);
        expect(share).toBeLessThan(0.8);
        setup({ resolveTarget: () => target, threshold: 0.7 }, cfg);

        turnEnded();

        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());
        expect(used(target.messages, cfg, W) / W).toBeLessThan(0.55);
    });

    it('a conversation that sits near the window costs one summary, not one per turn', async () => {
        const target = makeTarget(sized(20, 12_000));      // ~99 % of the window
        const { cfg, chat } = makeConfig('SUMMARY', W);
        setup({ resolveTarget: () => target }, cfg);

        turnEnded();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());

        // Four more exchanges, each ending a turn: the context grows, and stays under the threshold.
        for (let n = 21; n <= 24; n++) {
            target.messages = [...target.messages, ...sized(1, 4000, n)];
            turnEnded();
            await new Promise((r) => setTimeout(r, 15));
        }

        expect(chat).toHaveBeenCalledTimes(1);
        expect(used(target.messages, cfg, W) / W).toBeLessThan(0.8);
    });

    it('a selector of the host\'s is left alone: what it keeps is its call', async () => {
        const target = makeTarget(sized(20, 10_000));
        const { cfg } = makeConfig('SUMMARY', W);
        const keepAll = vi.fn((m: AparteMessage[]) => ({ keep: m, drop: [] }));
        setup({ resolveTarget: () => target, selector: keepAll }, cfg);

        turnEnded();
        await new Promise((r) => setTimeout(r, 15));

        expect(keepAll).toHaveBeenCalledTimes(1);
        expect(keepAll.mock.calls[0]!.length, 'called with the messages alone').toBe(1);
        expect(checkpointOf(target.messages)).toBeUndefined();
    });
});

describe('the default selector counts in the model\'s tokens', () => {
    // 8 messages of 1 800 characters: about 3 800 estimated tokens, 9 500 once the heuristic's 2.5x
    // is applied — over an 8K window although the raw figure is well inside its budget.
    const history = (): AparteMessage[] => undercounted(sized(4, 1800), 2.5);

    it('an overflow compacts a history the raw heuristic says fits', async () => {
        const target = makeTarget(history());
        const { cfg } = makeConfig('SUMMARY', 8000);
        const c = setup({ resolveTarget: () => target }, cfg);

        const outcome = await c.compact({ target: null, targetId: 'c', reason: 'overflow' });

        expect(outcome).toMatchObject({ ok: true, skipped: false });
        expect(checkpointOf(target.messages)).toBeDefined();
    });

    it('the pre-send comparison is calibrated too: a request the heuristic puts inside the window does not fit', async () => {
        const target = makeTarget(history());
        const { cfg } = makeConfig('SUMMARY', 8000);
        const c = setup({ resolveTarget: () => target }, cfg);

        // 2 500 estimated + 2 000 for the reply is 4 500 of 8 000 raw; the model counts 6 250 + 2 000.
        const compacted = await c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 2500 });

        expect(compacted).toBe(true);
        expect(checkpointOf(target.messages)).toBeDefined();
    });

    it('and one that fits at the model\'s count is left alone', async () => {
        const target = makeTarget(history());
        const { cfg, chat } = makeConfig('SUMMARY', 8000);
        const c = setup({ resolveTarget: () => target }, cfg);

        expect(await c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 1500 })).toBe(false);
        expect(chat).not.toHaveBeenCalled();
    });

    it('the summary request is sized in the model\'s tokens: fewer turns go to a model that counts 3x', async () => {
        // The request would carry 12 turns of about 260 estimated tokens (3 100) against a room of
        // 5 500: it fits at face value, and at three times that it does not.
        const plain = sized(6, 1000);
        const keepLastTwo = (m: AparteMessage[]) => ({ keep: m.slice(-2), drop: m.slice(0, -2) });
        const turnsSent = async (messages: AparteMessage[]): Promise<number> => {
            const target = makeTarget(messages);
            const { cfg, last } = makeConfig('SUMMARY', 8000);
            await setup({ resolveTarget: () => target, selector: keepLastTwo, listen: false }, cfg).compact();
            return last().request.messages.length;
        };

        const faceValue = await turnsSent(plain);
        const undercount = await turnsSent(undercounted(plain, 3));

        expect(undercount).toBeLessThan(faceValue);
    });
});

describe('the turn being prepared', () => {
    // Eight messages of about 550 tokens, 4 400 in all, on an 8K window: inside the budget by itself.
    const history = (): AparteMessage[] => sized(4, 2090);
    const newTurn = (): AparteMessage[] => [
        { id: 'u5', role: 'user', content: 'p'.repeat(9500), timestamp: 100, status: 'completed' },     // about 2 500 tokens
        { id: 'r5', role: 'assistant', content: '', timestamp: 101, status: 'streaming' },
    ];

    it('is made room for before a send: a long paste compacts a history that fits without it', async () => {
        const target = makeTarget([...history(), ...newTurn()]);
        const { cfg, last } = makeConfig('SUMMARY', 8192);
        const c = setup({ resolveTarget: () => target }, cfg);

        const compacted = await c.beforeSend({ target: null, targetId: 'c', exclude: ['u5', 'r5'], requestTokens: 6900 });

        expect(compacted).toBe(true);
        expect(JSON.stringify(last().request.messages), 'the new turn is not summarised').not.toContain('ppp');
        // What the request will carry — the history left, the summary and the paste — leaves the reply its room.
        expect(used(target.messages, cfg, 8192) + 2000).toBeLessThanOrEqual(8192);
        // Down to the newest exchange, which is the least it keeps.
        expect(checkpointOf(target.messages)!.id).toBe('u4');
    });

    it('is made room for after an overflow too', async () => {
        const target = makeTarget([...history(), ...newTurn()]);
        const { cfg } = makeConfig('SUMMARY', 8192);
        const c = setup({ resolveTarget: () => target }, cfg);

        const outcome = await c.compact({ target: null, targetId: 'c', reason: 'overflow', exclude: ['u5', 'r5'] });

        expect(outcome).toMatchObject({ ok: true, skipped: false });
        expect(checkpointOf(target.messages)!.id).toBe('u4');
    });

    it('leaves a history that fits with it alone', async () => {
        const target = makeTarget([...sized(2, 600), ...newTurn()]);
        const { cfg, chat } = makeConfig('SUMMARY', 8192);
        const c = setup({ resolveTarget: () => target }, cfg);

        expect(await c.beforeSend({ target: null, targetId: 'c', exclude: ['u5', 'r5'], requestTokens: 6000 })).toBe(false);
        expect(chat).not.toHaveBeenCalled();
    });
});
