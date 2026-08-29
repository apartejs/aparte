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

/** A transcript that behaves like the viewport's: the active path, emptied, appended. */
function makeTarget(initial: AparteMessage[]): CompactionTarget & { messages: AparteMessage[]; appended: AparteMessage[] } {
    const store = {
        messages: [...initial],
        appended: [] as AparteMessage[],
        getMessages: () => [...store.messages],
        clearAll: () => { store.messages = []; },
        appendMessage: (m: AparteMessage) => { store.messages.push(m); store.appended.push(m); },
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
        const target = makeTarget(exchange(1, 'a'));
        const { cfg, chat } = makeConfig();
        const selector = vi.fn((m: AparteMessage[]) => ({ keep: m, drop: [] as AparteMessage[] }));
        const done = once<any>('aparte-compact-done');

        const outcome = await setup({ selector, resolveTarget: () => target, listen: false }, cfg).compact('chat-1');

        expect(selector).toHaveBeenCalledWith(target.messages);
        expect(chat).not.toHaveBeenCalled();
        expect(outcome).toEqual({ ok: true, skipped: true, reason: 'nothing-to-drop', targetId: 'chat-1' });
        await expect(done).resolves.toEqual({ skipped: true, reason: 'nothing-to-drop', targetId: 'chat-1' });
    });

    it('summarises only the dropped turns and puts back: the notice, then the kept turns verbatim', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const target = makeTarget([...old, ...recent]);
        const { cfg, last } = makeConfig();

        const outcome = await setup({ selector: () => ({ keep: recent, drop: old }), resolveTarget: () => target, listen: false }, cfg).compact();

        const sent = JSON.stringify(last().request.messages);
        expect(sent).toContain('old question 1');
        expect(sent).not.toContain('recent question 2');
        expect(outcome).toMatchObject({ ok: true, skipped: false, summary: 'SUMMARY', kept: 2, dropped: 2 });

        const [notice, ...rest] = target.messages;
        expect(notice).toMatchObject({ role: 'user', compaction: true, status: 'completed' });
        expect(notice!.content).toBe('**Conversation summary**\n\nSUMMARY');
        expect(rest).toEqual(recent);
    });

    it('titles the notice through the locale', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const { cfg } = makeConfig();
        cfg.extendLocale({ compactionSummaryTitle: 'Résumé de la conversation' });
        await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        expect(target.messages[0]!.content).toMatch(/^\*\*Résumé de la conversation\*\*/);
    });

    it('without a known window, the default keeps the last two exchanges and summarises the rest', async () => {
        const target = makeTarget([...exchange(1, 'old'), ...exchange(2, 'recent'), ...exchange(3, 'recent')]);
        const { cfg, last } = makeConfig();

        const outcome = await setup({ resolveTarget: () => target, listen: false }, cfg).compact();

        const sent = JSON.stringify(last().request.messages);
        expect(sent).toContain('old question 1');
        expect(sent).not.toContain('recent question 2');
        expect(outcome).toMatchObject({ kept: 4, dropped: 2 });
        expect(target.messages.slice(1)).toEqual([...exchange(2, 'recent'), ...exchange(3, 'recent')]);
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
        const outcome = await setup({ resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toMatchObject({ skipped: true, reason: 'nothing-to-drop' });
        expect(chat).not.toHaveBeenCalled();
        expect(target.appended).toEqual([]);
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
        ];
        const target = makeTarget(messages);
        const { cfg, last } = makeConfig();
        await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();

        const { request } = last();
        const assistantTurn = request.messages.find((m) => m.role === 'assistant' && String(m.content).includes('Listing.'))!;
        expect(assistantTurn.content).toContain('[tool list_files] {"path":"src"} → a.ts, b.ts');
        expect(assistantTurn.content).toContain('[error] disk quota exceeded');
        expect(request._meta).toEqual({ compaction: true });
        expect(request.stream).toBe(false);
        expect(request.modelId).toBe('m');
        expect(request.messages[0]!.role).toBe('system');
        expect(request.messages[0]!.content).toContain('[tool …]');
        expect(request.messages.at(-1)).toEqual({ role: 'user', content: 'Please summarize this conversation.' });
    });

    it('leaves out a reply that never completed, and a turn with nothing to say', async () => {
        const messages: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'q', timestamp: 1, status: 'completed' },
            { id: 'a1', role: 'assistant', content: 'half', timestamp: 2, status: 'error' },
            { id: 'u2', role: 'user', content: '', timestamp: 3, status: 'completed' },
            { id: 'a2', role: 'assistant', content: 'done', timestamp: 4, status: 'completed' },
        ];
        const target = makeTarget(messages);
        const { cfg, last } = makeConfig();
        await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        const history = last().request.messages.slice(1, -1);
        expect(history).toEqual([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'done' }]);
    });

    it('takes a prompt of the host over the default instruction', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const { cfg, last } = makeConfig();
        await setup({ selector: (m) => ({ keep: [], drop: m }), prompt: 'Résume en français.', resolveTarget: () => target, listen: false }, cfg).compact();
        expect(last().request.messages[0]).toEqual({ role: 'system', content: 'Résume en français.' });
    });

    it('resolves the key through keyResolver first, then the config', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const { cfg, last } = makeConfig();
        const selector = (m: AparteMessage[]) => ({ keep: [], drop: m });

        await setup({ selector, resolveTarget: () => target, listen: false, keyResolver: () => ({ apiKey: 'sk-host', endpoint: 'http://x' }) }, cfg).compact();
        expect(last().auth).toEqual({ apiKey: 'sk-host', endpoint: 'http://x' });

        target.messages = exchange(1, 'x');
        await setup({ selector, resolveTarget: () => target, listen: false, keyResolver: () => null }, cfg).compact();
        expect(last().auth).toBe('sk-config');
    });

    it('drains a stream when the transport answers with one', async () => {
        const target = makeTarget(exchange(1, 'x'));
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
        expect(outcome).toMatchObject({ summary: 'part one, part two' });
    });

    it('a summarize option replaces the model call — no provider needed at all', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const cfg = new AparteConfig();
        const summarize = vi.fn(async (request: AparteChatRequest, signal: AbortSignal) => {
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(request._meta).toEqual({ compaction: true });
            return 'FROM HOST';
        });
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), summarize, resolveTarget: () => target, listen: false }, cfg).compact();
        expect(summarize).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({ ok: true, summary: 'FROM HOST' });
        expect(target.messages[0]!.content).toContain('FROM HOST');
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
        const outcome = await setup({ resolveTarget: () => makeTarget([...exchange(1, 'a'), ...exchange(2, 'b'), ...exchange(3, 'c')]), listen: false }, bare).compact();
        expect(outcome).toEqual({ ok: false, error: 'No provider configured', targetId: undefined });
        await expect(error).resolves.toEqual({ error: 'No provider configured', targetId: undefined });
    });

    it('leaves a transcript with a turn in flight alone', async () => {
        const target = makeTarget([...exchange(1, 'a'), { id: 'a9', role: 'assistant', content: '', timestamp: 9, status: 'streaming' }]);
        const { cfg, chat } = makeConfig();
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toMatchObject({ skipped: true, reason: 'streaming' });
        expect(chat).not.toHaveBeenCalled();
    });

    it('an empty summary is an error, and the transcript is untouched', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const { cfg } = makeConfig('   ');
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toEqual({ ok: false, error: 'Empty summary returned by model', targetId: undefined });
        expect(target.messages).toEqual(exchange(1, 'x'));
    });

    it('a transport failure is reported, never thrown', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const { cfg } = makeConfig(() => Promise.reject(new Error('502 Bad Gateway')));
        const outcome = await setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg).compact();
        expect(outcome).toEqual({ ok: false, error: '502 Bad Gateway', targetId: undefined });
        expect(target.messages).toEqual(exchange(1, 'x'));
    });
});

