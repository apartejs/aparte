/**
 * @aparte/provider-openai-compat — ONE adapter for every OpenAI-compatible
 * chat-completions endpoint.
 *
 * The OpenAI `/chat/completions` wire format is the de-facto industry standard:
 * OpenAI, Mistral, OpenRouter, Z.ai, Groq, Together, LM Studio, Ollama (`/v1`)
 * and many more all speak it. This package is the single, zero-dependency
 * format adapter for that family — vendors differ only by DATA (base URL, auth
 * header, branding), which you pass as config (or pick from `presets`).
 *
 * It replaces the per-vendor `@aparte/provider-{openai,mistral,zai,openrouter,
 * lmstudio,ollama}` packages, whose adapter bodies were byte-identical copies
 * (drift even produced real bugs: LM Studio dropped `max_tokens`, Z.ai dropped
 * `seed` — both fixed here by construction, there is only one body now).
 *
 * Model lists are CONSUMER data: pass `models` statically, or rely on the
 * generic `GET {baseURL}/models` fetcher (part of the compat standard). For
 * vendors outside this family (Anthropic, Gemini, …) use the AI-SDK bridge
 * provider instead — this package deliberately covers ONE format.
 */

import type {
    AparteAIProvider,
    AparteAIModel,
    AparteAIProviderConfigSchema,
    AparteChatRequest,
    AparteChatMessage,
    AparteTool,
    AparteToolCall,
    AparteContentPart,
    AparteStreamEvent,
    AparteUsage,
    AparteFinishReason,
    AparteFormatAdapter,
} from '@aparte/core';
import { AparteErrorCode, contentToText } from '@aparte/core';
import { createSourceCollector } from './sources.js';

// ─── Options ─────────────────────────────────────────────────────────────────

/** Config for one OpenAI-compatible endpoint. Everything but `id`/`baseURL` is branding/data. */
export interface OpenAICompatProviderOptions {
    /** Provider id used across aparté (key resolution, model picker, events). */
    id: string;
    /** Endpoint base, e.g. `https://api.openai.com/v1` or `http://localhost:11434/v1`. */
    baseURL: string;
    /** Display name (defaults to `id`). */
    name?: string;
    /** Brand icon (SVG string / data URI / icon-provider key). */
    icon?: string;
    /** Brand color. */
    color?: string;
    /** Short tag line. */
    description?: string;
    /** Where the user gets a key. */
    helpUrl?: string;
    /** Whether the vendor offers free models. */
    hasFreeModels?: boolean;
    /**
     * Local server (LM Studio, Ollama…): key optional, and the generic
     * `/models` fetch runs even without a key.
     */
    isLocal?: boolean;
    /**
     * `false` when the endpoint answers no `GET /models` (Perplexity): `fetchModels` then
     * serves `models` instead of asking, rather than logging a failed request.
     */
    listsModels?: boolean;
    /**
     * Which local server this endpoint is, so `fetchModels` can read the context window
     * the server actually serves through that server's own API: LM Studio's
     * `/api/v1/models`, Ollama's `/api/ps`, llama.cpp's `/props`. Data, not code — the
     * request shape is the same for everyone and only the probe differs. With it,
     * `fetchModels` makes one extra request at the endpoint's origin (the `/v1` path
     * stripped) and prefers the EFFECTIVE window (what the server loaded, which is where
     * it truncates) over the trained maximum. A probe that fails leaves the models
     * without a window; it never fails the model list. `'vllm'` needs no extra request,
     * its `/v1/models` already carries `max_model_len`, and is accepted so a preset can
     * say what it is.
     */
    server?: 'lmstudio' | 'ollama' | 'llamacpp' | 'vllm';
    /** Static model list (consumer data). Defaults to `[]` — use `fetchModels`. */
    models?: AparteAIModel[];
    /**
     * Extra headers sent on every request (chat + model fetch), e.g.
     * OpenRouter's attribution headers `HTTP-Referer` / `X-Title`.
     */
    extraHeaders?: Record<string, string>;
    /**
     * Fields added to every chat request body, for a vendor switch outside the OpenAI
     * schema, e.g. Zhipu's `thinking: { type: 'disabled' }` on GLM. The body's
     * counterpart of `extraHeaders`. The fields this adapter writes stay its own
     * (`model`, `messages`, `stream`, `tools`… see `ADAPTER_FIELDS`): an
     * `extraBody` key of the same name is ignored.
     */
    extraBody?: Record<string, unknown>;
    /** Override the default apiKey+endpoint settings schema. */
    configSchema?: AparteAIProviderConfigSchema;
}

/** The body fields `buildRequest` writes itself: `extraBody` cannot replace them. */
const ADAPTER_FIELDS = new Set(['model', 'messages', 'temperature', 'max_tokens', 'stream', 'stream_options', 'seed', 'tools', 'tool_choice']);

