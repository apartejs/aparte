/**
 * AparteConfig
 * 
 * Central configuration singleton for Aparte.
 * Manages providers for Markdown rendering, Syntax Highlighting, Icons, and Skeleton loading.
 * 
 * "Invisible but Flexible": Works out-of-the-box with sensible defaults,
 * but allows complete customization via dependency injection.
 */

import { AparteIconProvider, AparteIconName, DEFAULT_ICON_FALLBACKS } from './icon-provider.js';
import { AparteAvatarProvider } from './avatar-provider.js';
import { AparteLocale, DEFAULT_LOCALE } from './locale.js';
import { AparteAction, AparteActionZone } from './action-provider.js';
import { AparteSkeletonProvider, AparteSkeletonType } from './skeleton-provider.js';
import type { AparteStatusRenderer } from './status-renderer.js';
import type { AparteErrorRenderer } from './error-renderer.js';
import type { AparteAttachmentRenderer } from './attachment-renderer.js';
import type { AparteSiblingNavRenderer } from './sibling-nav-renderer.js';
import type { AparteBubbleShellRenderer } from './bubble-shell-renderer.js';
import type { AparteAIProvider, AparteAIModel, AparteModelConfig } from '../types/model-provider.js';
import type { AparteTransport } from '../transport/index.js';
import { DirectTransport } from '../transport/index.js';
import type { AparteTool, AparteToolHandler, AparteToolRenderer } from '../types/tools.js';
import type { AparteBubbleActionsConfig, AparteBubbleActionName } from '../types/models.js';
import type { ConversationManager } from '../conversations/conversation-manager.js';
import { defaultSanitizer, type AparteSanitizer } from './sanitize.js';
import type { AparteElicitationPresenter, AparteElicitationRequest, AparteElicitationResult } from '../elicitation/types.js';

export type AparteMarkdownProvider = (raw: string) => string;
export type AparteHighlightProvider =
    | ((code: string, lang: string) => string)
    | ((code: string, lang: string) => Promise<string>);
export type AparteSystemPromptVarsProvider = () => Record<string, string>;
export type AparteLocaleProvider = AparteLocale;
export type AparteKeyProvider = (providerId: string) => string | Promise<string | undefined> | undefined;

export interface AparteModelPreference {
    provider: string;
    model: string;
}

export interface AparteModelPreferenceProvider {
    /** Called whenever the selected provider+model changes */
    save: (provider: string, model: string) => void;
    /** Called on init to restore the previously saved selection. Return null if nothing stored. */
    load: () => AparteModelPreference | null;
}

/**
 * Incremental Markdown renderer bound to a target element. Created once per
 * streaming message: tokens are fed via `write()` and parsed + appended to the
 * DOM incrementally (O(n) total — no full re-parse / innerHTML rebuild on every
 * token). `end()` flushes any pending text when the stream completes.
 */
export interface AparteStreamingMarkdownRenderer {
    /** Append a chunk of Markdown text — parsed incrementally, appended as DOM nodes. */
    write(chunk: string): void;
    /** Finalize the stream (flush any pending text). */
    end(): void;
}

/**
 * Factory for an {@link AparteStreamingMarkdownRenderer}: given a target element,
 * returns a renderer that appends parsed Markdown into it. Supplied by an
 * opt-in provider package (e.g. `@aparte/provider-streaming-markdown`); when none
 * is registered the chat falls back to the one-shot `AparteMarkdownProvider`.
 */
export type AparteStreamingMarkdownProvider = (target: HTMLElement) => AparteStreamingMarkdownRenderer;

/**
 * Builds the HTML document used as an artifact preview iframe `srcdoc` for a
 * given artifact kind (react/html/svg/js/css/…). Supplied by the consuming app
 * — e.g. a React/Babel/Tailwind live preview that loads those libs from a CDN.
 * Core ships only a CDN-free fallback (svg/css/html/js render offline; other
 * kinds degrade to a read-only code view), so the engine stays zero-network and
 * framework-agnostic. The app opts into richer previews via
 * {@link AparteConfigClass.setArtifactPreviewBuilder}.
 */
export type AparteArtifactPreviewBuilder = (kind: string, body: string, title: string) => string;

