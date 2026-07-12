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
 * Represents an AI provider (e.g., OpenRouter, OpenAI, Anthropic).
 * 
 * Providers can return a static list of models or fetch them dynamically.
 * 
 * @example
 * ```typescript
 * const provider: AparteAIProvider = {
 *   id: 'openrouter',
 *   getMetadata: () => ({
 *     name: 'OpenRouter',
 *     id: 'openrouter',
 *     icon: '<svg>...</svg>',
 *     color: '#000000',
 *     helpUrl: 'https://openrouter.ai/keys'
 *   }),
 *   getModels: () => [...]
 * };
 * ```
 */
export interface AparteAIProvider {
    /** Unique identifier for the provider */
    id: string;

    /**
     * Returns brand metadata for UI rendering.
     */
    getMetadata(): AparteAIProviderMetadata;

    /**
     * Returns the list of available models.
     * Can be synchronous (static list) or async (API fetch).
     */
    getModels(): AparteAIModel[] | Promise<AparteAIModel[]>;

    /**
     * Optional: Fetch models dynamically from an API.
     * Useful for providers like OpenRouter that have evolving model lists.
     * 
     * @param config - Optional API key or full configuration object for authenticated requests
     */
    fetchModels?(config?: string | Record<string, string>): Promise<AparteAIModel[]>;

    /**
     * Execute a chat request directly. **Optional** — HTTP providers expose the
     * format-adapter surface below and are driven by an `AparteTransport` instead;
     * providers that own their own I/O (Transformers.js locally, or a bridge
     * wrapping an external SDK) implement `chat`, to which `DirectTransport`
     * delegates.
     *
     * @param request - The chat request options (messages, model, etc.)
     * @param config - Optional API key or full configuration object
     * @param ctx - Transport context (structurally mirrors `AparteTransportContext`;
     *   inline to avoid a type cycle with `transport/types`). `signal` aborts the
     *   in-flight call — bridges MUST honor it so a user "stop" cancels the
     *   underlying request, not just the local read.
     * @returns ReadableStream for streaming or string for full response
     */
    chat?(
        request: AparteChatRequest,
        config?: string | Record<string, string>,
        ctx?: { providerId: string; signal?: AbortSignal },
    ): Promise<AparteChatResponse>;

    // ── Format-adapter surface (transport ⊥ format) ─────────────────────────
    // A provider migrating to a pure format adapter exposes these instead of
    // owning fetch+key in `chat()`. When all four are present, `AparteTransport`
    // implementations (DirectTransport/BackendTransport) drive the request and
    // the provider only shapes the payload and parses the stream. See
    // `src/transport/`. All optional so un-migrated providers stay valid.

    /** Build the vendor HTTP request from an Aparte request (auth injected by the transport). */
    buildRequest?(request: AparteChatRequest): { path: string; body: unknown; headers?: Record<string, string> };
    /** Vendor auth headers for a resolved key (browser-direct only). */
    authHeaders?(key: string): Record<string, string>;
    /** Vendor auth as URL query params for a resolved key (e.g. Gemini `?key=`). */
    authQuery?(key: string): Record<string, string>;
    /** Base URL for browser-direct calls (overridable per request via config). */
    defaultEndpoint?: string;
    /** Parse a streaming vendor response body into unified events. */
    parseStream?(body: ReadableStream<Uint8Array>): ReadableStream<AparteStreamEvent>;
    /** Extract text from a non-streaming vendor JSON response. */
    parseText?(json: unknown): string;

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
