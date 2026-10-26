/**
 * createN8nRunner — an n8n chat workflow's answer, drawn by aparté.
 *
 * Every test replays an answer from a fake `fetch` and reads what the runner hands the
 * client's adapter. The `fixtures/` answers were recorded from a live n8n 2.35.7, byte
 * for byte; the synthetic ones cover what a recording cannot provoke on demand.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AparteError, AparteErrorCode } from '@aparte/core';
import type { AparteStreamRunOptions } from '@aparte/core';
import { createN8nRunner } from '../index.js';
import type { N8nRunnerOptions } from '../index.js';

type Event = { type: string; [key: string]: unknown };
interface Recorded { status: number; contentType: string; body: string }

const fixture = (name: string): Recorded =>
    JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as Recorded;

/** A response whose body arrives in the given pieces, as a network delivers it. */
function respond(body: string | Uint8Array[], { status = 200, contentType = 'application/json; charset=utf-8' } = {}): Response {
    const chunks = typeof body === 'string' ? [new TextEncoder().encode(body)] : body;
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    });
    return new Response(status === 204 ? null : stream, { status, headers: { 'content-type': contentType } });
}

const replay = (recorded: Recorded) => respond(recorded.body, recorded);

/** Every byte its own chunk: a line, a JSON value and a UTF-8 character all split. */
const byteByByte = (text: string) => Array.from(new TextEncoder().encode(text), (byte) => new Uint8Array([byte]));

const frames = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
const meta = (nodeId: string, runIndex = 0) => ({ metadata: { nodeId, nodeName: nodeId, itemIndex: 0, runIndex } });

