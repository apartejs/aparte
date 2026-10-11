// @vitest-environment jsdom
/**
 * The client drives a paused server run: now, or after a reload.
 *
 * A server loop suspends on calls only the page can answer. The runner is a pipe and
 * sees no message, so the CLIENT asks — through the same approval channel a run in the
 * page uses, or by running the browser tool — and runs again with the answers, into the
 * same bubble, under one pair of lifecycle events. A conversation reloaded with a paused
 * call resumes through the same path (`resumeDeferred`).
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';

/** A chat target that keeps what it is told, the way a viewport does. */
function chat(initial: AparteMessage[] = []) {
    const messages: AparteMessage[] = structuredClone(initial);
    const events: string[] = [];
    const el = document.createElement('div');
    const last = () => messages[messages.length - 1]!;
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        // The viewport's one-argument form: the CURRENT message, which a retry moves.
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = last();
            if (m.segments) m.segments = m.segments.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
    });
    for (const type of ['aparte-message-start', 'aparte-message-paused', 'aparte-message-done', 'aparte-message-aborted', 'aparte-message-error']) {
        el.addEventListener(type, () => events.push(type));
    }
    document.body.appendChild(el);
    return { el, messages, events };
}

type Script = (opts: AparteStreamRunOptions, call: number) => void | Promise<void>;

/** A runner that plays one script per call, and records what each call was given. */
function runner(...scripts: Script[]) {
    const calls: AparteStreamRunOptions[] = [];
    const run = async (opts: AparteStreamRunOptions) => {
        calls.push(structuredClone({ ...opts, emitter: undefined, transportCall: undefined, toolLookup: undefined, toolConfigLookup: undefined, approvalResolver: undefined, idGen: undefined, signal: undefined }) as never);
        await scripts[calls.length - 1]?.(opts, calls.length - 1);
        return undefined;
    };
    return { run, calls };
}

const pauseOn = (...pending: { id: string; name: string; reason: 'approval' | 'external' }[]): Script => (opts) => {
    opts.emitter({ type: 'run-start' });
    for (const p of pending) {
        opts.emitter({ type: 'tool-start', toolCallId: p.id, name: p.name, input: { path: p.id } });
        if (p.reason === 'approval') opts.emitter({ type: 'tool-awaiting-approval', toolCallId: p.id, name: p.name, input: { path: p.id } });
    }
    opts.emitter({
        type: 'run-suspended',
        pending: pending.map((p) => ({ toolCallId: p.id, name: p.name, input: { path: p.id }, reason: p.reason })),
        ticket: 'T',
    } as never);
};

const finish: Script = (opts) => {
    opts.emitter({ type: 'run-start' });
    opts.emitter({ type: 'turn-start' });
    opts.emitter({ type: 'text-delta', delta: 'Done.' });
    opts.emitter({ type: 'text-flush' });
    opts.emitter({ type: 'run-done' });
};

/** What a server replays when it resumes an approved call, before the rest of the turn. */
const resumeApproved = (id: string): Script => (opts, call) => {
    opts.emitter({ type: 'run-start' });
    opts.emitter({ type: 'tool-approved', toolCallId: id });
    opts.emitter({ type: 'tool-resolved', toolCallId: id, result: 'deleted' });
    opts.emitter({ type: 'turn-start' });
    opts.emitter({ type: 'text-delta', delta: 'Done.' });
    opts.emitter({ type: 'text-flush' });
    opts.emitter({ type: 'run-done' });
    void call;
};

function client(el: HTMLElement, streamRunner: ReturnType<typeof runner>['run'], extra: Record<string, unknown> = {}) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({ id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }), getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '' } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'k');
    const c = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => el as never, streamRunner, ...extra } as never);
    return { c, cfg };
}

/** A saved conversation whose last reply paused on c1, as a reload finds it. */
const pausedTranscript = (): AparteMessage[] => [
    { id: 'u1', role: 'user', content: 'delete a', timestamp: 1 },
    { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed', segments: [
        { id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a' } }, deferred: { reason: 'approval', ticket: 'T' } } as AparteSegment,
    ] },
];