export class AparteConfigClass {
    private _markdownProvider?: AparteMarkdownProvider;
    private _streamingMarkdownProvider?: AparteStreamingMarkdownProvider;
    private _highlightProvider?: AparteHighlightProvider;
    // HTML sanitizer applied to markdown/highlight PROVIDER output (untrusted,
    // LLM-authored) before it is injected via innerHTML. Default = built-in
    // zero-dep allowlist sanitizer; `null` disables it (trusted content only).
    private _sanitizer: AparteSanitizer | null = defaultSanitizer;
    private _systemPromptTemplate?: string;
    private _systemPromptVarsProvider?: AparteSystemPromptVarsProvider;
    private _skeletonProvider?: AparteSkeletonProvider;
    private _statusRenderer?: AparteStatusRenderer;
    private _errorRenderer?: AparteErrorRenderer;
    private _attachmentRenderer?: AparteAttachmentRenderer;
    private _siblingNavRenderer?: AparteSiblingNavRenderer;
    private _bubbleShellRenderer?: AparteBubbleShellRenderer;
    private _iconProvider?: AparteIconProvider;
    private _avatarProvider?: AparteAvatarProvider;
    private _keyProvider?: AparteKeyProvider;
    private _artifactPreviewBuilder?: AparteArtifactPreviewBuilder;
    private _locale: AparteLocale = DEFAULT_LOCALE;
    private _actions: AparteAction[] = [];
    private _listeners: Set<() => void> = new Set();

    // AI Provider Management (BYORK)
    private _aiProviders: Map<string, AparteAIProvider> = new Map();
    private _modelConfig: AparteModelConfig = {};
    /** Opt-in: gate the composer (block send + grey out) until a model is selected. */
    private _requireModelSelection = false;
    // Transport: where chat requests go + how auth is handled (DirectTransport = browser-direct).
    private _transport: AparteTransport = new DirectTransport();
    private _modelPreferenceProvider?: AparteModelPreferenceProvider;

    // Conversation persistence (optional, agnostic)
    private _conversationManager?: ConversationManager;

    // Human-in-the-loop: presents typed input requests (ask_question,
    // tool approval, forms). Set by the <aparte-elicitation> Web Component.
    private _elicitationPresenter?: AparteElicitationPresenter;

    // Tool Registry
    private _tools: Map<string, { tool: AparteTool; handler: AparteToolHandler }> = new Map();
    private _toolRenderers: Map<string, AparteToolRenderer> = new Map();

    // Bubble Actions
    private _bubbleActionsConfig: AparteBubbleActionsConfig = { copy: true, retry: true, edit: true, feedback: false };

    // ─────────────────────────────────────────────────────────────────────────
    // Provider Setters (Dependency Injection)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register a custom action button. `zones` places it in the composer toolbar
     * and/or the message (bubble) toolbar. Re-registering the same id overwrites
     * it. Notifies mounted elements so they re-render.
     */
    registerAction(action: AparteAction): void {
        const existing = this._actions.findIndex(a => a.id === action.id);
        if (existing !== -1) {
            console.warn(`[AparteConfig] Action with ID "${action.id}" already registered. Overwriting.`);
            this._actions[existing] = action;
        } else {
            this._actions.push(action);
        }
        this._notify();
    }

