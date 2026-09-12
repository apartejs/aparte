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
 * Discriminated union of all content part types.
 *
 * There was a third, `AparteFilePart`, "reserved for future PDF/audio support" — nothing
 * ever produced one: the client inlines images and text files and drops the rest, and both
 * wire mappers answered it with an empty text part no message could reach. What it did do
 * was promise a consumer that attaching a PDF sent it. That promise is now a warning at the
 * one place the file is really dropped.
 */
export type AparteContentPart = AparteTextPart | AparteImagePart;

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
    role: 'user' | 'assistant' | 'system' | 'tool';
    /**
     * Message content — either a plain string (backward compatible) or an array
     * of typed content parts: text and images. A binary the model cannot read is
     * not a content part; see the note on {@link AparteContentPart}.
     *
     * Use `contentToText(content)` to extract the text-only representation.
     */
    content: string | AparteContentPart[];
    /**
     * On an `assistant` message: the tool calls the model made this turn, grouped.
     * `content` is what it said before them — `''` when it said nothing.
     */
    toolCalls?: AparteToolCall[];
    /** On a `tool` message: the id of the call, in the preceding assistant message, that it answers. */
    toolCallId?: string;
    /**
     * On a `tool` message: the name of the tool that ran.
     *
     * Optional, and worth setting: a wire format that names the tool on the result
     * (the AI SDK does) otherwise has to scan back for the call that declared the id,
     * which a hand-built history need not contain.
     */
    toolName?: string;
}

/**
 * The request one turn sends to a provider.
 *
 * `prefill`, `systemOverride` and `fastStream` used to sit here, each documented "providers
 * MAY ignore it" and read by none — one model family's raw-completion vocabulary flattened
 * onto every provider's request. A provider reads its option off `_meta`, the namespaced bag,
 * which reaches it untouched; the trigger to reconsider is a raw-completion provider in this
 * repo (`provider-llamacpp`) that would actually read one.
 */
export interface AparteChatRequest {
    messages: AparteChatMessage[];
    modelId: string;
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    /** Tools the AI is allowed to call */
    tools?: AparteTool[];
    /**
     * Random seed for reproducibility. Passed through verbatim by the providers
     * that support it (OpenAI-compatible endpoints, the AI SDK bridge, the
     * transformers worker); Anthropic exposes none, so it is ignored there.
     *
     * Nothing sets it for you: a retry varies its answer by sampling
     * (`temperature`), not by seeding — this line used to promise an automatic
     * per-retry seed that no code had ever written. Set it from a
     * `requestInterceptor` when you need reproducible runs.
     */
    seed?: number;

    /**
     * Controls which tool the model must call — mirrors OpenAI tool_choice / Anthropic tool_choice.
     * - 'auto'        : model decides (default when tools are present)
     * - 'none'        : no tools injected this turn — model answers directly
     * - { name }      : model MUST call this tool (provider injects a strong directive)
     * - { name, input }: synthetic call — the agent loop (`runStreamAgent`,
     *                    or the runner you injected) bypasses the LLM
     *                    entirely and runs the handler directly with the provided
     *                    input, then re-calls the LLM with the tool message in history.
     */
    toolChoice?: 'auto' | 'none' | { name: string; input?: Record<string, unknown> };

    /**
     * Opaque, namespaced metadata bag threaded through the request pipeline (e.g.
     * from a `requestInterceptor` to the loop's post-processing). Core neither
     * filters nor rewrites it, which is what makes it the channel for an option
     * only one provider understands: it reaches that provider verbatim, and
     * `AparteBackendTransport`'s default body serialises it to your endpoint too.
     * So it is not a place to hide a secret. The well-known keys are typed; see
     * {@link AparteRequestMeta}.
     */
    _meta?: AparteRequestMeta;
}

/**
 * The well-known keys of `AparteChatRequest._meta`. One, read by core's client and
 * not by the loop; the rest of the bag is the consumer's (index signature).
 * `pipeline`, `artifactRaw` and `artifactXml` used to sit here too and were removed
 * (audit 2026-08-28, D2), then `artifactHint` (D7): an artifact is a plugin's
 * convention now, and a promoted code fence had no consumer.
 */
export interface AparteRequestMeta {
    /**
     * Segments to show at the top of the assistant's turn before the model has said
     * anything — a "planning" thinking block a host wants visible from the first
     * frame, a status row. Added right after the turn flips to `streaming`, in this
     * order, and never sent to the model.
     */
    prefixSegments?: AparteSegment[];
    /**
     * Set by `@aparte/plugin-compaction` on the summarisation request, and on nothing
     * else. A backend transport can route it — a cheaper model, a shorter timeout —
     * without inspecting the messages to guess what the request is for.
     */
    compaction?: true;
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
    /** Id of the model that produced this response. */
    modelId?: string;
    /** Compute device used for this response ('webgpu' | 'wasm' | …). */
    device?: string;
    /**
     * Per-call breakdown when a single turn used several provider calls
     * (e.g. a tool-use round-trip or a mid-turn model swap). Absent for a plain
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
