// @vitest-environment jsdom
/**
 * n8n keeps the agent's memory and the page sends it only the new message (`chatInput`): the
 * last user message of the history the client built. After a turn that failed on the way
 * (a workflow error, the network), the client sends that message with the next one, so the
 * text n8n receives is both, joined, as every later request of the conversation tells it.
 * It used to receive the new message alone, and the one that failed was never heard.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteClient, AparteConfig, type AparteMessage, type AparteSegment } from '@aparte/core';
import { createN8nRunner } from '../index.js';

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

/** A workflow that answers each message in turn: its text, or `500` for a workflow error. */
function workflow(...answers: (string | 500)[]) {
    const bodies: Record<string, unknown>[] = [];
    const fetch = (async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        const answer = answers.shift();
        if (answer === 500) return new Response('{"code":500,"message":"Error in workflow"}', { status: 500, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ output: answer }), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, bodies };
}

function conversation(fetch: typeof globalThis.fetch) {
    const el = chat();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = new AparteClient({
        config: new AparteConfig(), autoRegister: false, targetResolver: () => el,
        streamRunner: createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat', fetch }),
    });
    return async (content: string): Promise<void> => {
        const c = client as unknown as { _beginUserTurn: () => void; _handleSend: (e: Event) => Promise<void> };
        c._beginUserTurn();
        await c._handleSend(new CustomEvent('aparte-send', { detail: { content } }));
    };
}

describe('n8n hears a failed message with the next one', () => {
    it('after a failed first turn, the next message carries both texts', async () => {
        const n8n = workflow(500, 'A2', 'A3');
        const send = conversation(n8n.fetch);
        await send('U1');
        await send('U2');
        await send('U3');
        expect(n8n.bodies.map((b) => b['chatInput'])).toEqual(['U1', 'U1\n\nU2', 'U3']);
        // A history with no reply yet is a new conversation: the second session is the one kept.
        expect(n8n.bodies[2]!['sessionId']).toBe(n8n.bodies[1]!['sessionId']);
    });

    it('in the middle of a conversation, the same session hears the failed message with the next one', async () => {
        const n8n = workflow('A0', 500, 'A2', 'A3');
        const send = conversation(n8n.fetch);
        await send('U0');
        await send('U1');
        await send('U2');
        await send('U3');
        expect(n8n.bodies.map((b) => b['chatInput'])).toEqual(['U0', 'U1', 'U1\n\nU2', 'U3']);
        expect(new Set(n8n.bodies.map((b) => b['sessionId'])).size).toBe(1);
    });
});
