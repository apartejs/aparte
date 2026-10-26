// @vitest-environment jsdom
/**
 * `setupCompaction` end to end, against a config with a mock provider and a transport
 * that records the request: what is summarised, what is kept, what the transcript
 * looks like afterwards, and every way a compaction declines or fails.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteConfig, attachConfig, type AparteMessage, type AparteChatRequest } from '@aparte/core';
import { setupCompaction, type CompactionController, type CompactionTarget } from '../compaction.js';

const exchange = (n: number, text: string): AparteMessage[] => [
    { id: `u${n}`, role: 'user', content: `${text} question ${n}`, timestamp: n * 2, status: 'completed' },
    { id: `a${n}`, role: 'assistant', content: `${text} answer ${n}`, timestamp: n * 2 + 1, status: 'completed' },
];

/**
 * The same exchange with NO `status` on either turn — the shape a host that appends
 * its own messages produces, and the one the docs' own snippet writes.
 */
const bareExchange = (n: number, text: string): AparteMessage[] => [
    { id: `u${n}`, role: 'user', content: `${text} question ${n}`, timestamp: n * 2 },
    { id: `a${n}`, role: 'assistant', content: `${text} answer ${n}`, timestamp: n * 2 + 1 },
];

/** The message a compaction refuses to land with, spelled once. */
const CHANGED = 'The conversation changed while the summary was being written';

/**
 * One exchange and a follow-up question: the smallest transcript a compaction can work on.
 * The checkpoint sits on a USER message, so a selector that drops "everything" still keeps
 * the last one — a bare exchange has none to keep, and is rightly left alone.
 */
const session = (text = 'x', n = 1): AparteMessage[] => [
    ...exchange(n, text),
    { id: `t${n}`, role: 'user', content: `${text} follow-up ${n}`, timestamp: n * 2 + 2, status: 'completed' },
];

/** The first message of a transcript that carries a checkpoint, if any. */
const checkpointOf = (messages: AparteMessage[]): AparteMessage | undefined => messages.find((m) => m.contextSummary);

type Update = { id: string; updates: Partial<AparteMessage> };

/** A transcript that behaves like the viewport's: the active path, and one write — an update merged by id. */
function makeTarget(initial: AparteMessage[]): CompactionTarget & { messages: AparteMessage[]; updated: Update[] } {
    const store = {
        messages: [...initial],
        updated: [] as Update[],
        getMessages: () => [...store.messages],
        updateMessage: (id: string, updates: Partial<AparteMessage>) => {
            store.messages = store.messages.map((m) => (m.id === id ? { ...m, ...updates } : m));
            store.updated.push({ id, updates });
        },
    };
    return store;
}

function makeConfig(reply: string | (() => Promise<string>) = 'SUMMARY') {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'Mock' }),
        getModels: () => [{ id: 'm', name: 'M' }],
        chat: vi.fn(),
    } as any);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'sk-config');
    const calls: Array<{ request: AparteChatRequest; auth: unknown; signal: AbortSignal }> = [];
    const chat = vi.fn(async (_p: any, request: AparteChatRequest, auth: unknown, ctx: { signal: AbortSignal }) => {
        calls.push({ request, auth, signal: ctx.signal });
        return typeof reply === 'string' ? reply : reply();
    });
    cfg.setTransport({ chat } as any);
    return { cfg, calls, chat, last: () => calls[calls.length - 1]! };
}

const once = <T>(type: string): Promise<T> =>
    new Promise((res) => window.addEventListener(type, (e) => res((e as CustomEvent<T>).detail), { once: true }));

const controllers: CompactionController[] = [];
const setup = (...args: Parameters<typeof setupCompaction>): CompactionController => {
    const c = setupCompaction(...args);
    controllers.push(c);
    return c;
};
afterEach(() => {
    for (const c of controllers.splice(0)) c.dispose();
    document.body.innerHTML = '';
});

