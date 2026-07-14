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
 * Build an `AparteAIProvider` (full format-adapter surface) for one
 * OpenAI-compatible endpoint. Register it like any provider:
 *
 * ```ts
 * import { createOpenAICompatProvider, presets } from '@aparte/provider-openai-compat';
 * AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.OPENROUTER));
 * // or any compat endpoint, no preset needed:
 * AparteConfig.registerAIProvider(createOpenAICompatProvider({ id: 'groq', baseURL: 'https://api.groq.com/openai/v1' }));
 * ```
 */
export function createOpenAICompatProvider(opts: OpenAICompatProviderOptions): AparteAIProvider {
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
                    capabilities: ['streaming'],
                }));
            } catch (error) {
                console.error(`[${displayName}] Failed to fetch models:`, error);
                return [];
            }
        },

        // ── Format-adapter surface (transport ⊥ format) ──────────────────────
        // The vendor concern only: request shape + stream parsing. Auth and
        // network are the transport's job (DirectTransport / BackendTransport).
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

    // Tool call accumulation state (keyed by index)
    const toolCallsById: Record<number, { id: string; name: string; args: string }> = {};
    let capturedUsage: AparteUsage | undefined;

    return new ReadableStream<AparteStreamEvent>({
        async start(controller) {
            const reader = stream.getReader();
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
                                        const idx: number = tc.index ?? 0;
                                        if (!toolCallsById[idx]) {
                                            toolCallsById[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', args: '' };
                                        }
                                        if (tc.id) toolCallsById[idx].id = tc.id;
                                        if (tc.function?.name) toolCallsById[idx].name = tc.function.name;
                                        if (tc.function?.arguments) toolCallsById[idx].args += tc.function.arguments;
                                    }
                                }
                            }

                            // Emit tool_use events when the turn is done
                            if (choice.finish_reason === 'tool_calls') {
                                for (const entry of Object.values(toolCallsById)) {
                                    let input: Record<string, unknown> = {};
                                    try { input = JSON.parse(entry.args); } catch { /* incomplete */ }
                                    const toolCall: AparteToolCall = { id: entry.id, name: entry.name, input };
                                    controller.enqueue({ type: 'tool_use', ...toolCall });
                                }
                                controller.enqueue({ type: 'done', usage: capturedUsage });
                                return;
                            }
                        } catch { /* skip partial JSON */ }
                    }
                }
                controller.enqueue({ type: 'done', usage: capturedUsage });
            } catch (err: unknown) {
                controller.enqueue({ type: 'error', message: (err as Error | undefined)?.message ?? 'Stream error' });
            } finally {
                reader.releaseLock();
                controller.close();
            }
        },
    });
}

export * from './presets.js';
export type { AparteAIProvider, AparteAIModel } from '@aparte/core';
