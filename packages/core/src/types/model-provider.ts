/**
 * Aparte AI Model Provider Types
 * 
 * Interfaces for AI provider and model management.
 * These types enable the BYORK (Bring Your Own Key) pattern,
 * allowing users to plug in their preferred AI providers.
 * 
 * @packageDocumentation
 */

import { AparteChatRequest, AparteChatResponse, AparteStreamEvent } from './chat.js';

// ─────────────────────────────────────────────────────────────────────────────
// AI Model Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents an AI model that can be selected by the user.
 * 
 * @example
 * ```typescript
 * const model: AparteAIModel = {
 *   id: 'gpt-4-turbo',
 *   name: 'GPT-4 Turbo',
 *   contextWindow: 128000,
 *   capabilities: ['vision', 'function_calling', 'streaming']
 * };
 * ```
 */
export interface AparteAIModel {
    /** Unique identifier for the model (e.g., 'gpt-4-turbo', 'claude-3-opus') */
    id: string;

    /** Human-readable display name */
    name: string;

    /** Optional context window size in tokens */
    contextWindow?: number;

    /** Optional pricing information (per 1M tokens) */
    pricing?: {
        input: number;
        output: number;
    };

    /** Optional capability flags */
    capabilities?: ('vision' | 'function_calling' | 'streaming' | 'code' | 'reasoning')[];

    /** Optional short description shown in model pickers */
    description?: string;

    /** Optional metadata for custom properties */
    metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Status & Load Progress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Availability status of a model, as reported by the provider.
 *
 * Provider-agnostic: Transformers.js checks the Cache API,
 * Ollama checks pulled models, LM Studio checks VRAM, etc.
 */
export type ModelStatus =
    | 'ready'           // loaded in memory, usable immediately
    | 'cached'          // downloaded / in local cache, needs a few seconds to load
    | 'not-downloaded'; // not yet downloaded

/**
 * Progress update emitted during model preparation (download + load).
 * Passed to the `onProgress` callback of `AparteAIProvider.prepareModel()`.
 */
export interface ModelLoadProgress {
    /** Current phase of the preparation */
    status: 'downloading' | 'loading' | 'cached' | 'ready' | 'error';
    /** File currently being processed (e.g. "model.safetensors") */
    file?: string;
    /** Progress percentage 0–100 */
    progress?: number;
    /** Optional human-readable message */
    message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Provider Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Brand metadata for an AI provider, used for visual selection and onboarding.
 */
export interface AparteAIProviderMetadata {
    /** Human-readable display name */
    name: string;

    /** Provider ID */
    id: string;

    /** 
     * Brand icon. 
     * Can be an SVG string, a data URI, or a key for AparteIconProvider.
     */
    icon?: string;

    /** Brand primary color (hex or CSS variable) */
    color?: string;

    /** Short tag line or description */
    description?: string;

    /** Whether the provider offers free models or Tiers */
    hasFreeModels?: boolean;

    /** Whether the provider runs locally on the user machine */
    isLocal?: boolean;

    /** URL to the provider's API key management page or documentation */
    helpUrl?: string;

    /** Configuration schema for the onboarding UI */
    configSchema?: AparteAIProviderConfigSchema;
}

/**
 * Definition of a configuration field for the provider
 */
export interface AparteAIProviderConfigField {
    /** Unique identifier for the field (e.g., 'apiKey', 'endpoint') */
    id: string;
    /** Basic type for the input field */
    type: 'text' | 'password' | 'url';
    /** Human readable label (e.g., 'API Key', 'Sever URL') */
    label: string;
    /** Placeholder hint */
    placeholder?: string;
    /** Initial value */
    defaultValue?: string;
    /** Whether the field is mandatory to start */
    required?: boolean;
    /** If true, the field is hidden behind an 'Advanced' toggle in UI */
    isAdvanced?: boolean;
}

/**
 * Encapsulates all configuration fields for a provider
 */
export interface AparteAIProviderConfigSchema {
    fields: AparteAIProviderConfigField[];
}

/**
 * What every provider carries, whichever half of the contract it implements:
 * an identity, brand metadata, and a synchronous model list.
 *
 * On its own this is **not** a usable provider — see {@link AparteAIProvider},
 * which requires one of the two execution surfaces as well.
 */
export interface AparteAIProviderCore {
    /** Unique identifier for the provider */
    id: string;

    /**
     * Returns brand metadata for UI rendering.
     */
    getMetadata(): AparteAIProviderMetadata;

    /**
     * Returns the list of available models **synchronously** (static or cached
     * list). Never return a Promise here — it would be ignored by
     * `getCurrentModel()`, silently disabling capability gates such as
     * `function_calling` (tools). For async fetching implement
     * {@link fetchModels} instead, which `aparteGlobalConfig.refreshProviderModels()`
     * and the model-selector consume. Note: a provider without `fetchModels`
     * shows no models in the model-selector — `getModels()` is only read for
     * the current-model lookup.
     */
    getModels(): AparteAIModel[];

    /**
     * Optional: Fetch models dynamically from an API.
     * Useful for providers like OpenRouter that have evolving model lists.
     * 
     * @param config - Optional API key or full configuration object for authenticated requests
     */
    fetchModels?(config?: string | Record<string, string>): Promise<AparteAIModel[]>;

    /**
     * Optional. Returns the availability status of a model.
     *
     * - `'ready'`          — loaded in memory, usable immediately
     * - `'cached'`         — downloaded / in local cache, needs a few seconds to load
     * - `'not-downloaded'` — not yet downloaded
     *
     * Provider-agnostic: any provider can implement this to surface download/load state.
     * Backward-compatible: providers that do not implement this method are unaffected.
     */
    getModelStatus?(modelId: string): Promise<ModelStatus>;