function fakeFetch(...responses: (Response | (() => Response | Promise<Response>))[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const next = responses.shift();
        if (!next) throw new Error('no scripted response left');
        return typeof next === 'function' ? next() : next;
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
}

type Content = string | ({ type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string })[];

function run(fetch: typeof globalThis.fetch, {
    runner = {} as Partial<N8nRunnerOptions>,
    messages = [{ role: 'user', content: 'Combien font 6*7 ?' }] as { role: string; content: Content }[],
    signal = new AbortController().signal,
} = {}) {
    const events: Event[] = [];
    const opts = {
        messageId: 'm1',
        providerId: 'n8n',
        baseRequest: { messages, modelId: 'n8n', stream: true },
        transportCall: async () => { throw new Error('never called'); },
        toolLookup: () => undefined,
        emitter: (e: Event) => events.push(e),
        signal,
    } as unknown as AparteStreamRunOptions;
    const make = createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat', fetch, ...runner });
    return { done: make(opts), events, types: () => events.map((e) => e.type), text: () => events.filter((e) => e.type === 'text-delta').map((e) => e.delta).join('') };
}

const sentBody = (call: { init: RequestInit }) => JSON.parse(String(call.init.body)) as Record<string, unknown>;

const ANSWER = 'Bonjour ! Voici une **réponse** de test.\n\n- un point\n- un autre';

describe('createN8nRunner: what it sends', () => {
    it("sends the person's last message as n8n's widget does, in a session that lasts the runner's lifetime", async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('stream-tool')), replay(fixture('stream-tool')));
        const runner = createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat', fetch });
        const opts = (content: string) => ({
            messageId: 'm', providerId: 'n8n', signal: new AbortController().signal, emitter: () => {},
            baseRequest: { messages: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }, { role: 'user', content }], modelId: 'n8n' },
            transportCall: async () => { throw new Error('never called'); }, toolLookup: () => undefined,
        }) as unknown as AparteStreamRunOptions;
        await runner(opts('first'));
        await runner(opts('second'));

        expect(calls[0]!.url).toBe('https://n8n.example.com/webhook/abc/chat');
        expect(calls[0]!.init.method).toBe('POST');
        expect(calls[0]!.init.headers).toEqual({ Accept: 'text/plain', 'Content-Type': 'application/json' });
        const [first, second] = calls.map(sentBody);
        expect(first).toEqual({ action: 'sendMessage', sessionId: expect.stringMatching(/^aparte-/), chatInput: 'first' });
        expect(second!['chatInput']).toBe('second');
        // n8n keeps the memory per session: the second turn continues the first.
        expect(second!['sessionId']).toBe(first!['sessionId']);
    });

    it('gives each runner its own session by default', async () => {
        const a = fakeFetch(replay(fixture('last-node')));
        const b = fakeFetch(replay(fixture('last-node')));
        await run(a.fetch).done;
        await run(b.fetch).done;
        expect(sentBody(a.calls[0]!)['sessionId']).not.toBe(sentBody(b.calls[0]!)['sessionId']);
    });

    it('takes the session from a string, or from a function read on every turn', async () => {
        const fixed = fakeFetch(replay(fixture('last-node')));
        await run(fixed.fetch, { runner: { sessionId: 'conv-42' } }).done;
        expect(sentBody(fixed.calls[0]!)['sessionId']).toBe('conv-42');

        let conversation = 'conv-1';
        const seen: AparteStreamRunOptions[] = [];
        const read = fakeFetch(replay(fixture('last-node')), replay(fixture('last-node')));
        const runner = { sessionId: (opts: AparteStreamRunOptions) => { seen.push(opts); return conversation; } };
        await run(read.fetch, { runner }).done;
        conversation = 'conv-2';
        await run(read.fetch, { runner }).done;
        expect(read.calls.map((c) => sentBody(c)['sessionId'])).toEqual(['conv-1', 'conv-2']);
        expect(seen[0]!.messageId).toBe('m1');
    });

    it('sends metadata, from an object or a function, and leaves it out otherwise', async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('last-node')), replay(fixture('last-node')), replay(fixture('last-node')));
        await run(fetch, { runner: { metadata: { page: '/pricing' } } }).done;
        await run(fetch, { runner: { metadata: (opts) => ({ message: opts.messageId }) } }).done;
        await run(fetch).done;
        expect(sentBody(calls[0]!)['metadata']).toEqual({ page: '/pricing' });
        expect(sentBody(calls[1]!)['metadata']).toEqual({ message: 'm1' });
        expect('metadata' in sentBody(calls[2]!)).toBe(false);
    });

    it('sends headers from an object or from a function called per request, with credentials when asked', async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('last-node')), replay(fixture('last-node')));
        await run(fetch, { runner: { headers: { authorization: 'Basic abc' }, credentials: 'include' } }).done;
        let n = 0;
        await run(fetch, { runner: { headers: async () => ({ authorization: `Bearer ${++n}` }) } }).done;
        expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Basic abc', Accept: 'text/plain' });
        expect(calls[0]!.init.credentials).toBe('include');
        expect(calls[1]!.init.headers).toMatchObject({ authorization: 'Bearer 1' });
        expect('credentials' in calls[1]!.init).toBe(false);
    });

    it('names the session and message fields as a workflow reads them', async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('last-node')));
        await run(fetch, { runner: { chatSessionKey: 'conversation', chatInputKey: 'question' } }).done;
        expect(sentBody(calls[0]!)).toEqual({ action: 'sendMessage', conversation: expect.any(String), question: 'Combien font 6*7 ?' });
    });

    it("sends the text of a message's parts a paragraph apart, and an empty message when the person wrote none", async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('last-node')), replay(fixture('last-node')));
        await run(fetch, { messages: [{ role: 'user', content: [{ type: 'text', text: 'Bon' }, { type: 'text', text: 'jour' }] }] }).done;
        await run(fetch, { messages: [{ role: 'system', content: 'You are helpful.' }] }).done;
        // A text file inlined after the words starts on a line of its own, its fence intact.
        expect(sentBody(calls[0]!)['chatInput']).toBe('Bon\n\njour');
        expect(sentBody(calls[1]!)['chatInput']).toBe('');
    });

    it('sends the images of the message as files, in a form, the way the Chat Trigger takes uploads', async () => {
        const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        const { fetch, calls } = fakeFetch(replay(fixture('stream-with-file')));
        const r = run(fetch, {
            runner: { sessionId: 's1', metadata: { page: '/' } },
            messages: [{ role: 'user', content: [
                { type: 'text', text: 'Que vois-tu ?' },
                { type: 'image', image: `data:image/png;base64,${png}` },
                { type: 'image', image: `data:image/jpeg;name=photo.jpg;base64,${png}`, mimeType: 'image/jpeg' },
                { type: 'image', image: 'https://example.com/not-inline.png' },
            ] }],
        });
        await r.done;
        const form = calls[0]!.init.body as FormData;
        expect(form).toBeInstanceOf(FormData);
        expect(form.get('action')).toBe('sendMessage');
        expect(form.get('sessionId')).toBe('s1');
        expect(form.get('chatInput')).toBe('Que vois-tu ?');
        expect(form.get('metadata')).toBe('{"page":"/"}');
        const files = form.getAll('files') as File[];
        expect(files.map((f) => [f.name, f.type])).toEqual([['image-1.png', 'image/png'], ['image-2.jpg', 'image/jpeg']]);
        expect(Buffer.from(await files[0]!.arrayBuffer()).toString('base64')).toBe(png);
        // The browser writes the multipart boundary: no Content-Type of ours.
        expect(calls[0]!.init.headers).toEqual({ Accept: 'text/plain' });
        expect(r.text()).toBe(ANSWER);
    });

    it('names an image file by its type, and falls back for a type it does not know', async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('last-node')));
        await run(fetch, { messages: [{ role: 'user', content: [{ type: 'image', image: 'data:;base64,AAAA' }, { type: 'image', image: 'data:image/avif;base64,AAAA' }] }] }).done;
        const files = (calls[0]!.init.body as FormData).getAll('files') as File[];
        expect(files.map((f) => [f.name, f.type])).toEqual([['image-1.bin', 'application/octet-stream'], ['image-2.bin', 'image/avif']]);
    });
});

