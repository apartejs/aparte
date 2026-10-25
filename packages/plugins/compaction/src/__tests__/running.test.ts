// @vitest-environment jsdom
/**
 * What a summary in flight does and what can reach it: several chats on one setup, a Restore, the
 * turn's own Stop, and the setup that was told to stay manual. The summariser is a stub that
 * answers when the test says so.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { AparteChatRequest, AparteMessage } from '@aparte/core';
import { AparteConfig } from '@aparte/core';
import { checkpointOf, disposeAll, makeConfig, makeTarget, setup, transcript, type StubTarget } from './helpers.js';

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { disposeAll(); vi.restoreAllMocks(); });

const dropFirstTwo = (m: AparteMessage[]) => ({ keep: m.slice(2), drop: m.slice(0, 2) });

/** A summariser whose answers the test releases one by one, in the order they were asked for. */
const held = () => {
    const releases: Array<(summary: string) => void> = [];
    const reply = (_request: AparteChatRequest): Promise<string> => new Promise<string>((resolve) => { releases.push(resolve); });
    return { reply, releases, release: (summary = 'SUMMARY') => releases.shift()!(summary) };
};

describe('two chats on one setup', () => {
    /** Chat `a` and chat `b`, told apart by the text of their turns. */
    const twoChats = () => {
        const stores: Record<string, StubTarget> = { a: makeTarget(transcript(3, 'AAA')), b: makeTarget(transcript(3, 'BBB')) };
        const answers = held();
        const { cfg, chat } = makeConfig(async (request) => {
            const isA = JSON.stringify(request.messages).includes('AAA');
            return isA ? answers.reply(request) : 'SUMMARY';
        }, 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: (id) => (id ? stores[id] ?? null : null) }, cfg);
        return { stores, answers, chat, c };
    };

    it('compact independently: a summary running for one does not skip the other', async () => {
        const { stores, answers, chat, c } = twoChats();

        const a = c.compact('a');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        expect(c.running).toBe(true);

        const b = await c.compact('b');

        expect(b).toMatchObject({ ok: true, skipped: false });
        expect(checkpointOf(stores.b!.messages)).toBeDefined();
        expect(checkpointOf(stores.a!.messages), 'a is still being written').toBeUndefined();
        expect(c.running).toBe(true);

        answers.release();
        expect(await a).toMatchObject({ ok: true, skipped: false });
        expect(c.running).toBe(false);
    });

    it('a second request for the same chat is still skipped while its summary runs', async () => {
        const { answers, chat, c } = twoChats();
        const first = c.compact('a');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));

        expect(await c.compact('a')).toMatchObject({ ok: true, skipped: true, reason: 'running' });

        answers.release();
        await first;
    });

    it('a send in one chat is compacted while the other\'s summary runs, and waits for its own', async () => {
        const { stores, answers, chat, c } = twoChats();
        const a = c.compact('a');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));

        // b: not made to wait for a, and not skipped because a is running.
        expect(await c.beforeSend({ target: null, targetId: 'b', exclude: [], requestTokens: 50_000 })).toBe(true);
        expect(checkpointOf(stores.b!.messages)).toBeDefined();

        // a: waits for its own summary, then measures what it left behind.
        let answer: boolean | undefined;
        void c.beforeSend({ target: null, targetId: 'a', exclude: [], requestTokens: 50_000 }).then((v) => { answer = v; });
        await new Promise((r) => setTimeout(r, 15));
        expect(answer, 'a send never races its own chat\'s summary').toBeUndefined();

        answers.release();
        await a;
        // Its own summary is written; the send then compacts what is left (a's second summary).
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(3));
        answers.release();
        await vi.waitFor(() => expect(answer).toBe(true));
    });

    it('an overflow in one chat compacts while the other\'s summary runs', async () => {
        const { stores, answers, chat, c } = twoChats();
        const a = c.compact('a');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));

        const outcome = await c.compact({ target: null, targetId: 'b', reason: 'overflow', force: true });

        expect(outcome).toMatchObject({ ok: true, skipped: false });
        expect(checkpointOf(stores.b!.messages)).toBeDefined();
        answers.release();
        await a;
    });

    it('an overflow in a chat whose own summary runs waits for it rather than being skipped', async () => {
        const { answers, chat, c } = twoChats();
        const first = c.compact('a');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));

        const overflow = c.compact({ target: null, targetId: 'a', reason: 'overflow', force: true });
        await new Promise((r) => setTimeout(r, 15));
        expect(chat, 'not started beside the first').toHaveBeenCalledTimes(1);

        answers.release();
        await first;
        // The first checkpoint is written; the overflow then goes on to take what is left to summarise.
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
        answers.release();
        expect(await overflow).not.toMatchObject({ skipped: true, reason: 'running' });
    });

    it('abort() stops them all', async () => {
        const { stores, answers, chat, c } = twoChats();
        const a = c.compact('a');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));

        c.abort();

        expect(await a).toMatchObject({ ok: false });
        expect(c.running).toBe(false);
        expect(checkpointOf(stores.a!.messages)).toBeUndefined();
        answers.release();
    });
});

