// @vitest-environment jsdom
/**
 * When the plugin compacts without being asked: after a turn that ends over the threshold,
 * and before a send whose request would not fit — and when it stops trying. The turn's end
 * is a fake `aparte-message-done` on `window`, the usage on the last reply is what the
 * provider reported, and the summariser is a stub: what is under test is the decision.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { AparteConfig, estimateWireTokens, type AparteMessage } from '@aparte/core';
import { checkpointOf, disposeAll, exchange, makeConfig, makeTarget, recordEvents, setup, transcript } from './helpers.js';

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { disposeAll(); vi.restoreAllMocks(); });

/** Four exchanges; the last reply reports `tokens` in use and may carry a long text of its own. */
const conversation = (tokens: number, tailChars = 0): AparteMessage[] => [
    ...transcript(3),
    ...exchange(4).slice(0, 1),
    {
        id: 'a4', role: 'assistant', content: tailChars ? 'x'.repeat(tailChars) : 'fine', timestamp: 41, status: 'completed',
        usage: { inputTokens: tokens - 20, outputTokens: 20, totalTokens: tokens },
    },
];

/** The same conversation under other message ids: a different range, for a test that runs a second compaction. */
const another = (tokens = 900): AparteMessage[] => conversation(tokens).map((m) => ({ ...m, id: `n${m.id}` }));

/** Drop the oldest exchange of whatever the model reads. */
const dropFirstTwo = (m: AparteMessage[]) => ({ keep: m.slice(2), drop: m.slice(0, 2) });

const turnEnded = (targetId = 'c'): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { targetId, messageId: 'a4', role: 'assistant' } }));
};
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 15));

/** A summariser that records its calls and answers (or throws) as the test says. */
const summariser = (answer: (call: number) => string | Error = () => 'SUMMARY') => {
    let calls = 0;
    const summarize = vi.fn(async () => {
        const result = answer(++calls);
        if (result instanceof Error) throw result;
        return result;
    });
    return summarize;
};

describe('after a turn ends', () => {
    it('compacts when the context is at the threshold, 80 % of the window by default', async () => {
        const target = makeTarget(conversation(850));
        const { cfg } = makeConfig('SUMMARY', 1000);

        setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);
        turnEnded();

        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());
        expect(checkpointOf(target.messages)!.id).toBe('u2');
    });

    it('leaves a context under the threshold alone', async () => {
        const target = makeTarget(conversation(700));
        const { cfg, chat } = makeConfig('SUMMARY', 1000);

        setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);
        turnEnded();
        await settle();

        expect(chat).not.toHaveBeenCalled();
        expect(target.updated).toEqual([]);
    });

    it('reads the threshold option', async () => {
        const target = makeTarget(conversation(600));
        const { cfg } = makeConfig('SUMMARY', 1000);

        setup({ selector: dropFirstTwo, resolveTarget: () => target, threshold: 0.5 }, cfg);
        turnEnded();

        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());
    });

    it('answers only the chats it answers: a scoped setup ignores another chat\'s turn', async () => {
        const target = makeTarget(conversation(900));
        const { cfg, chat } = makeConfig('SUMMARY', 1000);

        setup({ selector: dropFirstTwo, resolveTarget: () => target, scopeToTargetId: 'mine' }, cfg);
        turnEnded('other');
        await settle();
        expect(chat).not.toHaveBeenCalled();

        turnEnded('mine');
        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());
    });

    it('needs a window: the model\'s, the contextWindow option (a number or a getter), or nothing happens', async () => {
        const target = makeTarget(conversation(900));
        const none = makeConfig('SUMMARY');
        setup({ selector: dropFirstTwo, resolveTarget: () => target }, none.cfg);
        turnEnded();
        await settle();
        expect(none.chat, 'no window, nothing to be at 80 % of').not.toHaveBeenCalled();

        let size = undefined as number | undefined;
        const own = makeConfig('SUMMARY');
        setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: () => size }, own.cfg);
        turnEnded();
        await settle();
        expect(own.chat, 'a getter that has no answer yet').not.toHaveBeenCalled();

        size = 1000;
        turnEnded();
        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());
    });

    it('the model\'s own window wins over the option', async () => {
        const target = makeTarget(conversation(900));
        const { cfg, chat } = makeConfig('SUMMARY', 100_000);

        setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: 1000 }, cfg);
        turnEnded();
        await settle();

        expect(chat, '900 of 100 000 is nothing').not.toHaveBeenCalled();
    });

    it('takes the window a gauge sends with its request as a last resort, and keeps it', async () => {
        const target = makeTarget(conversation(900));
        const { cfg, chat } = makeConfig('SUMMARY');
        setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        // A manual request that carries a window: the compaction runs, and the plugin remembers the window.
        window.dispatchEvent(new CustomEvent('aparte-compact', { detail: { targetId: 'c', window: 1000 } }));
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        await settle();

        target.messages = another();
        turnEnded();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
    });
});

