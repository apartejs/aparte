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
import { readSocketFrame } from '../socket.js';
import type { N8nRunnerOptions, N8nWebSocketLike } from '../index.js';

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

function setup({ answers = [] as (Response | Error)[], runner: extra = {} as Partial<N8nRunnerOptions> } = {}) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
        calls.push({ url, ...(init ? { init } : {}) });
        const next = answers.shift();
        if (!next) throw new Error('no scripted response left');
        if (next instanceof Error) throw next;
        return next;
    }) as unknown as typeof globalThis.fetch;
    const warnings: string[] = [];
    const runner = createN8nRunner({ webhookUrl: URL_, fetch, WebSocket: Socket, sessionId: 'conv-1', onWarning: (m) => warnings.push(m), ...extra });
    const turn = (content: string, deferral?: AparteStreamRunOptions['deferral'], signal = new AbortController().signal, files?: File[]) => {
        const events: Event[] = [];
        const done = runner({
            messageId: 'm', providerId: 'n8n', signal,
            baseRequest: { messages: [{ role: 'user', content }], modelId: 'n8n' },
            emitter: (e: Event) => events.push(e),
            transportCall: async () => { throw new Error('never called'); }, toolLookup: () => undefined,
            ...(deferral ? { deferral } : {}),
            ...(files ? { files } : {}),
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

    it('sends written words on the socket instead of a button, as n8n hears a message while it waits', async () => {
        const { turn, calls } = setup({ answers: [started()] });
        const first = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        const socket = FakeSocket.all[0]!;
        socket.open();
        socket.receive(BUTTONS);
        await first.done;
        const suspended = first.events.at(-1)!;
        const toolCallId = String((suspended['pending'] as { toolCallId: string }[])[0]!.toolCallId);
        const resumed = turn('hi', {
            token: String(suspended['ticket']),
            outcomes: { [toolCallId]: { kind: 'result', content: 'Tomorrow instead', structuredContent: { index: -1, text: 'Tomorrow instead', written: true } } },
        });
        await vi.waitFor(() => expect(socket.sent).toHaveLength(1));
        expect(JSON.parse(socket.sent[0]!)).toEqual({ sessionId: 'conv-1', action: 'sendMessage', chatInput: 'Tomorrow instead', files: [] });
        socket.receive('No booking, then.');
        await resumed.done;
        expect(calls).toHaveLength(1);
        expect(resumed.text()).toBe('No booking, then.');
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

    it("sends a file with a written reply as n8n's widget does, a data URL", async () => {
        const { turn } = setup({ answers: [started()] });
        const first = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        const socket = FakeSocket.all[0]!;
        socket.open();
        socket.receive('What name should it be under?');
        await first.done;
        const note = Object.assign(new Blob(['hi'], { type: 'text/plain' }), { name: 'note.txt' }) as unknown as File;
        const reply = turn('Paul', undefined, undefined, [note]);
        await vi.waitFor(() => expect(socket.sent.length).toBeGreaterThan(0));
        const sent = JSON.parse(socket.sent.at(-1)!) as { files: { name: string; type: string; data: string }[] };
        expect(sent.files).toEqual([{ name: 'note.txt', type: 'text/plain', data: 'data:text/plain;base64,aGk=' }]);
        socket.receive('Thanks.');
        socket.close();
        await reply.done;
    });

    it('starts a new execution when the socket closed between two turns, and closes nothing twice', async () => {
        const { turn, calls } = setup({ answers: [started(), started()] });
        const first = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive('What name should it be under?');
        await first.done;
        // n8n ends the execution while nobody listens: the next message posts again.
        FakeSocket.all[0]!.close();
        const second = turn('again');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
        expect(calls).toHaveLength(2);
        FakeSocket.all[1]!.open();
        FakeSocket.all[1]!.receive('Hello again.');
        FakeSocket.all[1]!.close();
        await second.done;
    });

    it('reads a deferral token it did not write as a new message', async () => {
        const { turn, calls } = setup({ answers: [new Response('{"output":"Hi."}', { status: 200 })] });
        await turn('hi', { token: 'not a ticket', outcomes: {} }).done;
        await turn('hi', { token: '{"v":2}', outcomes: {} }).done.catch(() => undefined);
        expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    /** A turn paused on BUTTONS, and its ticket and call id. */
    async function paused(turn: ReturnType<typeof setup>['turn']) {
        const before = FakeSocket.all.length;
        const first = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all.length).toBe(before + 1));
        const socket = FakeSocket.all.at(-1)!;
        socket.open();
        socket.receive(BUTTONS);
        await first.done;
        const suspended = first.events.at(-1)!;
        return { socket, ticket: String(suspended['ticket']), toolCallId: String((suspended['pending'] as { toolCallId: string }[])[0]!.toolCallId) };
    }
    const book = (toolCallId: string, written = false) => ({
        [toolCallId]: written
            ? { kind: 'result' as const, content: 'Later', structuredContent: { index: -1, text: 'Later', written: true } }
            : { kind: 'result' as const, content: 'Book it', structuredContent: { index: 0, text: 'Book it' } },
    });

    it('resumes on a socket of its own when the page was reloaded between the buttons and the answer', async () => {
        const before = setup({ answers: [started()] });
        const { ticket, toolCallId } = await paused(before.turn);
        // A new runner: the page reloaded, its sockets are gone, the ticket is all it has.
        const after = setup({ answers: [new Response('', { status: 200 })], runner: { credentials: 'include' } });
        const resumed = after.turn('hi', { token: ticket, outcomes: book(toolCallId) });
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
        expect(FakeSocket.all[1]!.url).toBe(FakeSocket.all[0]!.url);
        await vi.waitFor(() => expect(after.calls).toHaveLength(1));
        expect(after.calls[0]!.init?.credentials).toBe('include');
        FakeSocket.all[1]!.open();
        FakeSocket.all[1]!.receive('Booked.');
        FakeSocket.all[1]!.close();
        await resumed.done;

        const again = setup({ answers: [] });
        const written = again.turn('hi', { token: ticket, outcomes: book(toolCallId, true) });
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(3));
        FakeSocket.all[2]!.open();
        await vi.waitFor(() => expect(FakeSocket.all[2]!.sent).toHaveLength(1));
        FakeSocket.all[2]!.close();
        await written.done;
    });

    it("fails the resumed turn when the button's link cannot be reached, or n8n refuses it", async () => {
        const down = setup({ answers: [started(), new TypeError('Failed to fetch')] });
        const one = await paused(down.turn);
        await expect(down.turn('hi', { token: one.ticket, outcomes: book(one.toolCallId) }).done).rejects.toMatchObject({ code: AparteErrorCode.NET_ERROR });

        const refused = setup({ answers: [started(), new Response('{"message":"Signature mismatch"}', { status: 403 })] });
        const two = await paused(refused.turn);
        await expect(refused.turn('hi', { token: two.ticket, outcomes: book(two.toolCallId) }).done).rejects.toThrow(/Signature mismatch/);
    });

    it('fails with a sentence of its own on an error frame without words, after what was drawn', async () => {
        const { turn } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive('Working on it.', 'n8n|continue', '{"type":"error"}');
        await expect(t.done).rejects.toThrow('The n8n workflow failed.');
        expect(t.events.some((e) => e.type === 'text-flush')).toBe(true);
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

describe('readSocketFrame: what does not look like n8n reads as text', () => {
    it('reads a bare value or an unknown record as the message it is', () => {
        expect(readSocketFrame('42')).toEqual({ kind: 'text', text: '42' });
        expect(readSocketFrame('{"foo":1}')).toEqual({ kind: 'text', text: '{"foo":1}' });
        expect(readSocketFrame('{"type":"message"}')).toEqual({ kind: 'text', text: '' });
    });

    it('keeps the buttons it can read, styled primary by default, and an error without words', () => {
        expect(readSocketFrame(JSON.stringify({ type: 'with-buttons', buttons: [{ text: 'Go', link: '/x' }, { text: 'Bad' }, 'nope'] })))
            .toEqual({ kind: 'buttons', text: '', blockUserInput: false, buttons: [{ text: 'Go', link: '/x', type: 'primary' }] });
        expect(readSocketFrame(JSON.stringify({ type: 'with-buttons', text: 'Pick', buttons: 'none' })))
            .toEqual({ kind: 'buttons', text: 'Pick', blockUserInput: false, buttons: [] });
        expect(readSocketFrame('{"type":"error"}')).toEqual({ kind: 'error', message: '' });
    });
});

describe('N8nChatSocket', () => {
    it('answers closed once closed, nothing once stopped, and sends only once open', async () => {
        const { N8nChatSocket } = await import('../socket.js');
        const socket = new N8nChatSocket('wss://x/chat', Socket);
        const raw = FakeSocket.all.at(-1)!;
        const stopped = new AbortController();
        stopped.abort();
        expect(await socket.next(stopped.signal)).toBeUndefined();
        const sending = socket.send({ hello: 1 });
        expect(raw.sent).toEqual([]);
        raw.open();
        await sending;
        expect(raw.sent).toEqual(['{"hello":1}']);
        // An error is followed by the close that says it is over: nothing of its own.
        raw.onerror?.({});
        socket.close();
        expect(await socket.next(new AbortController().signal)).toEqual({ kind: 'closed' });
        expect(await socket.next(new AbortController().signal)).toEqual({ kind: 'closed' });
    });
});

