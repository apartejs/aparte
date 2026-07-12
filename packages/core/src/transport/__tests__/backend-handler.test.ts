import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAparteChatHandler } from '../backend-handler.js';
import { BackendTransport } from '../backend-transport.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteChatRequest, AparteStreamEvent } from '../../types/index.js';

const ctx = { providerId: 'mock' };
const req: AparteChatRequest = { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: true };

/** A ReadableStream of AparteStreamEvents — what an adapter's parseStream yields. */
function eventStream(events: AparteStreamEvent[]): ReadableStream<AparteStreamEvent> {
    return new ReadableStream<AparteStreamEvent>({
        start(c) { for (const e of events) c.enqueue(e); c.close(); },
    });
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

/** A format adapter whose parseStream ignores the (mocked) vendor bytes. */
function adapter(events: AparteStreamEvent[] = [{ type: 'text', delta: 'hi' } as AparteStreamEvent, { type: 'done' } as AparteStreamEvent]): AparteAIProvider {
    return {
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'Mock' }),
        getModels: () => [],
        defaultEndpoint: 'https://vendor.test/v1',
        buildRequest: (r) => ({ path: '/chat', body: { model: r.modelId } }),
        authHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
        parseStream: () => eventStream(events),
        parseText: (j: unknown) => (j as { text?: string })?.text ?? '',
    } as AparteAIProvider;
}

/** A mock vendor endpoint returning a streaming 200 (bytes are irrelevant here). */
function vendorStreamOk() {
    return vi.fn(async () => new Response(
        new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }),
        { status: 200 },
    ));
}

function backendRequest(body: unknown): Request {
    return new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(body) });
}

afterEach(() => vi.restoreAllMocks());

describe('createAparteChatHandler', () => {
    it('runs the adapter server-side and streams NDJSON AparteStreamEvents; key stays on the server', async () => {
        const vendor = vendorStreamOk();
        const handler = createAparteChatHandler({ providers: { mock: adapter() }, resolveKey: () => 'sk-secret', fetchImpl: vendor });

        const res = await handler(backendRequest({ providerId: 'mock', request: req }));

        expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
        const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
        expect(lines).toEqual([{ type: 'text', delta: 'hi' }, { type: 'done' }]);

        // the vendor was called with the key server-side (via authHeaders)
        const [vurl, vinit] = vendor.mock.calls[0] as [string, RequestInit];
        expect(vurl).toBe('https://vendor.test/v1/chat');
        expect((vinit.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret');
    });

    it('resolves a non-streaming request to { text } via parseText', async () => {
        const vendor = vi.fn(async () => new Response(JSON.stringify({ text: 'DONE' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        }));
        const handler = createAparteChatHandler({ providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendor });

        const res = await handler(backendRequest({ providerId: 'mock', request: { ...req, stream: false } }));
        expect(await res.json()).toEqual({ text: 'DONE' });
    });

    it('400s on an unknown providerId', async () => {
        const handler = createAparteChatHandler({ providers: {}, fetchImpl: vendorStreamOk() });
        const res = await handler(backendRequest({ providerId: 'nope', request: req }));
        expect(res.status).toBe(400);
    });

    it('400s on a malformed body', async () => {
        const handler = createAparteChatHandler({ providers: { mock: adapter() }, fetchImpl: vendorStreamOk() });
        const res = await handler(new Request('http://localhost/api/chat', { method: 'POST', body: 'not json' }));
        expect(res.status).toBe(400);
    });

    it('propagates a vendor error status so the client can surface it', async () => {
        const vendor = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
        const handler = createAparteChatHandler({ providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendor });
        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        expect(res.status).toBe(401);
    });
});

describe('BackendTransport ⟷ createAparteChatHandler round-trip', () => {
    it('client posts { providerId, request } (no key), server normalizes, client parses the events back', async () => {
        const vendor = vendorStreamOk();
        const handler = createAparteChatHandler({ providers: { mock: adapter() }, resolveKey: () => 'sk-server-only', fetchImpl: vendor });

        // Route the client's fetch to the real handler (only the vendor hop is mocked).
        const backendFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_url: string, init: RequestInit) =>
            handler(new Request('http://localhost/api/chat', { method: 'POST', headers: init.headers, body: init.body as string }))
        ) as typeof fetch);

        const result = await new BackendTransport({ endpoint: 'http://localhost/api/chat' })
            .chat(adapter(), req, 'sk-client-must-not-leak', ctx);

        expect(await collect(result as ReadableStream<AparteStreamEvent>)).toEqual([
            { type: 'text', delta: 'hi' }, { type: 'done' },
        ]);

        // the browser -> backend hop carried the routing info but never the key
        const [, binit] = backendFetch.mock.calls[0] as [unknown, RequestInit];
        expect(JSON.parse(binit.body as string)).toEqual({ providerId: 'mock', request: req });
        expect(JSON.stringify(binit.headers ?? {})).not.toContain('sk-client');
        expect(JSON.stringify(binit.headers ?? {})).not.toContain('sk-server');
    });
});
