import type { AparteChatRequest } from '../types/chat.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import { isFormatAdapter } from './types.js';

export interface AparteChatHandlerOptions {
    /**
     * Your server-side format adapters, keyed by the `providerId` the client
     * sends. The same adapters as the browser (`@aparte/provider-*`), running here
     * so the vendor key never leaves the server.
     */
    providers: Record<string, AparteAIProvider>;
    /**
     * Resolve the vendor API key for a providerId — from env / a secret store.
     * Runs server-side only. Return `undefined` for keyless/local providers.
     */
    resolveKey?: (providerId: string) => string | undefined | Promise<string | undefined>;
    /**
     * The `fetch` used to call the vendor. Defaults to the global `fetch`
     * (Node 18+, Deno, Bun, Workers). Override in tests or to add a proxy.
     */
    fetchImpl?: typeof fetch;
}

/**
 * Build a framework-free `/api/chat` handler for {@link BackendTransport} — the
 * server counterpart that keeps the key off the client.
 *
 * The returned handler speaks the Web `fetch` API (`Request` → `Response`), so
 * it drops into a Next.js route handler, Deno, Bun, or a Cloudflare Worker
 * unchanged. It reads `{ providerId, request }`, runs the matching format
 * adapter **server-side** (buildRequest → auth → vendor fetch → parseStream),
 * and streams back normalized `AparteStreamEvent`s as NDJSON — the exact wire
 * format `BackendTransport` expects. The vendor key is injected here and never
 * travels to the browser.
 *
 * ```ts
 * // app/api/chat/route.ts (Next.js)
 * import { createAparteChatHandler } from '@aparte/core';
 * import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
 * export const POST = createAparteChatHandler({
 *   providers: { openai: createOpenAICompatProvider(presets.OPENAI) },
 *   resolveKey: (id) => process.env[`${id.toUpperCase()}_KEY`],
 * });
 * ```
 */
export function createAparteChatHandler(
    options: AparteChatHandlerOptions,
): (req: Request) => Promise<Response> {
    const doFetch = options.fetchImpl ?? fetch;

    return async function handler(req: Request): Promise<Response> {
        let providerId: string;
        let request: AparteChatRequest;
        try {
            const parsed = (await req.json()) as { providerId?: unknown; request?: unknown };
            if (typeof parsed?.providerId !== 'string' || !parsed?.request || typeof parsed.request !== 'object') {
                return jsonError(400, 'Body must be { providerId: string, request: AparteChatRequest }.');
            }
            providerId = parsed.providerId;
            request = parsed.request as AparteChatRequest;
        } catch {
            return jsonError(400, 'Invalid JSON body.');
        }

        const adapter = options.providers[providerId];
        if (!adapter) {
            return jsonError(400, `Unknown providerId "${providerId}". Register it in the handler's providers map.`);
        }
        if (!isFormatAdapter(adapter)) {
            return jsonError(500, `Provider "${providerId}" is not a format adapter (needs buildRequest + parseStream).`);
        }

        const built = adapter.buildRequest(request);
        const key = await options.resolveKey?.(providerId);

        let url = `${adapter.defaultEndpoint}${built.path}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json', ...built.headers };
        if (key && adapter.authHeaders) Object.assign(headers, adapter.authHeaders(key));
        if (key && adapter.authQuery) {
            const qs = new URLSearchParams(adapter.authQuery(key)).toString();
            url += (url.includes('?') ? '&' : '?') + qs;
        }

        let vendor: Response;
        try {
            vendor = await doFetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(built.body),
                signal: req.signal, // a client disconnect aborts the vendor call too
            });
        } catch (err) {
            return jsonError(502, `Vendor request failed: ${(err as Error)?.message ?? 'network error'}`);
        }

        // Propagate a vendor error verbatim so the client surfaces the real message.
        if (!vendor.ok) {
            const text = await vendor.text().catch(() => '');
            return new Response(text || JSON.stringify({ error: { message: `HTTP ${vendor.status}` } }), {
                status: vendor.status,
                headers: { 'Content-Type': vendor.headers.get('Content-Type') ?? 'application/json' },
            });
        }

        // Non-streaming: resolve to { text } server-side.
        if (request.stream === false) {
            const json = await vendor.json().catch(() => ({}));
            const text = typeof adapter.parseText === 'function' ? adapter.parseText(json) : '';
            return new Response(JSON.stringify({ text }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!vendor.body) {
            return jsonError(502, 'Vendor returned no response body for a streaming request.');
        }

        // Normalize the vendor stream to AparteStreamEvents server-side, re-emit as
        // NDJSON (one JSON object per line) — what parseAparteEventStream reads.
        const events = adapter.parseStream(vendor.body).getReader();
        const encoder = new TextEncoder();
        const ndjson = new ReadableStream<Uint8Array>({
            async pull(controller) {
                try {
                    const { done, value } = await events.read();
                    if (done) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
                } catch (err) {
                    controller.error(err);
                }
            },
            cancel(reason) {
                void events.cancel(reason);
            },
        });

        return new Response(ndjson, { headers: { 'Content-Type': 'application/x-ndjson' } });
    };
}

function jsonError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
