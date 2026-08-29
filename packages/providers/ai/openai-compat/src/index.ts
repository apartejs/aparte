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
    AparteFormatAdapter,
} from '@aparte/core';
import { contentToText } from '@aparte/core';

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
    /** Static model list (consumer data). Defaults to `[]` — use `fetchModels`. */
    models?: AparteAIModel[];
    /**
     * Extra headers sent on every request (chat + model fetch), e.g.
     * OpenRouter's attribution headers `HTTP-Referer` / `X-Title`.
     */
    extraHeaders?: Record<string, string>;
    /** Override the default apiKey+endpoint settings schema. */
    configSchema?: AparteAIProviderConfigSchema;
}

// ─── Message / tool shaping (the format half) ────────────────────────────────

/** Content → OpenAI multipart array when images are present. */
function toOpenAIContent(content: string | AparteContentPart[]): unknown {
    if (typeof content === 'string') return content;
    return content.map(p => {
        if (p.type === 'text') return { type: 'text', text: p.text };
        if (p.type === 'image') return { type: 'image_url', image_url: { url: p.image } };
        return { type: 'text', text: '' }; // AparteFilePart — no inline-file support in the compat format
    });
}

/** AparteChatMessage[] → OpenAI messages (incl. the tool_call / tool_result envelope). */
function toOpenAIMessages(messages: AparteChatMessage[]): unknown[] {
    return messages.map(msg => {
        if (msg.role === 'tool_call') {
            return {
                role: 'assistant',
                content: msg.precedingText ?? null,
                tool_calls: (msg.toolCalls ?? []).map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: JSON.stringify(tc.input) },
                })),
            };
        }
        if (msg.role === 'tool_result') {
            return { role: 'tool', tool_call_id: msg.toolCallId, content: contentToText(msg.content) };
        }
        return { role: msg.role, content: toOpenAIContent(msg.content) };
    });
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
 * `authHeaders` / `parseText` optional because some vendors authenticate by query
 * string or never answer non-streaming. THIS factory always supplies all of them, so
 * saying so here is the difference between a caller writing
 * `provider.buildRequest(req)` and a caller sprinkling `!` or writing a check that
 * cannot fail. Useful to annotate with when you drive the adapter yourself (your own
 * `fetch`, your own `AbortSignal`) from a server or an Electron main process.
 */
export type OpenAICompatProvider =
    AparteAIProvider
    & AparteFormatAdapter
    & Required<Pick<AparteFormatAdapter, 'authHeaders' | 'parseText'>>;

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
            if (!apiKey && !opts.isLocal) return [];

            try {
                const headers: Record<string, string> = { ...opts.extraHeaders };
                if (apiKey) headers['Authorization'] = bearer(apiKey);
                const response = await fetch(`${endpoint}/models`, { headers });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json() as { data?: Array<{ id: string; name?: string; context_length?: number }> };
                return (data.data ?? []).map(m => ({
                    id: m.id,
                    name: m.name || m.id,
                    contextWindow: m.context_length,
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
                }));
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
                body['tool_choice'] = 'auto';
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

        parseText(json: unknown): string {
            return (json as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || '';
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
 * - usage-only chunk + [DONE]  → done{usage}
 */
export function parseOpenAICompatStream(
    stream: ReadableStream<Uint8Array>,
): ReadableStream<AparteStreamEvent> {
    const decoder = new TextDecoder();
    let buffer = '';

    // Tool call accumulation state (keyed by the vendor's `index`). A null-prototype
    // object: the key comes off the wire, and on a plain `{}` a chunk whose `index` is
    // `"__proto__"` writes into Object.prototype for the whole page.
    let toolCallsById: Record<number, { id: string; name: string; args: string }> = Object.create(null);
    let capturedUsage: AparteUsage | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

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
        for (const entry of Object.values(toolCallsById)) {
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
        toolCallsById = Object.create(null);
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
                            controller.enqueue({ type: 'done', usage: capturedUsage });
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

                            const choice = json.choices?.[0];
                            if (!choice) continue;

                            const delta = choice.delta;
                            if (delta) {
                                if (delta.reasoning_content) {
                                    controller.enqueue({ type: 'thinking', delta: delta.reasoning_content });
                                }
                                if (delta.content) {
                                    controller.enqueue({ type: 'text', delta: delta.content });
                                }
                                if (delta.tool_calls) {
                                    for (const tc of delta.tool_calls) {
                                        // Made a number, not annotated as one: `index` is whatever
                                        // the vendor's JSON put there.
                                        const idx = Number(tc.index ?? 0);
                                        if (!Number.isInteger(idx) || idx < 0) continue;
                                        if (!toolCallsById[idx]) {
                                            toolCallsById[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' };
                                        }
                                        if (tc.id) toolCallsById[idx].id = tc.id;
                                        if (tc.function?.name) toolCallsById[idx].name = tc.function.name;
                                        if (tc.function?.arguments) toolCallsById[idx].args += tc.function.arguments;
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
                            if (choice.finish_reason === 'tool_calls') flushToolCalls(controller, true);
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
                controller.enqueue({ type: 'done', usage: capturedUsage });
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
