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
     * Gate run on EVERY request before any work. **Required.**
     *
     * This endpoint spends your server-held vendor key, so leaving it open means
     * anyone who finds the URL spends your money. It used to be optional, and both
     * the JSDoc example here and the primary snippet in the docs omitted it — so
     * the copy-paste path was the unauthenticated one. Making it required moves
     * that decision from "did you notice?" to a compile error.
     *
     * Return `false` to reject with 401, a `Response` to reject with your own
     * status/body (e.g. 403 + a message), or `true` to proceed. Reads
     * cookies/headers via `req`.
     *
     * A deliberately open endpoint is still possible — `authorize: () => true` —
     * but now it is a line someone wrote on purpose.
     */
    authorize: (req: Request) => boolean | Response | Promise<boolean | Response>;
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
 * Build a framework-free `/api/chat` handler for {@link AparteBackendTransport} — the
 * server counterpart that keeps the key off the client.
 *
 * The returned handler speaks the Web `fetch` API (`Request` → `Response`), so
 * it drops into a Next.js route handler, Deno, Bun, or a Cloudflare Worker
 * unchanged. It reads `{ providerId, request }`, runs the matching format
 * adapter **server-side** (buildRequest → auth → vendor fetch → parseStream),
 * and streams back normalized `AparteStreamEvent`s as NDJSON — the exact wire
 * format `AparteBackendTransport` expects. The vendor key is injected here and never
 * travels to the browser.
 *
 * ```ts
 * // app/api/chat/route.ts (Next.js)
 * import { createAparteChatHandler } from '@aparte/core';
 * import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
 * export const POST = createAparteChatHandler({
 *   providers: { openai: createOpenAICompatProvider(presets.OPENAI) },
 *   resolveKey: (id) => process.env[`${id.toUpperCase()}_KEY`],
 *   // Required: this route spends your key. Your own session check goes here.
 *   authorize: async (req) => Boolean(await getSession(req)),
 * });
 * ```
 */
export function createAparteChatHandler(
    options: AparteChatHandlerOptions,
): (req: Request) => Promise<Response> {
    const doFetch = options.fetchImpl ?? fetch;

    return async function handler(req: Request): Promise<Response> {
        // Auth gate first: this route spends the server-held key, so reject
        // unauthorized callers before parsing or doing any work. Required by the
        // type — there is no path through here without a verdict.
        const verdict = await options.authorize(req);
        if (verdict instanceof Response) return verdict;
        if (!verdict) return jsonError(401, 'Unauthorized.');

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

        // The providerId is client-supplied, so index only OWN keys: on a plain
        // object literal `providers["__proto__"]` / `["constructor"]` resolve to a
        // truthy inherited value, which skipped this 400 and answered 500 instead.
        const adapter = Object.hasOwn(options.providers, providerId)
            ? options.providers[providerId]
            : undefined;
        if (!adapter) {
            return jsonError(400, `Unknown providerId "${providerId}". Register it in the handler's providers map.`);
        }
        if (!isFormatAdapter(adapter)) {
            return jsonError(500, `Provider "${providerId}" is not a format adapter (needs buildRequest + parseStream).`);
        }

        const built = adapter.buildRequest(request);
        // Guard against an adapter returning a non-rooted path that could redirect
        // this server-key'd call to another origin (SSRF): require a single-rooted
        // path — never protocol-relative (`//host`) nor an absolute URL.
        if (!built.path.startsWith('/') || built.path.startsWith('//')) {
            return jsonError(500, `Provider "${providerId}" produced a non-rooted request path.`);
        }
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
            // Same rule as the !vendor.ok block below: the vendor's prose is for
            // the server's logs, never the client's. `authQuery` (Gemini's `?key=`)
            // puts the key in `url`, and a custom `fetchImpl` names the URL in its
            // error text (node-fetch: `request to ${url} failed, reason: ...`).
            console.error('[aparte] vendor request failed', err);
            return jsonError(502, 'Vendor request failed.');
        }

        // A vendor error is SUMMARISED, not relayed byte-for-byte.
        //
        // The verbatim body leaked material a caller has no business seeing: an
        // OpenAI 401 reads `Incorrect API key provided: sk-proj-****abcd`, which
        // hands over the key's prefix, tail and format; other vendors echo org ids
        // and request fragments. Status and machine-readable code/type are enough
        // for a client to react; the vendor's prose is for the server's logs.
        if (!vendor.ok) {
            const raw = await vendor.text().catch(() => '');
            let code: unknown;
            let type: unknown;
            try {
                const parsed = JSON.parse(raw) as { error?: { code?: unknown; type?: unknown } };
                code = parsed?.error?.code;
                type = parsed?.error?.type;
            } catch { /* not JSON — nothing to salvage, and nothing to leak */ }
            return new Response(
                JSON.stringify({
                    error: {
                        message: `Vendor request failed (HTTP ${vendor.status}).`,
                        ...(typeof code === 'string' ? { code } : {}),
                        ...(typeof type === 'string' ? { type } : {}),
                    },
                }),
                { status: vendor.status, headers: { 'Content-Type': 'application/json' } },
            );
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