describe('a Restore while a summary is being written', () => {
    /** Four exchanges, the first compaction already done: its checkpoint sits on u2. */
    const checkpointed = (): AparteMessage[] => transcript(4).map((m) => (
        m.id === 'u2' ? { ...m, contextSummary: { summary: 'OLD', count: 2, createdAt: 1000 } } : m));
    const restored = (): void => {
        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { restored: true, targetId: 'c', messageId: 'u2' } }));
    };
    const withoutCheckpoints = (target: StubTarget): void => {
        target.messages = target.messages.map(({ contextSummary: _gone, ...m }) => m);
    };

    it('cancels it: nothing is written back over the Restore', async () => {
        const target = makeTarget(checkpointed());
        const answers = held();
        const { cfg, chat } = makeConfig((request) => answers.reply(request), 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        const running = c.compact('c');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        withoutCheckpoints(target);       // what restoreContext does,
        restored();                       // then says so on window
        answers.release('UPDATED');
        const outcome = await running;

        expect(outcome).toMatchObject({ ok: false });
        expect(checkpointOf(target.messages), 'the Restore stands').toBeUndefined();
        expect(c.running).toBe(false);
    });

    it('refuses the write even when nothing said so: the checkpoint it updates is gone', async () => {
        // A host that restores through its own store dispatches no event; the summary still must not come back.
        const target = makeTarget(checkpointed());
        const answers = held();
        const { cfg, chat } = makeConfig((request) => answers.reply(request), 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, listen: false }, cfg);

        const running = c.compact('c');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        withoutCheckpoints(target);
        answers.release('UPDATED');
        const outcome = await running;

        expect(outcome).toMatchObject({ ok: false });
        expect(checkpointOf(target.messages)).toBeUndefined();
    });

    it('leaves another chat\'s summary alone', async () => {
        const target = makeTarget(transcript(3));
        const answers = held();
        const { cfg, chat } = makeConfig((request) => answers.reply(request), 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        const running = c.compact('c');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { restored: true, targetId: 'other', messageId: 'x' } }));
        answers.release();

        expect(await running).toMatchObject({ ok: true, skipped: false });
    });
});

