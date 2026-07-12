import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { DirectTransport } from '../direct-transport.js';
import { BackendTransport } from '../backend-transport.js';
import { isFormatAdapter } from '../types.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteChatRequest } from '../../types/chat.js';
import type { AparteStreamEvent } from '../../types/index.js';

const ctx = { providerId: 'mock' };
const req: AparteChatRequest = { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: true };

function streamOf(bytes = new Uint8Array([1])) {
    return new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
}

/** A Response whose body is NDJSON of AparteStreamEvents (the backend wire format). */
function ndjsonResponse(events: AparteStreamEvent[]) {
    const text = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    return new Response(new TextEncoder().encode(text), { status: 200 });
}

async function collect(stream: ReadableStream<AparteStreamEvent>): Promise<AparteStreamEvent[]> {
    const out: AparteStreamEvent[] = [];
    const reader = stream.getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; out.push(value); }
    return out;
}

// A format-adapter provider (no chat) — the post-refactor shape.
function adapter(over: Partial<AparteAIProvider> = {}): AparteAIProvider {
    const events = streamOf();
    return {
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'Mock' }),
        getModels: () => [],
        defaultEndpoint: 'https://vendor.test/v1',
        buildRequest: (r) => ({ path: '/chat', body: { model: r.modelId } }),
        authHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
        parseStream: vi.fn(() => events as any),
        parseText: (j: any) => j?.text ?? '',
        ...over,
    } as AparteAIProvider;
}

// A legacy provider (only chat) — the pre-refactor shape.
function legacy(chat = vi.fn(async () => 'LEGACY')): AparteAIProvider {
    return {
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'Mock' }),
        getModels: () => [],
        chat,
    } as AparteAIProvider;
}

afterEach(() => vi.restoreAllMocks());
// Silence (and capture) the browser-key warning by default so the suite output
// stays clean; the dedicated tests assert against this spy.
beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('isFormatAdapter', () => {
    it('is true only when the full adapter surface is present', () => {
        expect(isFormatAdapter(adapter())).toBe(true);
        expect(isFormatAdapter(legacy())).toBe(false);
        expect(isFormatAdapter(adapter({ authHeaders: undefined }))).toBe(false);
    });
});

describe('DirectTransport', () => {
    it('delegates to a legacy provider\'s chat(), forwarding ctx (abort signal reaches the provider)', async () => {
        const chat = vi.fn(async () => 'LEGACY');
        const signal = new AbortController().signal;
        const out = await new DirectTransport().chat(legacy(chat), req, 'sk-1', { providerId: 'mock', signal });
        expect(out).toBe('LEGACY');
        expect(chat).toHaveBeenCalledWith(req, 'sk-1', { providerId: 'mock', signal });
    });

    it('warns once when a legacy provider carries a real key (BYOK-warn parity)', async () => {
        const t = new DirectTransport();
        await t.chat(legacy(), req, 'sk-secret', ctx);
        await t.chat(legacy(), req, 'sk-secret', ctx);
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(String(vi.mocked(console.warn).mock.calls[0]?.[0])).toContain('DirectTransport');
    });

    it('does not warn for a keyless legacy provider (local model)', async () => {
        await new DirectTransport().chat(legacy(), req, undefined, ctx);
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('drives an adapter: vendor URL + injected auth headers, then parseStream', async () => {
        const p = adapter();
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(streamOf(), { status: 200 }) as any,
        );
        await new DirectTransport().chat(p, req, 'sk-42', ctx);

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('https://vendor.test/v1/chat');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-42');
        expect(JSON.parse(init.body as string)).toEqual({ model: 'm' });
        expect(p.parseStream).toHaveBeenCalled();
    });

    it('honours an endpoint override from the auth config object', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamOf(), { status: 200 }) as any);
        await new DirectTransport().chat(adapter(), req, { apiKey: 'k', endpoint: 'https://proxy.test/v1' }, ctx);
        expect((fetchSpy.mock.calls[0] as any)[0]).toBe('https://proxy.test/v1/chat');
    });

    it('throws with the vendor error message on a non-ok response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }) as any,
        );
        await expect(new DirectTransport().chat(adapter(), req, 'k', ctx)).rejects.toThrow('bad key');
    });

    it('warns once when a real key is sent straight from the browser', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamOf(), { status: 200 }) as any);
        const t = new DirectTransport();
        await t.chat(adapter(), req, 'sk-secret', ctx);
        await t.chat(adapter(), req, 'sk-secret', ctx);
        expect(console.warn).toHaveBeenCalledTimes(1);
        expect(String(vi.mocked(console.warn).mock.calls[0]?.[0])).toContain('DirectTransport');
    });

    it('does not warn when constructed with { byok: true }', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamOf(), { status: 200 }) as any);
        await new DirectTransport({ byok: true }).chat(adapter(), req, 'sk-secret', ctx);
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('does not warn when no key is sent (local model)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streamOf(), { status: 200 }) as any);
        await new DirectTransport().chat(adapter(), req, {}, ctx);
        expect(console.warn).not.toHaveBeenCalled();
    });
});

describe('BackendTransport', () => {
    it('POSTs { providerId, request } (no key leak) and parses the NDJSON AparteStreamEvents', async () => {
        const p = adapter();
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            ndjsonResponse([{ type: 'text', delta: 'hi' } as AparteStreamEvent, { type: 'done' } as AparteStreamEvent]) as any,
        );
        const result = await new BackendTransport({ endpoint: '/api/chat' }).chat(p, req, 'sk-secret', ctx);

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/chat');
        expect(JSON.parse(init.body as string)).toEqual({ providerId: 'mock', request: req });
        // the key must NOT leak to the browser->backend call
        expect(JSON.stringify(init.headers)).not.toContain('sk-secret');
        // the vendor parser runs SERVER-side; the client never touches it
        expect(p.parseStream).not.toHaveBeenCalled();
        expect(await collect(result as ReadableStream<AparteStreamEvent>)).toEqual([
            { type: 'text', delta: 'hi' }, { type: 'done' },
        ]);
    });

    it('does not require a format-adapter provider (the backend owns the vendor mapping)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(ndjsonResponse([{ type: 'done' } as AparteStreamEvent]) as any);
        const result = await new BackendTransport({ endpoint: '/api/chat' }).chat(legacy(), req, undefined, ctx);
        expect(result).toBeInstanceOf(ReadableStream);
    });

    it('returns text for a non-streaming request via the backend { text } reply', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ text: 'done' }), { status: 200 }) as any);
        const out = await new BackendTransport({ endpoint: '/api/chat' }).chat(adapter(), { ...req, stream: false }, undefined, ctx);
        expect(out).toBe('done');
    });
});