describe('createN8nRunner: what it draws (recorded from n8n 2.35.7)', () => {
    it("streams an agent's answer, after the agent ran a tool n8n does not report", async () => {
        const r = run(fakeFetch(replay(fixture('stream-tool'))).fetch);
        await expect(r.done).resolves.toBeUndefined();
        expect(r.types()).toEqual(['run-start', 'turn-start', ...Array(6).fill('text-delta'), 'text-flush', 'run-done']);
        expect(r.text()).toBe(ANSWER);
    });

    it('draws two agents that stream one after the other as two blocks, in order', async () => {
        const r = run(fakeFetch(replay(fixture('stream-two-agents'))).fetch);
        await r.done;
        const flush = r.types().indexOf('text-flush');
        const before = r.events.slice(0, flush).filter((e) => e.type === 'text-delta').map((e) => e.delta).join('');
        const after = r.events.slice(flush).filter((e) => e.type === 'text-delta').map((e) => e.delta).join('');
        expect(before).toBe(ANSWER);
        expect(after).toBe('Le second agent a lu la première réponse.');
        expect(r.types().filter((t) => t === 'text-flush')).toHaveLength(2);
        expect(r.types().at(-1)).toBe('run-done');
    });

    it('draws the whole answer of a workflow that does not stream', async () => {
        const r = run(fakeFetch(replay(fixture('last-node'))).fetch);
        await r.done;
        expect(r.events).toEqual([
            { type: 'run-start' }, { type: 'turn-start' },
            { type: 'text-delta', delta: ANSWER }, { type: 'text-flush' }, { type: 'run-done' },
        ]);
    });

    it('reads the same answer whatever pieces the network cuts it into, characters included', async () => {
        for (const name of ['stream-tool', 'stream-two-agents', 'last-node']) {
            const whole = run(fakeFetch(replay(fixture(name))).fetch);
            const cut = run(fakeFetch(respond(byteByByte(fixture(name).body))).fetch);
            await Promise.all([whole.done, cut.done]);
            expect(cut.text()).toBe(whole.text());
            expect(cut.types().filter((t) => t !== 'text-delta')).toEqual(whole.types().filter((t) => t !== 'text-delta'));
        }
    });

    it('says what to change when the trigger streams but the agent does not: n8n answers nothing', async () => {
        const r = run(fakeFetch(replay(fixture('stream-disabled-in-agent'))).fetch);
        const error = await r.done.catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AparteError);
        expect((error as AparteError).code).toBe(AparteErrorCode.PROVIDER_MISCONFIGURED);
        expect((error as AparteError).message).toMatch(/turn on streaming in the AI Agent's options/);
    });

    it("fails with the workflow's own error when it breaks mid-stream", async () => {
        const r = run(fakeFetch(replay(fixture('stream-model-error'))).fetch);
        const error = await r.done.catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AparteError);
        expect((error as AparteError).message).toBe('The model is down (scripted failure).');
        expect(r.types()).toEqual(['run-start', 'turn-start']);
    });

    it('keeps the text drawn before a failure, closed, and fails below it', async () => {
        const r = run(fakeFetch(respond(frames(
            { type: 'begin', ...meta('a') },
            { type: 'item', content: 'Half an ', ...meta('a') },
            { type: 'error', content: '', ...meta('a') },
        ))).fetch);
        const error = await r.done.catch((e: unknown) => e);
        expect((error as AparteError).message).toBe('The n8n workflow failed.');
        expect(r.types()).toEqual(['run-start', 'turn-start', 'text-delta', 'text-flush']);
    });

    it("says an inactive workflow's webhook is not registered, with n8n's hint and the HTTP status", async () => {
        const r = run(fakeFetch(replay(fixture('inactive-webhook'))).fetch);
        const error = await r.done.catch((e: unknown) => e) as AparteError;
        expect(error).toBeInstanceOf(AparteError);
        expect(error.message).toMatch(/^The requested webhook "POST hook-does-not-exist\/chat" is not registered\. The workflow must be active/);
        expect(error.message.length).toBeLessThanOrEqual(400);
        expect(error.httpStatus).toBe(404);
        expect(r.events).toEqual([]);
    });
});