    /** All registered actions for a zone, sorted by `order` (lower first). */
    getActions(zone: AparteActionZone): AparteAction[] {
        return this._actions
            .filter(a => a.zones.includes(zone))
            .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    /** Remove a custom action by id (from every zone); notifies mounted elements if it existed. */
    unregisterAction(id: string): void {
        const before = this._actions.length;
        this._actions = this._actions.filter(a => a.id !== id);
        if (this._actions.length !== before) this._notify();
    }

    /**
     * Show or hide a composer action button by id.
     * Triggers a config update so all mounted `aparte-chat-input` elements react immediately.
     */
    setActionHidden(id: string, hidden: boolean): void {
        const action = this._actions.find(a => a.id === id);
        if (action) {
            action.composer = { ...action.composer, hidden };
            this._notify();
        }
    }

    /**
     * Configure which action buttons appear in message bubbles.
     * Unset keys keep their defaults (copy=true, retry=true, edit=true, feedback=false).
     *
     * @example
     * AparteConfig.setBubbleActions({ feedback: true })        // enable feedback, keep rest
     * AparteConfig.setBubbleActions({ retry: false })          // disable retry only
     * AparteConfig.setBubbleActions({ copy: false, retry: false, edit: false }) // hide all
     * // Explicit per-role ordered sets (replace the flag defaults for that role):
     * AparteConfig.setBubbleActions({ user: ['edit', 'copy'], assistant: ['copy', 'thumbUp', 'thumbDown', 'retry'] })
     */
    setBubbleActions(config: AparteBubbleActionsConfig): void {
        this._bubbleActionsConfig = { ...this._bubbleActionsConfig, ...config };
        this._notify();
    }

    /** Returns the resolved bubble actions config (flag defaults applied; per-role sets passed through). */
    getBubbleActions(): {
        copy: boolean;
        retry: boolean;
        edit: boolean;
        feedback: boolean;
        user?: AparteBubbleActionName[];
        assistant?: AparteBubbleActionName[];
    } {
        return {
            copy: this._bubbleActionsConfig.copy ?? true,
            retry: this._bubbleActionsConfig.retry ?? true,
            edit: this._bubbleActionsConfig.edit ?? true,
            feedback: this._bubbleActionsConfig.feedback ?? false,
            user: this._bubbleActionsConfig.user,
            assistant: this._bubbleActionsConfig.assistant,
        };
    }

    /**
     * Set a custom Markdown renderer (e.g., marked, maritime-it)
     */
    setMarkdownProvider(fn: AparteMarkdownProvider): void {
        this._markdownProvider = fn;
    }

    /**
     * Set an incremental (streaming) Markdown renderer provider. Optional —
     * when set, the chat bubble uses it to render the assistant message
     * token-by-token DURING streaming (incremental parse + DOM append, O(n)),
     * instead of re-parsing the whole string on every token. The one-shot
     * `setMarkdownProvider` is still used for finished / re-rendered messages.
     */
    setStreamingMarkdownProvider(fn: AparteStreamingMarkdownProvider): void {
        this._streamingMarkdownProvider = fn;
    }

    /**
     * Create an incremental Markdown renderer bound to `target`, or `null` when
     * no streaming-markdown provider is registered (the caller then falls back
     * to the one-shot `renderMarkdown`).
     */
    createStreamingMarkdownRenderer(target: HTMLElement): AparteStreamingMarkdownRenderer | null {
        return this._streamingMarkdownProvider ? this._streamingMarkdownProvider(target) : null;
    }

    /**
     * Set a custom Syntax Highlighter (e.g., prism, highlight.js, shiki)
     * Supports both synchronous and asynchronous renderers.
     */
    setHighlightProvider(fn: AparteHighlightProvider): void {
        this._highlightProvider = fn;
    }

    /**
     * Whether a syntax-highlight provider is registered. Lets consumers (e.g.
     * the bubble) skip the highlight pass — and avoid replacing already-rendered
     * code blocks with the plain fallback — when no highlighter is installed.
     */
    hasHighlightProvider(): boolean {
        return !!this._highlightProvider;
    }

    /**
     * Replace or disable the HTML sanitizer applied to markdown/highlight
     * provider output before it is injected into the DOM. Defaults to a built-in
     * zero-dependency allowlist sanitizer.
     *
     * @param sanitizer A sanitizer function (e.g. a DOMPurify wrapper) for
     *   hardened coverage, or `null` to DISABLE sanitization. Disabling exposes
     *   you to XSS from LLM-authored content — only do so for content you fully
     *   trust and have already sanitized upstream.
     * @example AparteConfig.setHtmlSanitizer((html) => DOMPurify.sanitize(html));
     */
    setHtmlSanitizer(sanitizer: AparteSanitizer | null): void {
        this._sanitizer = sanitizer;
    }

    /**
     * Run the active sanitizer over provider-produced HTML. Public so a
     * streaming-markdown provider (which appends DOM directly, bypassing
     * `renderMarkdown`) can apply the same policy. Returns the input unchanged
     * only when sanitization was disabled via `setHtmlSanitizer(null)`.
     */
    sanitizeHtml(html: string): string {
        return this._sanitizer ? this._sanitizer(html) : html;
    }

    /**
     * Set the system prompt template. Supports `{{key}}` placeholders resolved via setSystemPromptVarsProvider.
     * Pass undefined to clear.
     */
    setSystemPrompt(template: string | undefined): void {
        this._systemPromptTemplate = template;
    }

    /** Get the raw system prompt template (with unresolved placeholders). */
    getSystemPromptTemplate(): string | undefined {
        return this._systemPromptTemplate;
    }

    /**
     * Register a function that returns a map of variable name → value.
     * Called at request time to resolve `{{key}}` placeholders in the system prompt.
     * Example: () => ({ 'settings.lang': 'French' })
     */
    setSystemPromptVarsProvider(fn: AparteSystemPromptVarsProvider): void {
        this._systemPromptVarsProvider = fn;
    }

    /**
     * Resolve the system prompt template by substituting all `{{key}}` placeholders.
     * Returns null if no template is set or the template is empty after trimming.
     */
    resolveSystemPrompt(): string | null {
        if (!this._systemPromptTemplate?.trim()) return null;
        const vars = this._systemPromptVarsProvider ? this._systemPromptVarsProvider() : {};
        const resolved = this._systemPromptTemplate.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? '');
        return resolved.trim() || null;
    }