describe('setupCompaction — what is summarised and what stays', () => {
    it('skips, without a model call, when the selector drops nothing — and says why', async () => {
        const target = makeTarget(session('a'));
        const { cfg, chat } = makeConfig();
        const selector = vi.fn((m: AparteMessage[]) => ({ keep: m, drop: [] as AparteMessage[] }));
        const done = once<any>('aparte-compact-done');

        const outcome = await setup({ selector, resolveTarget: () => target, listen: false }, cfg).compact('chat-1');

        expect(selector).toHaveBeenCalledWith(target.messages);
        expect(chat).not.toHaveBeenCalled();
        expect(outcome).toEqual({ ok: true, skipped: true, reason: 'nothing-to-drop', targetId: 'chat-1' });
        await expect(done).resolves.toEqual({ skipped: true, reason: 'nothing-to-drop', targetId: 'chat-1' });
    });

    it('summarises only the dropped turns and writes ONE checkpoint on the first message kept — nothing is removed', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const target = makeTarget([...old, ...recent]);
        const { cfg, last } = makeConfig();
        const before = target.getMessages();

        const outcome = await setup({ selector: () => ({ keep: recent, drop: old }), resolveTarget: () => target, listen: false }, cfg).compact();

        const sent = JSON.stringify(last().request.messages);
        expect(sent).toContain('old question 1');
        expect(sent).not.toContain('recent question 2');
        expect(outcome).toMatchObject({
            ok: true, skipped: false, summary: expect.stringMatching(/^SUMMARY/), kept: 2, dropped: 2, messageId: 'u2', count: 2,
        });

        // The old and the new transcript are the same messages, in the same order: the only
        // difference is the field on the first one kept.
        expect(target.updated).toHaveLength(1);
        expect(target.updated[0]!.id).toBe('u2');
        expect(target.messages.map((m) => m.id)).toEqual(before.map((m) => m.id));
        expect(target.messages.filter((m) => m.contextSummary).map((m) => m.id)).toEqual(['u2']);
        expect(target.messages[2]!.contextSummary).toMatchObject({ count: 2, createdAt: expect.any(Number) });
        expect(target.messages[2]!.contextSummary!.summary).toMatch(/^SUMMARY/);
        // Not a notice any more: no `compaction: true` message, and the locale's title is unused.
        expect(target.messages.some((m) => m.compaction)).toBe(false);
        expect(target.messages.some((m) => String(m.content).includes('Conversation summary'))).toBe(false);
    });

    it('a target that cannot update a message fails with an error that says so, before the model is paid', async () => {
        const store = makeTarget(session('x'));
        const target: CompactionTarget = { getMessages: store.getMessages, clearAll: () => undefined, appendMessage: () => undefined };
        const { cfg, chat } = makeConfig();

        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toMatchObject({ ok: false, error: expect.stringContaining('updateMessage'), messageId: 't1' });
        expect(chat).not.toHaveBeenCalled();
    });

    it('the cut lands on a user message: a selector that keeps a reply keeps its question too', async () => {
        const target = makeTarget([...exchange(1, 'old'), ...exchange(2, 'mid'), ...exchange(3, 'new')]);
        const { cfg, last } = makeConfig();

        // keep = the last reply only: the checkpoint cannot sit on an assistant message.
        const outcome = await setup({ selector: (m) => ({ keep: m.slice(5), drop: m.slice(0, 5) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toMatchObject({ ok: true, messageId: 'u3', dropped: 4, kept: 2 });
        expect(JSON.stringify(last().request.messages)).not.toContain('new question 3');
    });

    it('the cut moves toward the newer end when going older would summarise nothing', async () => {
        // u1 a1a a1b u2 a2: the selector keeps from a1b on, and the only user message at or
        // before that is u1 — cutting there drops nothing, so the cut goes on to u2.
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'first question here', timestamp: 1, status: 'completed' },
            { id: 'a1a', role: 'assistant', content: 'first reply, part one', timestamp: 2, status: 'completed' },
            { id: 'a1b', role: 'assistant', content: 'first reply, part two', timestamp: 3, status: 'completed' },
            { id: 'u2', role: 'user', content: 'second question here', timestamp: 4, status: 'completed' },
            { id: 'a2', role: 'assistant', content: 'second reply', timestamp: 5, status: 'completed' },
        ];
        const target = makeTarget(messages);
        const { cfg } = makeConfig();

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toMatchObject({ ok: true, messageId: 'u2', dropped: 3 });
    });

    it('skips as nothing-to-drop when no user message can carry the checkpoint', async () => {
        const target = makeTarget([
            { id: 'u1', role: 'user', content: 'only question', timestamp: 1, status: 'completed' },
            { id: 'a1', role: 'assistant', content: 'reply one', timestamp: 2, status: 'completed' },
            { id: 'a2', role: 'assistant', content: 'reply two', timestamp: 3, status: 'completed' },
        ]);
        const { cfg, chat } = makeConfig();

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(1), drop: m.slice(0, 1) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toMatchObject({ ok: true, skipped: true, reason: 'nothing-to-drop' });
        expect(chat).not.toHaveBeenCalled();
    });

    it('without a known window, a host that opted in with keepWithoutWindow keeps the last two exchanges and summarises the rest', async () => {
        const target = makeTarget([...exchange(1, 'old'), ...exchange(2, 'recent'), ...exchange(3, 'recent')]);
        const { cfg, last } = makeConfig();

        const outcome = await setup({ keepWithoutWindow: 4, resolveTarget: () => target, listen: false }, cfg).compact();

        const sent = JSON.stringify(last().request.messages);
        expect(sent).toContain('old question 1');
        expect(sent).not.toContain('recent question 2');
        expect(outcome).toMatchObject({ kept: 4, dropped: 2 });
        expect(checkpointOf(target.messages)!.id).toBe('u2');
        expect(target.messages).toHaveLength(6);
    });

    it('keepWithoutWindow changes how many stay', async () => {
        const target = makeTarget([...exchange(1, 'a'), ...exchange(2, 'b'), ...exchange(3, 'c')]);
        const { cfg } = makeConfig();
        const outcome = await setup({ keepWithoutWindow: 2, resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toMatchObject({ kept: 2, dropped: 4 });
    });

    it('without a known window and nothing older than two exchanges, it skips', async () => {
        const target = makeTarget([...exchange(1, 'a'), ...exchange(2, 'b')]);
        const { cfg, chat } = makeConfig();
        const outcome = await setup({ keepWithoutWindow: 4, resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toMatchObject({ skipped: true, reason: 'nothing-to-drop' });
        expect(chat).not.toHaveBeenCalled();
        expect(target.updated).toEqual([]);
    });

    it('without a known window, the default selector and summariser skip as no-window: no request is sent', async () => {
        const target = makeTarget([...exchange(1, 'old'), ...exchange(2, 'recent'), ...exchange(3, 'recent')]);
        const { cfg, chat } = makeConfig();
        const done = once<any>('aparte-compact-done');

        const outcome = await setup({ resolveTarget: () => target, listen: true }, cfg).compact();

        expect(outcome).toMatchObject({ ok: true, skipped: true, reason: 'no-window' });
        await expect(done).resolves.toMatchObject({ skipped: true, reason: 'no-window' });
        expect(chat).not.toHaveBeenCalled();
        expect(target.updated).toEqual([]);
    });

    it('without a known window, a selector or a summarize of the host keeps today\'s behaviour: the host sizes the request', async () => {
        const long = [...exchange(1, 'old'), ...exchange(2, 'recent'), ...exchange(3, 'recent')];
        const own = makeTarget(long);
        const { cfg, chat } = makeConfig();
        const viaSelector = await setup({ selector: (m) => ({ keep: m.slice(4), drop: m.slice(0, 4) }), resolveTarget: () => own, listen: false }, cfg).compact();
        expect(viaSelector).toMatchObject({ skipped: false, dropped: 4 });
        expect(chat).toHaveBeenCalledTimes(1);

        const viaSummarize = makeTarget(long);
        const summarize = vi.fn(async () => 'S');
        const outcome = await setup({ summarize, resolveTarget: () => viaSummarize, listen: false }, new AparteConfig()).compact();
        // The default selector without a window falls back to its 4 — the host owns the sizing.
        expect(outcome).toMatchObject({ skipped: false, kept: 4, dropped: 2 });
        expect(summarize).toHaveBeenCalledTimes(1);
    });

    it('with a window, maxTokens is a quarter of it — inside reservedGeneration, never under the reservation', async () => {
        const target = makeTarget([...exchange(1, 'old'), ...exchange(2, 'old'), ...exchange(3, 'recent')].map((m) => ({ ...m, content: `${m.content} ${'x'.repeat(2000)}` })));
        const { cfg, last } = makeConfig();
        cfg.registerAIProvider({
            id: 'windowed',
            getMetadata: () => ({ id: 'windowed', name: 'W' }),
            getModels: () => [{ id: 'w', name: 'W', contextWindow: 6000 }],
            chat: vi.fn(),
        } as any);
        cfg.setModelConfig({ defaultProvider: 'windowed', defaultModel: 'w' });

        await setup({ resolveTarget: () => target, listen: false }, cfg).compact();

        // A quarter of 6000 is 1500: under the 2000 every request keeps for a reply, and above
        // the 289 the window walk holds back for the summary (a tenth of 2899 tokens of history),
        // which a reasoning model would spend thinking before it wrote a word.
        expect(last().request.maxTokens).toBe(1500);
    });

    it('with a large window, maxTokens stops at reservedGeneration', async () => {
        const target = makeTarget([...exchange(1, 'old'), ...exchange(2, 'old'), ...exchange(3, 'recent')]);
        const { cfg, last } = makeConfig();
        cfg.registerAIProvider({
            id: 'large', getMetadata: () => ({ id: 'large', name: 'L' }), getModels: () => [{ id: 'l', name: 'L', contextWindow: 200000 }], chat: vi.fn(),
        } as any);
        cfg.setModelConfig({ defaultProvider: 'large', defaultModel: 'l' });

        await setup({ selector: (m) => ({ keep: m.slice(4), drop: m.slice(0, 4) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(last().request.maxTokens).toBe(2000);
    });

    it('with a window, the dropped turns that do not fit the request stay verbatim, the oldest are summarised', async () => {
        const big = (id: string, role: 'user' | 'assistant', n: number): AparteMessage => ({ id, role, content: `${id} ${'x'.repeat(n)}`, timestamp: 1, status: 'completed' });
        // 4096-token window: 4096 − 1024 (the answer's cap, a quarter) − 500 (margin) = 2572 tokens
        // ≈ 9800 characters of input, the instruction included: u1 and a1 fit, u2 does not.
        const messages = [big('u1', 'user', 4000), big('a1', 'assistant', 4000), big('u2', 'user', 4000), big('a2', 'assistant', 100), big('u3', 'user', 100), big('a3', 'assistant', 100)];
        const target = makeTarget(messages);
        const { cfg, last } = makeConfig('short');
        cfg.registerAIProvider({
            id: 'small', getMetadata: () => ({ id: 'small', name: 'S' }), getModels: () => [{ id: 's', name: 'S', contextWindow: 4096 }], chat: vi.fn(),
        } as any);
        cfg.setModelConfig({ defaultProvider: 'small', defaultModel: 's' });

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(4), drop: m.slice(0, 4) }), resolveTarget: () => target, listen: false }, cfg).compact();

        const sent = JSON.stringify(last().request.messages);
        expect(sent).toContain('u1 ');
        expect(sent).toContain('a1 ');
        expect(sent).not.toContain('u2 ');
        expect(outcome).toMatchObject({ skipped: false, dropped: 2, kept: 4 });
        // Nothing moved: all six are still there, and the checkpoint sits on u2, the first message the model reads verbatim.
        expect(target.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3', 'a3']);
        expect(checkpointOf(target.messages)!.id).toBe('u2');
    });

    it('with a window, a first dropped turn that does not fit on its own fails — nothing is sent', async () => {
        const target = makeTarget([
            { id: 'u1', role: 'user', content: 'x'.repeat(20000), timestamp: 1, status: 'completed' },
            ...exchange(2, 'recent'),
        ]);
        const { cfg, chat } = makeConfig();
        cfg.registerAIProvider({
            id: 'small', getMetadata: () => ({ id: 'small', name: 'S' }), getModels: () => [{ id: 's', name: 'S', contextWindow: 4096 }], chat: vi.fn(),
        } as any);
        cfg.setModelConfig({ defaultProvider: 'small', defaultModel: 's' });

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(1), drop: m.slice(0, 1) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toMatchObject({ ok: false });
        expect((outcome as any).error).toMatch(/does not fit/);
        expect(chat).not.toHaveBeenCalled();
        expect(target.updated).toEqual([]);
    });

    it("with a window, the default walks the model's budget: what no longer fits is summarised", async () => {
        const long = (n: number, text: string) => exchange(n, text).map((m) => ({ ...m, content: `${m.content} ${'x'.repeat(2000)}` }));
        const target = makeTarget([...long(1, 'old'), ...long(2, 'old'), ...long(3, 'recent')]);
        const { cfg, last } = makeConfig();
        cfg.registerAIProvider({
            id: 'windowed',
            getMetadata: () => ({ id: 'windowed', name: 'W' }),
            getModels: () => [{ id: 'w', name: 'W', contextWindow: 6000 }],
            chat: vi.fn(),
        } as any);
        cfg.setModelConfig({ defaultProvider: 'windowed', defaultModel: 'w' });

        const outcome = await setup({ resolveTarget: () => target, listen: false }, cfg).compact();

        const sent = JSON.stringify(last().request.messages);
        expect(sent).toContain('old question 1');
        expect(sent).not.toContain('recent question 3');
        expect(outcome).toMatchObject({ skipped: false });
        expect((outcome as any).dropped).toBeGreaterThan(0);
        expect((outcome as any).kept).toBeGreaterThan(0);
    });
});

describe('setupCompaction — the request', () => {
    it('sends the summarised turns WITH their tool calls and errors, names the request, and asks in the default instruction', async () => {
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'list the files', timestamp: 1, status: 'completed' },
            {
                id: 'a1', role: 'assistant', timestamp: 2, status: 'completed',
                segments: [
                    { id: 's1', type: 'text', content: 'Listing.' },
                    { id: 's2', type: 'tool_call', status: 'resolved', toolCall: { id: 't1', name: 'list_files', input: { path: 'src' } }, result: 'a.ts, b.ts' } as any,
                    { id: 's3', type: 'error', content: 'disk quota exceeded' } as any,
                ],
            },
            { id: 'u2', role: 'user', content: 'and now?', timestamp: 3, status: 'completed' },
        ];
        const target = makeTarget(messages);
        const { cfg, last } = makeConfig();
        await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();

        const { request } = last();
        const assistantTurn = request.messages.find((m) => m.role === 'assistant' && String(m.content).includes('Listing.'))!;
        expect(assistantTurn.content).toContain('[tool list_files] {"path":"src"} → a.ts, b.ts');
        expect(assistantTurn.content).toContain('[error] disk quota exceeded');
        expect(request._meta).toEqual({ compaction: true });
        expect(request.stream).toBe(true);
        // No window to take a quarter of: the room every request keeps for a reply.
        expect(request.maxTokens).toBe(2000);
        expect(request.modelId).toBe('m');
        // The instruction rides the ask, in the user turn, where no provider can drop it:
        // one that imposes its own system prompt used to swallow it without a word (#45).
        const ask = request.messages.at(-1)!;
        expect(ask.role).toBe('user');
        expect(ask.content).toContain('[tool …]');
        expect(ask.content).toContain('Please summarize the conversation above.');
        expect(request.messages.some((m) => m.role === 'system'), 'no system message to lose').toBe(false);
    });

    it('carries a reply that ended in an error, and leaves out a turn with nothing to say', async () => {
        // What the user read is what is being deleted: a reply that errored half-way
        // still said something, so the summary carries it. Only a turn whose text is
        // empty contributes nothing and is dropped; the two replies it leaves side by
        // side are one turn, because the request must alternate.
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'q', timestamp: 1, status: 'completed' },
            { id: 'a1', role: 'assistant', content: 'half', timestamp: 2, status: 'error' },
            { id: 'u2', role: 'user', content: '', timestamp: 3, status: 'completed' },
            { id: 'a2', role: 'assistant', content: 'done', timestamp: 4, status: 'completed' },
            { id: 'u3', role: 'user', content: 'next', timestamp: 5, status: 'completed' },
        ];
        const target = makeTarget(messages);
        const { cfg, last } = makeConfig();
        await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        const history = last().request.messages.slice(0, -1);
        expect(history).toEqual([
            { role: 'user', content: 'q' },
            { role: 'assistant', content: 'half\n\ndone' },
        ]);
    });

    it('summarises the turns it is about to delete, `status` or no `status`', async () => {
        // A host that appends its own messages sets no status; the turns were deleted
        // and never reached the summariser, so the summary silently lost them.
        const target = makeTarget([...bareExchange(1, 'old'), ...bareExchange(2, 'recent')]);
        const { cfg, last } = makeConfig();

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(last().request.messages.slice(0, -1)).toEqual([
            { role: 'user', content: 'old question 1' },
            { role: 'assistant', content: 'old answer 1' },
        ]);
        expect(outcome).toMatchObject({ ok: true, skipped: false, dropped: 2 });
    });

    it('takes a prompt of the host over the default instruction', async () => {
        const target = makeTarget(session('x'));
        const { cfg, last } = makeConfig();
        await setup({ selector: (m) => ({ keep: [], drop: m }), prompt: 'Résume en français.', resolveTarget: () => target, listen: false }, cfg).compact();
        const ask = last().request.messages.at(-1)!;
        expect(ask.role).toBe('user');
        expect(ask.content).toContain('Résume en français.');
    });

    it('resolves the key through keyResolver first, then the config', async () => {
        const target = makeTarget(session('x'));
        const { cfg, last } = makeConfig();
        const selector = (m: AparteMessage[]) => ({ keep: [], drop: m });

        await setup({ selector, resolveTarget: () => target, listen: false, keyResolver: () => ({ apiKey: 'sk-host', endpoint: 'http://x' }) }, cfg).compact();
        expect(last().auth).toEqual({ apiKey: 'sk-host', endpoint: 'http://x' });

        target.messages = session('x', 1);
        await setup({ selector, resolveTarget: () => target, listen: false, keyResolver: () => null }, cfg).compact();
        expect(last().auth).toBe('sk-config');
    });

    it('drains a stream when the transport answers with one', async () => {
        const target = makeTarget(session('x'));
        const { cfg } = makeConfig();
        cfg.setTransport({
            chat: vi.fn(async () => new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'text', delta: 'part one, ' });
                    controller.enqueue({ type: 'thinking', delta: 'ignored' });
                    controller.enqueue({ type: 'text', delta: 'part two' });
                    controller.close();
                },
            })),
        } as any);
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toMatchObject({ summary: expect.stringMatching(/^part one, part two/) });
    });

    describe('a streamed answer is drained strictly', () => {
        const streamOf = (...events: any[]) => ({
            chat: vi.fn(async () => new ReadableStream({
                start(controller) {
                    for (const event of events) controller.enqueue(event);
                    controller.close();
                },
            })),
        } as any);
        const run = async (transport: any) => {
            const target = makeTarget(session('x'));
            const { cfg } = makeConfig();
            cfg.setTransport(transport);
            const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
            return { outcome, target };
        };

        it('an error event fails the compaction with its message, and the partial text is not applied', async () => {
            const { outcome, target } = await run(streamOf({ type: 'text', delta: 'half a sum' }, { type: 'error', message: 'context length exceeded' }));
            expect(outcome).toEqual({ ok: false, error: 'context length exceeded', targetId: undefined, messageId: 't1' });
            expect(target.messages).toEqual(session('x'));
        });

        it('a done at the length limit fails: a cut-off summary is not applied', async () => {
            const { outcome, target } = await run(streamOf({ type: 'text', delta: 'cut of' }, { type: 'done', finishReason: 'length' }));
            expect(outcome).toEqual({ ok: false, error: "The summary was cut off at the model's length limit", targetId: undefined, messageId: 't1' });
            expect(target.messages).toEqual(session('x'));
        });

        it('a done that stopped normally is the summary', async () => {
            const { outcome } = await run(streamOf({ type: 'text', delta: 'ok' }, { type: 'done', finishReason: 'stop' }));
            expect(outcome).toMatchObject({ ok: true, summary: expect.stringMatching(/^ok/) });
        });

        it('a summary no shorter than the turns it replaces is refused, the transcript untouched', async () => {
            const long = 'a summary as long as the whole exchange it is meant to replace, and then some';
            const { outcome, target } = await run(streamOf({ type: 'text', delta: long }, { type: 'done', finishReason: 'stop' }));
            expect(outcome).toEqual({ ok: false, error: 'The summary is no shorter than the turns it replaces', targetId: undefined, messageId: 't1' });
            expect(target.messages).toEqual(session('x'));
        });
    });

    it('a summarize option replaces the model call — no provider needed at all', async () => {
        const target = makeTarget(session('x'));
        const cfg = new AparteConfig();
        const summarize = vi.fn(async (request: AparteChatRequest, signal: AbortSignal) => {
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(request._meta).toEqual({ compaction: true });
            return 'FROM HOST';
        });
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), summarize, resolveTarget: () => target, listen: false }, cfg).compact();
        expect(summarize).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({ ok: true, summary: expect.stringMatching(/^FROM HOST/) });
        expect(checkpointOf(target.messages)!.contextSummary!.summary).toMatch(/^FROM HOST/);
    });
});

