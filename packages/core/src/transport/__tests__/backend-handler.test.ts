import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAparteChatHandler } from '../backend-handler.js';
import { AparteBackendTransport } from '../backend-transport.js';
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
    // Declared with the real fetch args so `vendor.mock.calls[0]` is typed as
    // [input, init] — asserting on them needed an unsound cast otherwise.
    return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(
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
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, resolveKey: () => 'sk-secret', fetchImpl: vendor });

        const res = await handler(backendRequest({ providerId: 'mock', request: req }));

        expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
        const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
        expect(lines).toEqual([{ type: 'text', delta: 'hi' }, { type: 'done' }]);

        // the vendor was called with the key server-side (via authHeaders)
        const [vurl, vinit] = vendor.mock.calls[0];
        expect(vurl).toBe('https://vendor.test/v1/chat');
        expect(vinit, 'the vendor call must carry an init with auth headers').toBeDefined();
        expect((vinit?.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret');
    });

    it('appends an authQuery adapter\'s params to the vendor URL (the Gemini `?key=` shape)', async () => {
        // The one auth shape neither transport suite exercised: a break here sends
        // every request for such a provider unauthenticated, in silence.
        const vendor = vendorStreamOk();
        const queryAuth = { ...adapter(), authHeaders: undefined, authQuery: (key: string) => ({ key }) } as AparteAIProvider;
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: queryAuth }, resolveKey: () => 'sk-secret', fetchImpl: vendor });

        await handler(backendRequest({ providerId: 'mock', request: req }));

        const [vurl, vinit] = vendor.mock.calls[0];
        expect(vurl).toBe('https://vendor.test/v1/chat?key=sk-secret');
        expect((vinit?.headers as Record<string, string>)?.Authorization).toBeUndefined();
    });

    it('resolves a non-streaming request to { text } via parseText', async () => {
        const vendor = vi.fn(async () => new Response(JSON.stringify({ text: 'DONE' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        }));
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendor });

        const res = await handler(backendRequest({ providerId: 'mock', request: { ...req, stream: false } }));
        expect(await res.json()).toEqual({ text: 'DONE' });
    });

    it('400s on an unknown providerId', async () => {
        const handler = createAparteChatHandler({ authorize: () => true, providers: {}, fetchImpl: vendorStreamOk() });
        const res = await handler(backendRequest({ providerId: 'nope', request: req }));
        expect(res.status).toBe(400);
    });

    it('400s on an inherited providerId ("__proto__", "constructor") — not 500', async () => {
        // A plain object's inherited members are truthy, so `providers[id]` used to skip
        // the 400 and reach the "not a format adapter" 500. Own keys only.
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, fetchImpl: vendorStreamOk() });
        for (const providerId of ['__proto__', 'constructor', 'toString']) {
            const res = await handler(backendRequest({ providerId, request: req }));
            expect(res.status, providerId).toBe(400);
        }
    });

    it('never relays a failed vendor fetch\'s message — it can name a URL that carries the key', async () => {
        const vendor = vi.fn(async () => { throw new Error('request to https://vendor.test/v1/chat?key=SECRET failed, reason: ECONNRESET'); });
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => { /* logged server-side, asserted here */ });
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, resolveKey: () => 'SECRET', fetchImpl: vendor });
        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        expect(res.status).toBe(502);
        const body = await res.text();
        expect(body).not.toContain('SECRET');
        expect(body).toContain('Vendor request failed.');
        expect(quiet).toHaveBeenCalled();
        quiet.mockRestore();
    });

    it('400s on a malformed body', async () => {
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, fetchImpl: vendorStreamOk() });
        const res = await handler(new Request('http://localhost/api/chat', { method: 'POST', body: 'not json' }));
        expect(res.status).toBe(400);
    });

    it('propagates a vendor error status so the client can surface it', async () => {
        const vendor = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendor });
        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        expect(res.status).toBe(401);
    });

    // BREAKING (0.8.0): the vendor body used to be relayed byte-for-byte. An
    // OpenAI 401 reads `Incorrect API key provided: sk-proj-****abcd`, so a caller
    // who tripped vendor auth learned the key's prefix, tail and format; other
    // vendors echo org ids and request fragments.
    it('does not relay the vendor error body, which can carry key material', async () => {
        const leak = JSON.stringify({
            error: {
                message: 'Incorrect API key provided: sk-proj-abc***xyz. Visit https://platform.openai.com',
                code: 'invalid_api_key',
                type: 'invalid_request_error',
                organization: 'org-secret',
            },
        });
        const vendor = vi.fn(async () => new Response(leak, { status: 401 }));
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendor });

        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        const body = await res.text();

        expect(res.status).toBe(401);
        expect(body, 'the key fragment reached the caller').not.toContain('sk-proj');
        expect(body).not.toContain('org-secret');
        expect(body).not.toContain('platform.openai.com');
        // The machine-readable parts a client legitimately reacts to survive.
        expect(JSON.parse(body)).toEqual({
            error: {
                message: 'Vendor request failed (HTTP 401).',
                code: 'invalid_api_key',
                type: 'invalid_request_error',
            },
        });
    });

    it('summarises a non-JSON vendor error without inventing fields', async () => {
        const vendor = vi.fn(async () => new Response('<html>gateway timeout</html>', { status: 504 }));
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendor });
        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        expect(res.status).toBe(504);
        expect(JSON.parse(await res.text())).toEqual({ error: { message: 'Vendor request failed (HTTP 504).' } });
    });

    it('rejects with 401 when authorize returns false — before touching the vendor', async () => {
        const vendor = vendorStreamOk();
        const handler = createAparteChatHandler({
            providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendor,
            authorize: () => false,
        });
        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        expect(res.status).toBe(401);
        expect(vendor).not.toHaveBeenCalled(); // no key spent on an unauthorized caller
    });

    it('returns the caller Response verbatim when authorize returns one', async () => {
        const handler = createAparteChatHandler({
            providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendorStreamOk(),
            authorize: () => new Response('forbidden', { status: 403 }),
        });
        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        expect(res.status).toBe(403);
        expect(await res.text()).toBe('forbidden');
    });

    it('proceeds when authorize returns true (async allowed)', async () => {
        const handler = createAparteChatHandler({
            providers: { mock: adapter() }, resolveKey: () => 'k', fetchImpl: vendorStreamOk(),
            authorize: async () => true,
        });
        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
    });

    it('500s (SSRF guard) when an adapter returns a non-rooted path, without calling the vendor', async () => {
        const evil = { ...adapter(), buildRequest: () => ({ path: '//evil.test/steal', body: {} }) } as AparteAIProvider;
        const vendor = vendorStreamOk();
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: evil }, resolveKey: () => 'k', fetchImpl: vendor });
        const res = await handler(backendRequest({ providerId: 'mock', request: req }));
        expect(res.status).toBe(500);
        expect(vendor).not.toHaveBeenCalled();
    });
});

describe('AparteBackendTransport ⟷ createAparteChatHandler round-trip', () => {
    it('client posts { providerId, request } (no key), server normalizes, client parses the events back', async () => {
        const vendor = vendorStreamOk();
        const handler = createAparteChatHandler({ authorize: () => true, providers: { mock: adapter() }, resolveKey: () => 'sk-server-only', fetchImpl: vendor });

        // Route the client's fetch to the real handler (only the vendor hop is mocked).
        const backendFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((async (_url: string, init: RequestInit) =>
            handler(new Request('http://localhost/api/chat', { method: 'POST', headers: init.headers, body: init.body as string }))
        ) as typeof fetch);

        const result = await new AparteBackendTransport({ endpoint: 'http://localhost/api/chat' })
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
