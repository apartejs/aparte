// @vitest-environment jsdom
/**
 * A run names the person's message it answers (`userMessage`), as it was sent.
 *
 * The history a run is handed is the model's: after a turn that failed on the way, the
 * failed message is joined to the next one, because a model reading the whole history must
 * hear both. A runner whose agent keeps its own memory (n8n's Chat Trigger) sends only the
 * new message, and the history's last message is then two messages. The run says which one
 * the person sent this turn: the text typed on a send, the retried message on a retry, the
 * new text on an edit.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';

function chatHost() {
    const host = document.createElement('div');
    host.id = 'host';
    document.body.appendChild(host);
    const messages: AparteMessage[] = [];
    const last = () => messages[messages.length - 1];
    Object.assign(host, {
        appendMessage: (m: AparteMessage) => { messages.push({ ...m }); },
        updateMessage: (id: string, u: Partial<AparteMessage>) => {
            const m = messages.find((x) => x.id === id);
            if (m) Object.assign(m, u);
        },
        addSegment: (s: AparteSegment) => { const m = last(); if (m) m.segments = [...(m.segments ?? []), s]; },
        updateSegment: (id: string, u: Partial<AparteSegment>) => {
            const m = last();
            if (m?.segments) m.segments = m.segments.map((s) => (s.id === id ? { ...s, ...u } as AparteSegment : s));
        },
        getMessages: () => messages,
        updateLastMessage: () => {}, typeName: () => {}, setUsage: () => {},
    });
    return { host, messages };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
    while (cleanups.length) cleanups.pop()!();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const answer = (opts: AparteStreamRunOptions): void => {
    opts.emitter({ type: 'run-start' });
    opts.emitter({ type: 'turn-start' });
    opts.emitter({ type: 'text-delta', delta: 'ok' });
    opts.emitter({ type: 'text-flush' });
    opts.emitter({ type: 'run-done' });
};

/** A chat whose runner records each run; `fail` lists the runs that end on a network error. */
function openChat(fail: number[] = []) {
    const { host, messages } = chatHost();
    const seen: AparteStreamRunOptions[] = [];
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = new AparteClient({
        autoRegister: false,
        streamRunner: async (opts: AparteStreamRunOptions) => {
            seen.push(opts);
            if (fail.includes(seen.length)) throw new TypeError('Failed to fetch');
            answer(opts);
            return undefined;
        },
    } as never);
    client.start();
    cleanups.push(() => client.stop());
    const dispatch = (type: string, detail: Record<string, unknown>) => host.dispatchEvent(
        new CustomEvent(type, { detail: { targetId: 'host', ...detail }, bubbles: true, composed: true }),
    );
    const settled = () => vi.waitFor(() => expect(messages.some((m) => m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming'))).toBe(false));
    const send = async (content: string) => {
        const runs = seen.length;
        dispatch('aparte-send', { content, timestamp: Date.now() });
        await vi.waitFor(() => expect(seen.length).toBe(runs + 1));
        await settled();
    };
    return { seen, messages, send, dispatch, settled };
}

const lastUserText = (opts: AparteStreamRunOptions): unknown =>
    [...opts.baseRequest.messages].reverse().find((m) => m.role === 'user')?.content;

describe('a run names the message it answers', () => {
    it('on a send: the text typed, and the id of the message the chat shows', async () => {
        const { seen, messages, send } = openChat();
        await send('hello');
        const question = messages.find((m) => m.role === 'user')!;
        expect(seen[0]!.userMessage).toEqual({ content: 'hello', messageId: question.id });
    });

    it('after a failed turn: the message just typed, while the history joins both', async () => {
        const { seen, send } = openChat([1]);
        await send('first');
        await send('second');
        expect(lastUserText(seen[1]!)).toBe('first\n\nsecond');
        expect(seen[1]!.userMessage?.content).toBe('second');
    });

    it('on a retry: the message retried', async () => {
        const { seen, messages, send, dispatch, settled } = openChat();
        await send('first');
        const question = messages.find((m) => m.role === 'user')!;
        const reply = messages.find((m) => m.role === 'assistant')!;
        dispatch('aparte-retry', { messageId: reply.id });
        await vi.waitFor(() => expect(seen).toHaveLength(2));
        await settled();
        expect(seen[1]!.userMessage).toEqual({ content: 'first', messageId: question.id });
    });

    it('on an edit: the new text, under the edited message id', async () => {
        const { seen, messages, send, dispatch } = openChat();
        await send('first');
        const question = messages.find((m) => m.role === 'user')!;
        dispatch('aparte-edit', { messageId: question.id, content: 'first, reworded' });
        await vi.waitFor(() => expect(seen).toHaveLength(2));
        expect(seen[1]!.userMessage).toEqual({ content: 'first, reworded', messageId: question.id });
    });
});