describe('when it does not act', () => {
    it('auto: false keeps it manual — no turn end, no pre-flight; compact() still works', async () => {
        const target = makeTarget(conversation(900));
        const { cfg, chat } = makeConfig('SUMMARY', 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, auto: false }, cfg);

        turnEnded();
        await settle();
        expect(chat).not.toHaveBeenCalled();
        expect(await c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 50_000 })).toBe(false);
        expect(chat).not.toHaveBeenCalled();

        expect(await c.compact('c')).toMatchObject({ ok: true, skipped: false });
    });

    it('listen: false forces it off, whatever auto says', async () => {
        const target = makeTarget(conversation(900));
        const { cfg, chat } = makeConfig('SUMMARY', 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, auto: true, listen: false }, cfg);

        turnEnded();
        expect(await c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 50_000 })).toBe(false);
        await settle();

        expect(chat).not.toHaveBeenCalled();
    });

    it('does nothing when no summariser can run, and says nothing about it', async () => {
        const rec = recordEvents('aparte-compact-start', 'aparte-compact-error', 'aparte-compact-done');
        const target = makeTarget(conversation(900));
        const cfg = new AparteConfig();     // no provider registered
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: 1000 }, cfg);

        turnEnded();
        expect(await c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 50_000 })).toBe(false);
        await settle();

        expect(rec.events).toEqual([]);
        rec.stop();
    });

    it('a summarize of the host\'s is a summariser: no provider needed', async () => {
        const target = makeTarget(conversation(900));
        const summarize = summariser();
        setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: 1000, summarize }, new AparteConfig());

        turnEnded();

        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
    });
});

