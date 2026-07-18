/**
 * Aparte Chat Request & Stream Types
 */

import type { AparteTool, AparteToolCall } from './tools.js';
import type { AparteSegment } from './segments.js';

// ─────────────────────────────────────────────────────────────────────────────
// Content Parts — multimodal message content (Vercel AI SDK compatible)
// ─────────────────────────────────────────────────────────────────────────────

/** Plain text content part */
export interface AparteTextPart {
    type: 'text';
    text: string;
}

/**
 * Image content part.
 * `image` must be a base64 data URL: `data:image/png;base64,...`
 * The data URL encodes the MIME type, making it consumable by all providers.
 */
export interface AparteImagePart {
    type: 'image';
    image: string;
    mimeType?: string;
}

/**
 * File content part — reserved for future PDF/audio support.
 * `data` must be a base64 data URL.
 */
export interface AparteFilePart {
    type: 'file';
    data: string;
    mimeType: string;
    name?: string;
}

/** Discriminated union of all content part types */
export type AparteContentPart = AparteTextPart | AparteImagePart | AparteFilePart;

/**
 * Extract plain text from a `string | AparteContentPart[]` content value.
 * Use this in providers and app-layer code whenever you need the text-only representation.
 */
export function contentToText(content: string | AparteContentPart[]): string {
    if (typeof content === 'string') return content;
    return content
        .filter((p): p is AparteTextPart => p.type === 'text')
        .map(p => p.text)
        .join('');
}

export interface AparteChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool_call' | 'tool_result';
    /**
     * Message content — either a plain string (backward compatible) or an array
     * of typed content parts for multimodal messages (text + images + files).
     *
     * Use `contentToText(content)` to extract the text-only representation.
     */
    content: string | AparteContentPart[];
    /** For role='tool_call': tool calls made by the assistant in this turn */
    toolCalls?: AparteToolCall[];
    /** For role='tool_result': id of the tool call this responds to */
    toolCallId?: string;
    /** For role='tool_call': text streamed before the tool call in the same turn */
    precedingText?: string;
}

export interface AparteChatRequest {
    messages: AparteChatMessage[];
    modelId: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    /** Tools the AI is allowed to call */
    tools?: AparteTool[];
    /**
     * Random seed for reproducibility / diversity.
     * Automatically set to a random integer on every `aparte:retry` so the
     * provider generates a different response even with the same history.
     * Supported by OpenAI, OpenRouter, LM Studio, Mistral, Ollama, and Gemini.
     * Anthropic does not expose a seed parameter — ignored silently there.
     */
    seed?: number;

    /**
     * Controls which tool the model must call — mirrors OpenAI tool_choice / Anthropic tool_choice.
     * - 'auto'        : model decides (default when tools are present)
     * - 'none'        : no tools injected this turn — model answers directly
     * - { name }      : model MUST call this tool (provider injects a strong directive)
     * - { name, input }: synthetic call — the agent loop (inline `_streamLoop`
     *                    or the injected `runStreamAgent`) bypasses the LLM
     *                    entirely and runs the handler directly with the provided
     *                    input, then re-calls the LLM with the tool_result in history.
     */
    toolChoice?: 'auto' | 'none' | { name: string; input?: Record<string, unknown> };

    /**
     * Optional prefill string applied after the chat template's generation
     * prompt — the model continues from the end of this string. Provider- and
     * model-specific; core prescribes no syntax (the consuming app/orchestrator
     * decides what control tokens, if any, to inject). Providers that support a
     * "continue final message" mode apply it; others MAY ignore this field.
     */
    prefill?: string;

    /**
     * Verbatim system message to use INSTEAD of the provider building its own
     * (e.g. the transformers provider's tool-system-message). Generic transport
     * field : when set, the provider uses this string as the system message
     * as-is. `tools` may still be passed (for the tool-call parser/dispatch)
     * but is NOT re-rendered into the system prompt. Used to feed a fine-tuned
     * model its EXACT training system prompt (anti-OOD). Providers that build no
     * system message MAY ignore it.
     */
    systemOverride?: string;

    /**
     * Hint : stream tokens AS THEY ARRIVE (bypass the provider's flush-throttle).
     * Default throttling coalesces UI paints to protect WebGPU decode speed ;
     * a short codegen turn that drives a live preview (e.g. xlsx_ops ops) opts
     * in so the consumer can render progressively. Providers MAY ignore it.
     */
    fastStream?: boolean;