const rowOf = (messages: AparteMessage[], id: string) =>
    messages.flatMap((m) => m.segments ?? []).find((s) => s.id === `tool-${id}`) as { status: string; deferred?: unknown };

const send = (c: AparteClient, content = 'delete a') =>
    (c as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(new CustomEvent('aparte-send', { detail: { content } }));

describe('the client resumes a paused server run', () => {
    it('asks through the approval channel, then runs again with the answer, into the same bubble', async () => {
        const { el, messages } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), finish);
        const asked: string[] = [];
        const { c } = client(el, r.run, { approvalResolver: async (call: { id: string }) => { asked.push(call.id); return { approved: true }; } });
        await send(c);

        expect(asked).toEqual(['c1']);
        expect(r.calls).toHaveLength(2);
        expect(r.calls[1]!.messageId).toBe(r.calls[0]!.messageId);
        expect(r.calls[1]!.deferral).toEqual({ outcomes: { c1: { kind: 'decision', approved: true } }, token: 'T' });
        // The resume's history ends on the envelope, the paused call left open.
        const tail = r.calls[1]!.baseRequest.messages.at(-1)!;
        expect(tail).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'c1', name: 'delete_file' }] });
        const reply = messages.find((m) => m.id === r.calls[0]!.messageId)!;
        expect(reply.segments?.some((s) => s.type === 'text' && (s as { content: string }).content === 'Done.')).toBe(true);
    });

    it('puts a call the SERVER gated to the person, even for a tool the page does not know', async () => {
        // The page's default channel falls back to the tool's own `needsApproval` — and a
        // server tool is unknown here, so that fallback said "allow" and the page approved,
        // silently, a call the server wanted a person to decide. The server gated it: with
        // no opinion from the page's policy, the person is asked.
        const { el } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), finish);
        const { c, cfg } = client(el, r.run);
        const asked: string[] = [];
        (c as unknown as { _askForApproval: (call: { id: string }) => Promise<unknown> })._askForApproval =
            async (call) => { asked.push(call.id); return { approved: true }; };
        await send(c);
        expect(asked).toEqual(['c1']);

        // A policy that HAS an opinion still answers alone (plugin-approval's `auto` mode).
        cfg.setApprovalPolicy(() => ({ verdict: 'allow' }));
        const r2 = runner(pauseOn({ id: 'c2', name: 'delete_file', reason: 'approval' }), finish);
        const { el: el2 } = chat();
        const { c: c2, cfg: cfg2 } = client(el2, r2.run);
        cfg2.setApprovalPolicy(() => ({ verdict: 'allow' }));
        const asked2: string[] = [];
        (c2 as unknown as { _askForApproval: (call: { id: string }) => Promise<unknown> })._askForApproval =
            async (call) => { asked2.push(call.id); return { approved: true }; };
        await send(c2);
        expect(asked2).toEqual([]);
        expect(r2.calls[1]!.deferral!.outcomes).toEqual({ c2: { kind: 'decision', approved: true } });
    });

    it('answers two approvals of one reply in ONE resume', async () => {
        const { el } = chat();
        const r = runner(pauseOn({ id: 'd1', name: 'delete_file', reason: 'approval' }, { id: 'd2', name: 'delete_file', reason: 'approval' }), finish);
        const asked: string[] = [];
        const { c } = client(el, r.run, { approvalResolver: async (call: { id: string }) => { asked.push(call.id); return { approved: call.id === 'd1' }; } });
        await send(c);

        expect(asked).toEqual(['d1', 'd2']);
        expect(r.calls).toHaveLength(2);
        expect(r.calls[1]!.deferral!.outcomes).toEqual({
            d1: { kind: 'decision', approved: true },
            d2: { kind: 'decision', approved: false },
        });
    });

    it('forgets the pause once the call is answered: no ticket stays in the saved row', async () => {
        const { el, messages } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), resumeApproved('c1'));
        const { c } = client(el, r.run, { approvalResolver: async () => ({ approved: true }) });
        await send(c);
        const row = messages.flatMap((m) => m.segments ?? []).find((s) => s.id === 'tool-c1') as { status: string; deferred?: unknown };
        expect(row.status).toBe('resolved');
        expect(row.deferred).toBeUndefined();
    });

    it('runs a browser tool in the page and sends its result', async () => {
        const { el } = chat();
        const r = runner(pauseOn({ id: 'q1', name: 'ask_user', reason: 'external' }), finish);
        const { c, cfg } = client(el, r.run);
        cfg.registerTool(
            { name: 'ask_user', description: 'Ask.', inputSchema: { type: 'object' } },
            async (call) => ({ toolCallId: call.id, content: 'The blue one.' }),
        );
        await send(c);
        expect(r.calls[1]!.deferral!.outcomes).toEqual({ q1: { kind: 'result', content: 'The blue one.' } });
    });

    it('brackets the whole turn, pauses included, with one start and one done', async () => {
        const { el, events } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), finish);
        const { c } = client(el, r.run, { approvalResolver: async () => ({ approved: true }) });
        await send(c);
        // The pause is said in between, for whoever saves the conversation.
        expect(events).toEqual(['aparte-message-start', 'aparte-message-paused', 'aparte-message-done']);
    });

    it('marks the calls stopped and does not resume when Stop lands while a panel waits', async () => {
        const { el, messages, events } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), finish);
        const { c } = client(el, r.run, {
            approvalResolver: (_call: unknown, signal: AbortSignal) => new Promise((resolve) => {
                signal.addEventListener('abort', () => resolve({ approved: false }));
                c.abort(); // Stop, while the panel waits
            }),
        });
        await send(c);

        expect(r.calls).toHaveLength(1);
        const call = messages.flatMap((m) => m.segments ?? []).find((s) => s.id === 'tool-c1') as { status: string; deferred?: unknown };
        expect(call.status).toBe('aborted');
        expect(call.deferred).toBeUndefined();
        expect(events).not.toContain('aparte-message-done');
        // No run was left to say the turn stopped, so the client says it: the composer
        // and the conversation manager both wait for this event.
        expect(events).toContain('aparte-message-aborted');
    });

    it('closes a paused call when a new message is sent instead of an answer', async () => {
        const paused: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'delete a', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed', segments: [
                { id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a' } }, deferred: { reason: 'approval', ticket: 'T' } } as AparteSegment,
            ] },
        ];
        const { el, messages } = chat(paused);
        const r = runner(finish);
        const { c } = client(el, r.run);
        await send(c, 'never mind');

        const call = messages[1]!.segments![0] as { status: string; deferred?: unknown };
        expect(call.status).toBe('aborted');
        expect(call.deferred).toBeUndefined();
        const history = r.calls[0]!.baseRequest.messages;
        expect(history.find((m) => m.role === 'tool')).toMatchObject({ toolCallId: 'c1', content: 'The tool call was stopped before it ran.' });
    });

    it('resumes a paused call in a restored conversation (resumeDeferred)', async () => {
        const paused: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'delete a', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed', segments: [
                { id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a' } }, deferred: { reason: 'approval', ticket: 'T' } } as AparteSegment,
            ] },
        ];
        const { el, events } = chat(paused);
        const r = runner(resumeApproved('c1'));
        const { c } = client(el, r.run, { approvalResolver: async () => ({ approved: true }) });

        expect(await c.resumeDeferred(el)).toBe(true);
        expect(r.calls).toHaveLength(1);
        expect(r.calls[0]!.messageId).toBe('a1');
        expect(r.calls[0]!.deferral).toEqual({ outcomes: { c1: { kind: 'decision', approved: true } }, token: 'T' });
        expect(r.calls[0]!.baseRequest.messages.at(-1)).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'c1' }] });
        expect(events).toEqual(['aparte-message-start', 'aparte-message-done']);
        // Nothing left to resume.
        expect(await c.resumeDeferred(el)).toBe(false);
    });

    it('resumes on its own when a conversation manager loads one with a paused call', async () => {
        const paused: AparteMessage[] = [
            { id: 'u1', role: 'user', content: 'delete a', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed', segments: [
                { id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a' } }, deferred: { reason: 'approval', ticket: 'T' } } as AparteSegment,
            ] },
        ];
        const { el } = chat(paused);
        const r = runner(resumeApproved('c1'));
        const asked: string[] = [];
        const { c } = client(el, r.run, { approvalResolver: async (call: { id: string }) => { asked.push(call.id); return { approved: true }; } });
        c.start();
        try {
            el.dispatchEvent(new CustomEvent('aparte-conversation-loaded', { bubbles: true, composed: true, detail: { targetId: '', conversationId: 'x' } }));
            await vi.waitFor(() => expect(r.calls).toHaveLength(1));
            expect(asked).toEqual(['c1']);
        } finally {
            c.stop();
        }
    });
});