describe('createN8nRunner: streams n8n can send', () => {
    it("holds back a second node's text while the first streams, then draws it below", async () => {
        const r = run(fakeFetch(respond(frames(
            { type: 'begin', ...meta('a') },
            { type: 'begin', ...meta('b') },
            { type: 'item', content: 'A1 ', ...meta('a') },
            { type: 'item', content: 'B1 ', ...meta('b') },
            { type: 'item', content: 'A2', ...meta('a') },
            { type: 'item', content: 'B2', ...meta('b') },
            { type: 'end', ...meta('b') },
            { type: 'end', ...meta('a') },
        ))).fetch);
        await r.done;
        expect(r.events).toEqual([
            { type: 'run-start' }, { type: 'turn-start' },
            { type: 'text-delta', delta: 'A1 ' }, { type: 'text-delta', delta: 'A2' },
            { type: 'text-flush' },
            { type: 'text-delta', delta: 'B1 ' }, { type: 'text-delta', delta: 'B2' },
            { type: 'text-flush' }, { type: 'run-done' },
        ]);
    });

    it('goes on drawing a held-back stream live once it is the one drawn', async () => {
        const r = run(fakeFetch(respond(frames(
            { type: 'item', content: 'A ', ...meta('a') },
            { type: 'item', content: 'B1 ', ...meta('b') },
            { type: 'item', content: 'C ', ...meta('c') },
            { type: 'end', ...meta('c') },
            { type: 'end', ...meta('a') },
            { type: 'item', content: 'B2', ...meta('b') },
            { type: 'end', ...meta('b') },
        ))).fetch);
        await r.done;
        expect(r.text()).toBe('A B1 B2C ');
        expect(r.types().filter((t) => t === 'text-flush')).toHaveLength(3);
    });

    it('tells apart two runs of the same node', async () => {
        const r = run(fakeFetch(respond(frames(
            { type: 'begin', ...meta('a', 0) }, { type: 'item', content: 'first', ...meta('a', 0) }, { type: 'end', ...meta('a', 0) },
            { type: 'begin', ...meta('a', 1) }, { type: 'item', content: 'second', ...meta('a', 1) }, { type: 'end', ...meta('a', 1) },
        ))).fetch);
        await r.done;
        expect(r.types()).toEqual(['run-start', 'turn-start', 'text-delta', 'text-flush', 'text-delta', 'text-flush', 'run-done']);
    });

    it('keeps the text of a stream cut before its end, and what was still held back', async () => {
        const r = run(fakeFetch(respond(frames(
            { type: 'begin', ...meta('a') },
            { type: 'item', content: 'A', ...meta('a') },
            { type: 'item', content: 'B', ...meta('b') },
            { type: 'end', ...meta('b') },
        ))).fetch);
        await r.done;
        expect(r.text()).toBe('AB');
        expect(r.types().at(-1)).toBe('run-done');
    });

    it('reads frames that leave fields out: no metadata is one stream, content that is not text is none', async () => {
        const r = run(fakeFetch(respond(frames(
            { type: 'begin', ...meta('a') },
            { type: 'item', content: 'kept', ...meta('a') },
            { type: 'item', content: { not: 'text' }, ...meta('a') },
            { type: 'end', ...meta('a') },
            { type: 'item', content: ' and this' },
            { type: 'end' },
        ))).fetch);
        await r.done;
        expect(r.text()).toBe('kept and this');
        const failed = run(fakeFetch(respond(frames({ type: 'begin', ...meta('a') }, { type: 'error', content: 7, ...meta('a') }))).fetch);
        await expect(failed.done).rejects.toThrow('The n8n workflow failed.');
    });

    it("draws a line that is not a frame as text, as n8n's widget does", async () => {
        const r = run(fakeFetch(respond(frames({ type: 'begin', ...meta('a') }, { type: 'item', content: 'Hi', ...meta('a') }) + 'plain words\n')).fetch);
        await r.done;
        expect(r.text()).toBe('Hiplain words');
    });

    it('skips a frame type it does not know and says so once', async () => {
        const warnings: string[] = [];
        const r = run(fakeFetch(respond(frames(
            { type: 'progress', ...meta('a') },
            { type: 'item', content: 'ok', ...meta('a') },
            { type: 'progress', ...meta('a') },
        ))).fetch, { runner: { onWarning: (m) => warnings.push(m) } });
        await r.done;
        expect(r.text()).toBe('ok');
        expect(warnings).toEqual(['n8n sent a "progress" frame, which this runner does not read; it was skipped.']);
    });

    it('warns on the console when given no onWarning', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await run(fakeFetch(respond(frames({ type: 'progress', ...meta('a') }, { type: 'item', content: 'ok', ...meta('a') }))).fetch).done;
        expect(warn).toHaveBeenCalledWith('[aparte] n8n: n8n sent a "progress" frame, which this runner does not read; it was skipped.');
        warn.mockRestore();
    });

    it('fails as a stream that answered nothing when every node streamed empty', async () => {
        const r = run(fakeFetch(respond(frames({ type: 'begin', ...meta('a') }, { type: 'item', content: '', ...meta('a') }, { type: 'end', ...meta('a') }))).fetch);
        await expect(r.done).rejects.toThrow(/streamed nothing/);
    });

    it('reports a proxy that gave up waiting, before or during the stream', async () => {
        const page = '<!DOCTYPE html><html><body>504 Gateway Time-out</body></html>';
        for (const body of [page, frames({ type: 'item', content: 'Hel', ...meta('a') }) + page + '\n']) {
            const r = run(fakeFetch(respond(body, { contentType: 'text/html' })).fetch);
            const error = await r.done.catch((e: unknown) => e) as AparteError;
            expect(error.code).toBe(AparteErrorCode.NET_TIMEOUT);
            expect(error.message).toMatch(/proxy timed out/);
        }
    });
});

