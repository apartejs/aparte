// @vitest-environment jsdom
/**
 * The runner numbers a thread's messages by their place in the history (`aparte-0`,
 * `aparte-1`, …), so an agent that keeps the thread's messages reads the same id as the
 * same message. That holds only if the history the client sends tells the same past on
 * every request. After a failed turn it did not: the next request left the failed message
 * out, the one after put it back joined to the next, and `aparte-2` named two different
 * messages in one thread. The client now sends the failed message with the next one from
 * the next request on, so every request starts with the one before.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteClient, AparteConfig, type AparteMessage, type AparteSegment } from '@aparte/core';
import { createAgUiRunner } from '../index.js';

vi.mock('@aparte/core', async () => await import('../../../../../core/src/index.js'));

/** A chat target that keeps what it is told, the way a viewport does. */
function chat() {
    const messages: AparteMessage[] = [];
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
    return el;
}

const sse = (...events: object[]) =>
    new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

/** An agent that answers each run in turn: its text, or `503` for a failed request. */
function agent(...answers: (string | 503)[]) {
    const bodies: { messages: { id: string; role: string; content?: unknown }[] }[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { threadId: string; messages: { id: string; role: string; content?: unknown }[] };
        bodies.push(body);
        const answer = answers.shift();
        if (answer === 503) return new Response('busy', { status: 503 });
        return sse(
            { type: 'RUN_STARTED', threadId: body.threadId, runId: `r${bodies.length}` },
            { type: 'TEXT_MESSAGE_START', messageId: `t${bodies.length}`, role: 'assistant' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: `t${bodies.length}`, delta: answer },
            { type: 'TEXT_MESSAGE_END', messageId: `t${bodies.length}` },
            { type: 'RUN_FINISHED', threadId: body.threadId, runId: `r${bodies.length}` },
        );
    }) as unknown as typeof globalThis.fetch;
    return { fetch, bodies };
}

describe('a failed turn leaves the ids of the thread in place', () => {
    it('every request of the thread starts with the messages of the one before, under the same ids', async () => {
        const a = agent('A0', 503, 'A2', 'A3');
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const el = chat();
        const client = new AparteClient({
            config: new AparteConfig(), autoRegister: false, targetResolver: () => el,
            streamRunner: createAgUiRunner({ endpoint: '/agui', fetch: a.fetch, threadId: 'thread-1' }),
        });
        const send = async (content: string): Promise<void> => {
            const c = client as unknown as { _beginUserTurn: () => void; _handleSend: (e: Event) => Promise<void> };
            c._beginUserTurn();
            await c._handleSend(new CustomEvent('aparte-send', { detail: { content } }));
        };
        await send('U0');
        await send('U1');
        await send('U2');
        await send('U3');

        const [, , third, fourth] = a.bodies;
        expect(third!.messages.at(-1)).toMatchObject({ role: 'user', content: 'U1\n\nU2' });
        expect(fourth!.messages.slice(0, third!.messages.length)).toEqual(third!.messages);
    });
});