describe('a paused turn stops, fails and ends like any other', () => {
    it('lets Stop reach a panel waiting in a RESTORED conversation', async () => {
        // The turn's controller was registered by its first run, and a restored turn has
        // none before the panel: Stop aborted an old controller and the wait never heard.
        const { el, messages, events } = chat(pausedTranscript());
        const r = runner(resumeApproved('c1'));
        const { c } = client(el, r.run, {
            approvalResolver: (_call: unknown, signal: AbortSignal) => new Promise((resolve) => {
                signal.addEventListener('abort', () => resolve({ approved: false }));
                // A fallback answer, so a Stop that never arrives fails the assertions below
                // rather than the test's timeout.
                setTimeout(() => resolve({ approved: true }), 50);
                c.abort();
            }),
        });
        await c.resumeDeferred(el);
        expect(r.calls).toHaveLength(0);
        expect(rowOf(messages, 'c1')).toMatchObject({ status: 'aborted' });
        expect(rowOf(messages, 'c1').deferred).toBeUndefined();
        expect(events).toEqual(['aparte-message-start', 'aparte-message-aborted']);
    });

    it('closes the calls a Stop cuts in the middle of a resume, instead of saving them open', async () => {
        // The server ran d1 and had r1 queued when the page stopped listening: neither
        // event reached it. r1 kept the old ticket — a reload resumed it, the server
        // refused the mismatch, and the error came back on every load — and d1 spun.
        const { el, messages, events } = chat();
        let stop = (): void => {};
        const pauseTwo: Script = (opts) => {
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'tool-start', toolCallId: 'd1', name: 'delete_file', input: {} });
            opts.emitter({ type: 'tool-awaiting-approval', toolCallId: 'd1', name: 'delete_file', input: {} });
            opts.emitter({ type: 'tool-start', toolCallId: 'r1', name: 'read_file', input: {} });
            opts.emitter({ type: 'run-suspended', pending: [
                { toolCallId: 'd1', name: 'delete_file', input: {}, reason: 'approval' },
                { toolCallId: 'r1', name: 'read_file', input: {}, reason: 'queued' },
            ], ticket: 'T' } as never);
        };
        const cutMidResume: Script = (opts) => {
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'tool-approved', toolCallId: 'd1' });
            stop();
            // What a real fetch does to the body when its signal aborts.
            throw new DOMException('The operation was aborted.', 'AbortError');
        };
        const r = runner(pauseTwo, cutMidResume);
        const { c } = client(el, r.run, { approvalResolver: async () => ({ approved: true }) });
        stop = () => c.abort();
        await send(c);
        expect(r.calls).toHaveLength(2);
        for (const id of ['d1', 'r1']) {
            expect(rowOf(messages, id)).toMatchObject({ status: 'aborted' });
            expect(rowOf(messages, id).deferred).toBeUndefined();
        }
        expect(events.filter((e) => e === 'aparte-message-aborted')).toHaveLength(1);
    });

    it('spends the ticket as the resume leaves: a save during the resume keeps no pause', async () => {
        // The conversation manager saves before it cuts a switch. A row saved with the old
        // ticket was resumed on the next load against a server that had moved on.
        const { el, messages } = chat();
        let seen: { deferred?: unknown } | undefined;
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), (opts, call) => {
            seen = structuredClone(rowOf(messages, 'c1'));
            return finish(opts, call);
        });
        const { c } = client(el, r.run, { approvalResolver: async () => ({ approved: true }) });
        await send(c);
        // The history still left the call open for the server: it was built first.
        expect(r.calls[1]!.baseRequest.messages.at(-1)).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'c1' }] });
        expect(seen!.deferred).toBeUndefined();
    });

    it('closes the paused rows by the reply\'s id — a retry during the wait moves the head', async () => {
        const { el, messages } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), finish);
        const { c } = client(el, r.run, {
            approvalResolver: (_call: unknown, signal: AbortSignal) => new Promise((resolve) => {
                signal.addEventListener('abort', () => resolve({ approved: false }));
                // A retry on the paused reply: its sibling becomes the head, the old turn is cut.
                (el as unknown as { appendMessage: (m: AparteMessage) => void })
                    .appendMessage({ id: 'a2', role: 'assistant', content: '', timestamp: 3 });
                c.abort();
            }),
        });
        await send(c);
        expect(rowOf(messages, 'c1')).toMatchObject({ status: 'aborted' });
        expect(rowOf(messages, 'c1').deferred).toBeUndefined();
    });

    it('still resumes a loaded conversation after an earlier Stop', async () => {
        // The Stop flag was cleared only by a send, so the next load found it set and
        // gave the paused turn up before asking anything.
        const { el } = chat(pausedTranscript());
        const r = runner(resumeApproved('c1'));
        const { c } = client(el, r.run, { approvalResolver: async () => ({ approved: true }) });
        c.abort();
        expect(await c.resumeDeferred(el)).toBe(true);
        expect(r.calls).toHaveLength(1);
    });

    it('fails the turn when the approval channel crashes, instead of resuming without the answer', async () => {
        const { el, messages, events } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), finish);
        const { c } = client(el, r.run, { approvalResolver: async () => { throw new Error('The panel crashed.'); } });
        await send(c);
        expect(r.calls).toHaveLength(1);
        expect(events).toContain('aparte-message-error');
        expect(rowOf(messages, 'c1')).toMatchObject({ status: 'aborted' });
        expect(rowOf(messages, 'c1').deferred).toBeUndefined();
    });

    it('stops asking after maxTurns resumes: a server that pauses on every run cannot ask forever', async () => {
        const { el, messages, events } = chat();
        let runs = 0;
        const run = async (opts: AparteStreamRunOptions) => {
            runs++;
            if (runs <= 50) await pauseOn({ id: `c${runs}`, name: 'delete_file', reason: 'approval' })(opts, runs);
            return undefined;
        };
        const asked: string[] = [];
        const { c } = client(el, run, { maxTurns: 3, approvalResolver: async (call: { id: string }) => { asked.push(call.id); return { approved: true }; } });
        await send(c);
        expect(asked).toEqual(['c1', 'c2', 'c3']);
        expect(runs).toBe(4);
        expect(rowOf(messages, 'c4')).toMatchObject({ status: 'aborted' });
        expect(messages.at(-1)!.segments!.some((seg) => seg.type === 'error' && (seg as { details?: string }).details === 'MAX_TURNS_EXCEEDED')).toBe(true);
        expect(events.filter((e) => e !== 'aparte-message-paused')).toEqual(['aparte-message-start', 'aparte-message-done']);
    });
});