    /**
     * Set a custom Skeleton generator for loading states
     * @param provider Object implementing AparteSkeletonProvider interface
     */
    setSkeletonProvider(provider: AparteSkeletonProvider): void {
        this._skeletonProvider = provider;
    }

    /**
     * Set a custom Icon provider (e.g., Lucide, FontAwesome, Material)
     * @param provider Object implementing AparteIconProvider interface
     */
    setIconProvider(provider: AparteIconProvider): void {
        this._iconProvider = provider;
        // Notify so already-rendered components (bubble action bars, composer
        // controls re-rendered by consumers) can pick up the new icon set —
        // e.g. a live skin switch. setBubbleActions already notifies.
        this._notify();
    }

    /**
     * Register an artifact preview builder (app-level). When set, the artifact
     * renderer uses it to build the preview iframe `srcdoc`; when unset, core's
     * CDN-free fallback is used. This is how the product opts into a
     * React/Babel/Tailwind live preview without leaking those into core.
     */
    setArtifactPreviewBuilder(builder: AparteArtifactPreviewBuilder): void {
        this._artifactPreviewBuilder = builder;
    }

    /** The registered artifact preview builder, or undefined for the core fallback. */
    getArtifactPreviewBuilder(): AparteArtifactPreviewBuilder | undefined {
        return this._artifactPreviewBuilder;
    }

    /**
     * Get the current icon provider, or a proxy that falls back to DEFAULT_ICON_FALLBACKS
     */
    getIconProvider(): AparteIconProvider {
        if (this._iconProvider) return this._iconProvider;
        // Build a fallback provider from DEFAULT_ICON_FALLBACKS
        return Object.fromEntries(
            Object.entries(DEFAULT_ICON_FALLBACKS).map(([k, v]) => [k, () => v])
        ) as unknown as AparteIconProvider;
    }

    /**
     * Set a custom avatar renderer. Lets framework consumers (Angular,
     * React, Vue, …) mount live components in place of the default
     * avatar text/image. Cleared by passing `null`.
     */
    setAvatarProvider(provider: AparteAvatarProvider | null): void {
        this._avatarProvider = provider ?? undefined;
    }

    /** Returns the registered avatar provider, or null if none. */
    getAvatarProvider(): AparteAvatarProvider | null {
        return this._avatarProvider ?? null;
    }

    /**
     * Set a custom typing-indicator renderer. Replaces the inner markup of
     * `<aparte-chat-status>` (avatar + animated dots + text) while the element keeps
     * owning show/hide. Return a string or an HTMLElement. Cleared by passing
     * `null`. Notifies mounted components so a live skin switch re-renders.
     */
    setStatusRenderer(renderer: AparteStatusRenderer | null): void {
        this._statusRenderer = renderer ?? undefined;
        this._notify();
    }

    /** Returns the registered status renderer, or null if none. */
    getStatusRenderer(): AparteStatusRenderer | null {
        return this._statusRenderer ?? null;
    }

    /**
     * Set a custom error renderer. Drives the content of error bubbles (the
     * built-in `error` segment) — return a string or an HTMLElement, e.g. a
     * friendly message with a retry button. The bubble also carries `data-error`
     * on its `.aparte-message` while errored, for CSS theming. Cleared with `null`.
     * Notifies mounted components so a live change re-renders.
     */
    setErrorRenderer(renderer: AparteErrorRenderer | null): void {
        this._errorRenderer = renderer ?? undefined;
        this._notify();
    }

    /** Returns the registered error renderer, or null if none. */
    getErrorRenderer(): AparteErrorRenderer | null {
        return this._errorRenderer ?? null;
    }

    /**
     * Set a custom attachment renderer. Replaces the chip rendered for each
     * attachment on a user message (default: image thumbnail / file chip) — return
     * a string or an HTMLElement, e.g. a PDF preview. You own the interactions for
     * custom output (see {@link AparteAttachmentRenderer}). Cleared with `null`.
     * Notifies mounted components so a live change re-renders.
     */
    setAttachmentRenderer(renderer: AparteAttachmentRenderer | null): void {
        this._attachmentRenderer = renderer ?? undefined;
        this._notify();
    }

    /** Returns the registered attachment renderer, or null if none. */
    getAttachmentRenderer(): AparteAttachmentRenderer | null {
        return this._attachmentRenderer ?? null;
    }