describe('before a send', () => {
    const ask = (c: ReturnType<typeof setup>, requestTokens: number, exclude: string[] = []) =>
        c.beforeSend({ target: null, targetId: 'c', exclude, requestTokens });

    it('compacts and resolves true when the request plus the reply reserve would not fit the window', async () => {
        const target = makeTarget(conversation(100));
        const { cfg } = makeConfig('SUMMARY', 4000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        // 4000 − the 2000 tokens kept for the reply: a request of 2100 does not fit.
        expect(await ask(c, 2100)).toBe(true);
        expect(checkpointOf(target.messages)!.id).toBe('u2');
    });

    it('resolves false, and spends nothing, when the request fits', async () => {
        const target = makeTarget(conversation(100));
        const { cfg, chat } = makeConfig('SUMMARY', 4000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        expect(await ask(c, 1900)).toBe(false);
        expect(chat).not.toHaveBeenCalled();
    });

    it('resolves false when the compaction did nothing — nothing changed, the caller need not rebuild', async () => {
        const target = makeTarget(conversation(100));
        const { cfg } = makeConfig('SUMMARY', 4000);
        const c = setup({ selector: (m) => ({ keep: m, drop: [] }), resolveTarget: () => target }, cfg);

        expect(await ask(c, 3000)).toBe(false);
    });

    it('leaves the turn being prepared out: its user message and placeholder are never summarised', async () => {
        const target = makeTarget([
            ...transcript(3),
            { id: 'u4', role: 'user', content: 'the new question', timestamp: 40, status: 'completed' },
            { id: 'r4', role: 'assistant', content: '', timestamp: 41, status: 'streaming' },
        ]);
        const { cfg, last } = makeConfig('SUMMARY', 4000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        expect(await ask(c, 3000, ['u4', 'r4'])).toBe(true);
        expect(JSON.stringify(last().request.messages)).not.toContain('the new question');
        expect(checkpointOf(target.messages)!.id).toBe('u2');
    });

    it('waits for a compaction already running, then measures what it left behind', async () => {
        const target = makeTarget(conversation(100));
        let release!: (s: string) => void;
        const { cfg, chat } = makeConfig(() => new Promise<string>((r) => { release = r; }), 4000);
        // Once a checkpoint exists the selector has nothing more to drop.
        const selector = (m: AparteMessage[]) => (m.some((x) => x.contextSummary) ? { keep: m, drop: [] } : dropFirstTwo(m));
        const c = setup({ selector, resolveTarget: () => target }, cfg);

        const manual = c.compact('c');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        let answer: boolean | undefined;
        void ask(c, 3000).then((v) => { answer = v; });
        await settle();
        expect(answer, 'a send never races a summary').toBeUndefined();

        release('SUMMARY');
        await manual;
        // The manual compaction wrote the checkpoint first, and there is nothing left to summarise.
        await vi.waitFor(() => expect(answer).toBe(false));
    });
});

describe('the back-off', () => {
    /** A summariser that fails for its first `n` calls, then answers. */
    const failing = (n: number) => summariser((call) => (call <= n ? new Error(`model down (${call})`) : 'SUMMARY'));

    it('two failures in a row stop the automatic attempts; a manual compact starts them again', async () => {
        const target = makeTarget(conversation(900));
        const summarize = failing(3);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: 1000, summarize }, new AparteConfig());

        turnEnded();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
        await settle();
        turnEnded();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(2));
        await settle();

        turnEnded();
        expect(await c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 50_000 })).toBe(false);
        await settle();
        expect(summarize, 'stopped after two').toHaveBeenCalledTimes(2);

        // A person asking is not automatic: it runs (and, here, fails a third time).
        expect(await c.compact('c')).toMatchObject({ ok: false });
        expect(summarize).toHaveBeenCalledTimes(3);

        // …but it cleared the count, so the next turn's attempt is allowed, and succeeds.
        turnEnded();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(4));
        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());
    });

    it('a success clears the count, so failures must be consecutive', async () => {
        const target = makeTarget(conversation(900));
        const summarize = summariser((call) => (call === 2 ? 'SUMMARY' : new Error('model down')));
        setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: 1000, summarize }, new AparteConfig());

        turnEnded();                                        // fails
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
        await settle();
        turnEnded();                                        // succeeds → count back to 0
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());

        target.messages = another();
        turnEnded();                                        // fails (1)
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(3));
        await settle();
        turnEnded();                                        // still allowed: fails (2)
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(4));
    });

    it('counts the gauge\'s auto requests, and refuses them once it stopped; a request without auto still runs', async () => {
        const target = makeTarget(conversation(900));
        const summarize = failing(2);
        setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: 1000, summarize }, new AparteConfig());
        const askAuto = (): void => {
            window.dispatchEvent(new CustomEvent('aparte-compact', { detail: { targetId: 'c', auto: true } }));
        };

        askAuto();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
        await settle();
        askAuto();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(2));
        await settle();
        askAuto();
        await settle();
        expect(summarize, 'the third automatic request is not made').toHaveBeenCalledTimes(2);

        window.dispatchEvent(new CustomEvent('aparte-compact', { detail: { targetId: 'c' } }));
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(3));
    });

    it('an overflow always runs, whatever the back-off says', async () => {
        const target = makeTarget(conversation(900));
        const summarize = failing(2);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: 1000, summarize }, new AparteConfig());
        turnEnded();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
        await settle();
        turnEnded();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(2));
        await settle();

        const outcome = await c.compact({ target: null, targetId: 'c', reason: 'overflow' });

        expect(summarize).toHaveBeenCalledTimes(3);
        expect(outcome).toMatchObject({ ok: true, skipped: false });
    });

    it('is forgotten when the conversation is switched', async () => {
        const target = makeTarget(conversation(900));
        const summarize = failing(2);
        setup({ selector: dropFirstTwo, resolveTarget: () => target, contextWindow: 1000, summarize }, new AparteConfig());
        turnEnded();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
        await settle();
        turnEnded();
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(2));
        await settle();

        window.dispatchEvent(new CustomEvent('aparte-reset-done'));
        turnEnded();

        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(3));
    });
});

describe('the hysteresis', () => {
    // The last reply is long, so even after the oldest exchange is summarised the model still reads
    // more than 80 % of the window.
    const heavy = (): AparteMessage[] => conversation(900, 4000);

    it('waits for another turn after a compaction that left the context at the threshold', async () => {
        const target = makeTarget(heavy());
        const { cfg, chat } = makeConfig('SUMMARY', 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        turnEnded();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());

        // Still over: not again for the asking — a request nobody made, an automatic one.
        expect(await c.compact({ target: null, targetId: 'c', reason: 'auto' })).toMatchObject({ skipped: true });
        expect(chat).toHaveBeenCalledTimes(1);
        // `force` is the caller overriding the policy.
        expect(await c.compact({ target: null, targetId: 'c', reason: 'auto', force: true })).toMatchObject({ ok: true, skipped: false });
        expect(chat).toHaveBeenCalledTimes(2);
    });

    it('another turn completing lifts it', async () => {
        const target = makeTarget(heavy());
        const { cfg, chat } = makeConfig('SUMMARY', 1000);
        setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        turnEnded();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        await settle();
        turnEnded();

        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
    });

    it('never takes the same range twice', async () => {
        const target = makeTarget(heavy());
        const { cfg, chat } = makeConfig('SUMMARY', 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);
        await c.compact({ target: null, targetId: 'c', reason: 'auto' });
        expect(chat).toHaveBeenCalledTimes(1);

        // Whoever took the checkpoint off (a host that restores by itself) leaves the range open again.
        target.messages = target.messages.map(({ contextSummary: _gone, ...m }) => m);
        window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { targetId: 'c', messageId: 'a4', role: 'assistant' } }));
        await settle();

        expect(chat, 'the same two messages are not summarised again').toHaveBeenCalledTimes(1);
    });
});