describe('setupCompaction — declining and failing', () => {
    it('reports an empty transcript, a missing chat, a missing provider', async () => {
        const { cfg } = makeConfig();
        const c = setup({ resolveTarget: (id) => (id === 'none' ? null : makeTarget([])), listen: false }, cfg);
        expect(await c.compact('none')).toEqual({ ok: false, error: 'No chat with id "none" to compact', targetId: 'none' });
        expect(await c.compact('empty')).toEqual({ ok: true, skipped: true, reason: 'empty', targetId: 'empty' });

        const bare = new AparteConfig();
        const error = once<any>('aparte-compact-error');
        const outcome = await setup({ keepWithoutWindow: 4, resolveTarget: () => makeTarget([...exchange(1, 'a'), ...exchange(2, 'b'), ...exchange(3, 'c')]), listen: false }, bare).compact();
        expect(outcome).toEqual({ ok: false, error: 'No provider configured', targetId: undefined, messageId: 'u2' });
        await expect(error).resolves.toEqual({ error: 'No provider configured', targetId: undefined, messageId: 'u2' });
    });

    it('leaves a transcript with a turn in flight alone', async () => {
        const target = makeTarget([...exchange(1, 'a'), { id: 'a9', role: 'assistant', content: '', timestamp: 9, status: 'streaming' }]);
        const { cfg, chat } = makeConfig();
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toMatchObject({ skipped: true, reason: 'streaming' });
        expect(chat).not.toHaveBeenCalled();
    });

    it('refuses when the dropped turns carry nothing to summarise — no model call, no deletion', async () => {
        const target = makeTarget([
            { id: 'u1', role: 'user', content: '', timestamp: 1, status: 'completed' },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed' },
            ...exchange(2, 'recent'),
        ]);
        const { cfg, chat } = makeConfig();

        const outcome = await setup({ selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }), resolveTarget: () => target, listen: false }, cfg).compact();

        expect(outcome).toEqual({ ok: false, error: 'Nothing summarisable in the dropped turns', targetId: undefined, messageId: 'u2' });
        expect(chat, 'nothing is paid for a summary of nothing').not.toHaveBeenCalled();
        expect(target.updated).toEqual([]);
    });

    it('an empty summary is an error, and the transcript is untouched', async () => {
        const target = makeTarget(session('x'));
        const { cfg } = makeConfig('   ');
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toEqual({ ok: false, error: 'Empty summary returned by model', targetId: undefined, messageId: 't1' });
        expect(target.messages).toEqual(session('x'));
    });

    it('a transport failure is reported, never thrown', async () => {
        const target = makeTarget(session('x'));
        const { cfg } = makeConfig(() => Promise.reject(new Error('502 Bad Gateway')));
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toEqual({ ok: false, error: '502 Bad Gateway', targetId: undefined, messageId: 't1' });
        expect(target.messages).toEqual(session('x'));
    });
});

