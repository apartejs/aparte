/**
 * Transport seam — separates two concerns of a provider:
 *
 *   • **Format adapter** (`AparteFormatAdapter`): the vendor-specific concern —
 *     how to shape the HTTP request and how to parse the response stream into
 *     unified `AparteStreamEvent`s. No network, no auth, no key.
 *   • **Transport** (`AparteTransport`): WHERE the call goes and how auth is
 *     handled — straight to the vendor from the browser (`AparteDirectTransport`,
 *     BYOK/local) or via your own backend that holds the key
 *     (`AparteBackendTransport`, recommended for production).
 *
 * A provider exposes EITHER the format-adapter surface OR a legacy monolithic
 * `chat()` (fetch + key + parse); the transports handle both.
 */
import type { AparteChatRequest, AparteChatResponse, AparteStreamEvent, AparteStreamEventMap } from '../types/chat.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import { AparteError, AparteErrorCode } from '../types/errors.js';

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
    /**
     * The sources a non-streaming vendor JSON response cites, and where (offsets into the
     * text `parseText` returns) — the `sources` event a stream would carry. With it, a
     * non-streaming answer that cites anything resolves to a stream of its text, its
     * sources and its end, instead of a bare string.
     */
    parseSources?(json: unknown): AparteStreamEventMap['sources'] | undefined;
    /**
     * Name the failure of a non-ok vendor response, for the ones a status cannot: a 400
     * whose body says the prompt overflowed the model's window is `USAGE_CONTEXT_EXCEEDED`,
     * not a bad request, and the client acts on the first (it compacts and resends). Return
     * `undefined` to leave the status to say what it says.
     *
     * It is the adapter's because what a vendor writes for an overflow is its wire format —
     * the same reason `parseStream` is — and core must not learn every server's wording.
     * It runs on the page for a direct call and on the server for the backend handler, which
     * forwards only the code it returns (never the vendor's prose).
     *
     * @param status The HTTP status.
     * @param body The response body, parsed as JSON; `undefined` when it was not JSON.
     */
    classifyError?(status: number, body: unknown): AparteErrorCode | undefined;
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

/** The message a parsed error body carries, or `${label} ${status}` when it carries none. */
function messageOf(body: unknown, status: number, label: string): string {
    const raw = (body as { error?: { message?: string } | string } | undefined)?.error;
    const msg = typeof raw === 'object' ? raw?.message : raw;
    return typeof msg === 'string' && msg ? msg : `${label} ${status}`;
}

/** Best-effort human message from a non-ok vendor/backend JSON error response. */
export async function vendorErrorMessage(response: Response, label = 'HTTP'): Promise<string> {
    const body = await response.json().catch(() => undefined);
    return messageOf(body, response.status, label);
}

/** Is this one of {@link AparteErrorCode}'s values — a code a backend forwarded, not a vendor's own. */
function isAparteErrorCode(value: unknown): value is AparteErrorCode {
    return typeof value === 'string' && (Object.values(AparteErrorCode) as string[]).includes(value);
}

/**
 * The error a non-ok vendor/backend response becomes: the message the body carries
 * (or `${label} ${status}`), the status, and the code that says what happened — so a
 * 429 and a 503 are told apart by a listener, and an overflowing prompt from a
 * malformed one.
 *
 * The code is, in order: the adapter's own reading of the body (`classifyError`, direct
 * calls), the `error.code` a backend handler forwarded when it is one of ours (a vendor's
 * own `context_length_exceeded` is not, and is ignored here), then the status.
 */
export async function vendorError(
    response: Response,
    label = 'HTTP',
    adapter?: Pick<AparteFormatAdapter, 'classifyError'>,
): Promise<AparteError> {
    const body = await response.json().catch(() => undefined);
    const message = messageOf(body, response.status, label);
    const forwarded = (body as { error?: { code?: unknown } } | undefined)?.error?.code;
    const code = adapter?.classifyError?.(response.status, body)
        ?? (isAparteErrorCode(forwarded) ? forwarded : undefined)
        ?? AparteError.codeForStatus(response.status)
        ?? AparteErrorCode.UNKNOWN_ERROR;
    return new AparteError(message, code, undefined, undefined, response.status);
}

/**
 * Resolve a non-streaming response to text via the adapter's `parseText`.
 * Both transports use this so `stream: false` behaves identically. It throws when the
 * adapter has no `parseText`.
 */
export async function parseNonStreamText(
    provider: { parseText?: (json: unknown) => string; parseSources?: AparteFormatAdapter['parseSources'] },
    response: Response,
    providerId: string,
): Promise<AparteChatResponse> {
    const json = await response.json();
    if (typeof provider.parseText !== 'function') {
        throw new Error(`Provider "${providerId}" cannot resolve a non-streaming response: parseText is not implemented.`);
    }
    return withSources(provider.parseText(json), provider.parseSources?.(json));
}

/**
 * A whole answer: the bare text, or — when it cites sources — the stream a streaming answer
 * would have been, so its sources reach the reply the same way.
 */
export function withSources(text: string, sources: AparteStreamEventMap['sources'] | undefined): AparteChatResponse {
    if (!sources || sources.sources.length === 0) return text;
    const events: AparteStreamEvent[] = [{ type: 'text', delta: text }, { type: 'sources', ...sources }, { type: 'done' }];
    return new ReadableStream<AparteStreamEvent>({
        pull(controller) {
            const next = events.shift();
            if (next) controller.enqueue(next);
            else controller.close();
        },
    });
}