describe('a Restore', () => {
    const restored = (targetId = 'c'): void => {
        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { restored: true, targetId, messageId: 'u2' } }));
    };

    it('suspends the automatic attempts until a person asks again', async () => {
        const target = makeTarget(conversation(900));
        const { cfg, chat } = makeConfig('SUMMARY', 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        restored();
        turnEnded();
        expect(await c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 50_000 })).toBe(false);
        await settle();
        expect(chat).not.toHaveBeenCalled();

        expect(await c.compact('c')).toMatchObject({ ok: true, skipped: false });
        expect(chat).toHaveBeenCalledTimes(1);
    });

    it('is lifted by a conversation switch', async () => {
        const target = makeTarget(conversation(900));
        const { cfg } = makeConfig('SUMMARY', 1000);
        setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        restored();
        window.dispatchEvent(new CustomEvent('aparte-reset-done'));
        turnEnded();

        await vi.waitFor(() => expect(checkpointOf(target.messages)).toBeDefined());
    });

    it('does not stop an overflow retry: the restored history may no longer fit', async () => {
        const target = makeTarget(conversation(900));
        const { cfg } = makeConfig('SUMMARY', 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        restored();

        expect(await c.compact({ target: null, targetId: 'c', reason: 'overflow' })).toMatchObject({ ok: true, skipped: false });
    });
});

describe('the preview', () => {
    it('says what a compaction would summarise now, without a model call or a write', () => {
        const target = makeTarget(conversation(100));
        const { cfg, chat } = makeConfig('SUMMARY', 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, listen: false }, cfg);

        const preview = c.preview({ target: null, targetId: 'c' });

        expect(preview).toEqual({ messages: 2, tokens: estimateWireTokens(target.messages.slice(0, 2)) });
        expect(chat).not.toHaveBeenCalled();
        expect(target.updated).toEqual([]);
    });

    it('is null when there is nothing to do, nothing to summarise with, or the chat is busy', async () => {
        const target = makeTarget(conversation(100));
        const nothing = setup({ selector: (m) => ({ keep: m, drop: [] }), resolveTarget: () => target, listen: false }, makeConfig('S', 1000).cfg);
        expect(nothing.preview({ target: null, targetId: 'c' })).toBeNull();

        const mute = setup({ selector: dropFirstTwo, resolveTarget: () => target, listen: false }, new AparteConfig());
        expect(mute.preview({ target: null, targetId: 'c' })).toBeNull();

        let release!: (s: string) => void;
        const { cfg, chat } = makeConfig(() => new Promise<string>((r) => { release = r; }), 1000);
        const busy = setup({ selector: dropFirstTwo, resolveTarget: () => target, listen: false }, cfg);
        const running = busy.compact('c');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        expect(busy.preview({ target: null, targetId: 'c' })).toBeNull();
        release('SUMMARY');
        await running;
    });
});

describe('the selector the plugin builds', () => {
    it('prices a message by what the wire sends: a reply\'s thinking costs nothing', async () => {
        // Two exchanges whose replies are mostly thinking, which the model is never shown. Costed by
        // their text alone the older exchange would not fit the 1 000-token window and would be dropped;
        // costed by the wire it is nearly free, and everything stays.
        const thinking = (id: string, ts: number): AparteMessage => ({
            id, role: 'assistant', content: '', timestamp: ts, status: 'completed',
            segments: [
                { id: `${id}-t`, type: 'thinking', content: 'z'.repeat(2400) } as never,
                { id: `${id}-x`, type: 'text', content: 'ok' } as never,
            ],
        });
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'first', timestamp: 1, status: 'completed' }, thinking('a1', 2),
            { id: 'u2', role: 'user', content: 'second', timestamp: 3, status: 'completed' }, thinking('a2', 4),
            { id: 'u3', role: 'user', content: 'third', timestamp: 5, status: 'completed' }, thinking('a3', 6),
        ];
        const target = makeTarget(messages);
        const { cfg, chat } = makeConfig('SUMMARY', 3000);

        const outcome = await setup({ resolveTarget: () => target, listen: false }, cfg).compact('c');

        expect(outcome).toMatchObject({ ok: true, skipped: true, reason: 'nothing-to-drop' });
        expect(chat).not.toHaveBeenCalled();
    });
});
