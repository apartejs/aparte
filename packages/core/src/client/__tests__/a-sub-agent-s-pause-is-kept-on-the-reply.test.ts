// @vitest-environment jsdom
/**
 * A paused run's call that no row of the reply holds — a sub-agent's — is kept on the reply
 * (`AparteMessage.deferredCalls`), in a shape that names nothing of a plugin: the call, why
 * it waits, the sub-agent's id and name, the server's ticket. Written before the turn says it
 * paused, so the conversation saved then has it; removed once the pause is answered, or
 * closed by a Stop or a new message. A reload resumes it with the reply's own paused calls.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';

afterEach(() => { document.body.innerHTML = ''; });

function chat(initial: AparteMessage[] = []) {
    const messages: AparteMessage[] = structuredClone(initial);
    const el = document.createElement('div');
    const last = () => messages[messages.length - 1]!;
    Object.assign(el, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: (s: AparteSegment) => { const m = last(); m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = last();
            if (m.segments) m.segments = m.segments.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
        getMessages: () => messages,
        getMessage: (id: string) => messages.find((m) => m.id === id),
    });
    document.body.appendChild(el);
    return { el, messages };
}

const config = () => {
    const cfg = new AparteConfig();
    cfg.setModelConfig({ defaultProvider: 'remote', defaultModel: 'm' });
    return cfg;
};

const send = async (client: AparteClient, content = 'go'): Promise<void> => {
    const c = client as unknown as { _beginUserTurn: () => void; _handleSend: (e: Event) => Promise<void> };
    c._beginUserTurn();
    await c._handleSend(new CustomEvent('aparte-send', { detail: { content } }));
};

/** A server run that pauses on a call of its sub-agent `Researcher`. */
const pausesOnTheSubAgent = (opts: AparteStreamRunOptions): void => {
    opts.emitter({ type: 'run-start' });
    opts.emitter({ type: 'tool-start', toolCallId: 'spawn', name: 'delegate', input: {} });
    opts.emitter({ type: 'agent-start', agentId: 'a1', name: 'Researcher', toolCallId: 'spawn' });
    opts.emitter({ type: 'tool-start', toolCallId: 's1', name: 'read_file', input: { path: 'x' }, agentId: 'a1' });
    opts.emitter({
        type: 'run-suspended',
        pending: [{ toolCallId: 's1', name: 'read_file', input: { path: 'x' }, reason: 'approval', agentId: 'a1' }],
        ticket: 'T',
    } as never);
};

const replyOf = (messages: AparteMessage[]): AparteMessage => messages.find((m) => m.role === 'assistant')!;

describe('a sub-agent’s pause is kept on the reply', () => {
    it('keeps the call, whose it is and the ticket, before the turn says it paused', async () => {
        const { el, messages } = chat();
        let atPause: AparteMessage | undefined;
        el.addEventListener('aparte-message-paused', () => { atPause = structuredClone(replyOf(messages)); });
        const client = new AparteClient({
            config: config(), autoRegister: false, targetResolver: () => el,
            streamRunner: async (opts) => { pausesOnTheSubAgent(opts); return undefined; },
            // Nobody answers: the pause stands until a Stop.
            approvalResolver: (_call, signal) => new Promise((_r, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('stop'), { name: 'AbortError' })))),
        });
        const sending = send(client);
        await new Promise((r) => setTimeout(r, 0));
        expect(atPause?.deferredCalls).toEqual([{
            toolCallId: 's1', name: 'read_file', input: { path: 'x' }, reason: 'approval',
            agentId: 'a1', agentName: 'Researcher', ticket: 'T',
        }]);
        // A Stop closes it: nothing will answer it now.
        client.abort();
        await sending;
        expect(replyOf(messages).deferredCalls).toBeUndefined();
    });

    it('keeps nothing for a pause on the reply’s own call, whose row says it', async () => {
        const { el, messages } = chat();
        const client = new AparteClient({
            config: config(), autoRegister: false, targetResolver: () => el,
            streamRunner: async (opts) => {
                opts.emitter({ type: 'run-start' });
                opts.emitter({ type: 'tool-start', toolCallId: 'c1', name: 'pick_file', input: {} });
                opts.emitter({ type: 'run-suspended', pending: [{ toolCallId: 'c1', name: 'pick_file', input: {}, reason: 'external' }], ticket: 'T' } as never);
                return undefined;
            },
        });
        await send(client);
        expect(replyOf(messages).deferredCalls).toBeUndefined();
    });

    it('is closed by a new message', async () => {
        const reply: AparteMessage = {
            id: 'r1', role: 'assistant', content: '', timestamp: 2, status: 'completed',
            deferredCalls: [{ toolCallId: 's1', name: 'read_file', input: {}, reason: 'approval', agentId: 'a1', ticket: 'T' }],
        };
        const { el, messages } = chat([{ id: 'u1', role: 'user', content: 'go', timestamp: 1 }, reply]);
        const client = new AparteClient({
            config: config(), autoRegister: false, targetResolver: () => el,
            streamRunner: async (opts) => { opts.emitter({ type: 'run-start' }); opts.emitter({ type: 'run-done' }); return undefined; },
        });
        await send(client, 'something else');
        expect(messages.find((m) => m.id === 'r1')!.deferredCalls).toBeUndefined();
    });

    it('is resumed after a reload with the reply’s own paused calls, and spent once the resume leaves', async () => {
        const reply: AparteMessage = {
            id: 'r1', role: 'assistant', content: '', timestamp: 2, status: 'completed',
            segments: [{
                id: 'tool-c1', type: 'tool_call', status: 'awaiting-approval',
                toolCall: { id: 'c1', name: 'write_file', input: {} }, deferred: { reason: 'approval', ticket: 'T' },
            } as AparteSegment],
            deferredCalls: [{ toolCallId: 's1', name: 'read_file', input: { path: 'x' }, reason: 'approval', agentId: 'a1', agentName: 'Researcher', ticket: 'T' }],
        };
        const { el, messages } = chat([{ id: 'u1', role: 'user', content: 'go', timestamp: 1 }, reply]);
        const runs: AparteStreamRunOptions[] = [];
        const asked: unknown[] = [];
        const client = new AparteClient({
            config: config(), autoRegister: false, targetResolver: () => el,
            streamRunner: async (opts) => {
                runs.push(opts);
                expect(messages.find((m) => m.id === 'r1')!.deferredCalls, 'spent before the resume leaves').toBeUndefined();
                opts.emitter({ type: 'run-start' });
                opts.emitter({ type: 'run-done' });
                return undefined;
            },
            approvalResolver: async (call) => { asked.push(call); return { approved: true }; },
        });
        expect(await client.resumeDeferred(el)).toBe(true);
        expect(asked).toEqual([
            { id: 'c1', name: 'write_file', input: {} },
            { id: 's1', name: 'read_file', input: { path: 'x' }, agent: { id: 'a1', name: 'Researcher' } },
        ]);
        expect(runs[0]!.deferral).toEqual({
            token: 'T',
            outcomes: { c1: { kind: 'decision', approved: true }, s1: { kind: 'decision', approved: true } },
        });
    });
});