describe('the turn\'s Stop', () => {
    it('cancels the summary its request asked for, with nothing written', async () => {
        const target = makeTarget(transcript(3));
        const stop = new AbortController();
        let seen: AbortSignal | undefined;
        const summarize = vi.fn((_request: AparteChatRequest, signal: AbortSignal) => {
            seen = signal;
            return new Promise<string>(() => undefined);      // never answers: only the abort ends it
        });
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, summarize, listen: false }, new AparteConfig());

        const running = c.compact({ target: null, targetId: 'c', signal: stop.signal });
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
        stop.abort();
        const outcome = await running;

        expect(outcome).toMatchObject({ ok: false, error: 'Compaction aborted' });
        expect(seen!.aborted).toBe(true);
        expect(target.updated).toEqual([]);
        expect(c.running).toBe(false);
    });

    it('a stop that came first starts no summary', async () => {
        const target = makeTarget(transcript(3));
        const stop = new AbortController();
        stop.abort();
        const summarize = vi.fn(async () => 'SUMMARY');
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, summarize, listen: false }, new AparteConfig());

        expect(await c.compact({ target: null, targetId: 'c', signal: stop.signal })).toMatchObject({ ok: false });
        expect(summarize).not.toHaveBeenCalled();
    });

    it('reaches the summary a send started, through beforeSend', async () => {
        const target = makeTarget(transcript(3));
        const stop = new AbortController();
        const summarize = vi.fn((_request: AparteChatRequest, _signal: AbortSignal) => new Promise<string>(() => undefined));
        const c = setup({
            selector: dropFirstTwo, resolveTarget: () => target, summarize, contextWindow: 1000,
        }, new AparteConfig());

        const sent = c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 50_000, signal: stop.signal });
        await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(1));
        stop.abort();

        expect(await sent).toBe(false);
        expect(target.updated).toEqual([]);
    });

    it('does not count as a failure: the back-off is for the model failing, not for a Stop', async () => {
        const target = makeTarget(transcript(3));
        const summarize = vi.fn((_request: AparteChatRequest, _signal: AbortSignal) => new Promise<string>(() => undefined));
        const c = setup({
            selector: dropFirstTwo, resolveTarget: () => target, summarize, contextWindow: 1000,
        }, new AparteConfig());
        for (let n = 1; n <= 3; n++) {
            const stop = new AbortController();
            const sent = c.beforeSend({ target: null, targetId: 'c', exclude: [], requestTokens: 50_000, signal: stop.signal });
            await vi.waitFor(() => expect(summarize).toHaveBeenCalledTimes(n));
            stop.abort();
            await sent;
        }
        expect(summarize, 'a third automatic attempt is still made').toHaveBeenCalledTimes(3);
    });
});

describe('auto: false means manual only', () => {
    const request = (reason: 'overflow' | 'auto' | 'manual') => ({ target: null, targetId: 'c', reason, force: true });

    for (const [name, options] of [['auto: false', { auto: false }], ['listen: false', { listen: false }]] as const) {
        it(`${name}: an overflow is not compacted, and the error stands`, async () => {
            const target = makeTarget(transcript(3));
            const { cfg, chat } = makeConfig('SUMMARY', 1000);
            const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, ...options }, cfg);

            expect(await c.compact(request('overflow'))).toMatchObject({ ok: true, skipped: true, reason: 'nothing-to-drop' });
            expect(await c.compact(request('auto'))).toMatchObject({ ok: true, skipped: true });
            expect(chat).not.toHaveBeenCalled();
            expect(target.updated).toEqual([]);
        });

        it(`${name}: a person's request still compacts`, async () => {
            const target = makeTarget(transcript(3));
            const { cfg } = makeConfig('SUMMARY', 1000);
            const c = setup({ selector: dropFirstTwo, resolveTarget: () => target, ...options }, cfg);

            expect(await c.compact(request('manual'))).toMatchObject({ ok: true, skipped: false });
            expect(checkpointOf(target.messages)).toBeDefined();
        });
    }

    it('and with the default, an overflow is compacted', async () => {
        const target = makeTarget(transcript(3));
        const { cfg } = makeConfig('SUMMARY', 1000);
        const c = setup({ selector: dropFirstTwo, resolveTarget: () => target }, cfg);

        expect(await c.compact(request('overflow'))).toMatchObject({ ok: true, skipped: false });
    });
});