describe('createN8nRunner: answers that do not stream', () => {
    const whole = async (body: string, contentType?: string) => {
        const r = run(fakeFetch(respond(body, contentType ? { contentType } : {})).fetch);
        await r.done;
        return r.text();
    };

    it("reads the answer's text the way n8n's widget does", async () => {
        expect(await whole('{"text":"from text"}')).toBe('from text');
        expect(await whole('{"message":"from message"}')).toBe('from message');
        expect(await whole('{"output":{"type":"text","text":"from a part"}}')).toBe('from a part');
        expect(await whole('{\n  "output": "pretty-printed"\n}\n')).toBe('pretty-printed');
        expect(await whole('[{"output":"one"},{"output":"two"}]')).toBe('one\n\ntwo');
        expect(await whole('"a JSON string"')).toBe('a JSON string');
    });

    it("names the fields a workflow's JSON carried when none of them is the answer, instead of printing it", async () => {
        // n8n's widget printed the JSON into the bubble: its forum's most asked-about failure.
        const r = run(fakeFetch(respond('{"status":"queued","id":7}')).fetch);
        await expect(r.done).rejects.toThrow(/answered with the fields "status", "id" but no "output", "text" or "message" field/);
        const list = run(fakeFetch(respond('[{"rows":3}]')).fetch);
        await expect(list.done).rejects.toThrow(/the fields "rows"/);
        expect(await whole('42')).toBe('42');
        expect(await whole('{"output":12}')).toBe('12');
    });

    it('reads a whole answer whose JSON has a type and metadata as an answer, not as a stream', async () => {
        expect(await whole('{"type":"order","metadata":{"ref":"A1"},"output":"Order A1 is on its way."}')).toBe('Order A1 is on its way.');
    });

    it('draws a whole answer that holds an HTML page in its text, which is not a proxy page', async () => {
        const html = 'Here:\n```html\n<!DOCTYPE html>\n<html><body>Hi</body></html>\n```';
        expect(await whole(JSON.stringify({ output: html }))).toBe(html);
    });

    it('draws a text answer as it came', async () => {
        expect(await whole('Thanks, we will call you back.', 'text/plain')).toBe('Thanks, we will call you back.');
    });

    it('fails on an answer with nothing to show, saying it is the last node that returned no text', async () => {
        for (const body of ['{}', 'null', '{"output":""}']) {
            await expect(run(fakeFetch(respond(body)).fetch).done).rejects.toThrow(/finished without an answer/);
        }
        // Blank is what a trigger that streams sends when its agent does not.
        await expect(run(fakeFetch(respond('   \n')).fetch).done).rejects.toThrow(/streamed nothing/);
    });

    it('says the workflow answers through response nodes, which it does not read', async () => {
        const r = run(fakeFetch(respond('{"executionStarted":true,"executionId":"12"}')).fetch);
        await expect(r.done).rejects.toThrow(/answers through response nodes/);
        await expect(r.done).rejects.toMatchObject({ code: AparteErrorCode.PROVIDER_MISCONFIGURED });
    });

    it('fails as an empty answer when there is no body at all', async () => {
        const r = run(fakeFetch(respond('', { status: 204 })).fetch);
        await expect(r.done).rejects.toThrow(/streamed nothing/);
        await expect(r.done).rejects.toMatchObject({ code: AparteErrorCode.PROVIDER_MISCONFIGURED });
    });
});

describe('createN8nRunner: HTTP failures', () => {
    it("reads n8n's JSON error, else the text, else the status", async () => {
        const cases: [Response, RegExp | string, number][] = [
            [respond('{"code":500,"message":"Error in workflow"}', { status: 500 }), 'Error in workflow', 500],
            [respond('Bad gateway', { status: 502, contentType: 'text/plain' }), 'Bad gateway', 502],
            [respond('{"message":42}', { status: 500 }), '{"message":42}', 500],
            [respond('', { status: 500 }), 'The n8n workflow answered HTTP 500.', 500],
        ];
        for (const [response, message, status] of cases) {
            const error = await run(fakeFetch(response).fetch).done.catch((e: unknown) => e) as AparteError;
            expect(error.message).toBe(message);
            expect(error.httpStatus).toBe(status);
            expect(error.code).toBe(AparteErrorCode.PROVIDER_ERROR);
        }
    });

    it("maps the status to aparté's error code", async () => {
        const auth = await run(fakeFetch(respond('Authorization data is wrong!', { status: 403, contentType: 'text/plain' })).fetch).done.catch((e: unknown) => e) as AparteError;
        expect(auth.code).toBe(AparteErrorCode.CONFIG_INVALID_KEY);
        const busy = await run(fakeFetch(respond('', { status: 429 })).fetch).done.catch((e: unknown) => e) as AparteError;
        expect(busy.code).toBe(AparteErrorCode.USAGE_RATE_LIMIT);
        // A workflow that is not published: set up so it cannot answer, not failing.
        const missing = await run(fakeFetch(respond('', { status: 404 })).fetch).done.catch((e: unknown) => e) as AparteError;
        expect(missing.code).toBe(AparteErrorCode.PROVIDER_MISCONFIGURED);
    });

    it('says what to check when n8n cannot be reached, which is also how a refused origin looks', async () => {
        const fetch = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof globalThis.fetch;
        const error = await run(fetch).done.catch((e: unknown) => e) as AparteError;
        expect(error).toBeInstanceOf(AparteError);
        expect(error.code).toBe(AparteErrorCode.NET_ERROR);
        expect(error.message).toMatch(/^Could not reach n8n at https:\/\/n8n\.example\.com\/webhook\/abc\/chat\..*production URL.*published.*Allowed Origins \(CORS\)/);
    });

    it('lets any other failure of the fetch through as it is', async () => {
        const fetch = (async () => { throw new RangeError('a bug of ours'); }) as unknown as typeof globalThis.fetch;
        await expect(run(fetch).done).rejects.toThrow('a bug of ours');
    });
});