// ─── Message / tool shaping (the format half) ────────────────────────────────

/** Content → OpenAI multipart array when images are present. */
function toOpenAIContent(content: string | AparteContentPart[]): unknown {
    if (typeof content === 'string') return content;
    // Two arms, exhaustive: a part is text or an image. A third used to answer the
    // removed `AparteFilePart` with an empty text part — a branch nothing could reach,
    // standing in for inline-file support this format does not have.
    return content.map(p => (p.type === 'text'
        ? { type: 'text', text: p.text }
        : { type: 'image_url', image_url: { url: p.image } }));
}

/**
 * The two roles a tool turn used to wear. `AparteChatMessage` no longer allows either, so
 * the comparison is on the role as a string: a message carrying one comes from code built
 * against an older aparté, which no type here can catch. Warned once per role, then
 * skipped — passing it on would put an unknown role on the wire and 400 the whole request.
 */
const LEGACY_TOOL_ROLES = new Set(['tool_call', 'tool_result']);
const warnedLegacyRoles = new Set<string>();
function warnLegacyToolRole(role: string): void {
    if (warnedLegacyRoles.has(role)) return;
    warnedLegacyRoles.add(role);
    console.warn(
        `[@aparte/provider-openai-compat] Skipping a message with the removed role "${role}".`
        + " A tool turn is now an assistant message carrying its calls — { role: 'assistant',"
        + " content: <what it said>, toolCalls } — followed by one { role: 'tool', content:"
        + ' <result>, toolCallId, toolName } per call. This warning is removed in 0.18.',
    );
}

// The other half of that legacy shape, and it is deliberately NOT warned: an assistant
// message built by hand with both `toolCalls` and image parts loses the images here.
// Chat Completions does not carry them — an assistant message's content parts are `text`
// and `refusal`, never `image_url` — so the mapping that used to emit them was a 400
// waiting to happen, and the loop cannot mint the shape (`stream-run.ts` builds an
// assistant's content from a string). Images on a USER turn are carried, unchanged.

/** AparteChatMessage[] → OpenAI messages (incl. an assistant turn's calls and the `tool` answers). */
function toOpenAIMessages(messages: AparteChatMessage[]): unknown[] {
    const out: unknown[] = [];
    for (const msg of messages) {
        const role: string = msg.role;
        if (LEGACY_TOOL_ROLES.has(role)) {
            warnLegacyToolRole(role);
            continue;
        }
        if (msg.role === 'tool') {
            out.push({ role: 'tool', tool_call_id: msg.toolCallId, content: contentToText(msg.content) });
            continue;
        }
        if (msg.role === 'assistant' && msg.toolCalls?.length) {
            out.push({
                role: 'assistant',
                // `||`, not `??`: this API takes null (or nothing) beside `tool_calls`, and
                // an assistant that said nothing before its calls now carries '' — which
                // some endpoints reject and the rest read as an empty reply.
                content: contentToText(msg.content) || null,
                tool_calls: msg.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: JSON.stringify(tc.input) },
                })),
            });
            continue;
        }
        out.push({ role: msg.role, content: toOpenAIContent(msg.content) });
    }
    return out;
}

/** AparteTool[] → OpenAI function-tool declarations. */
function toOpenAITools(tools: AparteTool[]): unknown[] {
    return tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
}

/** Accept both raw keys and user-pasted `Bearer xxx` values (local servers). */
function bearer(key: string): string {
    return key.startsWith('Bearer ') ? key : `Bearer ${key}`;
}

/** Map the server's `finish_reason` onto aparté's closed union. */
function toFinishReason(raw: string): AparteFinishReason {
    switch (raw) {
        case 'stop': return 'stop';
        case 'length': return 'length';
        case 'tool_calls':
        case 'function_call': return 'tool-calls';
        case 'content_filter': return 'content-filter';
        default: return 'other';
    }
}

/** The message of a `{ "error": … }` payload: `error.message`, or the error itself when it is a string. */
function errorPayloadMessage(error: unknown): string {
    if (typeof error === 'string' && error) return error;
    const message = (error as { message?: unknown } | null)?.message;
    return typeof message === 'string' && message ? message : 'The server reported an error';
}

/**
 * What servers write when the prompt is longer than the model's window: OpenAI's
 * "maximum context length", the generic "context length", LM Studio's "Context size has
 * been exceeded", llama.cpp's `exceed_context_size_error` ("the request exceeds the
 * available context size"), Anthropic-compatible gateways' "prompt is too long". Matched
 * against the message, the type and the code of the payload, because each server puts the
 * telltale in a different one.
 */