describe('a resume sends the history its turn was sent with', () => {
    it('keeps what the request interceptor added to the turn', async () => {
        // The resume rebuilt its history from the transcript, so context an interceptor
        // put in the first request — retrieved documents, a date — was gone from the next.
        const { el } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), finish);
        const { c } = client(el, r.run, {
            approvalResolver: async () => ({ approved: true }),
            requestInterceptor: (req: { messages: unknown[] }) => ({ ...req, messages: [{ role: 'system', content: 'The repo is read-only.' }, ...req.messages] }),
        });
        await send(c);
        const resumed = r.calls[1]!.baseRequest.messages;
        expect(resumed.filter((m) => m.content === 'The repo is read-only.')).toHaveLength(1);
        expect(resumed.at(-1)).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'c1' }] });
    });

    it('builds a reloaded turn\'s history the way its send did, `history` included', async () => {
        const transcript: AparteMessage[] = [
            { id: 'u0', role: 'user', content: 'hello', timestamp: 0 },
            { id: 'a0', role: 'assistant', content: 'hi', timestamp: 0, status: 'completed' },
            ...pausedTranscript(),
        ];
        for (const [history, sendsEarlier] of [['none', false], ['viewport', true]] as const) {
            const { el } = chat(transcript);
            const r = runner(resumeApproved('c1'));
            const { c } = client(el, r.run, { history, approvalResolver: async () => ({ approved: true }) });
            await c.resumeDeferred(el);
            const sent = r.calls[0]!.baseRequest.messages;
            expect(sent.some((m) => m.content === 'hello')).toBe(sendsEarlier);
            expect(sent.filter((m) => m.role === 'user').at(-1)).toMatchObject({ content: 'delete a' });
            expect(sent.at(-1)).toMatchObject({ role: 'assistant', toolCalls: [{ id: 'c1' }] });
        }
    });
});