    /**
     * Opaque metadata bag threaded through the request pipeline (e.g. from a
     * requestInterceptor to the `_streamLoop` post-processor). Never sent to the
     * AI provider — stripped before the network call. The well-known keys are
     * typed; see {@link AparteRequestMeta}.
     */
    _meta?: AparteRequestMeta;
}

/** One phase of a multi-turn `_meta.pipeline` run: each phase is a single LLM
 *  turn whose reply becomes context for the next. */
export type ApartePipelinePhase =
    | { mode: 'text'; system: string }
    | { mode: 'thinking'; system: string; label?: string }
    | { mode: 'artifact'; system: string; mimeType: string; kind: string };

/** A `{ mimeType, kind }` artifact hint for the `_meta` artifact modes. */
export interface AparteArtifactHint {
    mimeType: string;
    kind: string;
}

/**
 * Well-known keys of {@link AparteChatRequest._meta}, typed for discoverability.
 * The index signature keeps it an open channel for consumer-specific context.
 * None of these reach the provider — they're stripped before the network call.
 */
export interface AparteRequestMeta {
    /** Multi-phase run — each phase is one LLM turn; reply N is context for N+1. */
    pipeline?: ApartePipelinePhase[];
    /** Segments injected into the bubble before streaming (e.g. a plan thinking block). */
    prefixSegments?: AparteSegment[];
    /** Promote the first code fence in the reply to an artifact (for small models that ignore `<artifact>` XML). */
    artifactHint?: AparteArtifactHint;
    /** Treat the WHOLE reply as a raw artifact of this kind. */
    artifactRaw?: AparteArtifactHint;
    /** Parse an `<artifact>` XML block of this kind out of the stream. */
    artifactXml?: AparteArtifactHint;
    /** Consumer-specific context (open channel). */
    [key: string]: unknown;
}

/**
 * Token usage reported by the AI provider after a completed response.
 */
export interface AparteUsage {
    /** Tokens in the prompt / conversation history sent to the model */
    inputTokens: number;
    /** Tokens generated by the model */
    outputTokens: number;
    /** Total tokens (inputTokens + outputTokens). Populated when the provider reports it. */
    totalTokens?: number;
    /** Tokens read from the provider's prompt cache (Anthropic, OpenAI). */
    cacheReadTokens?: number;
    /** Wall-clock generation time in milliseconds (provider-measured). Used to compute tokens/sec. */
    durationMs?: number;

    // ── Extended timing (offline transformers provider) ──────────────────
    /** Time to first token in ms — the prefill / TTFT phase. */
    ttftMs?: number;
    /** Decode-phase wall time in ms (≈ durationMs − ttftMs). */
    decodeMs?: number;
    /** Tokens emitted during the decode phase (outputTokens minus the first). */
    decodeTokens?: number;
    /** Total turn wall-clock time in ms, measured client-side across all phases. */
    wallMs?: number;
    /** Id of the model / aparteni that produced this response. */
    modelId?: string;
    /** Compute device used for this response ('webgpu' | 'wasm' | …). */
    device?: string;
    /**
     * Per-call breakdown when a single turn used several provider calls
     * (e.g. a tool-use round-trip or an aparteni hot-swap). Absent for a plain
     * single-call turn. Each entry is the AparteUsage of one provider call.
     */
    phases?: AparteUsage[];
}

/**
 * Normalized stream event map — extensible via declaration merging.
 *
 * @example
 * // In a plugin or app:
 * declare module '@aparte/core' {
 *   interface AparteStreamEventMap {
 *     tool_call: { name: string; arguments: string }
 *   }
 * }
 */
export interface AparteStreamEventMap {
    text:     { delta: string }
    thinking: { delta: string }
    /** Emitted when the stream ends. May carry token usage reported by the provider. */
    done:     { usage?: AparteUsage }
    error:    { message: string }
    tool_use: AparteToolCall
}

/** Discriminated union derived from AparteStreamEventMap — stays in sync automatically. */
export type AparteStreamEvent = {
    [K in keyof AparteStreamEventMap]: { type: K } & AparteStreamEventMap[K]
}[keyof AparteStreamEventMap]

export type AparteChatResponse = ReadableStream<AparteStreamEvent> | string;