const CONTEXT_OVERFLOW = /maximum context length|context length|context size has been exceeded|exceed_context_size_error|exceeds the available context size|prompt is too long/i;

/** Is this `{ "error": … }` payload a prompt that did not fit? OpenAI's own `context_length_exceeded` code says so outright. */
function isContextOverflow(error: unknown): boolean {
    if (typeof error === 'string') return CONTEXT_OVERFLOW.test(error);
    const fields = error as { message?: unknown; type?: unknown; code?: unknown } | null;
    const strings = [fields?.message, fields?.type, fields?.code].filter((v): v is string => typeof v === 'string');
    return strings.some((v) => v === 'context_length_exceeded' || CONTEXT_OVERFLOW.test(v));
}

/**
 * The error event for a payload the server streamed after its 200. An overflow carries
 * its code, so the client can compact and resend instead of showing the prose.
 */
function errorEvent(error: unknown): AparteStreamEvent {
    const message = errorPayloadMessage(error);
    return isContextOverflow(error)
        ? { type: 'error', message, code: AparteErrorCode.USAGE_CONTEXT_EXCEEDED }
        : { type: 'error', message };
}

// ─── Context window ──────────────────────────────────────────────────────────

/**
 * The fields a `GET /models` entry may carry its window in, by vendor: OpenRouter and
 * Together (`context_length`), vLLM (`max_model_len`), Groq (`context_window`), Mistral
 * and LM Studio (`max_context_length`). Read in this order; the first positive integer wins.
 */
const WINDOW_FIELDS = ['context_length', 'max_model_len', 'context_window', 'max_context_length'] as const;

function positiveInt(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined;
}

function genericWindow(entry: Record<string, unknown>): number | undefined {
    for (const field of WINDOW_FIELDS) {
        const n = positiveInt(entry[field]);
        if (n !== undefined) return n;
    }
    return undefined;
}

type WindowOf = (modelId: string) => number | undefined;

type Json = Record<string, unknown>;

/** A server's JSON is whatever it sent: narrow to an object, or to nothing. */
function asJson(v: unknown): Json {
    return v !== null && typeof v === 'object' ? v as Json : {};
}

function asJsonList(v: unknown): Json[] {
    return Array.isArray(v) ? v.map(asJson) : [];
}

async function getJSON(url: string, headers: Record<string, string>): Promise<Json> {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return asJson(await response.json());
}

/**
 * Ask a local server for the window it serves, through its own API. Returns a lookup by
 * model id. Throws on a failed probe; the caller turns that into "no window".
 *
 * What each one reads, and what it deliberately does NOT:
 * - LM Studio: a LOADED model's `loaded_instances[].config.context_length`. An unloaded
 *   model has only `max_context_length`, the trained maximum, which is not what a JIT
 *   load will run with — reading it would draw a gauge against a ceiling the server
 *   never enforces, so an unloaded model is left without a window.
 * - Ollama: `/api/ps`, a loaded runner's `context_length`. Ollama also truncates the
 *   prompt silently, and `/api/show` only has `num_ctx` when a Modelfile bakes one in,
 *   so the trained maximum there is never used either.
 * - llama.cpp: `default_generation_settings.n_ctx` of `/props`, the per-slot window,
 *   one value for the one model the process serves.
 */
async function probeWindows(
    server: NonNullable<OpenAICompatProviderOptions['server']>,
    origin: string,
    headers: Record<string, string>,
): Promise<WindowOf | undefined> {
    if (server === 'lmstudio') {
        const byId = new Map<string, number>();
        let data: Json | undefined;
        try {
            data = await getJSON(`${origin}/api/v1/models`, headers);
        } catch {
            // Before the v1 REST API (and still beside it), `/api/v0/models` lists each
            // model with the window it was loaded at: `loaded_context_length` on a
            // `state: "loaded"` entry, read live on LM Studio 0.4.26.
            const legacy = await getJSON(`${origin}/api/v0/models`, headers);
            for (const m of asJsonList(legacy['data'])) {
                const n = positiveInt(m['loaded_context_length']);
                if (typeof m['id'] === 'string' && n !== undefined) byId.set(m['id'], n);
            }
            return id => byId.get(id);
        }
        for (const m of asJsonList(data['models'])) {
            const instances = asJsonList(m['loaded_instances']);
            // A model loaded under an identifier of its own (`lms load … --identifier`) is
            // listed by `/v1/models` under that identifier, which is the instance's id —
            // so each instance answers for its own id, and the model's key for its first.
            for (const instance of instances) {
                const n = positiveInt(asJson(instance['config'])['context_length']);
                if (typeof instance['id'] === 'string' && n !== undefined) byId.set(instance['id'], n);
            }
            const first = positiveInt(asJson(instances[0]?.['config'])['context_length']);
            if (typeof m['key'] === 'string' && first !== undefined && !byId.has(m['key'])) byId.set(m['key'], first);
        }
        return id => byId.get(id);
    }
    if (server === 'ollama') {
        const data = await getJSON(`${origin}/api/ps`, headers);
        const byName = new Map<string, number>();
        for (const m of asJsonList(data['models'])) {
            const n = positiveInt(m['context_length']);
            if (n === undefined) continue;
            for (const name of [m['name'], m['model']]) if (typeof name === 'string') byName.set(name, n);
        }
        // `/v1/models` lists `llama3.2:latest`; a bare `llama3.2` is the same model.
        return id => byName.get(id) ?? byName.get(id.endsWith(':latest') ? id.slice(0, -7) : `${id}:latest`);
    }
    if (server === 'llamacpp') {
        const data = await getJSON(`${origin}/props`, headers);
        const n = positiveInt(asJson(data['default_generation_settings'])['n_ctx']);
        return n === undefined ? undefined : () => n;
    }
    return undefined;
}

