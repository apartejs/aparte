/**
 * @aparte/provider-ai-sdk — bridge any Vercel AI SDK model into aparté.
 *
 * aparté's own wire concern is deliberately tiny: `@aparte/provider-openai-compat`
 * covers the one de-facto-standard format. EVERYTHING else (Anthropic, Google,
 * Bedrock, 25+ vendors) rides the AI SDK ecosystem through this bridge: you
 * bring your `@ai-sdk/*` package and hand its model to `createAiSdkProvider`;
 * the bridge runs `streamText` (single step — aparté's agent loop owns the
 * multi-turn) and maps `fullStream` parts to aparté's `AparteStreamEvent`s.
 *
 * ```ts
 * import { createAnthropic } from '@ai-sdk/anthropic';
 * import { createAiSdkProvider } from '@aparte/provider-ai-sdk';
 *
 * AparteConfig.registerAIProvider(createAiSdkProvider({
 *     id: 'anthropic',
 *     name: 'Anthropic',
 *     models: [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' }],
 *     languageModel: (modelId, auth) =>
 *         createAnthropic({
 *             apiKey: typeof auth === 'string' ? auth : auth?.['apiKey'],
 *             headers: { 'anthropic-dangerous-direct-browser-access': 'true' }, // BYOK
 *         })(modelId),
 * }));
 * ```
 *
 * DEPENDENCY POLICY: `ai` is a **peerDependency pinned to the verified major**
 * (`^7`). The AI SDK moves fast (v5→v7 in about a year); this bridge is the
 * ONLY aparté module touching its types, so a breaking major costs one small
 * package bump — widened per-major after verification, never speculatively.
 *
 * The bridge is an `AparteAIProvider` with a `chat()` (it owns its I/O via the
 * SDK — same shape as `@aparte/provider-transformers`), driven by
 * `DirectTransport`'s delegation branch, which forwards `ctx.signal` so a user
 * "stop" aborts the underlying vendor call.
 *
 * NOTE (loop contract): the bridge never sees `toolChoice: { name, input }` —
 * the agent loop (engine `runStreamAgent` / core `_streamLoop`) executes that
 * synthetic call itself and strips `toolChoice` before the transport call.
 * Only `'auto' | 'none' | { name }` reach this module.
 */

import type {
    AparteAIProvider,
    AparteAIModel,
    AparteAIProviderConfigSchema,
    AparteChatRequest,
    AparteChatResponse,
    AparteChatMessage,
    AparteStreamEvent,
    AparteUsage,
} from '@aparte/core';
import { contentToText } from '@aparte/core';
import { streamText, jsonSchema, tool } from 'ai';
import type { LanguageModel, ModelMessage, ToolSet, ToolChoice } from 'ai';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface AiSdkProviderOptions {
    /** Provider id used across aparté (key resolution, model picker, events). */
    id: string;
    /**
     * Resolve the AI SDK model for a chat call. `auth` is the key/config the
     * aparté key-resolver produced — rebuild the vendor provider per call for
     * UI-driven BYOK, or ignore it if your factory already carries the key.
     */
    languageModel: (modelId: string, auth?: string | Record<string, string>) => LanguageModel;
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
    /** Model runs locally (no key expected). */
    isLocal?: boolean;
    /** Model list — **consumer data** (the AI SDK has no model-listing API). */
    models?: AparteAIModel[];
    /** Override the default apiKey settings schema. */
    configSchema?: AparteAIProviderConfigSchema;
}

// ─── aparté ⇄ AI SDK shaping ─────────────────────────────────────────────────

/**
 * AparteChatMessage[] → AI SDK ModelMessage[]. Handles aparté's `tool_call` /
 * `tool_result` envelope (assistant tool-call parts + tool-role results); the
 * tool name for a result is recovered from the preceding envelope.
 */
export function toModelMessages(messages: AparteChatMessage[]): ModelMessage[] {
    // toolCallId → toolName (results reference calls by id only).
    const toolNames = new Map<string, string>();
    for (const msg of messages) {
        if (msg.role === 'tool_call') {
            for (const tc of msg.toolCalls ?? []) toolNames.set(tc.id, tc.name);
        }
    }

    const out: ModelMessage[] = [];
    for (const msg of messages) {
        if (msg.role === 'tool_call') {
            out.push({
                role: 'assistant',
                content: [
                    ...(msg.precedingText ? [{ type: 'text' as const, text: msg.precedingText }] : []),
                    ...(msg.toolCalls ?? []).map(tc => ({
                        type: 'tool-call' as const,
                        toolCallId: tc.id,
                        toolName: tc.name,
                        input: tc.input,
                    })),
                ],
            });
            continue;
        }
        if (msg.role === 'tool_result') {
            out.push({
                role: 'tool',
                content: [{
                    type: 'tool-result',
                    toolCallId: msg.toolCallId ?? '',
                    toolName: toolNames.get(msg.toolCallId ?? '') ?? 'unknown',
                    output: { type: 'text', value: contentToText(msg.content) },
                }],
            });
            continue;
        }
        if (msg.role === 'system') {
            out.push({ role: 'system', content: contentToText(msg.content) });
            continue;
        }
        if (msg.role === 'assistant') {
            out.push({ role: 'assistant', content: contentToText(msg.content) });
            continue;
        }
        // user (default) — keep multimodal parts.
        if (typeof msg.content === 'string') {
            out.push({ role: 'user', content: msg.content });
        } else {
            out.push({
                role: 'user',
                content: msg.content.map(p => {
                    if (p.type === 'text') return { type: 'text' as const, text: p.text };
                    if (p.type === 'image') return { type: 'image' as const, image: p.image };
                    return { type: 'text' as const, text: '' }; // AparteFilePart — not bridged
                }),
            });
        }
    }
    return out;
}