describe('setupCompaction — while a summary is being written', () => {
    function pending() {
        let resolve!: (s: string) => void;
        const promise = new Promise<string>((r) => { resolve = r; });
        return { resolve, reply: () => promise };
    }

    it('a second request is skipped as running; running reads true meanwhile', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg);

        const first = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        expect(c.running).toBe(true);
        expect(await c.compact()).toMatchObject({ skipped: true, reason: 'running' });

        gate.resolve('S');
        expect(await first).toMatchObject({ ok: true, summary: 'S' });
        expect(c.running).toBe(false);
        expect(chat).toHaveBeenCalledTimes(1);
    });

    it('abort() reaches the summarisation: an error, and the summary never lands', async () => {
        const target = makeTarget(exchange(1, 'x'));
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
        expect(await running).toEqual({ ok: false, error: 'Compaction aborted', targetId: undefined });
        await expect(errored).resolves.toMatchObject({ error: 'Compaction aborted' });
        expect(target.messages).toEqual(exchange(1, 'x'));
        expect(c.running).toBe(false);
    });

    it('an abort settles the compaction even when the transport ignores the signal, and a late result is discarded', async () => {
        const target = makeTarget(exchange(1, 'x'));
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
        expect(target.messages, 'the late summary never lands').toEqual(exchange(1, 'x'));
    });

    it('an abort that lands while the key is being resolved is honoured before the transport is called', async () => {
        const target = makeTarget(exchange(1, 'x'));
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

    it('what arrived meanwhile is kept, after the kept turns', async () => {
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
        await running;

        expect(target.messages.map((m) => m.id)).toEqual([target.messages[0]!.id, 'u2', 'a2', 'u3']);
        expect(target.messages[0]).toMatchObject({ compaction: true });
    });

    it('a kept turn updated meanwhile comes back once, as it is now — the repository replaces the object on update', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const target = makeTarget([...old, ...recent]);
        const gate = pending();
        const { cfg, chat } = makeConfig(gate.reply);
        const c = setup({ selector: () => ({ keep: recent, drop: old }), resolveTarget: () => target, listen: false }, cfg);

        const running = c.compact();
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(1));
        // What `updateMessage` does: a new object under the same id.
        target.messages = target.messages.map((m) => (m.id === 'a2' ? { ...m, content: 'recent answer 2 (edited)' } : m));
        gate.resolve('S');
        const outcome = await running;

        expect(target.messages.map((m) => m.id)).toEqual([target.messages[0]!.id, 'u2', 'a2']);
        expect(target.messages[2]!.content).toBe('recent answer 2 (edited)');
        expect(outcome).toMatchObject({ kept: 2, dropped: 2 });
    });
});

