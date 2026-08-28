/**
 * AparteConfig
 * 
 * Central configuration class for Aparte. `aparteGlobalConfig` is the page-wide instance.
 * Manages providers for Markdown rendering, Syntax Highlighting and Icons.
 * 
 * "Invisible but Flexible": Works out-of-the-box with sensible defaults,
 * but allows complete customization via dependency injection.
 */

import { AparteIconProvider, AparteIconName, APARTE_DEFAULT_ICON_FALLBACKS } from './icon-provider.js';
import { AparteAvatarProvider } from './avatar-provider.js';
import { AparteLocale, APARTE_DEFAULT_LOCALE } from './locale.js';
import { AparteAction, AparteActionZone } from './action-provider.js';
import type { AparteStatusRenderer } from './status-renderer.js';
import type { AparteErrorRenderer } from './error-renderer.js';
import type { AparteAttachmentRenderer } from './attachment-renderer.js';
import type { AparteElicitationFieldRenderer } from './elicitation-field-renderer.js';
import type { AparteSiblingNavRenderer } from './sibling-nav-renderer.js';
import type { AparteBubbleShellRenderer } from './bubble-shell-renderer.js';
import type { AparteAIProvider, AparteAIModel, AparteModelConfig } from '../types/model-provider.js';
import type { AparteTransport } from '../transport/index.js';
import { AparteDirectTransport } from '../transport/index.js';
import type {
    AparteTool, AparteToolHandler, AparteToolRenderer, AparteToolCall,
    AparteApprovalPolicy, AparteApprovalRuling,
} from '../types/tools.js';
import type { AparteSegmentDefaults } from '../types/segments.js';
import type { AparteBubbleActionsConfig, AparteBubbleActionName, AparteHostHandlersConfig } from '../types/models.js';
import type { AparteConversationManager } from '../conversations/conversation-manager.js';
import { defaultSanitizer, type AparteSanitizer } from './sanitize.js';
import type { AparteElicitationPresenter, AparteElicitationRequest, AparteElicitationResult } from '../elicitation/types.js';
import { AparteElicitationAbortError } from '../elicitation/types.js';
import { escapeHtml } from '../utils/escape.js';
import { chatBoundaryOf } from '../utils/chat-boundary.js';

export type AparteMarkdownProvider = (raw: string) => string;
export type AparteHighlightProvider =
    | ((code: string, lang: string) => string)
    | ((code: string, lang: string) => Promise<string>);
export type AparteSystemPromptVarsProvider = () => Record<string, string>;
export type AparteLocaleProvider = AparteLocale;
export type AparteKeyProvider = (providerId: string) => string | Promise<string | undefined> | undefined;

/**
 * The bubble-action defaults — `copy` on, everything else off.
 *
 * The rule: an affordance core cannot honor end-to-end does not appear by
 * default. Core can copy text by itself; retry and edit only do something when a
 * host (`AparteClient`) re-sends and rewrites, and feedback/info only when the app
 * listens for `aparte-feedback` / `aparte-message-info`. Rendering them
 * unconditionally showed dead buttons in every display-only integration — ours
 * included, which is how we found it.
 *
 * Exported so a consumer can read the defaults instead of hard-coding them.
 */
export const APARTE_DEFAULT_BUBBLE_ACTIONS = {
    copy: true,
    retry: false,
    edit: false,
    feedback: false,
    info: false,
} as const;

/**
 * The host-handler declarations — nothing declared.
 *
 * Same rule as {@link APARTE_DEFAULT_BUBBLE_ACTIONS}, applied outside the action bar: an
 * image tile you can click, a Run button, a download button on a binary artifact
 * are all requests core forwards to the app. Undeclared, they are not rendered
 * (and the tile is not even signalled as clickable) instead of doing nothing.
 */
export const APARTE_DEFAULT_HOST_HANDLERS = {
    attachmentPreview: false,
    artifactRedownload: false,
    artifactRehydrate: false,
} as const;

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
 * {@link AparteConfig.setArtifactPreviewBuilder}.
 */
export type AparteArtifactPreviewBuilder = (kind: string, body: string, title: string) => string;

/** The queue tail must never reject, so a failed request cannot wedge every later one. */
const NOOP = (): void => { /* deliberately empty */ };

export class AparteConfig {
    private _markdownProvider?: AparteMarkdownProvider;
    private _streamingMarkdownProvider?: AparteStreamingMarkdownProvider;
    private _highlightProvider?: AparteHighlightProvider;
    // HTML sanitizer applied to markdown/highlight PROVIDER output (untrusted,
    // LLM-authored) before it is injected via innerHTML. Default = built-in
    // zero-dep allowlist sanitizer; `null` disables it (trusted content only).
    private _sanitizer: AparteSanitizer | null = defaultSanitizer;
    private _systemPromptTemplate?: string;
    private _systemPromptVarsProvider?: AparteSystemPromptVarsProvider;
    private _statusRenderer?: AparteStatusRenderer;
    private _errorRenderer?: AparteErrorRenderer;
    private _attachmentRenderer?: AparteAttachmentRenderer;
    private _siblingNavRenderer?: AparteSiblingNavRenderer;
    private _bubbleShellRenderer?: AparteBubbleShellRenderer;
    private _iconProvider?: AparteIconProvider;
    private _avatarProvider?: AparteAvatarProvider;
    private _keyProvider?: AparteKeyProvider;
    private _artifactPreviewBuilder?: AparteArtifactPreviewBuilder;
    private _locale: AparteLocale = APARTE_DEFAULT_LOCALE;
    private _actions: AparteAction[] = [];
    private _listeners: Set<() => void> = new Set();