describe('setupCompaction — while a summary is being written', () => {
    function pending() {
        let resolve!: (s: string) => void;
        const promise = new Promise<string>((r) => { resolve = r; });
        return { resolve, reply: () => promise };
    }

    it('a second request is skipped as running; running reads true meanwhile', async () => {
        const target = makeTarget(session('x'));
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg);

        const first = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        expect(c.running).toBe(true);
        expect(await c.compact()).toMatchObject({ skipped: true, reason: 'running' });

        gate.resolve('S');
        expect(await first).toMatchObject({ ok: true, summary: expect.stringMatching(/^S/) });
        expect(c.running).toBe(false);
        expect(chat).toHaveBeenCalledTimes(1);
    });

    it('abort() reaches the summarisation: an error, and the summary never lands', async () => {
        const target = makeTarget(session('x'));
        const { cfg } = makeConfig();
        let seen: AbortSignal | undefined;
        const chat = vi.fn((_p: any, _r: any, _a: any, ctx: { signal: AbortSignal }) => new Promise<string>((_res, rej) => {
            seen = ctx.signal;
            ctx.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }));
        cfg.setTransport({ chat } as any);
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg);
        const errored = once<any>('aparte-compact-error');

        const running = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        expect(seen!.aborted).toBe(false);
        c.abort();

        expect(seen!.aborted).toBe(true);
        expect(await running).toEqual({ ok: false, error: 'Compaction aborted', targetId: undefined, messageId: 't1' });
        await expect(errored).resolves.toMatchObject({ error: 'Compaction aborted' });
        expect(target.messages).toEqual(session('x'));
        expect(c.running).toBe(false);
    });

    it('an abort settles the compaction even when the transport ignores the signal, and a late result is discarded', async () => {
        const target = makeTarget(session('x'));
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);       // never looks at the signal
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg);

        const running = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        c.abort();
        expect(await running).toMatchObject({ ok: false, error: 'Compaction aborted' });
        expect(c.running).toBe(false);

        gate.resolve('TOO LATE');
        await new Promise((r) => setTimeout(r, 10));
        expect(target.messages, 'the late summary never lands').toEqual(session('x'));
    });

    it('an abort that lands while the key is being resolved is honoured before the transport is called', async () => {
        const target = makeTarget(session('x'));
        const { cfg, chat } = makeConfig();
        let releaseKey!: () => void;
        const c = setup({
            selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false,
            keyResolver: () => new Promise<string>((res) => { releaseKey = () => res('sk'); }),
        }, cfg);

        const running = c.compact();
        await vi.waitFor(() => expect(releaseKey).toBeDefined());
        c.abort();
        releaseKey();
        expect(await running).toMatchObject({ ok: false, error: 'Compaction aborted' });
        await new Promise((r) => setTimeout(r, 10));
        expect(chat, 'no request goes out for a compaction already aborted').not.toHaveBeenCalled();
    });

    it('what arrived meanwhile stays where it is, after the checkpoint', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const target = makeTarget([...old, ...recent]);
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);
        const c = setup({ selector: () => ({ keep: recent, drop: old }), resolveTarget: () => target, listen: false }, cfg);

        const running = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        const late: AparteMessage = { id: 'u3', role: 'user', content: 'sent during the summary', timestamp: 30, status: 'completed' };
        target.messages.push(late);
        gate.resolve('S');
        const outcome = await running;

        expect(target.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2', 'u3']);
        expect(checkpointOf(target.messages)!.id).toBe('u2');
        // Kept verbatim = everything from the checkpoint on, what arrived meanwhile included.
        expect(outcome).toMatchObject({ kept: 3, dropped: 2 });
    });

    it('a transcript replaced meanwhile is refused: nothing is written over the new one', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const target = makeTarget([...old, ...recent]);
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);
        const c = setup({ selector: () => ({ keep: recent, drop: old }), resolveTarget: () => target, listen: false }, cfg);
        const errored = once<any>('aparte-compact-error');

        const running = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        // The user switched conversation while the summary was being written: the
        // transcript now holds conversation B, and shares no message with A.
        target.messages = session('other', 9);
        gate.resolve('S');

        expect(await running).toEqual({ ok: false, error: CHANGED, targetId: undefined, messageId: 'u2' });
        await expect(errored).resolves.toMatchObject({ error: CHANGED });
        expect(target.updated, 'nothing is written over conversation B').toEqual([]);
        expect(target.messages.map((m) => m.id)).toEqual(['u9', 'a9', 't9']);
    });

    it('is refused too when only the message the checkpoint was to sit on is gone', async () => {
        // The host updates by id: a checkpoint for a message that left the path would be a
        // success the host never saw, so it is reported as the failure it is.
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const target = makeTarget([...old, ...recent]);
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);
        const c = setup({ selector: () => ({ keep: recent, drop: old }), resolveTarget: () => target, listen: false }, cfg);

        const running = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        target.messages = target.messages.filter((m) => m.id !== 'u2');
        gate.resolve('S');

        expect(await running).toMatchObject({ ok: false, error: CHANGED });
        expect(target.updated).toEqual([]);
    });

    it('a summarised turn deleted meanwhile does not cost the compaction the user paid for', async () => {
        // The guard against the naive fix: "the ids are not exactly what they were" would
        // refuse this. What matters is the message the checkpoint sits on.
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const target = makeTarget([...old, ...recent]);
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);
        const c = setup({ selector: () => ({ keep: recent, drop: old }), resolveTarget: () => target, listen: false }, cfg);

        const running = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        target.messages = target.messages.filter((m) => m.id !== 'u1');
        gate.resolve('S');

        expect(await running).toMatchObject({ ok: true, skipped: false });
        expect(checkpointOf(target.messages)!.id).toBe('u2');
    });

    it('a kept turn updated meanwhile keeps its update — the checkpoint is merged into the message as it is now', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const target = makeTarget([...old, ...recent]);
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);
        const c = setup({ selector: () => ({ keep: recent, drop: old }), resolveTarget: () => target, listen: false }, cfg);

        const running = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        // What `updateMessage` does: a new object under the same id.
        target.messages = target.messages.map((m) => (m.id === 'u2' ? { ...m, content: 'recent question 2 (edited)' } : m));
        gate.resolve('S');
        const outcome = await running;

        expect(target.messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
        expect(target.messages[2]).toMatchObject({ content: 'recent question 2 (edited)', contextSummary: { count: 2 } });
        expect(outcome).toMatchObject({ kept: 2, dropped: 2 });
    });
});

