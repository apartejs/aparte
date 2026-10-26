// @vitest-environment jsdom
/**
 * What a compaction writes and how it is asked for: the checkpoint over a model view that
 * leaves out the turn being prepared, an update of the earlier summary rather than a second
 * summary of everything, the first request kept word for word, the events a transcript draws
 * from, and the controller as the config's compactor.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteConfig, type AparteMessage, type AparteCompactor } from '@aparte/core';
import { FIRST_REQUEST_LINE, FIRST_REQUEST_MAX } from '../cut.js';
import { checkpointOf, disposeAll, makeConfig, makeTarget, recordEvents, setup, transcript } from './helpers.js';

afterEach(disposeAll);

const turn = (id: string, role: 'user' | 'assistant', content: string, status: AparteMessage['status'] = 'completed', timestamp = 100): AparteMessage =>
    ({ id, role, content, timestamp, status });

describe('the turn being prepared', () => {
    const path = (): AparteMessage[] => [
        ...transcript(2),
        turn('u3', 'user', 'the question being sent'),
        turn('r3', 'assistant', '', 'streaming'),
    ];

    it('is left out of the selection and of the in-flight guard, and is never summarised', async () => {
        const target = makeTarget(path());
        const { cfg, last } = makeConfig();
        const seen: string[][] = [];
        const selector = (m: AparteMessage[]) => {
            seen.push(m.map((x) => x.id));
            return { keep: m.slice(2), drop: m.slice(0, 2) };
        };

        const outcome = await setup({ selector, resolveTarget: () => target, listen: false }, cfg)
            .compact({ target: null, targetId: 'c', exclude: ['u3', 'r3'] });

        expect(seen).toEqual([['u1', 'a1', 'u2', 'a2']]);
        expect(outcome).toMatchObject({ ok: true, skipped: false, messageId: 'u2', dropped: 2, kept: 4 });
        expect(JSON.stringify(last().request.messages)).not.toContain('the question being sent');
        expect(checkpointOf(target.messages)!.id).toBe('u2');
    });

    it('is a turn in flight when nobody says it is being prepared', async () => {
        const target = makeTarget(path());
        const { cfg, chat } = makeConfig();

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toMatchObject({ ok: true, skipped: true, reason: 'streaming' });
        expect(chat).not.toHaveBeenCalled();
    });

    it('does not excuse any OTHER message in flight', async () => {
        const messages = path();
        messages[3] = { ...messages[3]!, status: 'streaming' };
        const target = makeTarget(messages);
        const { cfg, chat } = makeConfig();

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg)
            .compact({ target: null, exclude: ['u3', 'r3'] });

        expect(outcome).toMatchObject({ skipped: true, reason: 'streaming' });
        expect(chat).not.toHaveBeenCalled();
    });
});

describe('a second compaction updates the first', () => {
    /** Two compactions of the same conversation: the first drops u1 a1 u2 a2, the second u3 a3. */
    async function twice() {
        const target = makeTarget(transcript(4, 'q'));
        let n = 0;
        const { cfg, calls } = makeConfig(() => `S${++n}`);
        // One setup, a different cut each time: the second call reads the checkpoint the first wrote.
        let cut = 4;
        const c = setup({
            selector: (m) => ({ keep: m.slice(cut), drop: m.slice(0, cut) }),
            resolveTarget: () => target,
            listen: false,
        }, cfg);
        const first = await c.compact();
        cut = 2;
        const second = await c.compact();
        return { target, calls, first, second };
    }

    it('sends "Summary so far:" with the earlier summary and only the messages since, and asks for an update', async () => {
        const { calls, second } = await twice();

        expect(second).toMatchObject({ ok: true, skipped: false });
        const request = calls[1]!.request;
        const [opening, ...rest] = request.messages;
        // Merged into the first turn, which is the user's: the request never opens with two user messages.
        expect(opening!.role).toBe('user');
        expect(opening!.content).toMatch(/^Summary so far:\nS1\n/);
        expect(opening!.content).toContain('q question 3');
        expect(JSON.stringify(request.messages)).not.toContain('q question 1');
        expect(JSON.stringify(request.messages)).not.toContain('q question 2');
        expect(rest.map((m) => m.role)).toEqual(['assistant', 'user']);
        expect(String(rest.at(-1)!.content)).toContain('Please write the updated summary');
        expect(String(rest[0]!.content)).toBe('q answer 3');
    });

    it('moves the checkpoint down, counts everything above it, and leaves the earlier field on its message', async () => {
        const { target, second } = await twice();

        expect(second).toMatchObject({ messageId: 'u4', count: 6, dropped: 2, kept: 2 });
        const holders = target.messages.filter((m) => m.contextSummary).map((m) => [m.id, m.contextSummary!.count]);
        expect(holders).toEqual([['u3', 4], ['u4', 6]]);
        expect(target.messages).toHaveLength(8);
    });

    it('carries the first request through the update without asking the model for it', async () => {
        const { target, calls } = await twice();

        const first = target.messages.find((m) => m.id === 'u3')!.contextSummary!.summary;
        const second = target.messages.find((m) => m.id === 'u4')!.contextSummary!.summary;
        expect(first).toBe(`S1\n\n${FIRST_REQUEST_LINE}\nq question 1`);
        expect(second).toBe(`S2\n\n${FIRST_REQUEST_LINE}\nq question 1`);
        // The model was handed the summary without the block: it would have copied it into its answer.
        expect(JSON.stringify(calls[1]!.request.messages)).not.toContain(FIRST_REQUEST_LINE);
    });

    it('measures the no-gain refusal against the summary it updates plus the messages it folds in', async () => {
        const cp = (summary: string): AparteMessage => ({ ...turn('u2', 'user', 'm question 2'), contextSummary: { summary, count: 2, createdAt: 5 } });
        const messages = (): AparteMessage[] => [
            turn('u1', 'user', 'm question 1'), turn('a1', 'assistant', 'm answer 1'),
            cp('P'.repeat(400)), turn('a2', 'assistant', 'm answer 2'),
            turn('u3', 'user', 'm question 3'), turn('a3', 'assistant', 'm answer 3'),
        ];
        const selector = (m: AparteMessage[]) => ({ keep: m.slice(2), drop: m.slice(0, 2) });

        // About 106 tokens of earlier summary and 8 of messages are replaced: 79 is a gain, 127 is not —
        // although both are far longer than the two messages alone.
        const gain = makeTarget(messages());
        const accepted = await setup({ selector, resolveTarget: () => gain, listen: false }, makeConfig('T'.repeat(300)).cfg).compact();
        expect(accepted).toMatchObject({ ok: true, skipped: false });

        const flat = makeTarget(messages());
        const refused = await setup({ selector, resolveTarget: () => flat, listen: false }, makeConfig('T'.repeat(480)).cfg).compact();
        expect(refused).toMatchObject({ ok: false, error: 'The summary is no shorter than the turns it replaces' });
        expect(flat.updated).toEqual([]);
    });
});

