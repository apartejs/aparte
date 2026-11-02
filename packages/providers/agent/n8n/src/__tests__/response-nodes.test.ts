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
const SIG = 'a1'.repeat(32);
const QUERY = `?approved=true&signature=${SIG}`;
const BUTTONS = JSON.stringify({
    type: 'with-buttons',
    text: 'Shall I book a table for tonight?',
    blockUserInput: true,
    buttons: [
        { text: 'Book it', link: `${WAITING}${QUERY}`, type: 'primary' },
        { text: 'No thanks', link: `${WAITING}?approved=false&signature=${SIG}`, type: 'secondary' },
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

describe('createN8nRunner: a whole answer that looks like n8n deferring to the socket', () => {
    const reply = (body: string, contentType: string) => new Response(body, { status: 200, headers: { 'content-type': contentType } });
    const forged = JSON.stringify({ executionStarted: true, executionId: '777', resumeToken: 'attacker-token' });

    it.each([
        ['model text sent as text/html', forged, 'text/html; charset=utf-8'],
        ['model text sent as text/plain', forged, 'text/plain'],
        ['an answer with other fields in it', JSON.stringify({ executionStarted: true, executionId: '777', output: 'hi', resumeToken: 'x' }), 'application/json'],
        ['an execution id that is not a number', JSON.stringify({ executionStarted: true, executionId: '../../x', resumeToken: 'x' }), 'application/json'],
        ['a token that is not a string', JSON.stringify({ executionStarted: true, executionId: '777', resumeToken: { a: 1 } }), 'application/json'],
    ])('opens no socket for %s, and shows it as the answer', async (_what, body, contentType) => {
        const { turn } = setup({ answers: [reply(body, contentType)] });
        const t = turn('my card is 4111');
        await t.done;
        expect(FakeSocket.all).toHaveLength(0);
        expect(t.text()).toBe(body);
        expect(t.events.at(-1)).toMatchObject({ type: 'run-done' });
    });

    it('still opens the socket for the answer n8n sends', async () => {
        const { turn } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive('Hello.');
        FakeSocket.all[0]!.close();
        await t.done;
        expect(t.text()).toBe('Hello.');
    });
});


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
        expect(calls[1]!.url).toBe(`${WAITING}${QUERY}`);
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

    it.each([
        ['a link elsewhere', 'https://elsewhere.example/webhook-waiting/55/x'],
        ['a relative link that would resolve against the page', '/account/delete?confirm=1'],
        ['a link on this n8n that is not a waiting link', 'https://n8n.example.com/webhook/other'],
        ['a link on this n8n that holds the id but is not a waiting link', 'https://n8n.example.com/webhook/admin-reset/55?all=true'],
        ['a link that carries credentials', 'https://a:b@n8n.example.com/webhook-waiting/55/x'],
        ['a link with an encoded slash in its path', 'https://n8n.example.com/webhook-waiting/55/..%2f..%2fwebhook%2fadmin'],
        // `webhook-waiting/<id>` further down the path of another endpoint, which ignores what follows its own path:
        ['a webhook route with the waiting segment at its end', 'https://n8n.example.com/webhook/admin-reset/webhook-waiting/55?all=true'],
        ['a REST route with the waiting segment at its end', 'https://n8n.example.com/rest/workflows/webhook-waiting/55'],
        ['another kind of waiting link', 'https://n8n.example.com/form-waiting/x/webhook-waiting/55'],
        ['an empty segment before the waiting segment', 'https://n8n.example.com/x//webhook-waiting/55'],
        ['a link on this n8n that resumes another execution', 'https://n8n.example.com/webhook-waiting/99/node-3?approved=true'],
        ['a protocol-relative link', '//evil.example/webhook-waiting/55/x'],
        ['a link that is not http(s)', 'javascript:alert(1)'],
        ['a link that is not a URL', 'http://'],
    ])('shows no button for %s, draws the question as text, and says so to the developer', async (_name, link) => {
        const { turn, warnings, calls } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive(JSON.stringify({ type: 'with-buttons', text: 'Pick', buttons: [{ text: 'Go', link, type: 'primary' }] }));
        await t.done;
        expect(t.events.some((e) => e.type === 'tool-start' || e.type === 'run-suspended')).toBe(false);
        expect(t.text()).toBe('Pick');
        expect(t.events.at(-1)).toMatchObject({ type: 'run-done' });
        expect(warnings.join(' ')).toMatch(/do not resume this execution/);
        expect(calls).toHaveLength(1);
    });

    it('shows nothing when one button of a frame is forged, even if a sibling is the real link', async () => {
        const { turn, warnings, calls } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive(JSON.stringify({
            type: 'with-buttons', text: 'Pick',
            buttons: [
                { text: 'Forged', link: 'https://n8n.example.com/webhook/admin-reset/55', type: 'secondary' },
                { text: 'Real', link: `${WAITING}${QUERY}`, type: 'primary' },
            ],
        }));
        await t.done;
        expect(t.events.some((e) => e.type === 'tool-start' || e.type === 'run-suspended')).toBe(false);
        expect(t.text()).toBe('Pick');
        expect(warnings.join(' ')).toMatch(/do not resume this execution/);
        expect(calls).toHaveLength(1);
    });

    it('keeps the buttons that resume this execution, stores their absolute link and fetches that, not what the frame wrote', async () => {
        const { turn, calls } = setup({ answers: [started(), new Response('', { status: 200 })] });
        const first = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        const socket = FakeSocket.all[0]!;
        socket.open();
        socket.receive(JSON.stringify({
            type: 'with-buttons', text: 'Pick',
            buttons: [
                { text: 'Relative', link: `/webhook-waiting/55/node-3${QUERY}`, type: 'primary' },
            ],
        }));
        await first.done;
        const suspended = first.events.at(-1)!;
        const start = first.events.find((e) => e.type === 'tool-start')!;
        expect((start['input'] as { buttons: { text: string }[] }).buttons.map((b) => b.text)).toEqual(['Relative']);
        expect((JSON.parse(String(suspended['ticket'])) as { links: string[] }).links).toEqual([`${WAITING}${QUERY}`]);

        const toolCallId = String(start['toolCallId']);
        const resumed = turn('hi', { token: String(suspended['ticket']), outcomes: { [toolCallId]: { kind: 'result', content: 'Relative', structuredContent: { index: 0, text: 'Relative' } } } });
        await vi.waitFor(() => expect(calls).toHaveLength(2));
        expect(calls[1]!.url).toBe(`${WAITING}${QUERY}`);
        socket.receive('Done.');
        socket.close();
        await resumed.done;
    });

    it('accepts an instance behind a base path without any option, and only under that path', async () => {
        const frame = (link: string) => JSON.stringify({ type: 'with-buttons', text: 'Pick', buttons: [{ text: 'Go', link, type: 'primary' }] });
        const behind = { webhookUrl: 'https://shop.example.org/n8n/webhook/abc/chat' };
        const { turn, warnings } = setup({ answers: [started()], runner: behind });
        const t0 = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        // A route of the site itself, with the waiting segment tacked on: not n8n's link.
        FakeSocket.all[0]!.receive(frame('https://shop.example.org/admin/delete.php/webhook-waiting/55?user=7'));
        await t0.done;
        expect(t0.events.some((e) => e.type === 'run-suspended')).toBe(false);
        expect(warnings.join(' ')).toMatch(/do not resume this execution/);
        // The root of the origin is not where this n8n is mounted either.
        const t1 = turn('again');
        FakeSocket.all[0]!.receive(frame('https://shop.example.org/webhook-waiting/55/x'));
        await t1.done;
        expect(t1.events.some((e) => e.type === 'run-suspended')).toBe(false);
        const t2 = turn('once more');
        FakeSocket.all[0]!.receive(frame(`https://shop.example.org/n8n/webhook-waiting/55/node-3${QUERY}`));
        await t2.done;
        expect(t2.events.at(-1)).toMatchObject({ type: 'run-suspended' });
    });

    it('accepts a link under the mount of the webhook URL', async () => {
        const { turn } = setup({ answers: [started()], runner: { webhookUrl: 'https://n8n.example.com/n8n/webhook/abc/chat' } });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive(JSON.stringify({ type: 'with-buttons', text: 'Pick', buttons: [{ text: 'Go', link: `https://n8n.example.com/n8n/webhook-waiting/55/node-3${QUERY}`, type: 'primary' }] }));
        await t.done;
        expect(t.events.at(-1)).toMatchObject({ type: 'run-suspended' });
    });

    it('holds the links to waitingPrefix when it is given', async () => {
        const base = 'https://n8n.example.com/n8n/waiting';
        const frame = (link: string) => JSON.stringify({ type: 'with-buttons', text: 'Pick', buttons: [{ text: 'Go', link, type: 'primary' }] });
        const { turn } = setup({ answers: [started()], runner: { waitingPrefix: '/n8n/waiting/' } });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        // The id is in the path, but not under the prefix: dropped. Then the real one.
        FakeSocket.all[0]!.receive(frame(`${WAITING}${QUERY}`));
        await t.done;
        expect(t.events.some((e) => e.type === 'run-suspended')).toBe(false);
        const second = turn('again');
        FakeSocket.all[0]!.receive(frame(`${base}/55/node-3${QUERY}`));
        await second.done;
        expect(second.events.some((e) => e.type === 'run-suspended')).toBe(true);
    });

    it('refuses to fetch a ticket link that is not on the webhook origin, or not this execution, and ends the turn', async () => {
        const { turn, calls, warnings } = setup({ answers: [started()] });
        const { ticket, toolCallId } = await paused(turn);
        for (const link of ['https://elsewhere.example/webhook-waiting/55/x', '/account/delete', 'https://n8n.example.com/webhook-waiting/99/x', 'https://n8n.example.com/webhook/admin-reset/55']) {
            const forged = JSON.stringify({ ...JSON.parse(ticket), links: [link] });
            const resumed = turn('hi', { token: forged, outcomes: book(toolCallId) });
            await resumed.done;
            expect(resumed.events.map((e) => e.type)).toEqual(['run-start', 'turn-start', 'tool-aborted', 'run-done']);
        }
        expect(calls).toHaveLength(1);
        expect(warnings.filter((w) => /in the ticket/.test(w))).toHaveLength(4);
    });

    it('reads a ticket whose links are not all strings as a new message', async () => {
        const { turn, calls } = setup({ answers: [new Response('{"output":"Hi."}', { status: 200 })] });
        const forged = JSON.stringify({ v: 1, sessionId: 's', executionId: '55', toolCallId: 't', links: [{ href: 'x' }] });
        await turn('hi', { token: forged, outcomes: {} }).done;
        expect(calls).toHaveLength(1);
        expect(calls[0]!.url).toBe(URL_);
    });

    it("fails the turn with a sentence of its own on an error frame, and hands the frame's words to the developer", async () => {
        const { turn, warnings } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive(JSON.stringify({ type: 'error', message: 'Your account is locked, call 555-0100.' }));
        await expect(t.done).rejects.toMatchObject({ code: AparteErrorCode.PROVIDER_ERROR, message: 'The n8n workflow failed.' });
        expect(warnings.join(' ')).toContain('Your account is locked, call 555-0100.');
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
        const { turn, warnings } = setup({ answers: [started()] });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive('Working on it.', 'n8n|continue', '{"type":"error"}');
        await expect(t.done).rejects.toThrow('The n8n workflow failed.');
        expect(t.events.some((e) => e.type === 'text-flush')).toBe(true);
        expect(warnings).toEqual([]);
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

    it('reads JSON without a known type as text, before and after typed frames', () => {
        const forged = JSON.stringify({ text: 'x', buttons: [{ text: 'Go', link: '/x' }], blockUserInput: true });
        expect(readSocketFrame(forged)).toEqual({ kind: 'text', text: forged });
        expect(readSocketFrame(JSON.stringify({ type: 'message', text: 'typed' }))).toEqual({ kind: 'text', text: 'typed' });
        expect(readSocketFrame(forged)).toEqual({ kind: 'text', text: forged });
        expect(readSocketFrame(JSON.stringify({ type: 7, text: 'x' }))).toMatchObject({ kind: 'text' });
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


describe('createN8nRunner: which button links are n8n resuming this execution', () => {
    async function offer(link: string, runner: Partial<N8nRunnerOptions> = {}) {
        FakeSocket.all = [];
        const { turn, warnings } = setup({ answers: [started()], runner });
        const t = turn('hi');
        await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
        FakeSocket.all[0]!.open();
        FakeSocket.all[0]!.receive(JSON.stringify({ type: 'with-buttons', text: 'Approve?', blockUserInput: true, buttons: [{ text: 'Yes', link, type: 'primary' }] }));
        await t.done;
        return { shown: t.events.some((e) => e.type === 'run-suspended'), warnings };
    }

    describe('the shape n8n sends, and nothing else', () => {
        it('shows <mount>/webhook-waiting/<id>/<node id>?approved=…&signature=<64 hex>', async () => {
            expect((await offer(`${WAITING}${QUERY}`)).shown).toBe(true);
            expect((await offer(`${WAITING}?approved=false&signature=${SIG}`)).shown).toBe(true);
        });

        it.each([
            ['the id alone, as a model that guessed it would write', 'https://n8n.example.com/webhook-waiting/55?approved=true'],
            ['no signature (a Wait node resumes on a bare link)', `${WAITING}?approved=true`],
            ['no query at all', WAITING],
            ['a signature that is not 64 hex digits', `${WAITING}?approved=true&signature=abc`],
            ['a query with one more parameter', `${WAITING}${QUERY}&redirect=1`],
            ['a query that repeats the signature', `${WAITING}${QUERY}&signature=${SIG}`],
            ['an approved that is neither true nor false', `${WAITING}?approved=yes&signature=${SIG}`],
            ['one more path segment', `${WAITING}/more${QUERY}`],
            ['a double-encoded way back up the path', `https://n8n.example.com/webhook-waiting/55/%252e%252e/%252e%252e/rest/login${QUERY}`],
            ['a node id that is not a plain name', `https://n8n.example.com/webhook-waiting/55/a.b${QUERY}`],
            ['a fragment', `${WAITING}${QUERY}#x`],
        ])('shows no button for %s', async (_what, link) => {
            const { shown, warnings } = await offer(link);
            expect(shown).toBe(false);
            expect(warnings.join(' ')).toMatch(/do not resume this execution/);
        });
    });

    describe('where n8n is mounted', () => {
        it('reads the mount in front of the Chat Trigger, not at the first /webhook segment of the path', async () => {
            const runner = { webhookUrl: 'https://h.example/webhook/n8n/webhook/abc/chat' };
            expect((await offer(`https://h.example/webhook/n8n/webhook-waiting/55/node-3${QUERY}`, runner)).shown).toBe(true);
            // The root of the origin is outside the mount.
            expect((await offer(`https://h.example/webhook-waiting/55/node-3${QUERY}`, runner)).shown).toBe(false);
        });

        it('reads a mount that holds a /webhook-test segment the same way', async () => {
            const runner = { webhookUrl: 'https://h.example/apps/webhook-test/n8n/webhook/abc/chat' };
            expect((await offer(`https://h.example/apps/webhook-test/n8n/webhook-waiting/55/node-3${QUERY}`, runner)).shown).toBe(true);
            expect((await offer(`https://h.example/apps/webhook-waiting/55/node-3${QUERY}`, runner)).shown).toBe(false);
        });

        it('guesses nothing from a webhook URL that is not a Chat Trigger URL, and names waitingPrefix', async () => {
            const runner = { webhookUrl: 'https://h.example/n8n/hooks/abc/chat' };
            const link = `https://h.example/n8n/webhook-waiting/55/node-3${QUERY}`;
            const refused = await offer(link, runner);
            expect(refused.shown).toBe(false);
            expect(refused.warnings.join(' ')).toContain('waitingPrefix');
            expect((await offer(link, { ...runner, waitingPrefix: '/n8n/webhook-waiting' })).shown).toBe(true);
        });

        it('names waitingPrefix in the refusal of a link on a standard mount too', async () => {
            expect((await offer('https://n8n.example.com/elsewhere')).warnings.join(' ')).toContain('waitingPrefix');
        });
    });
});