    /**
     * Set a custom sibling (branch) position indicator. Replaces the `‹ N / M ›`
     * counter between the prev/next arrows — e.g. dots. Return a string or an
     * HTMLElement (see {@link AparteSiblingNavRenderer}); the arrows keep their
     * behavior. Cleared with `null`. Notifies mounted components.
     */
    setSiblingNavRenderer(renderer: AparteSiblingNavRenderer | null): void {
        this._siblingNavRenderer = renderer ?? undefined;
        this._notify();
    }

    /** Returns the registered sibling-nav renderer, or null if none. */
    getSiblingNavRenderer(): AparteSiblingNavRenderer | null {
        return this._siblingNavRenderer ?? null;
    }

    /**
     * Set a custom bubble shell renderer (advanced) — replaces the structural
     * skeleton of `<aparte-chat-bubble>` while keeping its behavior. The shell must
     * honor the class-hook contract (root `.aparte-message`, region hooks) — see
     * {@link AparteBubbleShellRenderer}. For a fully custom element use `renderBubble`
     * (wrapper) instead. Cleared with `null`. Notifies mounted components.
     */
    setBubbleShellRenderer(renderer: AparteBubbleShellRenderer | null): void {
        this._bubbleShellRenderer = renderer ?? undefined;
        this._notify();
    }

    /** Returns the registered bubble-shell renderer, or null if none. */
    getBubbleShellRenderer(): AparteBubbleShellRenderer | null {
        return this._bubbleShellRenderer ?? null;
    }

    /**
     * Set the current locale
     * @param locale AparteLocale object defining all strings
     */
    setLocale(locale: AparteLocale): void {
        this._locale = locale;
    }

    /**
     * Get the current locale
     */
    getLocale(): AparteLocale {
        return this._locale;
    }

    /**
     * Extend the current locale with partial translations.
     * Useful for plugins to register their own strings.
     * @param translations Partial locale object to merge
     */
    extendLocale(translations: Partial<AparteLocale>): void {
        this._locale = { ...this._locale, ...translations };
    }

    /**
     * Get icon HTML string by name
     * Falls back to textual representation if no provider is set
     */
    getIcon(name: AparteIconName): string {
        if (this._iconProvider && this._iconProvider[name]) {
            return this._iconProvider[name]();
        }
        return DEFAULT_ICON_FALLBACKS[name];
    }

    /**
     * Set a custom Key provider (e.g., AparteVault override)
     */
    setKeyProvider(provider: AparteKeyProvider): void {
        this._keyProvider = provider;
    }

    /**
     * Get API key for a provider
     */
    async getKey(providerId: string): Promise<string | undefined> {
        if (this._keyProvider) {
            return await this._keyProvider(providerId);
        }
        return undefined;
    }