describe('createN8nRunner: Stop', () => {
    it('passes the signal to the request, and ends quietly when the request is stopped', async () => {
        const controller = new AbortController();
        const fetch = ((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })) as unknown as typeof globalThis.fetch;
        const r = run(fetch, { signal: controller.signal });
        controller.abort();
        await expect(r.done).resolves.toBeUndefined();
        expect(r.events).toEqual([]);
    });

    it('ends quietly when stopped in the middle of the stream, keeping what was drawn', async () => {
        const controller = new AbortController();
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
            start(c) { c.enqueue(encoder.encode(frames({ type: 'begin', ...meta('a') }, { type: 'item', content: 'Hel', ...meta('a') }))); },
            pull() {
                controller.abort();
                throw new DOMException('Aborted', 'AbortError');
            },
        });
        const r = run(fakeFetch(new Response(body, { headers: { 'content-type': 'application/json' } })).fetch, { signal: controller.signal });
        await expect(r.done).resolves.toBeUndefined();
        expect(r.text()).toBe('Hel');
        expect(r.types()).not.toContain('run-done');
    });
});

describe('createN8nRunner: what it draws (recorded from n8n 2.44.6, a real model)', () => {
    it('reads a stream that opens on a keepalive, sent while a slow node runs before the agent', async () => {
        const warnings: string[] = [];
        const r = run(fakeFetch(replay(fixture('v2.44-stream-keepalive'))).fetch, { runner: { onWarning: (m) => warnings.push(m) } });
        await r.done;
        expect(r.text()).toBe('Hello! Enjoy this sweet moment.');
        expect(warnings).toEqual([]);
    });

    it('draws a tool turn as one answer: the agent streams an empty block before the call, then the reply', async () => {
        const r = run(fakeFetch(replay(fixture('v2.44-stream-tool'))).fetch);
        await r.done;
        expect(r.text()).toBe('It will cost $5.55 for 3 croissants at $1.85 each.');
        expect(r.types().filter((t) => t === 'text-flush')).toHaveLength(1);
    });

    it("draws a turn that reads the session's memory, and one that read an uploaded text file", async () => {
        const memory = run(fakeFetch(replay(fixture('v2.44-stream-memory'))).fetch);
        const file = run(fakeFetch(replay(fixture('v2.44-stream-text-file'))).fetch);
        await Promise.all([memory.done, file.done]);
        expect(memory.text()).toBe('You asked, "Hello! What do you sell?"');
        expect(file.text()).toBe('Thank you! I can confirm your order: 2 baguettes and 1 sourdough.');
    });

    it("fails with the model's own words when it refuses the turn mid-stream", async () => {
        const r = run(fakeFetch(replay(fixture('v2.44-stream-image-refused'))).fetch);
        await expect(r.done).rejects.toThrow('The provided messages contain images, but gemma-e2b does not support image inputs.');
    });

    it('draws a whole answer whose text holds markup', async () => {
        const r = run(fakeFetch(replay(fixture('v2.44-last-node'))).fetch);
        await r.done;
        expect(r.text()).toMatch(/^Here is a tiny snippet[\s\S]*<a href="\/product-link"[\s\S]*```$/);
    });

    it('reads every recording the same whatever pieces the network cuts it into', async () => {
        for (const name of ['v2.44-stream-keepalive', 'v2.44-stream-tool', 'v2.44-last-node']) {
            const whole = run(fakeFetch(replay(fixture(name))).fetch);
            const cut = run(fakeFetch(respond(byteByByte(fixture(name).body))).fetch);
            await Promise.all([whole.done, cut.done]);
            expect(cut.text()).toBe(whole.text());
        }
    });
});

describe('createN8nRunner: sessions', () => {
    const turn = (runner: ReturnType<typeof createN8nRunner>, messages: { role: string; content: string }[]) => runner({
        messageId: 'm', providerId: 'n8n', signal: new AbortController().signal, emitter: () => {},
        baseRequest: { messages, modelId: 'n8n' },
        transportCall: async () => { throw new Error('never called'); }, toolLookup: () => undefined,
    } as unknown as AparteStreamRunOptions);

    it('starts a new session for a new conversation and continues it after, so n8n never mixes two memories', async () => {
        const { fetch, calls } = fakeFetch(...Array.from({ length: 4 }, () => replay(fixture('last-node'))));
        const runner = createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat', fetch });
        await turn(runner, [{ role: 'user', content: 'one' }]);
        await turn(runner, [{ role: 'user', content: 'one' }, { role: 'assistant', content: 'A' }, { role: 'user', content: 'two' }]);
        // A new chat: no reply before the message.
        await turn(runner, [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'fresh' }]);
        await turn(runner, [{ role: 'user', content: 'fresh' }, { role: 'assistant', content: 'B' }, { role: 'user', content: 'again' }]);
        const sessions = calls.map((c) => sentBody(c)['sessionId']);
        expect(sessions[1]).toBe(sessions[0]);
        expect(sessions[2]).not.toBe(sessions[0]);
        expect(sessions[3]).toBe(sessions[2]);
    });

    it('keeps the session it is given, even for a new conversation', async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('last-node')), replay(fixture('last-node')));
        const runner = createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat', fetch, sessionId: 'kept' });
        await turn(runner, [{ role: 'user', content: 'one' }]);
        await turn(runner, [{ role: 'user', content: 'two' }]);
        expect(calls.map((c) => sentBody(c)['sessionId'])).toEqual(['kept', 'kept']);
    });
});

describe('createN8nRunner: files the client hands over', () => {
    it('uploads every file picked, whatever its type, under their own names, instead of the inlined images', async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('v2.44-stream-text-file')));
        const events: Event[] = [];
        const pdf = new File([new Uint8Array([37, 80, 68, 70])], 'menu.pdf', { type: 'application/pdf' });
        const txt = new File(['- 2 baguettes'], 'order.txt', { type: 'text/plain' });
        const runner = createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat', fetch, sessionId: 's' });
        await runner({
            messageId: 'm', providerId: 'n8n', signal: new AbortController().signal, emitter: (e: Event) => events.push(e),
            baseRequest: { messages: [{ role: 'user', content: [{ type: 'text', text: 'Can you confirm?' }, { type: 'image', image: 'data:image/png;base64,AAAA' }] }], modelId: 'n8n' },
            transportCall: async () => { throw new Error('never called'); }, toolLookup: () => undefined,
            files: [pdf, txt],
        } as unknown as AparteStreamRunOptions);
        const form = calls[0]!.init.body as FormData;
        expect(form.get('chatInput')).toBe('Can you confirm?');
        expect((form.getAll('files') as File[]).map((f) => [f.name, f.type])).toEqual([['menu.pdf', 'application/pdf'], ['order.txt', 'text/plain']]);
        expect(events.some((e) => e.type === 'text-delta')).toBe(true);
    });
});

describe('createN8nRunner: what a proxy or n8n refuses', () => {
    const fail = async (response: Response) => run(fakeFetch(response).fetch).done.catch((e: unknown) => e) as Promise<AparteError>;

    it("says a proxy gave up on a 502 or 504 page, without showing the page's markup", async () => {
        for (const status of [502, 504]) {
            const error = await fail(respond('<html><head><title>504 Gateway Time-out</title></head><body>nginx</body></html>', { status, contentType: 'text/html' }));
            expect(error.code).toBe(AparteErrorCode.NET_TIMEOUT);
            expect(error.message).toContain(`gave up waiting (HTTP ${status})`);
            expect(error.message).not.toContain('<');
            expect(error.httpStatus).toBe(status);
        }
    });

    it('says a web page came back instead of an answer, for any other status', async () => {
        const error = await fail(respond('<!doctype html><title>Not found</title>', { status: 404, contentType: 'text/html' }));
        expect(error.message).toMatch(/web page instead of a chat answer.*ends in \/chat/);
        expect(error.code).toBe(AparteErrorCode.PROVIDER_MISCONFIGURED);
    });

    it("keeps what a web page's status says: busy, unavailable, refused", async () => {
        const page = (status: number) => respond('<!doctype html><title>x</title>', { status, contentType: 'text/html' });
        expect((await fail(page(429))).code).toBe(AparteErrorCode.USAGE_RATE_LIMIT);
        expect((await fail(page(503))).code).toBe(AparteErrorCode.PROVIDER_UNAVAILABLE);
        expect((await fail(page(403))).code).toBe(AparteErrorCode.CONFIG_INVALID_KEY);
        expect((await fail(page(405))).code).toBe(AparteErrorCode.PROVIDER_MISCONFIGURED);
    });

    it('names the credentials a workflow waits for, and says when n8n could not check them', async () => {
        const gate = await fail(respond(JSON.stringify({ status: 'credential_connections_required', readyToExecute: false, credentials: [{ credentialId: '1', credentialName: 'OpenAI account' }, { credentialName: 'Slack' }] }), { status: 428 }));
        expect(gate.message).toBe('The n8n workflow cannot run until its credentials are connected (OpenAI account, Slack). Connect them in n8n, then try again.');
        expect(gate.code, 'set up so it cannot answer: no retry mends it').toBe(AparteErrorCode.PROVIDER_MISCONFIGURED);
        const check = await fail(respond('{"status":"credential_readiness_check_failed"}', { status: 503 }));
        expect(check.message).toMatch(/could not check the workflow's credentials/);
        expect(check.code).toBe(AparteErrorCode.PROVIDER_UNAVAILABLE);
        const unnamed = await fail(respond(JSON.stringify({ credentials: [null, { credentialName: '' }, 'x'] }), { status: 428 }));
        expect(unnamed.message).toBe('The n8n workflow cannot run until its credentials are connected. Connect them in n8n, then try again.');
    });

    it('reads a page by its content type too, when its text does not start with markup', async () => {
        const error = await fail(respond('Bad gateway', { status: 502, contentType: 'text/html; charset=utf-8' }));
        expect(error.code).toBe(AparteErrorCode.NET_TIMEOUT);
    });

    it('uses the global fetch when given none', async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('last-node')));
        vi.stubGlobal('fetch', fetch);
        try {
            const runner = createN8nRunner({ webhookUrl: 'https://n8n.example.com/webhook/abc/chat' });
            await runner({
                messageId: 'm', signal: new AbortController().signal, emitter: () => {},
                baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'n8n' },
                transportCall: async () => { throw new Error('never called'); }, toolLookup: () => undefined,
            } as unknown as AparteStreamRunOptions);
        } finally {
            vi.unstubAllGlobals();
        }
        expect(calls).toHaveLength(1);
    });
});

describe('createN8nRunner: a stream cut mid-frame', () => {
    it('keeps the text before the cut, drops the fragment, and says so to the developer', async () => {
        const warnings: string[] = [];
        const body = frames({ type: 'begin', ...meta('a') }, { type: 'item', content: 'Kept.', ...meta('a') }) + '{"type":"item","content":"lo';
        const r = run(fakeFetch(respond(body)).fetch, { runner: { onWarning: (m) => warnings.push(m) } });
        await r.done;
        expect(r.text()).toBe('Kept.');
        expect(warnings).toEqual(["n8n's stream stopped in the middle of a frame; the text before it is kept."]);
    });
});

describe('createN8nRunner: what the code audit found', () => {
    it("drops the page's Content-Type, in any case, so a form keeps its boundary and JSON has one", async () => {
        const { fetch, calls } = fakeFetch(replay(fixture('last-node')), replay(fixture('last-node')));
        const runner = { headers: { 'content-type': 'application/json', 'X-Token': 't' } };
        await run(fetch, { runner, messages: [{ role: 'user', content: [{ type: 'text', text: 'see' }, { type: 'image', image: 'data:image/png;base64,AAAA' }] }] }).done;
        await run(fetch, { runner }).done;
        expect(calls[0]!.init.body).toBeInstanceOf(FormData);
        expect(calls[0]!.init.headers).toEqual({ Accept: 'text/plain', 'X-Token': 't' });
        expect(calls[1]!.init.headers).toEqual({ Accept: 'text/plain', 'X-Token': 't', 'Content-Type': 'application/json' });
    });

    it('shows a structured output — an agent with an output parser — as JSON, readable', async () => {
        const r = run(fakeFetch(respond('{"output":{"answer":"Paris","confidence":0.9}}')).fetch);
        await r.done;
        expect(r.text()).toBe('```json\n{\n  "answer": "Paris",\n  "confidence": 0.9\n}\n```');
    });

    it('reads a whole answer that looks like a frame but carries none of its marks as an answer', async () => {
        const item = run(fakeFetch(respond('{"type":"item","output":"We have bread."}')).fetch);
        await item.done;
        expect(item.text()).toBe('We have bread.');
        const error = run(fakeFetch(respond('{"type":"error","message":"Out of stock."}')).fetch);
        await error.done;
        expect(error.text()).toBe('Out of stock.');
    });

    it('still reads an error frame with no metadata, by its text, and a bare keepalive', async () => {
        const failed = run(fakeFetch(respond(frames({ type: 'error', content: 'Workflow execution failed' }))).fetch);
        await expect(failed.done).rejects.toThrow('Workflow execution failed');
        const alive = run(fakeFetch(respond(frames({ type: 'keepalive' }, { type: 'item', content: 'ok', ...meta('a') }))).fetch);
        await alive.done;
        expect(alive.text()).toBe('ok');
    });

    it('draws every stream still waiting when the body ends, the ended ones and the cut ones', async () => {
        const r = run(fakeFetch(respond(frames(
            { type: 'begin', ...meta('a') }, { type: 'item', content: 'A1', ...meta('a') },
            { type: 'begin', ...meta('b') }, { type: 'item', content: 'B1', ...meta('b') },
            { type: 'begin', ...meta('c') }, { type: 'item', content: 'C1', ...meta('c') }, { type: 'end', ...meta('c') },
            // The body ends here: A and B were cut, C had finished behind them.
        ))).fetch);
        await r.done;
        expect(r.text()).toBe('A1B1C1');
    });
});