describe('the first request of the conversation', () => {
    it('is appended verbatim under a fixed line, after the model\'s summary', async () => {
        const target = makeTarget([...transcript(2, 'q'), turn('u3', 'user', 'next')]);
        const { cfg } = makeConfig('Short summary.');

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toMatchObject({ ok: true, summary: `Short summary.\n\n${FIRST_REQUEST_LINE}\nq question 1` });
        expect(checkpointOf(target.messages)!.contextSummary!.summary).toBe(`Short summary.\n\n${FIRST_REQUEST_LINE}\nq question 1`);
    });

    it('is clipped at 1 500 characters with an ellipsis', async () => {
        const long = 'z'.repeat(FIRST_REQUEST_MAX + 500);
        const target = makeTarget([turn('u1', 'user', long), turn('a1', 'assistant', 'ok'), turn('u2', 'user', 'next'), turn('a2', 'assistant', 'fine')]);
        const { cfg } = makeConfig('Short summary.');

        await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg).compact();

        const summary = checkpointOf(target.messages)!.contextSummary!.summary;
        expect(summary.endsWith(`${'z'.repeat(FIRST_REQUEST_MAX)}…`)).toBe(true);
        expect(summary.length).toBe(`Short summary.\n\n${FIRST_REQUEST_LINE}\n`.length + FIRST_REQUEST_MAX + 1);
    });

    it('is not sent to the summariser twice: the model reads it once, in the transcript', async () => {
        const target = makeTarget([...transcript(2, 'q'), turn('u3', 'user', 'next')]);
        const { cfg, last } = makeConfig('Short summary.');

        await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(JSON.stringify(last().request.messages)).not.toContain(FIRST_REQUEST_LINE);
    });
});

describe('the events a transcript draws from', () => {
    it('-start names the message the checkpoint will sit on; -done adds its count; -error keeps the message', async () => {
        const rec = recordEvents('aparte-compact-start', 'aparte-compact-done', 'aparte-compact-error');
        const target = makeTarget([...transcript(2), turn('u3', 'user', 'next')]);
        const { cfg } = makeConfig();
        const c = setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg);

        await c.compact('chat-1');
        expect(rec.events.map((e) => e.type)).toEqual(['aparte-compact-start', 'aparte-compact-done']);
        expect(rec.events[0]!.detail).toEqual({ targetId: 'chat-1', messageId: 'u2' });
        expect(rec.events[1]!.detail).toEqual({
            summary: expect.stringMatching(/^SUMMARY/), kept: 3, dropped: 2, targetId: 'chat-1', messageId: 'u2', count: 2,
        });

        rec.events.length = 0;
        target.messages = [...transcript(2), turn('u3', 'user', 'next')];
        const failing = setup({
            selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false,
            summarize: async () => { throw new Error('model down'); },
        }, new AparteConfig());
        await failing.compact('chat-1');
        expect(rec.events.at(-1)).toMatchObject({ type: 'aparte-compact-error', detail: { error: 'model down', targetId: 'chat-1', messageId: 'u2' } });
        rec.stop();
    });
});