describe('a resume adds nothing the turn already has', () => {
    it('seeds the prefix segments once, not once per run', async () => {
        // Every run of the turn starts with `run-start`, and the resumes carry the turn's
        // `_meta`: the host's prefix landed in the reply again on each of them.
        const { el, messages } = chat();
        const r = runner(pauseOn({ id: 'c1', name: 'delete_file', reason: 'approval' }), finish);
        const { c } = client(el, r.run, {
            approvalResolver: async () => ({ approved: true }),
            requestInterceptor: (req: object) => ({ ...req, _meta: { prefixSegments: [{ id: 'pre-1', type: 'text', content: 'Context.' }] } }),
        });
        await send(c);
        const reply = messages.find((m) => m.id === r.calls[0]!.messageId)!;
        expect(reply.segments!.filter((s) => s.id === 'pre-1')).toHaveLength(1);
    });
});

describe('a reloaded turn resumes on the model it ran on', () => {
    const pausedOn = (model?: object): AparteMessage[] => [
        { id: 'u1', role: 'user', content: 'delete a', timestamp: 1 },
        { id: 'a1', role: 'assistant', content: '', timestamp: 2, status: 'completed', ...(model ? { model } : {}), segments: [
            { id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval', toolCall: { id: 'c1', name: 'delete_file', input: { path: 'a' } }, deferred: { reason: 'approval', ticket: 'T' } } as AparteSegment,
        ] } as AparteMessage,
    ];

    it('records the provider, model and temperature a turn ran on, on its reply', async () => {
        const { el, messages } = chat();
        const r = runner(finish);
        const { c } = client(el, r.run);
        await send(c);
        expect(messages.find((m) => m.role === 'assistant')).toMatchObject({ model: { providerId: 'mock', modelId: 'm' } });
    });

    it('resumes on the recorded provider, model and temperature, not the current default', async () => {
        const { el } = chat(pausedOn({ providerId: 'other', modelId: 'm2', temperature: 0.4 }));
        const r = runner(resumeApproved('c1'));
        const { c, cfg } = client(el, r.run, { approvalResolver: async () => ({ approved: true }) });
        cfg.registerAIProvider({ id: 'other', getMetadata: () => ({ id: 'other', name: 'O' }), getModels: () => [{ id: 'm2', name: 'M2' }], chat: async () => '' } as never);
        expect(await c.resumeDeferred(el)).toBe(true);
        expect(r.calls[0]).toMatchObject({ providerId: 'other', baseRequest: { modelId: 'm2', temperature: 0.4 } });
    });

    it('falls back to the default when the recorded provider is gone', async () => {
        const { el } = chat(pausedOn({ providerId: 'removed', modelId: 'm9' }));
        const r = runner(resumeApproved('c1'));
        const { c } = client(el, r.run, { approvalResolver: async () => ({ approved: true }) });
        expect(await c.resumeDeferred(el)).toBe(true);
        expect(r.calls[0]).toMatchObject({ providerId: 'mock', baseRequest: { modelId: 'm' } });
    });
});