    // AI Provider Management (BYORK)
    private _aiProviders: Map<string, AparteAIProvider> = new Map();
    /**
     * What `refreshProviderModels()` last brought back, per provider.
     *
     * Without it, `getCurrentModel()` read `provider.getModels()` only — the
     * SYNCHRONOUS, hand-declared list, which every preset of
     * `@aparte/provider-openai-compat` leaves empty because a compat endpoint's
     * list is fetched at runtime. So the current model resolved to `undefined`
     * for the documented primary path, and everything that reads a capability off
     * it silently got nothing: `AparteClient._toolsForCurrentModel()` gates tools
     * on `capabilities.includes('function_calling')`, so NO tool was ever sent to
     * the model. A registered tool, an approval gate, `<aparte-elicitation>` — all
     * dead, with the model answering, correctly, that it had been given no tools.
     */
    private _fetchedModels: Map<string, AparteAIModel[]> = new Map();
    private _modelConfig: AparteModelConfig = {};
    /** Opt-in: gate the composer (block send + grey out) until a model is selected. */
    private _requireModelSelection = false;
    /** Host policy for the elicitation panel's free-text escape — see {@link setElicitationOptions}. */
    private _elicitationAllowOther = true;
    private _elicitationLayout: 'stepped' | 'stacked' = 'stepped';
    /** Whether a single choice answers on the click (buttons) or keeps its radios + the composer's button. */
    private _elicitationAnswerOnClick = true;
    private _elicitationFieldRenderer?: AparteElicitationFieldRenderer | undefined;
    // Transport: where chat requests go + how auth is handled (AparteDirectTransport = browser-direct).
    private _transport: AparteTransport = new AparteDirectTransport();
    private _modelPreferenceProvider?: AparteModelPreferenceProvider;
    // Per-call approval policy (a mode: plan / ask / auto). `null` = the tools' own flags.
    private _approvalPolicy: AparteApprovalPolicy | null = null;

    // Conversation persistence (optional, agnostic)
    private _conversationManager?: AparteConversationManager;

    /*
     * Human-in-the-loop: presents typed input requests (ask_user, tool approval,
     * forms). Registered by the `<aparte-elicitation>` Web Component.
     *
     * A STACK, not one slot, and that is the fix for two real failures. Since
     * `<aparte-elicitation>` entered `<aparte-chat>`'s default composition, two plain
     * `<aparte-chat>` elements on a page each register one on the same global config:
     *
     *   - the second clobbered the first, so chat A's approval opened under chat B, and
     *     answering it under B decided A's tool call;
     *   - and when B unmounted it cleared the slot, leaving chat A mounted with a
     *     perfectly good presenter that never re-registered — every later approval and
     *     every `ask_user` in A rejected `no-presenter` for the life of the page,
     *     silently, because the warning fires at most once per config.
     *
     * Each entry carries the element that registered it, so a request naming a `target`
     * is routed to the presenter in the SAME chat. `AparteElicitationRequest.target` was
     * already documented as "used to resolve WHICH instance presents"; the single slot
     * is what made that impossible.
     */
    private _elicitationPresenters: Array<{ fn: AparteElicitationPresenter; owner?: HTMLElement }> = [];
    /** Warn once per config, not once per request — a tool loop can ask repeatedly. */
    private _warnedNoPresenter = false;
    /**
     * The tail of the queue of requests waiting for the human, or `null` when none is.
     *
     * One request reaches the presenter at a time — not because a presenter could not
     * cope, but because the COMPOSER cannot: it has one panel slot, and a second
     * request used to clobber the first's DOM. The previous protection lived in the
     * default presenter, which answered the second request `cancel` on the spot; that
     * is a refusal invented for a question nobody was ever shown, the same class of
     * lie as telling the model a stopped turn was refused. WAITING is the honest
     * behaviour.
     *
     * Here rather than in the presenter because this is the only place that sees
     * EVERY request whatever raised it — a tool handler, an app's own button, and
     * (soon) the tool-approval gate. A custom presenter registered by a consumer gets
     * the same protection for free, which it previously had none of.
     */
    private _elicitationQueue: Promise<void> | null = null;

    // Tool Registry
    private _tools: Map<string, { tool: AparteTool; handler: AparteToolHandler }> = new Map();
    private _toolRenderers: Map<string, AparteToolRenderer> = new Map();
    private _segmentDefaults: Map<string, AparteSegmentDefaults> = new Map();

    // Host handlers — what the app declares it can actually complete.
    private _hostHandlers: AparteHostHandlersConfig = { ...APARTE_DEFAULT_HOST_HANDLERS };

