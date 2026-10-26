/**
 * An overflowing prompt is a `USAGE_CONTEXT_EXCEEDED`, not a bad request — and only the
 * provider knows what its vendor writes for one. The adapter's `classifyError` names it,
 * on the page for a direct call and on the server for the backend handler, which forwards
 * the code (never the vendor's prose) for the client's `vendorError` to read.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteDirectTransport } from '../direct-transport.js';
import { AparteBackendTransport } from '../backend-transport.js';
import { createAparteChatHandler } from '../backend-handler.js';
import type { AparteAIProvider } from '../../types/model-provider.js';
import type { AparteChatRequest } from '../../types/chat.js';
import { AparteError, AparteErrorCode } from '../../types/errors.js';

const ctx = { providerId: 'mock' };
const req: AparteChatRequest = { messages: [{ role: 'user', content: 'hi' }], modelId: 'm', stream: true };
const OVERFLOW = { error: { message: "This model's maximum context length is 8192 tokens.", code: 'context_length_exceeded' } };

/** The wire knowledge: a 400 whose body says `context_length_exceeded`. */
const classifyError = (status: number, body: unknown): AparteErrorCode | undefined =>
    status === 400 && (body as typeof OVERFLOW | undefined)?.error?.code === 'context_length_exceeded'
        ? AparteErrorCode.USAGE_CONTEXT_EXCEEDED
        : undefined;

function adapter(over: Partial<AparteAIProvider> = {}): AparteAIProvider {
    return {
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'Mock' }),
        getModels: () => [],
        defaultEndpoint: 'https://vendor.test/v1',
        buildRequest: () => ({ path: '/chat', body: {} }),
        authHeaders: (key: string) => ({ Authorization: `Bearer ${key}` }),
        parseStream: () => new ReadableStream(),
        ...over,
    } as AparteAIProvider;
}

const reject = (p: Promise<unknown>) =>
    p.then(() => { throw new Error('resolved instead of rejecting'); }, (e: unknown) => e as AparteError);

const post = (body: unknown) => new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(body) });

afterEach(() => vi.restoreAllMocks());

describe('the direct path', () => {
    it('builds the error with the code the adapter classified, the vendor message and the status kept', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OVERFLOW), { status: 400 }));
        const err = await reject(new AparteDirectTransport().chat(adapter({ classifyError } as never), req, 'k', ctx));
        expect(err.code).toBe(AparteErrorCode.USAGE_CONTEXT_EXCEEDED);
        expect(err.message).toBe(OVERFLOW.error.message);
        expect(err.httpStatus).toBe(400);
    });

    it('falls back to the status when the adapter does not classify', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad' } }), { status: 400 }));
        const err = await reject(new AparteDirectTransport().chat(adapter({ classifyError } as never), req, 'k', ctx));
        expect(err.code).toBe(AparteErrorCode.USAGE_BAD_REQUEST);
    });

    it('is the status alone for an adapter that has no classifyError, even on an overflow body', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OVERFLOW), { status: 400 }));
        const err = await reject(new AparteDirectTransport().chat(adapter(), req, 'k', ctx));
        expect(err.code).toBe(AparteErrorCode.USAGE_BAD_REQUEST);
    });

    it('hands the adapter the parsed body, or undefined when the body was not JSON', async () => {
        const seen: unknown[] = [];
        const spy = (status: number, body: unknown) => { seen.push([status, body]); return undefined; };
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>nope</html>', { status: 413 }));
        await reject(new AparteDirectTransport().chat(adapter({ classifyError: spy } as never), req, 'k', ctx));
        expect(seen).toEqual([[413, undefined]]);
    });
});

describe('the backend path', () => {
    it('the handler forwards the classified code as error.code, still without the vendor prose', async () => {
        const handler = createAparteChatHandler({
            authorize: () => true,
            providers: { mock: adapter({ classifyError } as never) },
            fetchImpl: vi.fn(async () => new Response(JSON.stringify(OVERFLOW), { status: 400 })),
        });
        const res = await handler(post({ providerId: 'mock', request: req }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: { message: 'Vendor request failed (HTTP 400).', code: 'USAGE_CONTEXT_EXCEEDED' } });
    });

    it("keeps the vendor's own code when the adapter classifies nothing", async () => {
        const handler = createAparteChatHandler({
            authorize: () => true,
            providers: { mock: adapter({ classifyError: () => undefined } as never) },
            fetchImpl: vi.fn(async () => new Response(JSON.stringify(OVERFLOW), { status: 400 })),
        });
        const res = await handler(post({ providerId: 'mock', request: req }));
        expect((await res.json()).error.code).toBe('context_length_exceeded');
    });

    it('an adapter whose classifyError throws leaves the clean 4xx, not a 500', async () => {
        const handler = createAparteChatHandler({
            authorize: () => true,
            providers: { mock: adapter({ classifyError: () => { throw new Error('bug'); } } as never) },
            fetchImpl: vi.fn(async () => new Response(JSON.stringify(OVERFLOW), { status: 400 })),
        });
        const res = await handler(post({ providerId: 'mock', request: req }));
        expect(res.status).toBe(400);
    });

    it('the client reads error.code when it is one of ours, and ignores a vendor string it does not know', async () => {
        const backend = new AparteBackendTransport({ endpoint: '/api/chat' });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: { message: 'x', code: 'USAGE_CONTEXT_EXCEEDED' } }), { status: 400 }),
        );
        expect((await reject(backend.chat(adapter(), req, undefined, ctx))).code).toBe(AparteErrorCode.USAGE_CONTEXT_EXCEEDED);

        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OVERFLOW), { status: 400 }));
        expect((await reject(backend.chat(adapter(), req, undefined, ctx))).code).toBe(AparteErrorCode.USAGE_BAD_REQUEST);
    });

    it('the whole way: handler on the server, backend transport on the page', async () => {
        const handler = createAparteChatHandler({
            authorize: () => true,
            providers: { mock: adapter({ classifyError } as never) },
            fetchImpl: vi.fn(async () => new Response(JSON.stringify(OVERFLOW), { status: 400 })),
        });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => handler(new Request(`http://localhost${String(input)}`, init)));
        const err = await reject(new AparteBackendTransport({ endpoint: '/api/chat' }).chat(adapter(), req, undefined, ctx));
        expect(err.code).toBe(AparteErrorCode.USAGE_CONTEXT_EXCEEDED);
        expect(err.message).not.toContain('maximum context length');
    });
});

describe('AparteError.from', () => {
    it('keeps a valid code the error it wraps carries', () => {
        const thrown = Object.assign(new Error('too long'), { code: 'USAGE_CONTEXT_EXCEEDED' });
        expect(AparteError.from(thrown).code).toBe(AparteErrorCode.USAGE_CONTEXT_EXCEEDED);
    });

    it('ignores a code that is not one of ours (a Node errno, a vendor string)', () => {
        expect(AparteError.from(Object.assign(new Error('x'), { code: 'ECONNRESET' })).code).toBe(AparteErrorCode.UNKNOWN_ERROR);
        expect(AparteError.from(Object.assign(new Error('x'), { code: 42 })).code).toBe(AparteErrorCode.UNKNOWN_ERROR);
    });

    it('a caller that names a code still wins', () => {
        const thrown = Object.assign(new Error('x'), { code: 'USAGE_CONTEXT_EXCEEDED' });
        expect(AparteError.from(thrown, AparteErrorCode.NET_ERROR).code).toBe(AparteErrorCode.NET_ERROR);
    });
});