    /**
     * Optional. Prepare a model for use (download + load) with progress feedback.
     * The returned Promise resolves when the model is ready to accept `chat()` calls.
     *
     * Provider-agnostic: Transformers.js streams download progress, Ollama streams
     * pull progress, any provider can implement this pattern.
     * Backward-compatible: providers that do not implement this method are unaffected.
     */
    prepareModel?(modelId: string, onProgress: (p: ModelLoadProgress) => void): Promise<void>;

    /**
     * Optional. Delete a locally cached/downloaded model.
     * Provider-agnostic: Transformers.js clears the Cache API, Ollama calls /api/delete, etc.
     * Backward-compatible: providers that do not implement this method are unaffected.
     */
    deleteModel?(modelId: string): Promise<void>;
}

/**
 * Execution surface for a provider that **owns its own I/O** — Transformers.js
 * running locally, or a bridge wrapping an external SDK. `AparteDirectTransport`
 * delegates to `chat()` and stays out of the way.
 */
export interface AparteAIProviderChat {
    /**
     * @param request - The chat request options (messages, model, etc.)
     * @param config - Optional API key or full configuration object
     * @param ctx - Transport context (structurally mirrors `AparteTransportContext`;
     *   inline to avoid a type cycle with `transport/types`). `signal` aborts the
     *   in-flight call — bridges MUST honor it so a user "stop" cancels the
     *   underlying request, not just the local read.
     * @returns ReadableStream for streaming or string for full response
     */
    chat(
        request: AparteChatRequest,
        config?: string | Record<string, string>,
        ctx?: { providerId: string; signal?: AbortSignal },
    ): Promise<AparteChatResponse>;
}

/**
 * Execution surface for a provider that only **shapes payloads** (transport ⊥
 * format): an `AparteTransport` performs the call and handles auth, and the
 * provider builds the request and parses the stream. See `src/transport/`.
 */
export interface AparteAIProviderFormat {
    /** Base URL for browser-direct calls (overridable per request via config). */
    defaultEndpoint: string;
    /** Build the vendor HTTP request from an Aparte request (auth injected by the transport). */
    buildRequest(request: AparteChatRequest): { path: string; body: unknown; headers?: Record<string, string> };
    /** Parse a streaming vendor response body into unified events. */
    parseStream(body: ReadableStream<Uint8Array>): ReadableStream<AparteStreamEvent>;
    /** Extract text from a non-streaming vendor JSON response. */
    parseText?(json: unknown): string;
}

/** Both ways a format adapter can present a resolved key. At least one is required. */
export interface AparteAIProviderAuthMembers {
    /** Vendor auth headers for a resolved key (browser-direct only). */
    authHeaders?(key: string): Record<string, string>;
    /** Vendor auth as URL query params for a resolved key (e.g. Gemini `?key=`). */
    authQuery?(key: string): Record<string, string>;
}

/**
 * A format adapter with no way to present a key cannot be called, so the union
 * demands one of the two — mirroring `isFormatAdapter`, which accepts either.
 */
export type AparteAIProviderAuth =
    | (AparteAIProviderAuthMembers & { authHeaders(key: string): Record<string, string> })
    | (AparteAIProviderAuthMembers & { authQuery(key: string): Record<string, string> });

/**
 * An AI provider (e.g. OpenRouter, OpenAI, Transformers.js).
 *
 * A **union, not one interface**, because there are two mutually sufficient ways
 * to be a provider and the compiler should say which one you implemented. It used
 * to be a single interface with three required members and fifteen optional ones,
 * discriminated at RUNTIME by `isFormatAdapter()` — so `{ id, getMetadata,
 * getModels }` typechecked, registered, and then failed on the first message with
 * nothing at build time to warn you.
 *
 * Every member of both surfaces stays reachable on the union (optional on the arm
 * that does not require it), so runtime probes like `typeof p.buildRequest ===
 * 'function'` and `isFormatAdapter()` narrowing keep working unchanged. A provider
 * implementing both surfaces is valid and satisfies the format arm.
 *
 * @example A format adapter — a transport does the call
 * ```typescript
 * const provider: AparteAIProvider = {
 *   id: 'openrouter',
 *   getMetadata: () => ({ name: 'OpenRouter', id: 'openrouter', icon: '<svg/>', color: '#000' }),
 *   getModels: () => [],
 *   defaultEndpoint: 'https://openrouter.ai/api/v1',
 *   buildRequest: (req) => ({ path: '/chat/completions', body: req }),
 *   authHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
 *   parseStream: (body) => body as unknown as ReadableStream<AparteStreamEvent>,
 * };
 * ```
 *
 * @example A provider owning its own I/O
 * ```typescript
 * const local: AparteAIProvider = {
 *   id: 'transformers',
 *   getMetadata: () => ({ name: 'Transformers.js', id: 'transformers', icon: '<svg/>', color: '#000' }),
 *   getModels: () => [],
 *   chat: async (request) => runLocally(request),
 * };
 * ```
 */
export type AparteAIProvider =
    | (AparteAIProviderCore & AparteAIProviderFormat & AparteAIProviderAuth & Partial<AparteAIProviderChat>)
    | (AparteAIProviderCore & AparteAIProviderChat & Partial<AparteAIProviderFormat> & AparteAIProviderAuthMembers);

// ─────────────────────────────────────────────────────────────────────────────
// Model Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration options for model selection behavior.
 */
export interface AparteModelConfig {
    /** Which providers to enable (all if omitted) */
    enabledProviders?: string[];

    /** Filter models by provider */
    modelFilters?: Record<string, string[]>;

    /** Default provider ID */
    defaultProvider?: string;

    /** Default model ID */
    defaultModel?: string;
}
