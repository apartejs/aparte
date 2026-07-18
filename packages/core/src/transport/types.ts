/**
 * Transport seam — separates the two concerns that providers used to bundle:
 *
 *   • **Format adapter** (`AparteFormatAdapter`): the vendor-specific concern —
 *     how to shape the HTTP request and how to parse the response stream into
 *     unified `AparteStreamEvent`s. No network, no auth, no key.
 *   • **Transport** (`AparteTransport`): WHERE the call goes and how auth is
 *     handled — straight to the vendor from the browser (`DirectTransport`,
 *     BYOK/local) or via your own backend that holds the key
 *     (`BackendTransport`, recommended for production).
 *
 * A "provider" is migrating from a monolithic `chat()` (fetch + key + parse) to
 * a pure format adapter. During the migration a provider may expose EITHER the
 * adapter surface OR a legacy `chat()`; the transports handle both.
 */
import type { AparteChatRequest, AparteChatResponse, AparteStreamEvent } from '../types/chat.js';
import type { AparteAIProvider } from '../types/model-provider.js';

/** A vendor HTTP request built from an Aparte request — auth is injected separately. */
export interface AparteVendorRequest {
    /** Appended to the transport's endpoint, e.g. `/chat/completions`. */
    path: string;
    /** Vendor-shaped JSON body. */
    body: unknown;
    /** Content headers (NOT auth — the transport adds auth). */
    headers?: Record<string, string>;
}

/** The vendor-format concern, with no transport/auth coupling. */
export interface AparteFormatAdapter {
    id: string;
    /** Base URL for browser-direct calls (overridable per request via config). */
    defaultEndpoint: string;
    /** Map an Aparte request to the vendor HTTP request (without auth). */
    buildRequest(request: AparteChatRequest): AparteVendorRequest;
    /** Vendor auth headers for a resolved key (browser-direct only). Most vendors. */
    authHeaders?(key: string): Record<string, string>;
    /** Vendor auth as URL query params for a resolved key (e.g. Gemini `?key=`). */
    authQuery?(key: string): Record<string, string>;
    /** Parse a streaming vendor response body into unified events. */
    parseStream(body: ReadableStream<Uint8Array>): ReadableStream<AparteStreamEvent>;
    /** Extract text from a non-streaming vendor JSON response. */
    parseText?(json: unknown): string;
}

export interface AparteTransportContext {
    providerId: string;
    signal?: AbortSignal;
}

/**
 * Decides where a chat request goes and how auth is handled. Given a provider
 * (adapter or legacy), the request, and the already-resolved auth, it returns
 * unified events (streaming) or a string (non-streaming).
 */
export interface AparteTransport {
    chat(
        provider: AparteAIProvider,
        request: AparteChatRequest,
        auth: string | Record<string, string> | undefined,
        ctx: AparteTransportContext,
    ): Promise<AparteChatResponse>;
}

/** True once a provider has been refactored to the format-adapter surface. */
export function isFormatAdapter(
    p: AparteAIProvider,
): p is AparteAIProvider & Required<Pick<AparteFormatAdapter, 'buildRequest' | 'parseStream' | 'defaultEndpoint'>> {
    return (
        typeof p.buildRequest === 'function' &&
        typeof p.parseStream === 'function' &&
        typeof p.defaultEndpoint === 'string' &&
        (typeof p.authHeaders === 'function' || typeof p.authQuery === 'function')
    );
}

/** Read an api key / endpoint out of the legacy `string | Record` auth shape. */
export function readAuth(auth: string | Record<string, string> | undefined): { key?: string; endpoint?: string } {
    if (typeof auth === 'string') return { key: auth };
    if (auth && typeof auth === 'object') return { key: auth['apiKey'], endpoint: auth['endpoint'] };
    return {};
}

/** Best-effort human message from a non-ok vendor/backend JSON error response. */
export async function vendorErrorMessage(response: Response, label = 'HTTP'): Promise<string> {
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    const raw = (body as { error?: { message?: string } | string })?.error;
    const msg = typeof raw === 'object' ? raw?.message : raw;
    return typeof msg === 'string' && msg ? msg : `${label} ${response.status}`;
}

/**
 * Resolve a non-streaming response to text via the adapter's `parseText`.
 * Both transports use this so `stream: false` behaves identically (previously
 * DirectTransport returned '' and BackendTransport returned raw JSON when
 * `parseText` was missing — now both fail loud).
 */
export async function parseNonStreamText(
    provider: { parseText?: (json: unknown) => string },
    response: Response,
    providerId: string,
): Promise<string> {
    const json = await response.json();
    if (typeof provider.parseText !== 'function') {
        throw new Error(`Provider "${providerId}" cannot resolve a non-streaming response: parseText is not implemented.`);
    }
    return provider.parseText(json);
}