describe('setupCompaction — the window events and the page', () => {
    const send = (type: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(type, { detail }));

    it('answers aparte-compact, naming the chat on every event it dispatches', async () => {
        const target = makeTarget(session('x'));
        const { cfg } = makeConfig();
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target }, cfg);
        const start = once<any>('aparte-compact-start');
        const done = once<any>('aparte-compact-done');

        send('aparte-compact', { targetId: 'chat-1' });

        await expect(start).resolves.toEqual({ targetId: 'chat-1', messageId: 't1' });
        await expect(done).resolves.toEqual({ summary: expect.stringMatching(/^SUMMARY/), kept: 1, dropped: 2, targetId: 'chat-1', messageId: 't1', count: 2 });
    });

    it('a scoped setup answers only the chat it names — and compacts it when asked without one', async () => {
        const left = makeTarget(session('l'));
        const right = makeTarget(session('r'));
        const targets: Record<string, CompactionTarget> = { 'chat-left': left, 'chat-right': right };
        const { cfg } = makeConfig();
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: (id) => (id ? targets[id] ?? null : null), scopeToTargetId: 'chat-left' }, cfg);

        send('aparte-compact', { targetId: 'chat-right' });
        send('aparte-compact', {});
        await new Promise((r) => setTimeout(r, 10));
        expect(left.updated).toEqual([]);
        expect(right.updated).toEqual([]);

        expect(await c.compact()).toMatchObject({ ok: true, targetId: 'chat-left' });
        expect(checkpointOf(left.messages)).toBeDefined();
        expect(right.updated).toEqual([]);
    });

    it('an aparte-abort addressed to the running chat, or to no chat, aborts; one for another chat does not', async () => {
        const target = makeTarget(session('x'));
        const { cfg } = makeConfig();
        let abortedCount = 0;
        const chat = vi.fn((_p: any, _r: any, _a: any, ctx: { signal: AbortSignal }) => new Promise<string>((res, rej) => {
            ctx.signal.addEventListener('abort', () => { abortedCount++; rej(new Error('aborted')); });
            setTimeout(() => res('S'), 200);
        }));
        cfg.setTransport({ chat } as any);
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target }, cfg);

        const first = c.compact('chat-1');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        send('aparte-abort', { targetId: 'chat-other' });
        expect(abortedCount).toBe(0);
        send('aparte-abort', { targetId: 'chat-1' });
        expect(abortedCount).toBe(1);
        expect(await first).toMatchObject({ ok: false });

        target.messages = session('x', 1);
        const second = c.compact('chat-1');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
        send('aparte-abort');
        expect(abortedCount).toBe(2);
        expect(await second).toMatchObject({ ok: false });
    });

    it('resolves the chat on the page: by id, through an <aparte-chat> shell to its viewport, or the first that can render', async () => {
        const viewport = makeTarget(session('v'));
        const shell = document.createElement('div');
        shell.id = 'chat-shell';
        (shell as any).viewport = viewport;
        shell.setAttribute('data-aparte-chat', '');
        document.body.appendChild(shell);

        const direct = document.createElement('div') as unknown as HTMLElement & CompactionTarget;
        direct.id = 'chat-direct';
        const store = makeTarget(session('d'));
        direct.getMessages = store.getMessages;
        direct.updateMessage = store.updateMessage;
        direct.setAttribute('data-aparte-chat', '');
        document.body.appendChild(direct);

        const { cfg } = makeConfig();
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), listen: false }, cfg);

        expect(await c.compact('chat-direct')).toMatchObject({ ok: true, dropped: 2 });
        expect(checkpointOf(store.messages)).toBeDefined();

        expect(await c.compact('chat-shell')).toMatchObject({ ok: true, dropped: 2 });
        expect(checkpointOf(viewport.messages)).toBeDefined();

        viewport.messages = session('again', 2);
        expect(await c.compact()).toMatchObject({ ok: true, targetId: undefined });
        expect(checkpointOf(viewport.messages), 'the first host on the page that can render').toBeDefined();

        expect(await c.compact('nowhere')).toMatchObject({ ok: false, error: 'No chat with id "nowhere" to compact' });
    });

    it('a second setup on the same config replaces the first; dispose stops the listening and the compacting', async () => {
        const target = makeTarget(session('x'));
        const { cfg, chat } = makeConfig();
        const first = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target }, cfg);
        const second = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target }, cfg);

        send('aparte-compact');
        await vi.waitFor(() => expect(target.updated.length).toBeGreaterThan(0));
        expect(chat, 'one setup answered, not two').toHaveBeenCalledTimes(1);
        expect(await first.compact()).toMatchObject({ ok: false, error: 'This compaction setup was disposed' });

        second.dispose();
        target.messages = session('y', 1);
        send('aparte-compact');
        await new Promise((r) => setTimeout(r, 10));
        expect(chat).toHaveBeenCalledTimes(1);
    });

    it('a setup on a config of its own answers only the chats that resolve that config; the global one answers all', async () => {
        const hostOf = (id: string, store: CompactionTarget): HTMLElement => {
            const el = document.createElement('div') as unknown as HTMLElement & CompactionTarget;
            el.id = id;
            el.setAttribute('data-aparte-chat', '');
            el.getMessages = store.getMessages;
            el.updateMessage = store.updateMessage;
            document.body.appendChild(el);
            return el;
        };
        const left = makeTarget(session('l'));
        const right = makeTarget(session('r'));
        const leftEl = hostOf('chat-left', left);
        const rightEl = hostOf('chat-right', right);
        const a = makeConfig('A');
        const b = makeConfig('B');
        attachConfig(leftEl, a.cfg);
        attachConfig(rightEl, b.cfg);
        const sa = setup({ selector: (m) => ({ keep: [], drop: m }) }, a.cfg);
        const sb = setup({ selector: (m) => ({ keep: [], drop: m }) }, b.cfg);

        send('aparte-compact', { targetId: 'chat-left' });
        await vi.waitFor(() => expect(left.updated.length).toBeGreaterThan(0));
        await new Promise((r) => setTimeout(r, 10));
        expect(a.chat, 'the left chat, by its own config').toHaveBeenCalledTimes(1);
        expect(b.chat, 'not by the other').not.toHaveBeenCalled();
        expect(checkpointOf(left.messages)!.contextSummary!.summary).toContain('A');
        expect(right.updated).toEqual([]);

        // Unnamed: the first host on the page is the left one, which belongs to A.
        left.messages = session('l', 2);
        send('aparte-compact');
        await vi.waitFor(() => expect(a.chat).toHaveBeenCalledTimes(2));
        await new Promise((r) => setTimeout(r, 10));
        expect(b.chat).not.toHaveBeenCalled();

        // A setup on the global config answers anything, including a chat bound elsewhere
        // (the two scoped setups are gone first, or B would rightly answer for its chat too).
        sa.dispose();
        sb.dispose();
        setup({ selector: (m) => ({ keep: [], drop: m }), summarize: async () => 'G' });
        right.messages = session('r', 3);
        send('aparte-compact', { targetId: 'chat-right' });
        await vi.waitFor(() => expect(checkpointOf(right.messages)?.contextSummary?.summary ?? '').toContain('G'));
        expect(b.chat, 'B never ran').not.toHaveBeenCalled();
    });

    it('with a global setup and an instance one on the page, each chat is summarised once, by its own', async () => {
        const hostOf = (id: string, store: CompactionTarget): HTMLElement => {
            const el = document.createElement('div') as unknown as HTMLElement & CompactionTarget;
            el.id = id;
            el.setAttribute('data-aparte-chat', '');
            el.getMessages = store.getMessages;
            el.updateMessage = store.updateMessage;
            document.body.appendChild(el);
            return el;
        };
        const plain = makeTarget(session('p'));
        const scoped = makeTarget(session('s'));
        hostOf('chat-plain', plain);                 // on the global config
        const scopedEl = hostOf('chat-scoped', scoped);
        const a = makeConfig('A');
        attachConfig(scopedEl, a.cfg);
        const globalSummaries = vi.fn(async () => 'G');
        setup({ selector: (m) => ({ keep: [], drop: m }), summarize: globalSummaries });
        setup({ selector: (m) => ({ keep: [], drop: m }) }, a.cfg);

        send('aparte-compact', { targetId: 'chat-plain' });
        await vi.waitFor(() => expect(checkpointOf(plain.messages)?.contextSummary?.summary ?? '').toContain('G'));
        await new Promise((r) => setTimeout(r, 10));
        expect(a.chat, 'the instance setup leaves the global chat to the global one').not.toHaveBeenCalled();

        send('aparte-compact', { targetId: 'chat-scoped' });
        await vi.waitFor(() => expect(a.chat).toHaveBeenCalledTimes(1));
        await new Promise((r) => setTimeout(r, 10));
        expect(globalSummaries, 'and the global one leaves the scoped chat to its own').toHaveBeenCalledTimes(1);
    });

    it('a setup scoped to a chat answers it alone, beside a global setup — the per-chat pattern of the guide', async () => {
        const store = makeTarget(session('s'));
        const el = document.createElement('div') as unknown as HTMLElement & CompactionTarget;
        el.id = 'support';
        el.setAttribute('data-aparte-chat', '');
        el.getMessages = store.getMessages;
        el.updateMessage = store.updateMessage;
        document.body.appendChild(el);
        const support = makeConfig('S');
        attachConfig(el, support.cfg);
        const globalSummaries = vi.fn(async () => 'G');
        setup({ selector: (m) => ({ keep: [], drop: m }), summarize: globalSummaries });
        setup({ selector: (m) => ({ keep: [], drop: m }), scopeToTargetId: 'support' }, support.cfg);

        send('aparte-compact', { targetId: 'support' });
        await vi.waitFor(() => expect(support.chat).toHaveBeenCalledTimes(1));
        await new Promise((r) => setTimeout(r, 10));
        expect(globalSummaries, 'the global setup leaves the chat to the one scoped to it').not.toHaveBeenCalled();
    });

    it('a setup with a resolveTarget of its own answers a chat that lives in a store, beside a global setup', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const store = makeTarget(session('z'));
        const own = makeConfig('O');
        const globalSummaries = vi.fn(async () => 'G');
        setup({ selector: (m) => ({ keep: [], drop: m }), summarize: globalSummaries });
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: (id) => (id === 'store-chat' ? store : null) }, own.cfg);

        send('aparte-compact', { targetId: 'store-chat' });
        await vi.waitFor(() => expect(own.chat).toHaveBeenCalledTimes(1));
        await new Promise((r) => setTimeout(r, 10));
        expect(globalSummaries).not.toHaveBeenCalled();
        expect(warn.mock.calls.flat().join(' '), 'and the global one does not report a missing chat').not.toContain('No chat with id');
        warn.mockRestore();
    });

    it('two setups sharing one resolver: disposing one leaves the other answering its stored chat, alone', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const store = makeTarget(session('y'));
        const resolveStore = (id?: string) => (id === 'chat-b' ? store : null);
        const a = makeConfig('A');
        const b = makeConfig('B');
        const globalSummaries = vi.fn(async () => 'G');
        setup({ selector: (m) => ({ keep: [], drop: m }), summarize: globalSummaries });
        const first = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: resolveStore }, a.cfg);
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: resolveStore }, b.cfg);
        first.dispose();

        send('aparte-compact', { targetId: 'chat-b' });
        await vi.waitFor(() => expect(b.chat).toHaveBeenCalledTimes(1));
        await new Promise((r) => setTimeout(r, 10));
        expect(globalSummaries, 'the global setup still steps aside').not.toHaveBeenCalled();
        expect(warn.mock.calls.flat().join(' ')).not.toContain('No chat with id');
        warn.mockRestore();
    });

    it('a scoped setup\'s resolver does not make the others step aside for a chat it is not scoped to', async () => {
        // The resolver knows every chat in the store, but the setup answers 'support' only: a
        // request for another stored chat is the global setup's, which says it cannot find it.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const store = makeTarget(session('v'));
        const scoped = makeConfig('S');
        setup({ selector: (m) => ({ keep: [], drop: m }) });
        setup({ selector: (m) => ({ keep: [], drop: m }), scopeToTargetId: 'support', resolveTarget: () => store }, scoped.cfg);

        send('aparte-compact', { targetId: 'other' });
        await vi.waitFor(() => expect(warn.mock.calls.flat().join(' ')).toContain('No chat with id "other"'));
        expect(scoped.chat).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('with no global setup, a stored chat no resolver knows is reported once, not by each setup', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const a = makeConfig('A');
        const b = makeConfig('B');
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => null }, a.cfg);
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => null }, b.cfg);

        send('aparte-compact', { targetId: 'ghost' });
        await vi.waitFor(() => expect(warn.mock.calls.flat().join(' ')).toContain('No chat with id "ghost"'));
        await new Promise((r) => setTimeout(r, 10));
        expect(warn.mock.calls.filter((c) => c.join(' ').includes('No chat with id "ghost"')), 'reported once').toHaveLength(1);
        warn.mockRestore();
    });

    it('with no global setup, a chat on the global config is summarised once, not by each setup', async () => {
        const store = makeTarget(session('g'));
        const el = document.createElement('div') as unknown as HTMLElement & CompactionTarget;
        el.id = 'on-page';
        el.setAttribute('data-aparte-chat', '');
        el.getMessages = store.getMessages;
        el.updateMessage = store.updateMessage;
        document.body.appendChild(el);
        const a = makeConfig('A');
        const b = makeConfig('B');
        setup({ selector: (m) => ({ keep: [], drop: m }) }, a.cfg);
        setup({ selector: (m) => ({ keep: [], drop: m }) }, b.cfg);

        send('aparte-compact', { targetId: 'on-page' });
        await vi.waitFor(() => expect(a.chat.mock.calls.length + b.chat.mock.calls.length).toBeGreaterThan(0));
        await new Promise((r) => setTimeout(r, 10));
        expect(a.chat.mock.calls.length + b.chat.mock.calls.length, 'summarised once').toBe(1);
    });

    it('a request for a chat no resolver knows is still answered, with the failure said', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const store = makeTarget(session('w'));
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: (id) => (id === 'store-chat' ? store : null) });

        send('aparte-compact', { targetId: 'conv-42' });
        await vi.waitFor(() => expect(warn.mock.calls.flat().join(' ')).toContain('No chat with id "conv-42"'));
        warn.mockRestore();
    });

    it('a chat whose config has no setup is answered by the one that exists, global or not', async () => {
        const store = makeTarget(session('u'));
        const el = document.createElement('div') as unknown as HTMLElement & CompactionTarget;
        el.id = 'chat-unbound';
        el.setAttribute('data-aparte-chat', '');
        el.getMessages = store.getMessages;
        el.updateMessage = store.updateMessage;
        document.body.appendChild(el);
        // A setup on a config of its own, none on the global one, and a chat that resolves
        // the global: nobody else would answer it, so this one does.
        const a = makeConfig('A');
        setup({ selector: (m) => ({ keep: [], drop: m }) }, a.cfg);
        send('aparte-compact', { targetId: 'chat-unbound' });
        await vi.waitFor(() => expect(a.chat).toHaveBeenCalledTimes(1));
    });

    it('a request for a chat that is not on the page is answered by the global setup, which says so', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { chat } = makeConfig();
        setup({ selector: (m) => ({ keep: [], drop: m }) });
        send('aparte-compact', { targetId: 'missing' });
        await vi.waitFor(() => expect(warn.mock.calls.flat().join(' ')).toContain('No chat with id "missing"'));
        expect(chat).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('a global setup that does not listen leaves the global chats to the instance setup', async () => {
        const store = makeTarget(session('g'));
        const el = document.createElement('div') as unknown as HTMLElement & CompactionTarget;
        el.id = 'chat-global';
        el.setAttribute('data-aparte-chat', '');
        el.getMessages = store.getMessages;
        el.updateMessage = store.updateMessage;
        document.body.appendChild(el);
        setup({ selector: (m) => ({ keep: [], drop: m }), listen: false });   // driven by hand
        const a = makeConfig('A');
        setup({ selector: (m) => ({ keep: [], drop: m }) }, a.cfg);
        send('aparte-compact', { targetId: 'chat-global' });
        await vi.waitFor(() => expect(a.chat).toHaveBeenCalledTimes(1));
    });

    it('listen: false ignores the window entirely', async () => {
        const target = makeTarget(session('x'));
        const { cfg, chat } = makeConfig();
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg);
        send('aparte-compact');
        await new Promise((r) => setTimeout(r, 10));
        expect(chat).not.toHaveBeenCalled();
    });
});