    // Bubble Actions — APARTE_DEFAULT_BUBBLE_ACTIONS is the single source of truth
    // (init here, restored by reset(), and the fallback in getBubbleActions()).
    private _bubbleActionsConfig: AparteBubbleActionsConfig = { ...APARTE_DEFAULT_BUBBLE_ACTIONS };

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
     * Triggers a config update so all mounted composer elements react immediately.
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
     * Unset keys keep their defaults — see {@link APARTE_DEFAULT_BUBBLE_ACTIONS}: `copy`
     * only, because every other button needs a host to honor it.
     *
     * @example
     * aparteGlobalConfig.setBubbleActions({ retry: true, edit: true }) // you run AparteClient
     * aparteGlobalConfig.setBubbleActions({ feedback: true })          // you listen for aparte-feedback
     * aparteGlobalConfig.setBubbleActions({ copy: false })             // hide everything
     * // Explicit per-role ordered sets (replace the flag defaults for that role):
     * aparteGlobalConfig.setBubbleActions({ user: ['edit', 'copy'], assistant: ['copy', 'thumbUp', 'thumbDown', 'retry'] })
     */
    setBubbleActions(config: AparteBubbleActionsConfig): void {
        this._bubbleActionsConfig = { ...this._bubbleActionsConfig, ...config };
        this._notify();
    }

    /**
     * Declare which host-dependent affordances your app handles. Core renders the
     * trigger only for the ones you claim — see {@link AparteHostHandlersConfig}.
     *
     * @example
     * aparteGlobalConfig.setHostHandlers({ attachmentPreview: true, artifactRedownload: true });
     */
    setHostHandlers(config: AparteHostHandlersConfig): void {
        this._hostHandlers = { ...this._hostHandlers, ...config };
        this._notify();
    }

    /** Returns the resolved host-handler declarations (undeclared = false). */
    // `Required<...>` rather than a hand-written shape: the previous signature
    // listed the three keys literally, so adding a fourth to the interface left
    // this method silently returning a type without it — the caller's read did not
    // even typecheck. Derived from the interface, a new declaration cannot be
    // forgotten here.
    getHostHandlers(): Required<AparteHostHandlersConfig> {
        return {
            attachmentPreview: this._hostHandlers.attachmentPreview ?? APARTE_DEFAULT_HOST_HANDLERS.attachmentPreview,
            artifactRedownload: this._hostHandlers.artifactRedownload ?? APARTE_DEFAULT_HOST_HANDLERS.artifactRedownload,
            artifactRehydrate: this._hostHandlers.artifactRehydrate ?? APARTE_DEFAULT_HOST_HANDLERS.artifactRehydrate,
        };
    }