describe('the controller as the config\'s compactor', () => {
    it('registers itself on the config it was set up on, and dispose unregisters it', () => {
        const { cfg } = makeConfig();
        const c = setup({ listen: false }, cfg);
        expect(cfg.getCompactor()).toBe(c);
        c.dispose();
        expect(cfg.getCompactor()).toBeNull();
    });

    it('a later setup takes the seam; disposing an earlier controller does not take it back', () => {
        const { cfg } = makeConfig();
        const first = setup({ listen: false }, cfg);
        const second = setup({ listen: false }, cfg);
        expect(cfg.getCompactor()).toBe(second);
        first.dispose();
        expect(cfg.getCompactor()).toBe(second);
    });

    it('dispose leaves a compactor somebody else registered', () => {
        const { cfg } = makeConfig();
        const c = setup({ listen: false }, cfg);
        const other: AparteCompactor = { compact: async () => ({ ok: true, skipped: true, reason: 'empty' }), settled: async () => undefined };
        cfg.setCompactor(other);
        c.dispose();
        expect(cfg.getCompactor()).toBe(other);
    });

    it('takes the seam\'s request: the chat element is found without an id, even outside the document', async () => {
        // A chat inside a shadow root is not found by id; the compactor is handed the element.
        const store = makeTarget([...transcript(2), turn('u3', 'user', 'next')]);
        const element = Object.assign(document.createElement('div'), { getMessages: store.getMessages, updateMessage: store.updateMessage });
        const { cfg } = makeConfig();

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), listen: false }, cfg)
            .compact({ target: element, reason: 'manual' });

        expect(outcome).toMatchObject({ ok: true, skipped: false, messageId: 'u2' });
        expect(checkpointOf(store.messages)!.id).toBe('u2');
    });

    it('still takes a chat id, or nothing', async () => {
        const store = makeTarget([...transcript(2), turn('u3', 'user', 'next')]);
        const { cfg } = makeConfig();
        const c = setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => store, listen: false }, cfg);
        expect(await c.compact('chat-1')).toMatchObject({ ok: true, targetId: 'chat-1' });
        store.messages = [...transcript(2), turn('u3', 'user', 'next')];
        expect(await c.compact()).toMatchObject({ ok: true });
    });

    it('a scoped setup refuses another chat\'s id, quietly, and compacts its own when asked without one', async () => {
        const stores: Record<string, ReturnType<typeof makeTarget>> = {
            a: makeTarget([...transcript(2), turn('u3', 'user', 'next')]),
            b: makeTarget([...transcript(2), turn('u3', 'user', 'next')]),
        };
        const rec = recordEvents('aparte-compact-start', 'aparte-compact-done', 'aparte-compact-error');
        const { cfg, chat } = makeConfig();
        const c = setup({
            scopeToTargetId: 'a', listen: false, selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }),
            resolveTarget: (id) => (id ? stores[id] ?? null : null),
        }, cfg);

        expect(await c.compact('b')).toMatchObject({ ok: false, targetId: 'b' });
        expect(await c.compact({ target: null, targetId: 'b' })).toMatchObject({ ok: false });
        expect(chat).not.toHaveBeenCalled();
        expect(rec.events, 'another setup may own that chat: no event says it failed').toEqual([]);

        expect(await c.compact({ target: null })).toMatchObject({ ok: true, targetId: 'a' });
        expect(checkpointOf(stores.a!.messages)).toBeDefined();
        expect(checkpointOf(stores.b!.messages)).toBeUndefined();
        rec.stop();
    });

    it('settled() resolves at once when idle, and when the running compaction ends otherwise', async () => {
        const target = makeTarget([...transcript(2), turn('u3', 'user', 'next')]);
        let release!: (s: string) => void;
        const { cfg, chat } = makeConfig(() => new Promise<string>((r) => { release = r; }));
        const c = setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg);

        await expect(c.settled()).resolves.toBeUndefined();

        const running = c.compact('chat-1');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        let settled = false;
        void c.settled('chat-1').then(() => { settled = true; });
        await new Promise((r) => setTimeout(r, 10));
        expect(settled, 'a send never races a summary').toBe(false);

        release('S');
        await running;
        await vi.waitFor(() => expect(settled).toBe(true));
    });

    it('keeps the doc promise: compact() never rejects', async () => {
        const target = makeTarget([...transcript(2), turn('u3', 'user', 'next')]);
        const { cfg } = makeConfig(() => { throw new Error('boom'); });
        const c = setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg);
        await expect(c.compact()).resolves.toMatchObject({ ok: false, error: 'boom' });
    });
});