    /**
     * Refresh models for a specific provider
     * Orchestrates: Key Retrieval -> Fetch -> Return
     * This keeps UI components unaware of keys.
     */
    async refreshProviderModels(providerId: string): Promise<any[]> {
        const provider = this._aiProviders.get(providerId);
        if (!provider || !provider.fetchModels) return [];

        try {
            const apiKey = await this.getKey(providerId);
            // apiKey may be undefined for keyless local providers (e.g. LMStudio) — provider handles it
            return await provider.fetchModels(apiKey);
        } catch (error) {
            console.warn(`[AparteConfig] Failed to refresh models for ${providerId}`, error);
            return [];
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AI Provider Management (BYORK - Bring Your Own Key)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register one or more AI providers (e.g., OpenRouter, Gemini, Anthropic)
     * @param providers AparteAIProvider implementations
     * @example
     * AparteConfig.registerAIProvider(OpenRouterProvider);
     * AparteConfig.registerAIProvider(GeminiProvider, AnthropicProvider);
     */
    registerAIProvider(...providers: AparteAIProvider[]): void {
        for (const provider of providers) {
            if (!provider) continue;
            if (this._aiProviders.has(provider.id)) {
                console.warn(`[AparteConfig] AI Provider "${provider.id}" already registered. Overwriting.`);
            }
            this._aiProviders.set(provider.id, provider);
        }
        this._notify(); // Notify when providers change
    }

    /**
     * Unregister an AI provider
     */
    unregisterAIProvider(id: string): void {
        this._aiProviders.delete(id);
    }

    /**
     * Get all registered AI providers
     * Optionally filtered by enabled providers in config
     */
    getAIProviders(): AparteAIProvider[] {
        const all = Array.from(this._aiProviders.values());
        const enabled = this._modelConfig.enabledProviders;
        if (enabled?.length) {
            const result = all.filter(p => enabled.includes(p.id));
            return result;
        }
        return all;
    }

    /**
     * Get a specific AI provider by ID
     */
    getAIProvider(id: string): AparteAIProvider | undefined {
        return this._aiProviders.get(id);
    }

    /**
     * Set the transport that decides where chat requests go and how auth is
     * handled. Defaults to {@link DirectTransport} (browser-direct — BYOK/local).
     * Use a `BackendTransport` to keep API keys server-side (recommended for
     * production).
     */
    setTransport(transport: AparteTransport): void {
        this._transport = transport;
    }

    /** Get the active transport (DirectTransport by default). */
    getTransport(): AparteTransport {
        return this._transport;
    }

    /**
     * Register a model preference provider for agnostic persistence.
     * The host app decides how/where to store the selected provider & model.
     * @example
     * AparteConfig.setModelPreferenceProvider({
     *   save: (p, m) => localStorage.setItem('model', JSON.stringify({p, m})),
     *   load: () => JSON.parse(localStorage.getItem('model') ?? 'null')
     * });
     */
    setModelPreferenceProvider(provider: AparteModelPreferenceProvider): void {
        this._modelPreferenceProvider = provider;
    }

    /**
     * Restore previously saved model preference via the registered provider.
     * Should be called once at app startup, before any component mounts.
     * No-op if no provider is registered or nothing was saved.
     */
    restoreModelPreference(): AparteModelPreference | null {
        if (!this._modelPreferenceProvider) return null;
        const pref = this._modelPreferenceProvider.load();
        if (pref?.provider && pref?.model) {
            // Apply silently without triggering save again
            this._modelConfig = { ...this._modelConfig, defaultProvider: pref.provider, defaultModel: pref.model };
            this._notify();
            return pref;
        }
        return null;
    }

    /**
     * Set model selection configuration
     */
    setModelConfig(config: AparteModelConfig): void {
        this._modelConfig = { ...this._modelConfig, ...config };

        // Auto-save preference if a provider is registered and we have a full selection
        if (this._modelPreferenceProvider && this._modelConfig.defaultProvider && this._modelConfig.defaultModel) {
            this._modelPreferenceProvider.save(this._modelConfig.defaultProvider, this._modelConfig.defaultModel);
        }

        this._notify();
    }

    /**
     * Subscribe to configuration changes
     * @returns Unsubscribe function
     */
    subscribe(callback: () => void): () => void {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    }

    private _notify(): void {
        this._listeners.forEach(cb => cb());
        // Also dispatch a browser event for maximum agnosticism. `config` lets
        // listeners ignore changes to a config that isn't theirs — components
        // resolving to a different instance (or the global) skip the rebuild
        // instead of every bubble on the page reacting to every config's change.
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aparte:config-change', {
                detail: { config: this, modelConfig: this._modelConfig },
            }));
        }
    }

    /**
     * Get current model configuration
     */
    getModelConfig(): AparteModelConfig {
        return { ...this._modelConfig };
    }

    /**
     * True when the model config has BOTH a provider and a model selected — i.e.
     * the chat can actually send. Used by the composer's `require-model` gate.
     */
    hasSelectedModel(): boolean {
        return !!(this._modelConfig.defaultProvider && this._modelConfig.defaultModel);
    }

    /**
     * Opt-in UX: when enabled, `<aparte-composer>` blocks sending and greys out
     * until {@link hasSelectedModel} is true (e.g. while the model selector is
     * still fetching its list). Off by default so single-model / backend setups
     * that never select a model are unaffected.
     */
    setRequireModelSelection(required: boolean): void {
        if (this._requireModelSelection === required) return;
        this._requireModelSelection = required;
        this._notify();
    }

    /** Whether the composer should gate on model selection (see {@link setRequireModelSelection}). */
    getRequireModelSelection(): boolean {
        return this._requireModelSelection;
    }

    /**
     * Get the currently selected model object, if available synchronously.
     * Returns undefined if no provider/model is selected, or if the provider's
     * models are only available asynchronously (fetchModels).
     */
    getCurrentModel(): AparteAIModel | undefined {
        const { defaultProvider, defaultModel } = this._modelConfig;
        if (!defaultProvider || !defaultModel) return undefined;
        const provider = this._aiProviders.get(defaultProvider);
        if (!provider) return undefined;
        const models = provider.getModels();
        if (models instanceof Promise) return undefined;
        return (models as AparteAIModel[]).find(m => m.id === defaultModel);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public Rendering Methods (with Fallbacks)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get translated string by key
     */
    t(key: keyof AparteLocale): string {
        const val = this._locale[key] || DEFAULT_LOCALE[key];
        // Ensure we always return a string for template interpolation
        // For optional properties like 'direction', this might need specific handling or casting
        return (val === undefined) ? '' : val;
    }

    /**
     * Render Markdown to HTML
     * Fallback: Escapes HTML and converts newlines to <br>
     */
    renderMarkdown(raw: string): string {
        if (this._markdownProvider) {
            try {
                // Provider output is untrusted (LLM-authored) → sanitize before it hits innerHTML.
                return this.sanitizeHtml(this._markdownProvider(raw));
            } catch (error) {
                console.warn('[AparteConfig] Markdown provider failed, using fallback:', error);
            }
        }
        // The default renderer already HTML-escapes — no sanitization needed.
        return this._defaultMarkdownRenderer(raw);
    }

    /**
     * Highlight code block
     * Fallback: Returns raw code wrapped in <pre><code>
     * Supports Promise if provider is async/streaming
     */
    async highlightCode(code: string, lang: string): Promise<string> {
        if (this._highlightProvider) {
            try {
                const result = this._highlightProvider(code, lang);
                const html = result instanceof Promise ? await result : result;
                // Highlighter output is derived from LLM code blocks → sanitize before innerHTML.
                return this.sanitizeHtml(html);
            } catch (error) {
                console.warn('[AparteConfig] Highlight provider failed, using fallback:', error);
            }
        }
        return this._defaultHighlightRenderer(code);
    }

    /**
     * Get HTML for a skeleton loader
     * Fallback: Simple CSS-animated box
     */
    getSkeleton(type: AparteSkeletonType): string {
        if (this._skeletonProvider) {
            return this._skeletonProvider.getSkeleton(type);
        }
        return this._defaultSkeletonRenderer(type);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Tool Registry
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register a tool and its handler together.
     * The handler is called when the AI invokes the tool during streaming.
     * @example
     * AparteConfig.registerTool(askQuestionTool, askQuestionHandler);
     */
    registerTool(tool: AparteTool, handler: AparteToolHandler): void {
        this._tools.set(tool.name, { tool, handler });
    }

    /** Unregister a tool by name */
    unregisterTool(name: string): void {
        this._tools.delete(name);
    }

    /** Get all registered tool definitions (to pass in AparteChatRequest) */
    getTools(): AparteTool[] {
        return Array.from(this._tools.values()).map(e => e.tool);
    }

    /** Get the handler for a tool by name */
    getToolHandler(name: string): AparteToolHandler | undefined {
        return this._tools.get(name)?.handler;
    }

    /**
     * Register a per-tool segment renderer.
     * Controls what appears in the chat bubble when the AI calls this tool.
     * Use this instead of the generic `tool_call` segment renderer for tool-specific UI.
     *
     * @example
     * // Hide the segment entirely (UI-only tool like ask_question)
     * AparteConfig.registerToolRenderer('ask_question', { render: () => '' });
     *
     * @example
     * // Custom pill for a web-search tool
     * AparteConfig.registerToolRenderer('web_search', { render: (seg) => `<div class="tool-pill">Searching...</div>` });
     */
    registerToolRenderer(toolName: string, renderer: AparteToolRenderer): void {
        this._toolRenderers.set(toolName, renderer);
    }

    /** Unregister a per-tool renderer */
    unregisterToolRenderer(toolName: string): void {
        this._toolRenderers.delete(toolName);
    }

    /** Get the renderer for a specific tool name. Returns undefined if none registered. */
    getToolRenderer(toolName: string): AparteToolRenderer | undefined {
        return this._toolRenderers.get(toolName);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Conversation Manager (optional, agnostic persistence layer)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register a ConversationManager so any UI controller can persist & load
     * conversations without coupling to a framework wrapper.
     */
    setConversationManager(manager: ConversationManager): void {
        this._conversationManager = manager;
    }

    /** Returns the registered ConversationManager, or undefined if none. */
    getConversationManager(): ConversationManager | undefined {
        return this._conversationManager;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Elicitation (human-in-the-loop typed input)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register the presenter that renders typed input requests (a choice, a
     * confirmation, a text field, a form) and resolves with the user's answer.
     * The `<aparte-elicitation>` Web Component registers itself here; an app can
     * override with its own framework-native presenter. Pass `null` to clear.
     */
    setElicitationPresenter(presenter: AparteElicitationPresenter | null): void {
        this._elicitationPresenter = presenter ?? undefined;
    }

    /** The registered elicitation presenter, or undefined if none. */
    getElicitationPresenter(): AparteElicitationPresenter | undefined {
        return this._elicitationPresenter;
    }

    /**
     * Ask the user for typed input mid-run and await their response. This is the
     * generic primitive behind `ask_question` and tool approval — the KIND of
     * question is the schema, not a bespoke tool. Resolves `accept` with the
     * value, `decline` when the user declines, or `cancel` when the turn is
     * cancelled. With no presenter registered it resolves `cancel` (nothing can
     * present it) rather than hanging.
     */
    requestUserInput(request: AparteElicitationRequest): Promise<AparteElicitationResult> {
        if (!this._elicitationPresenter) return Promise.resolve({ action: 'cancel' });
        return this._elicitationPresenter(request);
    }

    /**
     * Reset ALL configuration back to defaults — providers, registries, model
     * selection and bubble actions. Previously left `_aiProviders` / `_tools` /
     * `_toolRenderers` / `_modelConfig` behind, which leaked across SPA
     * navigations (registries only ever grew). Now a full reset.
     */
    reset(): void {
        this._markdownProvider = undefined;
        this._streamingMarkdownProvider = undefined;
        this._highlightProvider = undefined;
        this._systemPromptTemplate = undefined;
        this._systemPromptVarsProvider = undefined;
        this._skeletonProvider = undefined;
        this._statusRenderer = undefined;
        this._errorRenderer = undefined;
        this._attachmentRenderer = undefined;
        this._siblingNavRenderer = undefined;
        this._bubbleShellRenderer = undefined;
        this._iconProvider = undefined;
        this._avatarProvider = undefined;
        this._artifactPreviewBuilder = undefined;
        this._keyProvider = undefined;
        this._conversationManager = undefined;
        this._elicitationPresenter = undefined;
        this._locale = DEFAULT_LOCALE;
        this._actions = [];
        this._sanitizer = defaultSanitizer;
        // Registries — the leak the audit flagged.
        this._aiProviders.clear();
        this._tools.clear();
        this._toolRenderers.clear();
        this._modelConfig = {};
        this._requireModelSelection = false;
        this._modelPreferenceProvider = undefined;
        this._bubbleActionsConfig = { copy: true, retry: true, edit: true, feedback: false };
        this._notify();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Default Fallbacks (Zero-dependency)
    // ─────────────────────────────────────────────────────────────────────────

    private _defaultMarkdownRenderer(raw: string): string {
        // Simple security: Escape HTML tags
        const escaped = this._escapeHtml(raw);
        // Convert newlines to breaks
        return escaped.replace(/\n/g, '<br>');
    }

    private _defaultHighlightRenderer(code: string): string {
        return `<pre><code>${this._escapeHtml(code)}</code></pre>`;
    }

    private _defaultSkeletonRenderer(type: AparteSkeletonType): string {
        // Minimal fallback - no CSS animations, no heavy styling
        // Install @aparte/plugin-skeleton-default for shimmer effects
        const fallbacks: Record<AparteSkeletonType, string> = {
            message: '<div class="aparte-skeleton-fallback" style="padding:16px;color:#9ca3af;">Loading message...</div>',
            code: '<div class="aparte-skeleton-fallback" style="padding:16px;background:#1e293b;color:#64748b;border-radius:8px;">Loading code...</div>',
            text: '<div class="aparte-skeleton-fallback" style="padding:8px;color:#9ca3af;">Loading...</div>',
            thinking: '<div class="aparte-skeleton-fallback" style="padding:8px;color:#9ca3af;">Thinking...</div>',
            input: '<div class="aparte-skeleton-fallback" style="padding:12px;color:#9ca3af;">...</div>',
            list: '<div class="aparte-skeleton-fallback" style="padding:16px;color:#9ca3af;">Loading items...</div>',
        };
        return fallbacks[type] || fallbacks.text;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

const GLOBAL_CONFIG_KEY = '__APARTE_CONFIG_SINGLETON__';

function getGlobalConfig(): AparteConfigClass {
    if (typeof window !== 'undefined') {
        if (!(window as any)[GLOBAL_CONFIG_KEY]) {
            (window as any)[GLOBAL_CONFIG_KEY] = new AparteConfigClass();
        }
        return (window as any)[GLOBAL_CONFIG_KEY];
    }
    // Fallback for non-browser environments (e.g., SSR, tests)
    return new AparteConfigClass();
}

/**
 * Global configuration singleton for Aparte.
 * Use this to register providers and configure behavior.
 */
export const AparteConfig = getGlobalConfig();

// Inject default styles for skeletons if needed (optional)
// Note: In a real app we might want to use a stylesheet or shadow DOM styles
