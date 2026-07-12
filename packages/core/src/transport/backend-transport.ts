import type { AparteChatRequest, AparteChatResponse } from '../types/chat.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import type { AparteTransport, AparteTransportContext } from './types.js';
import { vendorErrorMessage } from './types.js';
import { parseAparteEventStream } from '../parsers/index.js';

export interface BackendTransportOptions {
    /** Your backend chat endpoint, e.g. `/api/chat`. */
    endpoint: string;
    /** Extra headers to send with each request (session cookie is automatic). */
    headers?: Record<string, string>;
    /**
     * Override how the request is serialised to your backend. Default body is
     * `{ providerId, request }`. Return any JSON-serialisable value.
     */
    buildBody?: (request: AparteChatRequest, providerId: string) => unknown;
}

/**
 * Backend-proxied transport — RECOMMENDED for production.
 *
 * POSTs `{ providerId, request }` to YOUR endpoint. The backend resolves the API
 * key server-side, calls the vendor, runs the vendor parser **server-side**, and
 * streams back already-normalized `AparteStreamEvent`s as NDJSON (one JSON object
 * per line). The key never reaches the browser and — unlike a raw proxy — the
 * client stays fully vendor-agnostic (it never runs the vendor's `parseStream`,
 * so switching the server-side provider needs no client change). Non-streaming
 * requests get a JSON `{ text }` reply.
 *
 * This is NOT the Vercel AI SDK Data Stream Protocol; the wire format is a plain
 * NDJSON of `AparteStreamEvent` (see `parseAparteEventStream`).
 *
 * The matching `/api/chat` handler ships as a real, framework-free function —
 * {@link createAparteChatHandler} (Web `fetch` API, same @aparte adapters run
 * server-side, key held server-side). Drop it into a Next.js route handler,
 * Deno, Bun, or a Worker rather than hand-rolling one.
 */
export class BackendTransport implements AparteTransport {
    constructor(private readonly options: BackendTransportOptions) {}

    async chat(
        _provider: AparteAIProvider,
        request: AparteChatRequest,
        _auth: string | Record<string, string> | undefined,
        ctx: AparteTransportContext,
    ): Promise<AparteChatResponse> {
        // The backend owns the vendor mapping + key, so no client-side format
        // adapter is required — only the providerId, so it knows which vendor to call.
        const body = this.options.buildBody
            ? this.options.buildBody(request, ctx.providerId)
            : { providerId: ctx.providerId, request };

        const response = await fetch(this.options.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...this.options.headers },
            body: JSON.stringify(body),
            signal: ctx.signal,
        });

        if (!response.ok) {
            throw new Error(await vendorErrorMessage(response, 'Backend HTTP'));
        }

        if (request.stream === false) {
            const json = await response.json();
            const text = (json as { text?: unknown })?.text;
            return typeof text === 'string' ? text : (typeof json === 'string' ? json : JSON.stringify(json));
        }
        if (!response.body) {
            throw new Error('Backend returned no response body for a streaming request.');
        }
        return parseAparteEventStream(response.body);
    }
}
