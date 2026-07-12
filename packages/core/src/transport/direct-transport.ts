import type { AparteChatRequest, AparteChatResponse } from '../types/chat.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import type { AparteTransport, AparteTransportContext } from './types.js';
import { isFormatAdapter, readAuth, vendorErrorMessage, parseNonStreamText } from './types.js';

/** Options for {@link DirectTransport}. */
export interface DirectTransportOptions {
    /**
     * Set when the key is the end-user's own (BYOK) or the model runs locally —
     * i.e. you *intend* the credential to live in the browser. This silences the
     * one-time insecure-key warning. Leave it unset for keys that must stay
     * server-side, and use `BackendTransport` for those instead.
     */
    byok?: boolean;
}

/**
 * Browser-direct transport (BYOK / local / prototyping) — the DEFAULT.
 *
 * Calls the vendor endpoint straight from the browser, injecting the resolved
 * key via the adapter's `authHeaders`. This is the pre-refactor behaviour and
 * is only safe when the user brings their own key or the model runs locally.
 * Production apps that must keep a key server-side should use `BackendTransport`.
 *
 * When a real key is sent straight from the browser and the transport was not
 * flagged `{ byok: true }`, a one-time `console.warn` names the exposure — the
 * default should be loud, not silent. Local providers (no key) never warn.
 *
 * Legacy providers (still exposing `chat()` rather than the adapter surface) are
 * delegated to untouched, so the migration can proceed provider-by-provider.
 */
export class DirectTransport implements AparteTransport {
    private readonly byok: boolean;
    private warnedBrowserKey = false;

    constructor(options: DirectTransportOptions = {}) {
        this.byok = options.byok ?? false;
    }

    async chat(
        provider: AparteAIProvider,
        request: AparteChatRequest,
        auth: string | Record<string, string> | undefined,
        ctx: AparteTransportContext,
    ): Promise<AparteChatResponse> {
        // A real credential is about to leave the browser toward the vendor.
        // Warn once unless the caller opted into BYOK/local on purpose. Hoisted
        // above the adapter/legacy split: a legacy `chat()` provider (or an
        // SDK bridge) carrying a key exposes it exactly the same way — the
        // transport just isn't the one attaching it. Keyless locals never warn.
        const { key, endpoint } = readAuth(auth);
        if (!this.byok && key) {
            this.warnBrowserKeyOnce(ctx.providerId);
        }

        // Not yet a format adapter → let the provider own its fetch+parse.
        // Forward ctx so the provider can honor the abort signal (a bridge
        // wraps it into its SDK call; TransformersProvider simply ignores it).
        if (!isFormatAdapter(provider)) {
            if (typeof provider.chat !== 'function') {
                throw new Error(`Provider "${ctx.providerId}" exposes neither a format-adapter surface nor chat().`);
            }
            return provider.chat(request, auth, ctx);
        }

        const base = endpoint || provider.defaultEndpoint;
        const built = provider.buildRequest(request);

        let url = `${base}${built.path}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json', ...built.headers };
        if (key && provider.authHeaders) Object.assign(headers, provider.authHeaders(key));
        if (key && provider.authQuery) {
            const qs = new URLSearchParams(provider.authQuery(key)).toString();
            url += (url.includes('?') ? '&' : '?') + qs;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(built.body),
            signal: ctx.signal,
        });

        if (!response.ok) {
            throw new Error(await vendorErrorMessage(response));
        }

        if (request.stream === false) {
            return parseNonStreamText(provider, response, ctx.providerId);
        }
        if (!response.body) {
            throw new Error(`Provider "${ctx.providerId}" returned no response body for a streaming request.`);
        }
        return provider.parseStream(response.body);
    }

    private warnBrowserKeyOnce(providerId: string): void {
        if (this.warnedBrowserKey) return;
        this.warnedBrowserKey = true;
        console.warn(
            `[Aparte] DirectTransport is sending the "${providerId}" API key straight from the browser — ` +
            `it is visible to anyone who opens devtools. Fine for BYOK or local models: pass ` +
            `new DirectTransport({ byok: true }) to silence this. For a server-held key, use ` +
            `BackendTransport so the key never reaches the client.`,
        );
    }
}