describe('setupCompaction — the window events and the page', () => {
    const send = (type: string, detail?: unknown) => window.dispatchEvent(new CustomEvent(type, { detail }));

    it('answers aparte-compact, naming the chat on every event it dispatches', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const { cfg } = makeConfig();
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target }, cfg);
        const start = once<any>('aparte-compact-start');
        const done = once<any>('aparte-compact-done');

        send('aparte-compact', { targetId: 'chat-1' });

        await expect(start).resolves.toEqual({ targetId: 'chat-1' });
        await expect(done).resolves.toEqual({ summary: 'SUMMARY', kept: 0, dropped: 2, targetId: 'chat-1' });
    });

    it('a scoped setup answers only the chat it names — and compacts it when asked without one', async () => {
        const left = makeTarget(exchange(1, 'l'));
        const right = makeTarget(exchange(1, 'r'));
        const targets: Record<string, CompactionTarget> = { 'chat-left': left, 'chat-right': right };
        const { cfg } = makeConfig();
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: (id) => (id ? targets[id] ?? null : null), scopeToTargetId: 'chat-left' }, cfg);

        send('aparte-compact', { targetId: 'chat-right' });
        send('aparte-compact', {});
        await new Promise((r) => setTimeout(r, 10));
        expect(left.appended).toEqual([]);
        expect(right.appended).toEqual([]);

        expect(await c.compact()).toMatchObject({ ok: true, targetId: 'chat-left' });
        expect(left.messages[0]).toMatchObject({ compaction: true });
        expect(right.appended).toEqual([]);
    });

    it('an aparte-abort addressed to the running chat, or to no chat, aborts; one for another chat does not', async () => {
        const target = makeTarget(exchange(1, 'x'));
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

        target.messages = exchange(1, 'x');
        const second = c.compact('chat-1');
        await vi.waitFor(() => expect(chat).toHaveBeenCalledTimes(2));
        send('aparte-abort');
        expect(abortedCount).toBe(2);
        expect(await second).toMatchObject({ ok: false });
    });

    it('resolves the chat on the page: by id, through an <aparte-chat> shell to its viewport, or the first that can render', async () => {
        const viewport = makeTarget(exchange(1, 'v'));
        const shell = document.createElement('div');
        shell.id = 'chat-shell';
        (shell as any).viewport = viewport;
        shell.setAttribute('data-aparte-chat', '');
        document.body.appendChild(shell);

        const direct = document.createElement('div') as unknown as HTMLElement & CompactionTarget;
        direct.id = 'chat-direct';
        const store = makeTarget(exchange(1, 'd'));
        direct.getMessages = store.getMessages;
        direct.clearAll = store.clearAll;
        direct.appendMessage = store.appendMessage;
        direct.setAttribute('data-aparte-chat', '');
        document.body.appendChild(direct);

        const { cfg } = makeConfig();
        const c = setup({ selector: (m) => ({ keep: [], drop: m }), listen: false }, cfg);

        expect(await c.compact('chat-direct')).toMatchObject({ ok: true, dropped: 2 });
        expect(store.messages[0]).toMatchObject({ compaction: true });

        expect(await c.compact('chat-shell')).toMatchObject({ ok: true, dropped: 2 });
        expect(viewport.messages[0]).toMatchObject({ compaction: true });

        viewport.messages = exchange(2, 'again');
        expect(await c.compact()).toMatchObject({ ok: true, targetId: undefined });
        expect(viewport.messages[0], 'the first host on the page that can render').toMatchObject({ compaction: true });

        expect(await c.compact('nowhere')).toMatchObject({ ok: false, error: 'No chat with id "nowhere" to compact' });
    });

    it('a second setup on the same config replaces the first; dispose stops the listening and the compacting', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const { cfg, chat } = makeConfig();
        const first = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target }, cfg);
        const second = setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target }, cfg);

        send('aparte-compact');
        await vi.waitFor(() => expect(target.appended.length).toBeGreaterThan(0));
        expect(chat, 'one setup answered, not two').toHaveBeenCalledTimes(1);
        expect(await first.compact()).toMatchObject({ ok: false, error: 'This compaction setup was disposed' });

        second.dispose();
        target.messages = exchange(1, 'y');
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
            el.clearAll = store.clearAll;
            el.appendMessage = store.appendMessage;
            document.body.appendChild(el);
            return el;
        };
        const left = makeTarget(exchange(1, 'l'));
        const right = makeTarget(exchange(1, 'r'));
        const leftEl = hostOf('chat-left', left);
        const rightEl = hostOf('chat-right', right);
        const a = makeConfig('A');
        const b = makeConfig('B');
        attachConfig(leftEl, a.cfg);
        attachConfig(rightEl, b.cfg);
        const sa = setup({ selector: (m) => ({ keep: [], drop: m }) }, a.cfg);
        const sb = setup({ selector: (m) => ({ keep: [], drop: m }) }, b.cfg);

        send('aparte-compact', { targetId: 'chat-left' });
        await vi.waitFor(() => expect(left.appended.length).toBeGreaterThan(0));
        await new Promise((r) => setTimeout(r, 10));
        expect(a.chat, 'the left chat, by its own config').toHaveBeenCalledTimes(1);
        expect(b.chat, 'not by the other').not.toHaveBeenCalled();
        expect(left.messages[0]!.content).toContain('A');
        expect(right.appended).toEqual([]);

        // Unnamed: the first host on the page is the left one, which belongs to A.
        left.messages = exchange(2, 'l');
        send('aparte-compact');
        await vi.waitFor(() => expect(a.chat).toHaveBeenCalledTimes(2));
        await new Promise((r) => setTimeout(r, 10));
        expect(b.chat).not.toHaveBeenCalled();

        // A setup on the global config answers anything, including a chat bound elsewhere
        // (the two scoped setups are gone first, or B would rightly answer for its chat too).
        sa.dispose();
        sb.dispose();
        setup({ selector: (m) => ({ keep: [], drop: m }), summarize: async () => 'G' });
        right.messages = exchange(3, 'r');
        send('aparte-compact', { targetId: 'chat-right' });
        await vi.waitFor(() => expect(right.messages[0]?.content ?? '').toContain('G'));
        expect(b.chat, 'B never ran').not.toHaveBeenCalled();
    });

    it('listen: false ignores the window entirely', async () => {
        const target = makeTarget(exchange(1, 'x'));
        const { cfg, chat } = makeConfig();
        setup({ selector: (m) => ({ keep: [], drop: m }), resolveTarget: () => target, listen: false }, cfg);
        send('aparte-compact');
        await new Promise((r) => setTimeout(r, 10));
        expect(chat).not.toHaveBeenCalled();
    });
});