const DEFAULT_CONFIG_SCHEMA = (opts: OpenAICompatProviderOptions): AparteAIProviderConfigSchema => ({
    fields: opts.isLocal
        ? [
            { id: 'endpoint', type: 'url', label: 'Server', defaultValue: opts.baseURL, required: true },
            { id: 'apiKey', type: 'password', label: 'API Key / Token (optional)', placeholder: 'Bearer ...', isAdvanced: true },
        ]
        : [
            { id: 'apiKey', type: 'password', label: 'API Key', placeholder: 'sk-...', required: true },
            { id: 'endpoint', type: 'url', label: 'Custom endpoint', placeholder: opts.baseURL, isAdvanced: true },
        ],
});

// ─── The factory ─────────────────────────────────────────────────────────────

/**
 * What {@link createOpenAICompatProvider} hands back: a provider whose whole
 * format-adapter surface is guaranteed present.
 *
 * `AparteAIProvider` declares that surface optional — correct in general, since a
 * provider may own its I/O through `chat()` instead — and `AparteFormatAdapter` keeps
 * `authHeaders` / `parseText` / `classifyError` optional because some vendors authenticate
 * by query string, never answer non-streaming, or say nothing a client could classify.
 * THIS factory always supplies all of them, so
 * saying so here is the difference between a caller writing
 * `provider.buildRequest(req)` and a caller sprinkling `!` or writing a check that
 * cannot fail. Useful to annotate with when you drive the adapter yourself (your own
 * `fetch`, your own `AbortSignal`) from a server or an Electron main process.
 */
export type OpenAICompatProvider =
    AparteAIProvider
    & AparteFormatAdapter
    & Required<Pick<AparteFormatAdapter, 'authHeaders' | 'parseText' | 'classifyError'>>;

/**
 * Build an `AparteAIProvider` (full format-adapter surface) for one
 * OpenAI-compatible endpoint. Register it like any provider:
 *
 * ```ts
 * import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
 * aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
 * // or any compat endpoint, no preset needed:
 * aparteGlobalConfig.registerAIProvider(createOpenAICompatProvider({ id: 'groq', baseURL: 'https://api.groq.com/openai/v1' }));
 * ```
 *
 * Returns {@link OpenAICompatProvider}: the full format-adapter surface, non-optional.
 */
