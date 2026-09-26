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
import { describe, it, expect } from 'vitest';
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
    const owner = (segmentId: string) => [...messages].reverse().find((m) => m.segments?.some((s) => s.id === segmentId));
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = owner(id);
            if (m) m.segments = m.segments!.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
    });
    for (const type of ['aparte-message-start', 'aparte-message-done', 'aparte-message-aborted']) {
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
        expect(events).toEqual(['aparte-message-start', 'aparte-message-done']);
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
});
