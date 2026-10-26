// @vitest-environment node
/**
 * createAgentStreamRunner — AparteClient's loop, run on your server.
 *
 * A pipe and nothing more: it POSTs the run to the endpoint, replays each NDJSON line to
 * the adapter's emitter in order, carries a continuation (`deferral`) as the resume body,
 * and turns the server's failures into an `AparteError`. It opens no panel and runs no
 * tool — the client drives a pause, because only the client sees the messages.
 */
import { describe, it, expect } from 'vitest';
import { createAgentStreamRunner } from '../agent-runner.js';
import { AparteError } from '../../types/errors.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';

const ndjson = (...lines: object[]) => lines.map((l) => JSON.stringify(l)).join('\n') + '\n';

function fakeFetch(respond: (body: Record<string, unknown>) => Response) {
    const calls: { url: string; body: Record<string, unknown>; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        calls.push({ url, body, init });
        return respond(body);
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
}

function options(extra: Partial<AparteStreamRunOptions> = {}) {
    const events: { type: string }[] = [];
    const opts = {
        messageId: 'm1',
        providerId: 'openai',
        baseRequest: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true, tools: [{ name: 'ask_user', description: 'Ask.', inputSchema: {} }] },
        transportCall: async () => { throw new Error('never called'); },
        toolLookup: () => undefined,
        emitter: (e: { type: string }) => events.push(e),
        signal: new AbortController().signal,
        ...extra,
    } as unknown as AparteStreamRunOptions;
    return { opts, events };
}

describe('createAgentStreamRunner', () => {
    it('POSTs the run and replays every line to the emitter, in order', async () => {
        const { fetch, calls } = fakeFetch(() => new Response(ndjson(
            { type: 'run-start' }, { type: 'turn-start' }, { type: 'text-delta', delta: 'Hi' }, { type: 'text-flush' },
            { type: 'run-done', usage: { inputTokens: 3, outputTokens: 1 } },
        )));
        const { opts, events } = options();
        const usage = await createAgentStreamRunner({ endpoint: '/api/agent', fetch, headers: { 'x-test': '1' } })(opts);
        expect(events.map((e) => e.type)).toEqual(['run-start', 'turn-start', 'text-delta', 'text-flush', 'run-done']);
        expect(usage).toEqual({ inputTokens: 3, outputTokens: 1 });
        expect(calls[0]!.url).toBe('/api/agent');
        expect(calls[0]!.body).toEqual({
            v: 1, providerId: 'openai', messageId: 'm1',
            request: { messages: [{ role: 'user', content: 'hi' }], modelId: 'x', stream: true },
            clientTools: [{ name: 'ask_user', description: 'Ask.', inputSchema: {} }],
        });
        expect((calls[0]!.init.headers as Record<string, string>)['x-test']).toBe('1');
    });

    it('hands the emitter the run-done line whole, finishReason included', async () => {
        const { fetch } = fakeFetch(() => new Response(ndjson(
            { type: 'run-start' }, { type: 'run-done', finishReason: 'length' },
        )));
        const { opts, events } = options();
        await createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts);
        expect(events.at(-1)).toEqual({ type: 'run-done', finishReason: 'length' });
    });

    it('carries a continuation as the resume body', async () => {
        const { fetch, calls } = fakeFetch(() => new Response(ndjson({ type: 'run-start' }, { type: 'run-done' })));
        const { opts } = options({ deferral: { token: 'T', outcomes: { c1: { kind: 'decision', approved: true } } } });
        await createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts);
        expect(calls[0]!.body['resume']).toEqual({ ticket: 'T', outcomes: { c1: { kind: 'decision', approved: true } } });
    });

    it('returns after a suspension, which is an end of the run like any other', async () => {
        const { fetch } = fakeFetch(() => new Response(ndjson(
            { type: 'run-start' }, { type: 'run-suspended', pending: [], ticket: 'T' },
        )));
        const { opts, events } = options();
        await createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts);
        expect(events.at(-1)).toMatchObject({ type: 'run-suspended', ticket: 'T' });
    });

    it('rejects with the server\'s own words on a run-error line', async () => {
        const { fetch } = fakeFetch(() => new Response(ndjson({ type: 'run-start' }, { type: 'run-error', message: 'The agent run failed.', code: 'AGENT_RUN_FAILED' })));
        const { opts } = options();
        const run = createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts);
        await expect(run).rejects.toBeInstanceOf(AparteError);
        await expect(run).rejects.toThrow('The agent run failed.');
    });

    it('rejects with the server\'s message on an HTTP error', async () => {
        const { fetch } = fakeFetch(() => new Response(JSON.stringify({ error: { message: 'Invalid or expired continuation ticket.' } }), { status: 400 }));
        const { opts } = options();
        await expect(createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts)).rejects.toThrow('Invalid or expired continuation ticket.');
    });

    it('throws a code of ours as the error code itself, so the client can act on an overflow', async () => {
        const { fetch } = fakeFetch(() => new Response(ndjson({ type: 'run-error', message: 'The agent run failed.', code: 'USAGE_CONTEXT_EXCEEDED' })));
        const { opts } = options();
        const run = createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts);
        await expect(run).rejects.toMatchObject({ code: 'USAGE_CONTEXT_EXCEEDED' });
    });

    it('keeps a code that is not ours in the data, under PROVIDER_ERROR', async () => {
        const { fetch } = fakeFetch(() => new Response(ndjson({ type: 'run-error', message: 'The agent run failed.', code: 'AGENT_RUN_FAILED' })));
        const { opts } = options();
        const run = createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts);
        await expect(run).rejects.toMatchObject({ code: 'PROVIDER_ERROR', data: { code: 'AGENT_RUN_FAILED' } });
    });

    it('rejects when the stream ends without its last line, instead of leaving the reply streaming', async () => {
        const { fetch } = fakeFetch(() => new Response(ndjson({ type: 'run-start' }, { type: 'text-delta', delta: 'Hal' })));
        const { opts } = options();
        await expect(createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts)).rejects.toThrow('The agent stream ended unexpectedly.');
    });

    it('hands the run\'s signal to fetch, so Stop cuts the request', async () => {
        const controller = new AbortController();
        const { fetch, calls } = fakeFetch(() => new Response(ndjson({ type: 'run-done' })));
        const { opts } = options({ signal: controller.signal });
        await createAgentStreamRunner({ endpoint: '/api/agent', fetch })(opts);
        expect(calls[0]!.init.signal).toBe(controller.signal);
    });

    it('asks for headers per request when given a function (a fresh token each time)', async () => {
        let n = 0;
        const { fetch, calls } = fakeFetch(() => new Response(ndjson({ type: 'run-done' })));
        const runner = createAgentStreamRunner({ endpoint: '/api/agent', fetch, headers: async () => ({ authorization: `Bearer ${++n}` }) });
        await runner(options().opts);
        await runner(options().opts);
        expect(calls.map((c) => (c.init.headers as Record<string, string>)['authorization'])).toEqual(['Bearer 1', 'Bearer 2']);
    });
});