export function createOpenAICompatProvider(opts: OpenAICompatProviderOptions): OpenAICompatProvider {
    const displayName = opts.name ?? opts.id;

    return {
        id: opts.id,

        getMetadata() {
            return {
                id: opts.id,
                name: displayName,
                icon: opts.icon,
                color: opts.color,
                description: opts.description,
                helpUrl: opts.helpUrl,
                hasFreeModels: opts.hasFreeModels,
                isLocal: opts.isLocal,
                configSchema: opts.configSchema ?? DEFAULT_CONFIG_SCHEMA(opts),
            };
        },

        getModels(): AparteAIModel[] {
            return opts.models ?? [];
        },

        /**
         * Generic `GET {baseURL}/models` — part of the compat standard. Cloud
         * endpoints need a key (returns `[]` without one); local servers fetch
         * keyless. Vendor-specific niceties (pricing, name prettifying) are
         * consumer concerns: pass `models` yourself for anything fancier.
         */
        async fetchModels(config?: string | Record<string, string>): Promise<AparteAIModel[]> {
            const apiKey = typeof config === 'string' ? config : config?.['apiKey'];
            const endpoint = (typeof config === 'object' ? config?.['endpoint'] : null) || opts.baseURL;
            if (opts.listsModels === false) return opts.models ?? [];
            if (!apiKey && !opts.isLocal) return [];

            try {
                const headers: Record<string, string> = { ...opts.extraHeaders };
                if (apiKey) headers['Authorization'] = bearer(apiKey);
                const response = await fetch(`${endpoint}/models`, { headers });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json() as { data?: Array<Record<string, unknown> & { id: string; name?: string }> };

                // The server's own view of the window, when this endpoint says which
                // server it is. Quiet on failure: the list is still good without it.
                let probed: WindowOf | undefined;
                if (opts.server) {
                    try {
                        probed = await probeWindows(opts.server, new URL(endpoint).origin, headers);
                    } catch (error) {
                        console.warn(`[${displayName}] Could not read the context window from the ${opts.server} server:`, error);
                    }
                }
                // A window the consumer declared on a static model beats anything read.
                const declared = new Map((opts.models ?? []).flatMap(m => (m.contextWindow ? [[m.id, m.contextWindow] as const] : [])));

                return (data.data ?? []).map(m => {
                    const contextWindow = declared.get(m.id) ?? probed?.(m.id) ?? genericWindow(m);
                    return {
                    id: m.id,
                    name: m.name || m.id,
                    ...(contextWindow !== undefined ? { contextWindow } : {}),
                    // `function_calling` is declared because it is a property of the
                    // WIRE FORMAT, which is what this provider is: `/chat/completions`
                    // takes a `tools` array, and every server behind a compat endpoint
                    // accepts one. `/models` returns `{id, object, owned_by}` and says
                    // nothing about tools, so waiting for it to declare the capability
                    // means never declaring it — and core gates tools on exactly this
                    // field, so a registered tool, an approval gate and the whole
                    // elicitation path were dead on this provider: the model was asked
                    // to use a tool it had never been sent.
                    //
                    // The failure mode of over-declaring is mild and visible: a model
                    // that cannot call tools simply does not call one. The failure mode
                    // of under-declaring was silent and total. A server that rejects a
                    // `tools` array outright surfaces as an error from its own endpoint,
                    // which is the right place for that argument to happen.
                    capabilities: ['streaming', 'function_calling'],
                    };
                });
            } catch (error) {
                console.error(`[${displayName}] Failed to fetch models:`, error);
                return [];
            }
        },

        // ── Format-adapter surface (transport ⊥ format) ──────────────────────
        // The vendor concern only: request shape + stream parsing. Auth and
        // network are the transport's job (AparteDirectTransport / AparteBackendTransport).
        defaultEndpoint: opts.baseURL,

        buildRequest(request: AparteChatRequest) {
            const body: Record<string, unknown> = {
                ...Object.fromEntries(Object.entries(opts.extraBody ?? {}).filter(([key]) => !ADAPTER_FIELDS.has(key))),
                model: request.modelId,
                messages: toOpenAIMessages(request.messages),
                temperature: request.temperature,
                max_tokens: request.maxTokens,
                stream: request.stream ?? true,
                ...((request.stream ?? true) ? { stream_options: { include_usage: true } } : {}),
                ...(request.seed !== undefined ? { seed: request.seed } : {}),
            };
            if (request.tools?.length) {
                body['tools'] = toOpenAITools(request.tools);
                /*
                 * A forced tool travels; `'auto'` is only the DEFAULT. It used to be
                 * written unconditionally, so `toolChoice: { name }` — a shape the loop
                 * passes straight through, since it intercepts only `{ name, input }`
                 * (the synthetic call it runs itself) — was silently downgraded to
                 * "the model decides", while the ai-sdk bridge honoured the same field.
                 * `'none'` never reaches here: core strips the tools upstream.
                 */
                const forced = typeof request.toolChoice === 'object' ? request.toolChoice.name : undefined;
                body['tool_choice'] = forced ? { type: 'function', function: { name: forced } } : 'auto';
            }
            return {
                path: '/chat/completions',
                body,
                ...(opts.extraHeaders ? { headers: opts.extraHeaders } : {}),
            };
        },

        authHeaders(key: string) {
            return { Authorization: bearer(key) };
        },

        parseStream(body: ReadableStream<Uint8Array>) {
            return parseOpenAICompatStream(body);
        },

        /**
         * A 400 (or a 413) whose body says the prompt did not fit is an overflow, not a bad
         * request: the client compacts and sends the turn again. Other statuses keep what
         * the status says.
         */
        classifyError(status: number, body: unknown): AparteErrorCode | undefined {
            if (status !== 400 && status !== 413) return undefined;
            return isContextOverflow((body as { error?: unknown } | null | undefined)?.error)
                ? AparteErrorCode.USAGE_CONTEXT_EXCEEDED
                : undefined;
        },

        parseText(json: unknown): string {
            // A 200 that carries `error` and no `choices` is a failure, not an empty
            // reply: LM Studio answers a context overflow this way. The direct
            // transport propagates the throw as the turn's error.
            const payload = json as { error?: unknown; choices?: unknown } | null;
            if (payload?.error && !payload.choices) {
                const failure = new Error(errorPayloadMessage(payload.error));
                throw isContextOverflow(payload.error)
                    ? Object.assign(failure, { code: AparteErrorCode.USAGE_CONTEXT_EXCEEDED })
                    : failure;
            }
            return (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || '';
        },

        /** What a non-streamed answer cites: the same annotations and Perplexity fields a stream carries. */
        parseSources(json: unknown) {
            const payload = json as { choices?: Array<{ message?: { content?: unknown; annotations?: unknown } }>; citations?: unknown; search_results?: unknown } | null;
            const message = payload?.choices?.[0]?.message;
            const cited = createSourceCollector();
            cited.addAnnotations(message?.annotations);
            cited.addListed(payload?.citations, payload?.search_results);
            const event = cited.finish(typeof message?.content === 'string' ? message.content : '');
            return event ? { sources: event.sources, ...(event.citations ? { citations: event.citations } : {}) } : undefined;
        },
    };
}

// ─── SSE stream parser (ported from @aparte/core parseOpenAIStream) ──────────

/**
 * OpenAI-compatible SSE stream parser — this package's own copy of core's
 * `parseOpenAIStream` (the parser follows the format adapter; core keeps only
 * the aparté-native NDJSON parser).
 *
 * Handles:
 * - `delta.content`            → text event
 * - `delta.reasoning_content`  → thinking event (Qwen3, DeepSeek R1, …)
 * - `delta.tool_calls`         → accumulate → tool_use on finish_reason='tool_calls'
 * - `annotations` (url_citation) and Perplexity's `citations` / `search_results`
 *                              → ONE `sources` event, just before `done` (see `sources.ts`)
 * - `finish_reason`           → `finishReason` on the `done`
 * - `{ error }` data line      → error event, and the stream ends there (no `done`)
 * - usage-only chunk + [DONE]  → done{usage}
 */
export function parseOpenAICompatStream(
    stream: ReadableStream<Uint8Array>,
): ReadableStream<AparteStreamEvent> {
    const decoder = new TextDecoder();
    let buffer = '';

    /*
     * Tool call accumulation state, in wire order, keyed by `toolCallKey` below.
     * A Map, not an object: the key comes off the wire, and on a plain `{}` a chunk
     * whose `index` is `"__proto__"` writes into Object.prototype for the whole page.
     */
    const toolCalls = new Map<string, { id: string; name: string; args: string }>();
    /** The call the last delta touched — what a bare argument fragment continues. */
    let lastToolKey: string | null = null;
    /**
     * Every key a delta has addressed a call by → that call's slot in `toolCalls`.
     * One call can be addressed both ways in one turn (by `index` in a chunk, by `id`
     * in the next), so the identity is the alias, not the key of the moment.
     */
    const toolCallAliases = new Map<string, string>();
    /** Ids minted for a vendor that sends none. Per stream, i.e. per turn. */
    let mintedCallIds = 0;
    let capturedUsage: AparteUsage | undefined;
    /** The last non-null `finish_reason` seen, mapped; every `done` carries it. */
    let finishReason: AparteFinishReason | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    /**
     * What the call has said so far, and what it cites. A citation's offsets are into the
     * whole message text, so the `sources` event waits for the end of the stream, when the
     * text is complete and the offsets can be checked against it.
     */
    let streamed = '';
    const cited = createSourceCollector();
    // Once, at the first of a tool call and the end: a call the loop refuses, or one with no
    // handler, ends the turn without reading on, and its sources would never arrive.
    let sourcesSent = false;
    const flushSources = (controller: ReadableStreamDefaultController<AparteStreamEvent>): void => {
        if (sourcesSent) return;
        sourcesSent = true;
        const event = cited.finish(streamed);
        if (event) controller.enqueue(event);
    };

    /*
     * Emit the accumulated calls and clear the map.
     *
     * Called at EVERY graceful end of a turn, not only on `finish_reason: 'tool_calls'`:
     * the accumulation spans the whole stream, and a vendor that ends with `stop`,
     * `length` or a bare `[DONE]` after streaming tool-call deltas used to drop them —
     * the model had asked for a tool and the loop never heard. `complete` says the
     * model declared the calls finished: a parse failure there is malformed JSON (a
     * real small-model failure) and the tool still runs, on `{}`. Elsewhere it is
     * truncation, and running a tool on `{}` for a call the model never finished would
     * be worse than dropping it — so those are dropped, with a breadcrumb.
     */
    const flushToolCalls = (controller: ReadableStreamDefaultController<AparteStreamEvent>, complete: boolean): void => {
        for (const entry of toolCalls.values()) {
            let input: Record<string, unknown> = {};
            try {
                input = entry.args.trim() ? JSON.parse(entry.args) : {};
            } catch {
                if (!complete) {
                    console.warn(`[openai-compat] Tool "${entry.name}" was cut mid-arguments (the turn ended without finish_reason 'tool_calls'); the call is dropped. Raw:`, entry.args);
                    continue;
                }
                console.warn(
                    `[openai-compat] Tool "${entry.name}" returned malformed arguments JSON; ` +
                    `passing empty input. Raw:`, entry.args,
                );
            }
            const toolCall: AparteToolCall = { id: entry.id, name: entry.name, input };
            controller.enqueue({ type: 'tool_use', ...toolCall });
        }
        toolCalls.clear();
        toolCallAliases.clear();
        lastToolKey = null;
    };

    /*
     * Which accumulated call a `delta.tool_calls` entry belongs to.
     *
     * Both `index` and `id` address a call, and a vendor may use one in a chunk and
     * the other in the next — so neither can BE the identity: a delta's keys are
     * ALIASES that all resolve to the same slot. A key already resolved names the
     * call, and every key a delta carries is recorded against the slot it lands on.
     * Picking one key instead (`index` first, `id` next) split such a call in two,
     * the second half nameless, and the turn ran the tool on `{}`.
     *
     * When no key of the delta is known yet, the function NAME decides — it appears
     * only on a call's FIRST delta, so a nameless delta continues the call before it
     * and a named one opens its own. That single rule covers the vendor whose deltas
     * never carry both addresses at once (open by `id`, continue by `index`, or the
     * reverse) and the vendor that carries neither: `index` is a streaming
     * convenience, not part of the function-call payload, and keying on it alone
     * (`Number(tc.index ?? 0)`) put every call of a server that omits it on slot 0.
     *
     * `null` means "skip this entry": an `index` the vendor sent that is not a
     * non-negative integer is not a slot number, it is malformed (or hostile —
     * `"__proto__"` was the shape that made this a Map).
     */
    const toolCallKey = (tc: { index?: unknown; id?: string; function?: { name?: string } }): string | null => {
        let indexKey: string | undefined;
        if (tc.index !== undefined && tc.index !== null) {
            // Made a number, not annotated as one: `index` is whatever the vendor's JSON put there.
            const idx = Number(tc.index);
            if (!Number.isInteger(idx) || idx < 0) return null;
            indexKey = `i${idx}`;
        }
        const idKey = tc.id ? `d${tc.id}` : undefined;
        const known = (idKey ? toolCallAliases.get(idKey) : undefined) ?? (indexKey ? toolCallAliases.get(indexKey) : undefined);
        // No key of this delta is known yet. A nameless delta never OPENS a call, so it
        // continues the call before it — which is what keeps ONE call together when the
        // vendor opens it with one address and continues it with the other, neither
        // delta carrying both. A named delta still opens its own slot.
        const key = known ?? ((!tc.function?.name && lastToolKey !== null) ? lastToolKey : (idKey ?? indexKey));
        if (key === undefined) return `p${toolCalls.size}`;
        if (idKey) toolCallAliases.set(idKey, key);
        if (indexKey) toolCallAliases.set(indexKey, key);
        return key;
    };

    return new ReadableStream<AparteStreamEvent>({
        async start(controller) {
            reader = stream.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) continue;
                        const raw = trimmed.slice(5).trim();
                        if (raw === '[DONE]') {
                            // A turn that streamed tool-call deltas and ended on `stop`,
                            // `length` or a bare [DONE]: the calls are still the model's.
                            flushToolCalls(controller, false);
                            flushSources(controller);
                            controller.enqueue({ type: 'done', usage: capturedUsage, ...(finishReason ? { finishReason } : {}) });
                            return;
                        }
                        try {
                            const json = JSON.parse(raw);

                            // Capture usage from the usage-only chunk (choices: [])
                            if (json.usage) {
                                capturedUsage = {
                                    inputTokens: json.usage.prompt_tokens ?? 0,
                                    outputTokens: json.usage.completion_tokens ?? 0,
                                    totalTokens: json.usage.total_tokens,
                                    cacheReadTokens: json.usage.prompt_tokens_details?.cached_tokens,
                                };
                            }

                            // Perplexity's list of sources rides on any chunk, usage-only ones
                            // included, which is why it is read before the choice is.
                            cited.addListed(json.citations, json.search_results);

                            // An error the server streamed AFTER a 200 (LM Studio on a context
                            // overflow, OpenAI and vLLM mid-stream). Without this the line was
                            // skipped as "no choices" and the turn ended on an empty `done`:
                            // an empty reply marked completed. An `event: error` line before it
                            // is ignored like every non-`data:` line; this data line is the payload.
                            if (json.error) {
                                controller.enqueue(errorEvent(json.error));
                                reader?.cancel().catch(() => undefined);
                                return;
                            }

                            const choice = json.choices?.[0];
                            if (!choice) continue;
                            if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
                                finishReason = toFinishReason(choice.finish_reason);
                            }

                            const delta = choice.delta;
                            // Annotations: on the delta as OpenAI and OpenRouter stream them
                            // (usually in a late chunk, after the text), or on a whole `message`
                            // as some servers stream the non-streamed shape.
                            cited.addAnnotations(delta?.annotations);
                            cited.addAnnotations(choice.message?.annotations);
                            if (delta) {
                                if (delta.reasoning_content) {
                                    controller.enqueue({ type: 'thinking', delta: delta.reasoning_content });
                                }
                                if (delta.content) {
                                    streamed += delta.content;
                                    controller.enqueue({ type: 'text', delta: delta.content });
                                }
                                if (delta.tool_calls) {
                                    for (const tc of delta.tool_calls) {
                                        const key = toolCallKey(tc);
                                        if (key === null) continue;
                                        let entry = toolCalls.get(key);
                                        if (!entry) {
                                            /*
                                             * An id is MINTED when the vendor sends none. `id: ''`
                                             * used to travel: the transcript keys a row on
                                             * `tool-${id}` and the history a result on
                                             * `toolCallId`, so two id-less calls in one turn shared
                                             * one row (the second call's result landed on the first
                                             * call's line) and one history slot an OpenAI-shaped
                                             * endpoint rejects on the next turn. A real id arriving
                                             * in a later chunk still wins, below. The mint is
                                             * namespaced because `call_1` is what an OpenAI-shaped
                                             * server calls its own first call: a turn mixing an
                                             * id-less call with a real `call_1` minted a duplicate.
                                             */
                                            entry = { id: tc.id ?? `aparte-call-${++mintedCallIds}`, name: tc.function?.name ?? '', args: '' };
                                            toolCalls.set(key, entry);
                                        }
                                        lastToolKey = key;
                                        if (tc.id) entry.id = tc.id;
                                        if (tc.function?.name) entry.name = tc.function.name;
                                        if (tc.function?.arguments) entry.args += tc.function.arguments;
                                    }
                                }
                            }

                            // The model declared the calls complete: emit them now (and clear
                            // the map, so a server that repeats the finish chunk cannot
                            // re-emit them). Do NOT emit `done` or return here: under
                            // `include_usage` (which buildRequest requests) the usage-only
                            // chunk arrives AFTER this finish chunk, so stopping now dropped
                            // usage on every tool-call turn — i.e. most turns of an agent.
                            // Keep reading; the single `done` comes from `[DONE]` below, or
                            // from the end-of-stream fallback if the socket just closes.
                            if (choice.finish_reason === 'tool_calls') {
                                flushSources(controller);
                                flushToolCalls(controller, true);
                            }
                        } catch {
                            // Every line here is a complete, newline-terminated SSE
                            // line (see buffer split above), so a parse failure is an
                            // unexpected/malformed server payload, not partial JSON —
                            // log a breadcrumb instead of dropping it silently.
                            console.warn('[openai-compat] Skipped an unparseable SSE data line:', raw);
                        }
                    }
                }
                // The socket closed without [DONE]: same rule, the calls are flushed first.
                flushToolCalls(controller, false);
                flushSources(controller);
                controller.enqueue({ type: 'done', usage: capturedUsage, ...(finishReason ? { finishReason } : {}) });
            } catch (err: unknown) {
                // AbortError surfaces here when the caller's signal fires mid-stream:
                // the consumer (agent loop) cancelled on purpose — end quietly, the
                // same way the ai-sdk provider does. Reporting it as an `error` event
                // makes a deliberate Stop indistinguishable from a network failure,
                // and the loop's error branch then replaces the streamed answer with
                // an error bubble.
                if ((err as { name?: string } | undefined)?.name !== 'AbortError') {
                    controller.enqueue({ type: 'error', message: (err as Error | undefined)?.message ?? 'Stream error' });
                }
            } finally {
                reader?.releaseLock();
                reader = null;
                controller.close();
            }
        },
        // Consumer cancelled (e.g. user hit "stop"): cancel the underlying reader so
        // the vendor response body stops being drained to its natural end instead of
        // silently finishing the whole SSE stream in the background.
        cancel(reason) {
            const r = reader;
            reader = null;
            return r?.cancel(reason);
        },
    });
}

export * from './presets.js';
export type { AparteAIProvider, AparteAIModel } from '@aparte/core';
