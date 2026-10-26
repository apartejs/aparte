/**
 * A workflow that answers through response nodes — Chat nodes — over n8n's chat WebSocket.
 *
 * The frames are the ones recorded against n8n 2.44.7 (see socket.ts): a heartbeat, a
 * message as plain text, `n8n|continue`, a `with-buttons` frame whose links resume the
 * waiting execution, and a written reply to a Chat node that waits for one, sent on the
 * socket. The socket is a fake the test drives; the order and the strings are n8n's.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteErrorCode } from '@aparte/core';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createN8nRunner, N8N_BUTTONS_TOOL } from '../index.js';
import type { N8nWebSocketLike } from '../index.js';

type Event = { type: string; [key: string]: unknown };

class FakeSocket {
    static all: FakeSocket[] = [];
    readyState = 0;
    sent: string[] = [];
    closed = false;
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    constructor(readonly url: string) { FakeSocket.all.push(this); }
    open(): void { this.readyState = 1; this.onopen?.({}); }
    receive(...frames: string[]): void { for (const data of frames) this.onmessage?.({ data }); }
    send(data: string): void { this.sent.push(data); }
    close(): void { this.closed = true; this.readyState = 3; this.onclose?.({}); }
}
const Socket = FakeSocket as unknown as N8nWebSocketLike;

afterEach(() => { FakeSocket.all = []; });

const URL_ = 'https://n8n.example.com/webhook/abc/chat';
const WAITING = 'https://n8n.example.com/webhook-waiting/55/node-3';
const BUTTONS = JSON.stringify({
    type: 'with-buttons',
    text: 'Shall I book a table for tonight?',
    blockUserInput: true,
    buttons: [
        { text: 'Book it', link: `${WAITING}?approved=true&signature=a`, type: 'primary' },
        { text: 'No thanks', link: `${WAITING}?approved=false&signature=b`, type: 'secondary' },
    ],
});

function setup({ answers = [] as Response[] } = {}) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
        calls.push({ url, ...(init ? { init } : {}) });
        const next = answers.shift();
        if (!next) throw new Error('no scripted response left');
        return next;
    }) as unknown as typeof globalThis.fetch;
    const warnings: string[] = [];
    const runner = createN8nRunner({ webhookUrl: URL_, fetch, WebSocket: Socket, sessionId: 'conv-1', onWarning: (m) => warnings.push(m) });
    const turn = (content: string, deferral?: AparteStreamRunOptions['deferral'], signal = new AbortController().signal) => {
        const events: Event[] = [];
        const done = runner({
            messageId: 'm', providerId: 'n8n', signal,
            baseRequest: { messages: [{ role: 'user', content }], modelId: 'n8n' },
            emitter: (e: Event) => events.push(e),
            transportCall: async () => { throw new Error('never called'); }, toolLookup: () => undefined,
            ...(deferral ? { deferral } : {}),
        } as unknown as AparteStreamRunOptions);
        return { done, events, text: () => events.filter((e) => e.type === 'text-delta').map((e) => e.delta).join('|') };
    };
    return { calls, turn, warnings };
}

const started = () => new Response(JSON.stringify({ executionStarted: true, executionId: '55', resumeToken: 'tok' }), { status: 200, headers: { 'content-type': 'application/json' } });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createN8nRunner: response nodes over the chat socket', () => {
    it("opens the execution's socket, answers its heartbeat, draws each message and pauses the turn on buttons", async () => {
        const { turn } = setup({ answers: [started()] });
        const t = turn('hi there');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        const socket = FakeSocket.all[0]!;
        expect(socket.url).toBe('wss://n8n.example.com/chat?sessionId=conv-1&executionId=55&isPublic=true&token=tok');
        socket.open();
        socket.receive('n8n|heartbeat');
        expect(socket.sent).toEqual(['n8n|heartbeat-ack']);
        socket.receive('Hello! You said: hi there', 'n8n|continue', BUTTONS);
        await t.done;

        expect(t.text()).toBe('Hello! You said: hi there|Shall I book a table for tonight?');
        const start = t.events.find((e) => e.type === 'tool-start')!;
        expect(start).toMatchObject({ name: N8N_BUTTONS_TOOL, input: { text: 'Shall I book a table for tonight?', blockUserInput: true, buttons: [{ text: 'Book it', type: 'primary' }, { text: 'No thanks', type: 'secondary' }] } });
        const suspended = t.events.at(-1)!;
        expect(suspended).toMatchObject({ type: 'run-suspended', pending: [{ toolCallId: start['toolCallId'], name: N8N_BUTTONS_TOOL, reason: 'external' }] });
        // The links stay in the ticket: the page is handed the labels, never the URLs.
        expect(JSON.stringify(start['input'])).not.toContain('webhook-waiting');
        expect(String(suspended['ticket'])).toContain('webhook-waiting');
    });

    it("resumes on the button chosen: its link is fetched, and the execution's next messages end the turn", async () => {
        const { turn, calls } = setup({ answers: [started(), new Response('', { status: 200, headers: { 'content-type': 'text/html' } })] });
        const first = turn('hi there');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        const socket = FakeSocket.all[0]!;
        socket.open();
        socket.receive(BUTTONS);
        await first.done;
        const suspended = first.events.at(-1)!;
        const toolCallId = String((suspended['pending'] as { toolCallId: string }[])[0]!.toolCallId);

        const resumed = turn('hi there', {
            token: String(suspended['ticket']),
            outcomes: { [toolCallId]: { kind: 'result', content: 'Book it', structuredContent: { index: 0, text: 'Book it' } } },
        });
        await vi.waitFor(() => expect(calls).toHaveLength(2));
        expect(calls[1]!.url).toBe(`${WAITING}?approved=true&signature=a`);
        socket.receive('Booked.', 'n8n|continue', 'What name should it be under?');
        await resumed.done;

        expect(resumed.events.map((e) => e.type)).toEqual(['run-start', 'turn-start', 'tool-resolved', 'text-delta', 'text-flush', 'text-delta', 'text-flush', 'run-done']);
        expect(resumed.events[2]).toMatchObject({ toolCallId, result: 'Book it' });
        expect(resumed.text()).toBe('Booked.|What name should it be under?');
    });

    it('sends a written reply on the socket while the execution waits for one, and posts again once it has ended', async () => {
        const { turn, calls } = setup({ answers: [started(), new Response('{"output":"A new conversation."}', { status: 200 })] });
        const first = turn('hi there');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        const socket = FakeSocket.all[0]!;
        socket.open();
        socket.receive('What name should it be under?');
        await first.done;
        expect(first.events.at(-1)).toMatchObject({ type: 'run-done' });

        const reply = turn('Paul');
        await tick();
        expect(calls).toHaveLength(1);
        expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ sessionId: 'conv-1', action: 'sendMessage', chatInput: 'Paul', files: [] });
        socket.receive('Thanks, Paul. See you tonight.');
        socket.close();
        await reply.done;
        expect(reply.text()).toBe('Thanks, Paul. See you tonight.');

        // The execution ended with its socket: the next message starts a new one.
        await turn('again').done;
        expect(calls).toHaveLength(2);
    });

    it("reads n8n 3.0's JSON frames: heartbeat, message, continue", async () => {
        const { turn } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        const socket = FakeSocket.all[0]!;
        socket.open();
        socket.receive(JSON.stringify({ type: 'heartbeat' }));
        expect(socket.sent).toEqual([JSON.stringify({ type: 'heartbeat-ack' })]);
        socket.receive(JSON.stringify({ type: 'message', text: 'One.' }), JSON.stringify({ type: 'continue' }), JSON.stringify({ type: 'message', text: 'Two.' }));
        await t.done;
        expect(t.text()).toBe('One.|Two.');
    });

    it("shows no button whose link leaves this n8n, and says so to the developer", async () => {
        const { turn, warnings } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive(JSON.stringify({ type: 'with-buttons', text: 'Pick', buttons: [{ text: 'Go', link: 'https://elsewhere.example/x', type: 'primary' }] }));
        await t.done;
        expect(t.events.some((e) => e.type === 'tool-start')).toBe(false);
        expect(t.events.at(-1)).toMatchObject({ type: 'run-done' });
        expect(warnings.join(' ')).toMatch(/lead off this n8n instance/);
    });

    it("fails the turn with the workflow's own words on an error frame", async () => {
        const { turn } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive(JSON.stringify({ type: 'error', message: 'The Chat node failed.' }));
        await expect(t.done).rejects.toMatchObject({ code: AparteErrorCode.PROVIDER_ERROR, message: 'The Chat node failed.' });
    });

    it('fetches nothing when no button was chosen: the execution keeps waiting in n8n', async () => {
        const { turn, calls } = setup({ answers: [started()] });
        const first = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive(BUTTONS);
        await first.done;
        const suspended = first.events.at(-1)!;
        const resumed = turn('hi', { token: String(suspended['ticket']), outcomes: {} });
        await resumed.done;
        expect(calls).toHaveLength(1);
        expect(resumed.events.map((e) => e.type)).toEqual(['run-start', 'turn-start', 'tool-aborted', 'run-done']);
    });

    it('stops listening when the turn is stopped, and keeps the execution for the next message', async () => {
        const { turn } = setup({ answers: [started()] });
        const stop = new AbortController();
        const t = turn('hi', undefined, stop.signal);
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        stop.abort();
        await expect(t.done).resolves.toBeUndefined();
        expect(FakeSocket.all[0]!.closed).toBe(false);
    });
});