    /** Returns the resolved bubble actions config (flag defaults applied; per-role sets passed through). */
    getBubbleActions(): {
        copy: boolean;
        retry: boolean;
        edit: boolean;
        feedback: boolean;
        info: boolean;
        user?: AparteBubbleActionName[];
        assistant?: AparteBubbleActionName[];
    } {
        return {
            copy: this._bubbleActionsConfig.copy ?? APARTE_DEFAULT_BUBBLE_ACTIONS.copy,
            retry: this._bubbleActionsConfig.retry ?? APARTE_DEFAULT_BUBBLE_ACTIONS.retry,
            edit: this._bubbleActionsConfig.edit ?? APARTE_DEFAULT_BUBBLE_ACTIONS.edit,
            feedback: this._bubbleActionsConfig.feedback ?? APARTE_DEFAULT_BUBBLE_ACTIONS.feedback,
            info: this._bubbleActionsConfig.info ?? APARTE_DEFAULT_BUBBLE_ACTIONS.info,
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
     * @example aparteGlobalConfig.setHtmlSanitizer((html) => DOMPurify.sanitize(html));
     */
    setHtmlSanitizer(sanitizer: AparteSanitizer | null): void {
        if (sanitizer === null) {
            // Passing null is a legitimate choice — an app that fully trusts its
            // own pipeline, or one swapping in DOMPurify at a different layer. But
            // it turns every renderer in this library into a raw `innerHTML` sink
            // for model output, and it used to happen in complete silence, which
            // is indistinguishable from a typo or a half-finished migration. One
            // line in the console, once, so the decision is visible where it takes
            // effect rather than only where it was written.
            console.warn(
                '[aparte] HTML sanitization is now DISABLED (setHtmlSanitizer(null)). '
                + 'Model-authored HTML will be inserted verbatim. Pass a sanitizer '
                + '(e.g. DOMPurify.sanitize) unless you sanitize upstream yourself.',
            );
        }
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
     * The icon set as a **complete** provider: every name resolves, falling back
     * to `APARTE_DEFAULT_ICON_FALLBACKS` for anything the registered provider doesn't
     * implement. Callers (bubble action bar, composer controls) can therefore
     * invoke `icons.copy()` unconditionally.
     *
     * It used to hand back the registered provider verbatim, so a provider that
     * implemented a subset — which `getIcon()` has always supported, and which
     * the type now states — crashed every other icon with
     * "icons.retry is not a function".
     */
    getIconProvider(): Required<AparteIconProvider> {
        const registered = this._iconProvider;
        const complete = {} as Required<AparteIconProvider>;
        for (const name of Object.keys(APARTE_DEFAULT_ICON_FALLBACKS) as AparteIconName[]) {
            const fn = registered?.[name];
            complete[name] = fn ?? (() => APARTE_DEFAULT_ICON_FALLBACKS[name]);
        }
        return complete;
    }

    /**
     * Set a custom avatar renderer. Lets framework consumers (Angular,
     * React, Vue, …) mount live components in place of the default
     * avatar text/image. Cleared by passing `null`.
     */
    setAvatarProvider(provider: AparteAvatarProvider | null): void {
        this._avatarProvider = provider ?? undefined;
        // Notify like every other live-renderer swap so mounted bubbles re-render.
        this._notify();
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
        // A runtime language switch must propagate to already-mounted components,
        // same as every other live setter.
        this._notify();
    }

    /**
     * Restore the built-in English locale (the same `APARTE_DEFAULT_LOCALE` core ships
     * with). Counterpart of {@link setLocale} for language toggles — avoids
     * having to import `APARTE_DEFAULT_LOCALE` yourself.
     */
    resetLocale(): void {
        this._locale = APARTE_DEFAULT_LOCALE;
        this._notify();
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
        this._notify();
    }

    /**
     * Get icon HTML string by name
     * Falls back to textual representation if no provider is set
     */
    getIcon(name: AparteIconName): string {
        const icon = this._iconProvider?.[name];
        if (icon) return icon();
        return APARTE_DEFAULT_ICON_FALLBACKS[name];
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
    async refreshProviderModels(providerId: string): Promise<AparteAIModel[]> {
        const provider = this._aiProviders.get(providerId);
        if (!provider || !provider.fetchModels) return [];

        try {
            const apiKey = await this.getKey(providerId);
            // apiKey may be undefined for keyless local providers (e.g. LMStudio) — provider handles it
            const models = await provider.fetchModels(apiKey);
            // Cached so `getCurrentModel()` can see it: a fetched list is the only
            // list a compat endpoint has, and capabilities are read off the model.
            this._fetchedModels.set(providerId, models);
            return models;
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
     * aparteGlobalConfig.registerAIProvider(OpenRouterProvider);
     * aparteGlobalConfig.registerAIProvider(GeminiProvider, AnthropicProvider);
     */
    registerAIProvider(...providers: AparteAIProvider[]): void {
        for (const provider of providers) {
            if (!provider) continue;
            if (this._aiProviders.has(provider.id)) {
                console.warn(`[AparteConfig] AI Provider "${provider.id}" already registered. Overwriting.`);
            }
            this._aiProviders.set(provider.id, provider);
        }
        /*
         * One provider, one model, nothing selected: there is no choice to make, so it
         * is made. A scripted provider (`@aparte/provider-scenario`) or an in-browser
         * one offers exactly one model and knows it without a request — and without
         * this, a page with no `<aparte-model-selector>` and no `setModelConfig()` sent
         * nothing, silently (issue #29). Only the synchronous case: a provider whose
         * list comes from a fetch has no model to select yet, and the selector's
         * `auto-select` is what handles that one.
         */
        if (!this.hasSelectedModel() && this._aiProviders.size === 1) {
            const only = [...this._aiProviders.values()][0]!;
            const models = only.getModels();
            if (models.length === 1) {
                this._modelConfig = { ...this._modelConfig, defaultProvider: only.id, defaultModel: models[0]!.id };
            }
        }
        this._notify(); // Notify when providers change
    }

    /**
     * Unregister an AI provider
     */
    unregisterAIProvider(id: string): void {
        this._aiProviders.delete(id);
        // Notify like registerAIProvider does, so a mounted model-selector drops
        // the removed provider instead of showing a stale list.
        this._notify();
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
     * handled. Defaults to {@link AparteDirectTransport} (browser-direct — BYOK/local).
     * Use a `AparteBackendTransport` to keep API keys server-side (recommended for
     * production).
     */
    setTransport(transport: AparteTransport): void {
        this._transport = transport;
    }

    /** Get the active transport (AparteDirectTransport by default). */
    getTransport(): AparteTransport {
        return this._transport;
    }

    /**
     * Register a model preference provider for agnostic persistence.
     * The host app decides how/where to store the selected provider & model.
     * @example
     * aparteGlobalConfig.setModelPreferenceProvider({
     *   save: (p, m) => localStorage.setItem('model', JSON.stringify({p, m})),
     *   load: () => JSON.parse(localStorage.getItem('model') ?? 'null')
     * });
     */
    setModelPreferenceProvider(provider: AparteModelPreferenceProvider): void {
        this._modelPreferenceProvider = provider;
    }

    /**
     * Decide per CALL whether a tool runs, asks, or is refused — a mode, not a flag.
     *
     * With a policy registered, the client's default approval channel evaluates it for
     * every tool call: `allow` runs without asking, `ask` puts the call to the person
     * exactly as a `needsApproval` tool is, `deny` refuses it with the policy's own
     * `reason` as what the model reads. `undefined` leaves the tool's `needsApproval`
     * to decide, as before. `null` removes the policy.
     *
     * `@aparte/plugin-approval` builds one from a classification of your tool names and
     * a switchable mode (plan / ask / auto-edit / auto); a host that owns its own
     * `approvalResolver` on `AparteClientOptions` is not affected — that resolver
     * already decides everything.
     *
     * @example
     * ```ts
     * aparteGlobalConfig.setApprovalPolicy((call) =>
     *   call.name === 'run_command'
     *     ? { verdict: 'ask' }
     *     : { verdict: 'allow' });
     * ```
     */
    setApprovalPolicy(policy: AparteApprovalPolicy | null): void {
        this._approvalPolicy = policy;
        // Like every other registration: a mounted switch has to hear that a policy
        // arrived after it did, or went away.
        this._notify();
    }

    /** The registered approval policy, or `null`. */
    getApprovalPolicy(): AparteApprovalPolicy | null {
        return this._approvalPolicy;
    }

    /**
     * What the policy says about one call, with the tool's own `needsApproval` as the
     * answer when it has no opinion. The one place the two are combined, so the client's
     * gate predicate and its approval channel cannot disagree.
     */
    ruleOnToolCall(call: AparteToolCall): AparteApprovalRuling {
        const tool = this._tools.get(call.name)?.tool;
        const ruling = this._approvalPolicy?.(call, tool);
        if (ruling) return ruling;
        return { verdict: tool?.needsApproval ? 'ask' : 'allow' };
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
        // Each listener is isolated: one throwing/slow subscriber must not abort
        // the loop and starve the others of the notification.
        this._listeners.forEach(cb => {
            try { cb(); } catch (err) {
                console.error('[AparteConfig] A config-change listener threw', err);
            }
        });
        // Also dispatch a browser event for maximum agnosticism. `config` lets
        // listeners ignore changes to a config that isn't theirs — components
        // resolving to a different instance (or the global) skip the rebuild
        // instead of every bubble on the page reacting to every config's change.
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent<AparteConfigChangeEventDetail>('aparte-config-change', {
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
    /**
     * Elicitation policy: whether a choice offers a free-text "Other…" escape.
     *
     * This is the HOST's decision, not the model's. `ask_user` used to carry an
     * `allow_other` field in the schema it hands the model, which meant the model
     * decided your UX — and a small model fills a field it does not understand: one
     * sent two questions with `allow_other: true` and no options at all, so the
     * panel rendered a radio list whose only entry was "Other…", twice.
     *
     * Every serious implementation of this pattern makes the escape hatch a property
     * of the surface rather than of the request. Default `true`, which is what the
     * panel did before, so nothing a user sees changes — only who gets to say so.
     * A direct `requestUserInput` caller can still set `allowOther` per field; that
     * is the app talking, and it wins.
     *
     * `layout` decides how a form of SEVERAL questions is presented.
     * `'stepped'` (default) asks them one at a time with a chip per question;
     * `'stacked'` puts them all in the panel at once. Stacked was the only shape,
     * inherited unexamined from MCP elicitation — which describes a FORM for
     * collecting structured data, not two different questions asked mid-conversation.
     * No product asks a person two questions by stacking them in one box; it is kept
     * as an option because the form case is real, not because it was the right default.
     *
     * `answerOnClick` decides how a question asked ON ITS OWN with a single choice — an
     * `enum` without `multiple` or a `default`, a `boolean` without a `default` — is
     * answered. `true` (default) renders the options as buttons and the click is the
     * answer: one decision, one gesture, the shape every chat product uses for "which
     * one?". `false` keeps the radios and the composer's button, so a person can
     * change their mind before committing — the shape a form or a screen reader
     * flow may prefer, and the one a host that wants a uniform "select, then send"
     * across every question asks for. A form of several questions always collects and
     * submits, whatever this says.
     */
    setElicitationOptions(options: { allowOther?: boolean; layout?: 'stepped' | 'stacked'; answerOnClick?: boolean }): void {
        if (options.allowOther !== undefined) this._elicitationAllowOther = options.allowOther;
        if (options.layout !== undefined) this._elicitationLayout = options.layout;
        if (options.answerOnClick !== undefined) this._elicitationAnswerOnClick = options.answerOnClick;
        this._notify();
    }

    /** The elicitation policy (see {@link setElicitationOptions}). */
    getElicitationOptions(): { allowOther: boolean; layout: 'stepped' | 'stacked'; answerOnClick: boolean } {
        return { allowOther: this._elicitationAllowOther, layout: this._elicitationLayout, answerOnClick: this._elicitationAnswerOnClick };
    }

    /**
     * Render one field of the question panel yourself.
     *
     * See {@link AparteElicitationFieldRenderer}. Return `null` for a field to let
     * the built-in render it, which is what makes overriding a single kind practical.
     * Pass `null` here to remove the renderer.
     */
    setElicitationFieldRenderer(fn: AparteElicitationFieldRenderer | null): void {
        this._elicitationFieldRenderer = fn ?? undefined;
        this._notify();
    }

    /** The custom field renderer, if one is registered. */
    getElicitationFieldRenderer(): AparteElicitationFieldRenderer | undefined {
        return this._elicitationFieldRenderer;
    }

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
        // The fetched list FIRST: it is fresher, and for a provider whose list only
        // exists at runtime it is the only one there is. `getModels()` stays the
        // fallback, so a provider that declares its models statically is unchanged.
        const fetched = this._fetchedModels.get(defaultProvider);
        const fromFetch = fetched?.find(m => m.id === defaultModel);
        if (fromFetch) return fromFetch;
        const models = provider.getModels();
        if (models instanceof Promise) {
            // Contract violation kept survivable for plain-JS consumers: the
            // type is sync-only, async lists belong in fetchModels().
            console.warn(
                `[AparteConfig] Provider "${defaultProvider}".getModels() returned a Promise — it is ignored here, ` +
                'so this model resolves to undefined and nothing can read its capabilities. ' +
                'getModels() must return the list synchronously; implement fetchModels() for async fetching.'
            );
            return undefined;
        }
        return models.find(m => m.id === defaultModel);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public Rendering Methods (with Fallbacks)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get translated string by key
     */
    t(key: keyof AparteLocale): string {
        const val = this._locale[key] || APARTE_DEFAULT_LOCALE[key];
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

    // ─────────────────────────────────────────────────────────────────────────
    // Tool Registry
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register a tool and its handler together.
     * The handler is called when the AI invokes the tool during streaming.
     * @example
     * aparteGlobalConfig.registerTool(askUserTool, askUserHandler);
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

    /**
     * The registered tools' own `systemPrompt`s, joined, or `null` if none set one.
     *
     * `AparteTool.systemPrompt` has always been documented as "injected automatically when
     * this tool is registered", on the type and in the tools guide — and nothing read it.
     * A field that is documented and dead is worse than one that does not exist: a caller
     * writes it, sees the tool work (the model has the schema either way), and never learns
     * that the sentence explaining WHEN to reach for it was dropped. `@aparte/plugin-ask-user`
     * sets one, so a shipped plugin was losing its instructions.
     *
     * Registration order, blank line between, because two tools' instructions are two
     * paragraphs and not one run-on sentence. The app's own template stays a separate
     * message — see `resolveSystemPrompt`, which is about the app and not about the tools.
     */
    resolveToolSystemPrompts(): string | null {
        const prompts = Array.from(this._tools.values())
            .map((entry) => entry.tool.systemPrompt?.trim())
            .filter((prompt): prompt is string => Boolean(prompt));
        return prompts.length ? prompts.join('\n\n') : null;
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
     * // Hide the segment entirely (UI-only tool like ask_user)
     * aparteGlobalConfig.registerToolRenderer('ask_user', { render: () => '' });
     *
     * @example
     * // Custom pill for a web-search tool
     * aparteGlobalConfig.registerToolRenderer('web_search', { render: (seg) => `<div class="aparte-tool-label">Searching...</div>` });
     */
    registerToolRenderer(toolName: string, renderer: AparteToolRenderer): void {
        this._toolRenderers.set(toolName, renderer);
    }

    /**
     * Field defaults for a segment TYPE, filled in when a segment enters a message.
     *
     * One function for every type rather than one per field: a `setThinkingOpen()`
     * would need a sibling the next time any type wanted a default, and the type key
     * is a string, so a consumer's own segment type is covered by the same call.
     *
     * The problem it solves: a consumer streaming a reply does not CONSTRUCT its
     * segments — the parser does — so there was no hook at all for "reasoning blocks
     * open in my app". Per-segment fields only reach segments you build yourself.
     *
     * Applied where identity is stamped (`utils/segments.ts`), so it covers every
     * path a segment can arrive by — the parser, `addSegment`, and the segments
     * seeded on an `appendMessage` — and no renderer has to look anything up.
     *
     * A field the producer set always wins, and identity is never defaulted. Read at
     * insertion and baked in: changing a default later does not reach segments already
     * on screen, because a block the reader opened has state the data does not.
     *
     * @example
     * // Reasoning blocks arrive open in this app, streaming or settled.
     * aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false });
     *
     * @example
     * // A consumer's own type, same call.
     * aparteGlobalConfig.setSegmentDefaults('my-chart', { theme: 'dark' });
     */
    setSegmentDefaults(type: string, defaults: AparteSegmentDefaults): void {
        this._segmentDefaults.set(type, { ...defaults });
        // No `_notify()`, on purpose: nothing re-reads this. Defaults are baked in at
        // insertion, so a notify would advertise a liveness that does not exist.
    }

    /** The defaults registered for a type, or undefined. */
    getSegmentDefaults(type: string): AparteSegmentDefaults | undefined {
        return this._segmentDefaults.get(type);
    }

    /** Drop the defaults for a type. */
    clearSegmentDefaults(type: string): void {
        this._segmentDefaults.delete(type);
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
     * Register a AparteConversationManager so any UI controller can persist & load
     * conversations without coupling to a framework wrapper.
     */
    setConversationManager(manager: AparteConversationManager): void {
        this._conversationManager = manager;
    }

    /** Returns the registered AparteConversationManager, or undefined if none. */
    getConversationManager(): AparteConversationManager | undefined {
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
    setElicitationPresenter(presenter: AparteElicitationPresenter | null, owner?: HTMLElement): void {
        if (presenter === null) {
            // "Turn it off" — an app deliberately clearing, and what `reset()` means.
            this._elicitationPresenters = [];
            return;
        }
        // Re-registering moves an existing entry to the top rather than duplicating it,
        // so `aparteConfigChanged` firing twice cannot leave two copies behind.
        this._elicitationPresenters = this._elicitationPresenters.filter(e => e.fn !== presenter);
        this._elicitationPresenters.push(owner === undefined ? { fn: presenter } : { fn: presenter, owner });
    }

    /**
     * Withdraw ONE presenter, named, leaving any others registered.
     *
     * This is what an unmounting `<aparte-elicitation>` needs and what
     * `setElicitationPresenter(null)` could not express: clearing the slot took every
     * other mounted chat's presenter down with it. Removing a presenter that is not
     * registered is a no-op.
     */
    removeElicitationPresenter(presenter: AparteElicitationPresenter): void {
        this._elicitationPresenters = this._elicitationPresenters.filter(e => e.fn !== presenter);
    }

    /**
     * The presenter a request with no `target` would reach — the most recently
     * registered one. Kept for the callers that ask "is anybody able to present?".
     */
    getElicitationPresenter(): AparteElicitationPresenter | undefined {
        return this._elicitationPresenters[this._elicitationPresenters.length - 1]?.fn;
    }

    /**
     * The presenter that should handle THIS request.
     *
     * A `target` is an element inside the asking chat, so the presenter registered from
     * the same chat is the right one — found by comparing chat boundaries rather than by
     * `contains`, because the presenter is a sibling of the transcript, not an ancestor
     * of it. With no target, no match, or no boundary to compare, the top of the stack
     * is the answer, which is exactly the old single-slot behaviour.
     */
    private _presenterFor(target?: HTMLElement | null): AparteElicitationPresenter | undefined {
        const stack = this._elicitationPresenters;
        if (stack.length === 0) return undefined;
        if (target) {
            const wanted = chatBoundaryOf(target);
            if (wanted) {
                // Last registered wins among equals, matching the stack's own order.
                for (let i = stack.length - 1; i >= 0; i -= 1) {
                    const entry = stack[i] as { fn: AparteElicitationPresenter; owner?: HTMLElement };
                    if (entry.owner && chatBoundaryOf(entry.owner) === wanted) return entry.fn;
                }
            }
        }
        return stack[stack.length - 1]?.fn;
    }

    /**
     * Ask the user for typed input mid-run and await their response. This is the
     * generic primitive behind `ask_user` and tool approval — the KIND of
     * question is the schema, not a bespoke tool.
     *
     * **Resolves** `accept` with the value, or `decline` when the user declines.
     *
     * **Rejects** — it does not resolve — when the request ends without an answer, with
     * an {@link AparteElicitationAbortError} whose `name` is `'AbortError'` and whose
     * `reason` is `'aborted'` (the turn was stopped, the signal fired, or another request
     * took the question away) or `'no-presenter'` (nothing was mounted to ask it). So
     * `await` it inside a `try`, or attach a `.catch()`.
     *
     * That is a change, and this block described the old behaviour for a whole release:
     * "resolves `cancel` when the turn is cancelled", and "with NO presenter registered it
     * resolves `cancel` rather than hanging". Both were false the moment `cancel` was
     * removed — and the second is the one that bites, because a developer who reads
     * "rather than hanging" writes no `.catch()` and gets an unhandled rejection. It ships
     * in the `.d.ts` and in the custom-elements manifest, which is the API surface the
     * docs site renders, so it was the most-read wrong sentence in the library.
     *
     * A value was removed rather than renamed on purpose: `cancel` was easy to handle as
     * though it were an answer, and the approval gate did exactly that — it read a stopped
     * turn as the user refusing a tool they were never shown.
     *
     * With no presenter it rejects `'no-presenter'` and warns once, because a request
     * nobody could see is a setup mistake only the developer can fix. The default
     * presenter is `<aparte-elicitation>`, which registers itself from its
     * `connectedCallback` — so it has to be IN THE DOM. A docs page of ours claimed it
     * "installs itself — nothing to register", which is how that was found.
     */
    requestUserInput(request: AparteElicitationRequest): Promise<AparteElicitationResult> {
        const previous = this._elicitationQueue;
        /*
         * Nothing waiting → present in THIS tick.
         *
         * The panel is mounted synchronously today, and the unit tests and the browser
         * E2E both read it on the line after the call. A microtask hop for every
         * request would be an observable change bought for nothing, so the queue only
         * costs a hop when there is actually something ahead.
         */
        const settled = previous === null ? this._present(request) : previous.then(
            () => this._present(request),
            () => this._present(request),
        );
        const mine: Promise<void> = settled.then(NOOP, NOOP).then(() => {
            // Drained: back to "nothing waiting", so the next request is immediate
            // again. Guarded because a request enqueued behind this one owns the tail
            // now, and clearing it would drop that one on the floor.
            if (this._elicitationQueue === mine) this._elicitationQueue = null;
        });
        this._elicitationQueue = mine;
        return settled;
    }

    /** Hand ONE request to the presenter. Called only from the queue. */
    private _present(request: AparteElicitationRequest): Promise<AparteElicitationResult> {
        // Routed by the request's own `target`, so two chats on one page each answer
        // their own questions instead of the last-mounted one answering both.
        const presenter = this._presenterFor(request.target);
        if (!presenter) {
            if (!this._warnedNoPresenter) {
                this._warnedNoPresenter = true;
                console.warn(
                    '[aparte] requestUserInput() was called with no elicitation presenter, '
                    + 'so it rejected with an AbortError — nothing was ever shown to anybody. '
                    + 'Add <aparte-elicitation></aparte-elicitation> '
                    + 'inside your <aparte-chat> (the Angular wrapper\'s tag too) — or, under the '
                    + 'React/Vue/Svelte wrappers, inside their [data-aparte-chat] host (every wrapper '
                    + 'renders it by default, unless you passed `elicitation={false}`) — or register '
                    + 'your own by calling '
                    + 'setElicitationPresenter() on the config this chat resolves — '
                    + 'the scoped one if you passed a `config`, aparteGlobalConfig otherwise.',
                );
            }
            return Promise.reject(new AparteElicitationAbortError('no-presenter'));
        }
        /*
         * Re-checked HERE rather than on the way in: a request can sit in the queue
         * while the turn that raised it is stopped, and opening a panel for a run
         * that is already over would ask the user about nothing.
         */
        if (request.signal?.aborted) return Promise.reject(new AparteElicitationAbortError('aborted'));
        return presenter(request);
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
        this._statusRenderer = undefined;
        this._errorRenderer = undefined;
        this._attachmentRenderer = undefined;
        this._siblingNavRenderer = undefined;
        this._bubbleShellRenderer = undefined;
        this._iconProvider = undefined;
        // Registered defaults are config like any other. Leaving them behind made
        // a test leak its defaults into the next one, which is the same thing a
        // consumer's `reset()` would do to a second chat.
        this._segmentDefaults.clear();
        this._avatarProvider = undefined;
        this._artifactPreviewBuilder = undefined;
        this._keyProvider = undefined;
        this._conversationManager = undefined;
        this._elicitationPresenters = [];
        // The queue too: a request left waiting across a reset belongs to a chat that
        // no longer exists, and holding the tail would make the next request wait on it.
        this._elicitationQueue = null;
        this._locale = APARTE_DEFAULT_LOCALE;
        this._actions = [];
        this._sanitizer = defaultSanitizer;
        // Registries — the leak the audit flagged.
        this._aiProviders.clear();
        this._fetchedModels.clear();
        this._tools.clear();
        this._toolRenderers.clear();
        this._modelConfig = {};
        this._requireModelSelection = false;
        this._elicitationAllowOther = true;
        this._elicitationLayout = 'stepped';
        this._elicitationAnswerOnClick = true;
        this._elicitationFieldRenderer = undefined;
        this._modelPreferenceProvider = undefined;
        this._approvalPolicy = null;
        this._bubbleActionsConfig = { ...APARTE_DEFAULT_BUBBLE_ACTIONS };
        this._hostHandlers = { ...APARTE_DEFAULT_HOST_HANDLERS };
        this._notify();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Default Fallbacks (Zero-dependency)
    // ─────────────────────────────────────────────────────────────────────────

    private _defaultMarkdownRenderer(raw: string): string {
        // Simple security: Escape HTML tags
        const escaped = escapeHtml(raw);
        // Convert newlines to breaks
        return escaped.replace(/\n/g, '<br>');
    }

    private _defaultHighlightRenderer(code: string): string {
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
    }

}

// ─────────────────────────────────────────────────────────────────────────────
// Export Singleton
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The page-global singleton's key.
 *
 * A `Symbol.for`, and versioned — matching the discipline the instance boundary
 * next door already uses (`Symbol.for('aparte.instanceConfig')`). It used to be the
 * enumerable string `'__APARTE_CONFIG_SINGLETON__'` with no version segment, so any
 * two copies of `@aparte/core` on one page — the ordinary outcome of a `~` peer next
 * to an app-level dependency, or two consumers on different wrapper versions — got
 * the instance built by whichever module evaluated first, while their `AparteConfig`
 * classes, their `Symbol.for('aparte.instanceConfig')` reads and their WeakMap
 * renderer registries stayed distinct. One object, seen through two classes across
 * which `instanceof` is false.
 *
 * The trailing number is a CONTRACT version, not the package version: bump it when
 * the config's shape changes in a way that makes sharing unsafe. Two copies then
 * simply get one global each, which is correct — a copy is consistent with itself.
 */
const GLOBAL_CONFIG_KEY = Symbol.for('aparte.globalConfig.1');

function getGlobalConfig(): AparteConfig {
    if (typeof window !== 'undefined') {
        if (!(window as unknown as Record<symbol, AparteConfig>)[GLOBAL_CONFIG_KEY]) {
            (window as unknown as Record<symbol, AparteConfig>)[GLOBAL_CONFIG_KEY] = new AparteConfig();
        }
        return (window as unknown as Record<symbol, AparteConfig>)[GLOBAL_CONFIG_KEY]!;
    }
    // Fallback for non-browser environments (e.g., SSR, tests)
    return new AparteConfig();
}

/**
 * Global configuration singleton for Aparte.
 * Use this to register providers and configure behavior.
 */
export const aparteGlobalConfig = getGlobalConfig();

// Inject default styles for skeletons if needed (optional)
// Note: In a real app we might want to use a stylesheet or shadow DOM styles

/**
 * Detail payload for `aparte-config-change`, dispatched on `window` whenever any
 * provider, locale, action or model setting changes.
 *
 * Five core components listen for it — the widest listener footprint of any event
 * that had no declared type. `config` is what makes per-instance config work: a
 * component resolving to a different instance compares it and skips the rebuild
 * instead of every chat on the page reacting to every config's change.
 *
 * @event aparte-config-change
 */
export interface AparteConfigChangeEventDetail {
    /** The config instance that changed — compare against your own before reacting. */
    config: AparteConfig;
    /** Its model configuration, after the change. */
    modelConfig: AparteModelConfig;
}