/** AparteTool[] → AI SDK ToolSet — declaration only, NO `execute` (aparté's loop runs tools). */
export function toToolSet(tools: NonNullable<AparteChatRequest['tools']>): ToolSet {
    return Object.fromEntries(tools.map(t => [
        t.name,
        tool({
            description: t.description,
            inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
        }),
    ]));
}

/** aparté toolChoice → AI SDK toolChoice (the synthetic {name,input} never reaches here). */
export function toToolChoice(choice: AparteChatRequest['toolChoice']): ToolChoice<ToolSet> | undefined {
    if (choice === 'auto' || choice === 'none') return choice;
    if (choice && typeof choice === 'object') return { type: 'tool', toolName: choice.name };
    return undefined;
}

/** fullStream `finish.totalUsage` → AparteUsage. */
function toAparteUsage(u: { inputTokens?: number; outputTokens?: number; totalTokens?: number; inputTokenDetails?: { cacheReadTokens?: number } }): AparteUsage {
    return {
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        totalTokens: u.totalTokens,
        cacheReadTokens: u.inputTokenDetails?.cacheReadTokens,
    };
}

/**
 * Map the AI SDK `fullStream` to aparté's event stream:
 * `text-delta`→text · `reasoning-delta`→thinking · `tool-call`→tool_use ·
 * `finish`→done{usage} · `error`→error. Everything else (step markers,
 * tool-input deltas, sources, files) is dropped — aparté's loop consumes whole
 * tool calls, not input deltas.
 */
export function fullStreamToAparteEvents(
    fullStream: AsyncIterable<{ type: string } & Record<string, unknown>>,
): ReadableStream<AparteStreamEvent> {
    // Held so `cancel()` can signal the AI SDK's iterator to stop (calling
    // `.return()` propagates cancellation the same way breaking a `for await`
    // loop would), instead of leaving `start()` draining `fullStream` to its
    // natural end after the consumer has already walked away.
    let iterator: AsyncIterator<{ type: string } & Record<string, unknown>> | undefined;

    return new ReadableStream<AparteStreamEvent>({
        async start(controller) {
            iterator = fullStream[Symbol.asyncIterator]();
            try {
                while (true) {
                    const { value: part, done } = await iterator.next();
                    if (done) break;

                    switch (part.type) {
                        case 'text-delta':
                            controller.enqueue({ type: 'text', delta: part['text'] as string });
                            break;
                        case 'reasoning-delta':
                            controller.enqueue({ type: 'thinking', delta: part['text'] as string });
                            break;
                        case 'tool-call':
                            controller.enqueue({
                                type: 'tool_use',
                                id: part['toolCallId'] as string,
                                name: part['toolName'] as string,
                                input: (part['input'] ?? {}) as Record<string, unknown>,
                            });
                            break;
                        case 'finish':
                            controller.enqueue({ type: 'done', usage: toAparteUsage(part['totalUsage'] as Parameters<typeof toAparteUsage>[0]) });
                            // Terminal: stop reading `fullStream` so a stray second
                            // finish/error part (if the SDK ever emits one) can't
                            // enqueue past the done event.
                            return;
                        case 'error': {
                            const err = part['error'];
                            controller.enqueue({ type: 'error', message: err instanceof Error ? err.message : String(err) });
                            return;
                        }
                        // 'abort', step markers, tool-input-* deltas, sources… → dropped.
                    }
                }
            } catch (err: unknown) {
                // AbortError surfaces here when ctx.signal fires mid-stream: the
                // consumer (agent loop) cancelled on purpose — end quietly.
                if ((err as { name?: string })?.name !== 'AbortError') {
                    controller.enqueue({ type: 'error', message: (err as Error | undefined)?.message ?? 'Stream error' });
                }
            } finally {
                controller.close();
            }
        },
        async cancel(reason) {
            await iterator?.return?.(reason);
        },
    });
}

// ─── The provider factory ────────────────────────────────────────────────────

const DEFAULT_CONFIG_SCHEMA = (opts: AiSdkProviderOptions): AparteAIProviderConfigSchema => ({
    fields: opts.isLocal
        ? []
        : [{ id: 'apiKey', type: 'password', label: 'API Key', required: true }],
});

/**
 * Wrap an AI SDK model factory into an `AparteAIProvider`. The returned provider
 * owns its I/O through the SDK (`chat()` shape — `DirectTransport` delegates
 * to it and forwards the abort signal).
 */
export function createAiSdkProvider(opts: AiSdkProviderOptions): AparteAIProvider {
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

        async chat(
            request: AparteChatRequest,
            auth?: string | Record<string, string>,
            ctx?: { providerId: string; signal?: AbortSignal },
        ): Promise<AparteChatResponse> {
            const model = opts.languageModel(request.modelId ?? '', auth);

            const result = streamText({
                model,
                messages: toModelMessages(request.messages),
                temperature: request.temperature,
                maxOutputTokens: request.maxTokens,
                seed: request.seed,
                abortSignal: ctx?.signal,
                ...(request.tools?.length
                    ? { tools: toToolSet(request.tools), toolChoice: toToolChoice(request.toolChoice) ?? 'auto' }
                    : {}),
            });

            if (request.stream === false) {
                return await result.text;
            }
            return fullStreamToAparteEvents(result.fullStream);
        },
    };
}

export type { AparteAIProvider, AparteAIModel } from '@aparte/core';
