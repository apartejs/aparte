import { aparteGlobalConfig, AparteConfig } from '../config/aparte-config.js';
import { AparteStreamParser, deriveArtifactKind } from '../parsers/aparte-stream-parser.js';

const XML_OPEN_TAG = '<artifact';

/**
 * Length of the longest suffix of text that is a PROPER prefix of the artifact
 * open tag (0 when there is none). The angle bracket and the tag name are
 * separate tokens in most vocabularies, so a delta ending mid-tag is routine;
 * without this the fragment is emitted as chat text and the artifact loses its
 * whole lifecycle.
 *
 * Mirrors partialOpenTagLength in the engine artifact-xml state machine.
 */
function partialXmlOpenTagLength(text: string): number {
    const max = Math.min(text.length, XML_OPEN_TAG.length - 1);
    for (let k = max; k > 0; k--) {
        if (text.endsWith(XML_OPEN_TAG.slice(0, k))) return k;
    }
    return 0;
}
import { registerDefaultRenderers, declineDefaultRenderers } from '../renderers/segment-renderers.js';
import { createStreamAdapter, readableToAsyncIterable } from './stream-adapter.js';
import { dispatchLifecycleEvent, dispatchArtifactLifecycle } from './lifecycle-events.js';
import type { AparteStreamRunner, StreamAdapterTarget } from './stream-adapter.js';
import type { AparteSegment, AparteStreamEvent, AparteMessage, AparteErrorSegment } from '../types/index.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import type { AparteThinkingSegment } from '../types/segments.js';
import type { AparteToolCallSegment } from '../types/segments.js';
import type { AparteToolCall, AparteTool } from '../types/tools.js';
import { AparteChatRequest, AparteChatMessage, AparteContentPart, AparteUsage, AparteRequestMeta, AparteArtifactHint, contentToText } from '../types/chat.js';
import { AparteError, AparteErrorCode } from '../types/errors.js';
import { uuid } from '../utils/uuid.js';

/**
 * The imperative surface AparteClient drives on a chat target element
 * (`<aparte-chat-viewport>` directly, or a framework host via AparteChatHost).
 * Every method is optional so a partial/mock target degrades gracefully — the
 * client always calls them through optional chaining. Mirrors the shape the
 * wrappers and `AparteChatHost` already conform to.
 */
/** Mutable state for streaming a Claude-style `<artifact>` XML block out of the
 *  text stream — owned by _streamLoop, fed to _feedXmlArtifactDelta per delta. */
interface XmlArtifactStreamState {
    state: 'normal' | 'scanning' | 'in-artifact';
    scanBuf: string;
    closeBuf: string;
    segId: string | null;
    content: string;
    mime: string;
    kind: string;
    title: string;
}

interface AparteChatTargetElement extends HTMLElement {
    appendMessage?(message: AparteMessage): void;
    updateMessage?(id: string, updates: Partial<AparteMessage>): void;
    updateLastMessage?(content: string, options?: { append?: boolean }): void;
    addSegment?(segment: AparteSegment): void;
    updateSegment?(segmentId: string, updates: Partial<AparteSegment>): void;
    removeSegment?(segmentId: string): void;
    getMessages?(): AparteMessage[];
    addSiblingOf?(existingId: string, newMessage: AparteMessage): string | null;
    truncateFrom?(id: string): void;
    truncateResponsesAfter?(userMessageId: string): void;
    typeName?(text: string): void;
}

/**
 * Default timeout (ms) for a tool handler to resolve before it is aborted.
 *
 * Same value `runStreamAgent` uses, and now overridable by the same option name
 * (`toolTimeoutMs`). It used to be reachable only as this constant here while the
 * engine runner exposed it — so a consumer who set `toolTimeoutMs` got it honoured
 * on one of the two loops and silently ignored on the other. Found by writing the
 * tool-timeout parity scenario the seam never had.
 */
const DEFAULT_TOOL_HANDLER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolves a human-in-the-loop tool approval for a `needsApproval` tool call.
 * Resolves `{ approved, payload? }`; the `signal` aborts a pending decision.
 */
export type AparteToolApprovalResolver = (
    toolCallId: string,
    signal: AbortSignal,
) => Promise<{ approved: boolean; payload?: unknown }>;

/**
 * Decides how a conversation is compacted: which messages are summarized away
 * (`drop`) and which are preserved verbatim (`keep`). Pure — no LLM call.
 *
 * The default selector drops the whole history (summarize everything, replace
 * all), which is the built-in behaviour. Inject a budget-aware selector (e.g.
 * wrapping `@aparte/engine`'s `compactConversation`) so the compaction badge and
 * the `compact()` action share one selection and only the old turns are sent to
 * the summarizer — the budget is closed over by the consumer, not core's to know.
 */
export type AparteCompactionSelector = (
    messages: AparteMessage[],
) => { keep: AparteMessage[]; drop: AparteMessage[] };

/**
 * Configuration options for AparteClient
 */
export interface AparteClientOptions {
    /**
     * Function to resolve API keys for a given provider.
     * Can return a string (key) or a full configuration object.
     */
    keyResolver?: (providerId: string) => string | Record<string, string> | Promise<string | Record<string, string> | undefined | null> | undefined | null;

    /**
     * Custom human-in-the-loop approval resolver for tools marked
     * `needsApproval`. Defaults to a global `document` `aparte-tool-decision`
     * listener (the built-in Approve/Reject gate). Inject this to run multiple
     * isolated clients on one page, or to drive approval from a headless source
     * (CLI / webhook) with no DOM.
     */
    approvalResolver?: AparteToolApprovalResolver;

    /**
     * Custom compaction selection strategy. Defaults to dropping the entire
     * history (summarize all, replace all — the built-in behaviour). Inject a
     * budget-aware selector so only old turns are summarized and recent ones are
     * kept verbatim. See {@link AparteCompactionSelector}.
     */
    compactionSelector?: AparteCompactionSelector;

    /**
     * Optional headless stream-loop runner. When set, `_streamLoop` delegates the
     * agentic loop to it and renders via the core adapter
     * ({@link createStreamAdapter}); when absent, the built-in inline loop runs.
     * Inject `@aparte/engine`'s `runStreamAgent` here so a backend/cloud path
     * shares one tested loop — core stays the zero-dep leaf and never imports
     * engine. Same injection pattern as {@link approvalResolver} /
     * {@link compactionSelector}. See {@link AparteStreamRunner}.
     */
    streamRunner?: AparteStreamRunner;

    /**
     * Optional request interceptor to modify the chat request before sending.
     */
    requestInterceptor?: (request: AparteChatRequest) => AparteChatRequest | Promise<AparteChatRequest>;

    /**
     * Whether to register core's default segment renderers.
     *
     * Rarely needed either way: the built-ins install themselves the first time a
     * segment needs one, so leaving this alone just works. Set it to `false` to
     * keep them out entirely — a decision that is remembered, so nothing installs
     * them later; register your own with `registerSegmentRenderer`. Do it at
     * startup, before the first segment renders.
     * @default true
     */
    autoRegister?: boolean;

    /**
     * Conversation history strategy:
     * - 'viewport' (default) — collects completed messages from the viewport
     * - 'none'               — sends only the current message (original behavior)
     * - function             — custom: receives viewport messages, returns AparteChatMessage[]
     */
    history?: 'viewport' | 'none' | ((viewportMessages: AparteMessage[]) => AparteChatMessage[]);

    /**
     * Optional resolver that returns the host element exposing `appendMessage`.
     * Use this when the default event-bubble walk cannot reach the host
     * (e.g. Angular re-renders detach the input element mid-flight).
     *
     * @example
     * targetResolver: () => document.querySelector('aparte-chat')
     */
    targetResolver?: () => HTMLElement | null;

    /**
     * Scope this client to a specific target element id.
     * When set, the client will only handle `aparte-send`, `aparte-retry`, `aparte-edit`
     * and `aparte-abort` events whose `detail.targetId` matches this id.
     * This allows multiple AparteClient instances (one per conversation) to coexist
     * on the same page without interfering with each other.
     *
     * @example
     * // Two independent conversations:
     * new AparteClient({ scopeToTargetId: 'chat-left' }).start();
     * new AparteClient({ scopeToTargetId: 'chat-right' }).start();
     */
    scopeToTargetId?: string;

    /**
     * Maximum number of agentic tool-call loop turns before the loop is forcibly
     * stopped and an error segment is shown. Prevents infinite loops.
     * Individual tools can override this via `AparteTool.maxTurns`.
     * @default 10
     */
    maxTurns?: number;
    /**
     * Per-call ceiling (ms) for a tool handler to resolve before its signal is
     * aborted. Defaults to 5 minutes — the same default, and the same option name,
     * as `runStreamAgent`, so the value means one thing whichever loop runs.
     */
    toolTimeoutMs?: number;

    /**
     * Controls which files attached by the user are injected as raw content
     * parts in the LLM request.
     *
     * - `'all'` (default) — images as base64, text files as code-fenced text
     * - `'images-only'`   — only images are injected; text/binary documents
     *   are left for the application layer (e.g. a RAG pipeline) to handle
     * - `'none'`          — no files are injected as content parts; ALL file
     *   types (including images) are routed to the application layer. Used
     *   when images go through a captioning pipeline before RAG ingest, so
     *   the chat context only ever sees retrieved text — never raw image
     *   bytes. Saves bytes on every turn and matches the offline-first
     *   intent (read file once at upload, retrieve text-only forever after).
     *
     * Set `'images-only'` when a `requestInterceptor` retrieves relevant
     * document chunks and injects them as a system message instead, to avoid
     * flooding the context window with full file contents.
     */
    rawFileInject?: 'all' | 'images-only' | 'none';

    /**
     * Per-file veto on top of {@link rawFileInject}: called for each file the
     * mode would inject; return `false` to keep that file out of the request.
     * The file still rides on the `aparte-send` event for the application
     * layer (upload, RAG). Use it to block sensitive names while keeping the
     * default inline UX:
     *
     * ```ts
     * fileInjectFilter: (f) => !/(^|\.)env$|\.(pem|key)$/i.test(f.name)
     * ```
     */
    fileInjectFilter?: (file: File) => boolean;

    /**
     * Config this client reads (providers, model selection, tools, system
     * prompt). Defaults to `aparteGlobalConfig`. Pass a host's
     * instance config when scoping a client to one chat among several
     * (pairs with `scopeToTargetId`).
     */
    config?: AparteConfig;
}

/**
 * AparteClient
 *
 * The "Automatic Transmission" for Aparte.
 * Connects the UI events (aparte-send) to the AI Providers (chat).
 * Handles:
 * - Listening to send events
 * - Resolving API keys
 * - Calling the appropriate Provider
 * - Streaming the response back to the UI
 * - Tool use: awaiting handlers and re-calling the provider
 *
 * @example
 * ```typescript
 * const client = new AparteClient({
 *   keyResolver: (providerId) => process.env[providerId.toUpperCase() + '_KEY']
 * });
 * client.start();
 * ```
 */
export class AparteClient {
    private _boundHandler: ((e: Event) => void) | null = null;
    private _boundAbortHandler: (() => void) | null = null;
    private _boundCompactHandler: ((e: Event) => void) | null = null;
    private _boundRetryHandler: ((e: Event) => void) | null = null;
    private _boundEditHandler: ((e: Event) => void) | null = null;
    private _activeToolControllers: Set<AbortController> = new Set();
    private _isAborted = false;

    /**
     * Does this window event belong to this client?
     *
     * One rule for all five handlers, because it used to be four near-copies and
     * one omission: `aparte-compact` had no guard at all, so in the two-client
     * layout the JSDoc documents, a single compact event made BOTH clients run —
     * two paid summarisation calls against whichever chat the DOM scan found
     * first, and a global reset that wiped the other conversation.
     *
     * A scoped client also answers only events ADDRESSED to it. The old guard let
     * an untargeted event through to every scoped client, which turned one
     * broadcast into an action on every chat on the page.
     */
    private _isForThisInstance(e?: Event): boolean {
        const scope = this.options.scopeToTargetId;
        if (!scope) return true;
        // No event at all means a direct, programmatic call — not a broadcast, so
        // the addressing rule does not apply to it.
        if (!e) return true;
        const detail = (e as CustomEvent).detail as { targetId?: string } | undefined;
        return detail?.targetId === scope;
    }
    /** Aborts the in-flight vendor/transport fetch when the user stops a stream. */
    private _streamController: AbortController | null = null;

    private options: AparteClientOptions;
    /** Config read by this client — an instance config, or the global default. */
    private readonly _config: AparteConfig;

    constructor(options: AparteClientOptions = {}) {
        this.options = {
            autoRegister: true,
            ...options
        };
        this._config = options.config ?? aparteGlobalConfig;

        // Both take THIS client's config, not the global one. Segment renderers are
        // registered per config as of 0.8.0, so a client constructed with
        // `{ config }` must register — or decline — on that instance; otherwise
        // `autoRegister: false` on a scoped client silently muted the global chat
        // instead of its own.
        if (this.options.autoRegister) {
            registerDefaultRenderers(this._config);
        } else {
            // Explicit: keep core's built-ins out, including the lazy install the
            // bubble would otherwise do on first render.
            declineDefaultRenderers(this._config);
        }

        this._setupListeners();
    }

    /**
     * Sets up the event listeners.
     * This is called once in the constructor.
     */
    private _setupListeners(): void {
        if (this._boundHandler) return; // Already set up

        this._boundHandler = (e: Event) => {
            const event = e as CustomEvent;
            if (event.type !== 'aparte-send') return;
            // Scope guard: ignore events not for this instance
            if (!this._isForThisInstance(event)) return;
            // Reset abort flag and cancel any tool calls from a previous turn
            this._isAborted = false;
            for (const controller of this._activeToolControllers) {
                controller.abort();
            }
            this._activeToolControllers.clear();

            void this._handleSend(event);
        };
    }

    /**
     * Start listening for aparte-send events on the window.
     */
    start(): void {
        if (!this._boundHandler) {
            this._setupListeners();
        }
        if (this._boundHandler) {
            window.addEventListener('aparte-send', this._boundHandler);
        }
        if (!this._boundAbortHandler) {
            this._boundAbortHandler = (e?: Event) => {
                // Scope guard
                if (!this._isForThisInstance(e)) return;
                this.abort();
            };
        }
        window.addEventListener('aparte-abort', this._boundAbortHandler);
        if (!this._boundCompactHandler) {
            this._boundCompactHandler = (e: Event) => {
                if (!this._isForThisInstance(e)) return;
                const detail = (e as CustomEvent).detail as { targetId?: string } | undefined;
                void this.compact(detail?.targetId);
            };
        }
        window.addEventListener('aparte-compact', this._boundCompactHandler);

        if (!this._boundRetryHandler) {
            this._boundRetryHandler = (e: Event) => {
                const evt = e as CustomEvent;
                if (!this._isForThisInstance(evt)) return;
                void this._handleRetry(evt);
            };
        }
        window.addEventListener('aparte-retry', this._boundRetryHandler);

        if (!this._boundEditHandler) {
            this._boundEditHandler = (e: Event) => {
                const evt = e as CustomEvent;
                if (!this._isForThisInstance(evt)) return;
                void this._handleEdit(evt);
            };
        }
        window.addEventListener('aparte-edit', this._boundEditHandler);
    }

    /**
     * Stop listening.
     */
    stop(): void {
        // Abort what is in flight, not just the listeners.
        //
        // `stop()` used to remove event handlers and nothing else, so a wrapper
        // unmounting mid-stream — both `useAparteClient` and the Svelte store call
        // this on teardown — left the vendor request running: the user navigates
        // away and the tokens keep being generated and billed, with nothing left on
        // the page to render them.
        //
        // Before the early return: a client that was never `start()`ed can still
        // have a stream, because `_handleSend` can be invoked directly.
        this.abort();
        if (!this._boundHandler) return;
        window.removeEventListener('aparte-send', this._boundHandler);
        this._boundHandler = null;
        if (this._boundAbortHandler) {
            window.removeEventListener('aparte-abort', this._boundAbortHandler);
            this._boundAbortHandler = null;
        }
        if (this._boundCompactHandler) {
            window.removeEventListener('aparte-compact', this._boundCompactHandler);
            this._boundCompactHandler = null;
        }
        if (this._boundRetryHandler) {
            window.removeEventListener('aparte-retry', this._boundRetryHandler);
            this._boundRetryHandler = null;
        }
        if (this._boundEditHandler) {
            window.removeEventListener('aparte-edit', this._boundEditHandler);
            this._boundEditHandler = null;
        }
    }

    /**
     * Abort the current streaming response and all active tool calls.
     * Dispatches `aparte-message-aborted` on the target element.
     */
    abort(): void {
        this._isAborted = true;
        this._streamController?.abort();
        for (const controller of this._activeToolControllers) {
            controller.abort();
        }
        this._activeToolControllers.clear();
    }

    /**
     * Human-in-the-loop: wait for an `aparte-tool-decision` event matching this
     * tool call (dispatched by the built-in Approve/Reject UI or an app-level
     * approval surface). Resolves `{ approved, payload }` — `approved` is `true`
     * only on an explicit approve, and `payload` carries any arbitrary data a
     * custom approval UI attached to the decision (the built-in gate sends
     * none). The `signal` (an AbortController registered in
     * `_activeToolControllers`) lets `abort()` cleanly resolve a pending
     * approval to `{ approved: false }` — there is no timeout, since a human may
     * take any amount of time to decide.
     */
    private _awaitToolDecision(toolCallId: string, signal: AbortSignal): Promise<{ approved: boolean; payload?: unknown }> {
        return new Promise<{ approved: boolean; payload?: unknown }>((resolve) => {
            if (signal.aborted) { resolve({ approved: false }); return; }
            const cleanup = () => {
                document.removeEventListener('aparte-tool-decision', onDecision as EventListener);
                signal.removeEventListener('abort', onAbort);
            };
            const onDecision = (e: Event) => {
                const detail = (e as CustomEvent).detail as { toolCallId?: string; approved?: boolean; payload?: unknown } | undefined;
                if (detail?.toolCallId !== toolCallId) return;
                cleanup();
                resolve({ approved: detail?.approved === true, payload: detail?.payload });
            };
            const onAbort = () => { cleanup(); resolve({ approved: false }); };
            document.addEventListener('aparte-tool-decision', onDecision as EventListener);
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }

    /**
     * Resolve the auth for a provider: `options.keyResolver` takes precedence,
     * then the aparteGlobalConfig key channel (`setKeyProvider`) so a key registered
     * there reaches the request. One key source on the happy path.
     */
    private async _resolveAuth(providerId: string): Promise<string | Record<string, string> | undefined> {
        if (this.options.keyResolver) {
            const resolved = await this.options.keyResolver(providerId);
            if (resolved) return resolved;
        }
        const key = await this._config.getKey(providerId);
        return key || undefined;
    }

    /**
     * The shared tail of send / retry / edit: attach the current tools, run the
     * request interceptor, honour `toolChoice: 'none'`, reset the abort flag,
     * dispatch `aparte-message-start`, run the agentic `_streamLoop`, then dispatch
     * `aparte-message-done` or route the error to the lifecycle handler.
     *
     * Callers own only their turn-specific prep (target resolution, history
     * building, appending the assistant placeholder) and hand the fully-built
     * `messages` here — one place for the provider→interceptor→toolChoice→stream
     * sequence, so it can't drift between the three entry points.
     */
    private async _streamTurn(
        targetElement: AparteChatTargetElement,
        messageId: string,
        provider: AparteAIProvider,
        messages: AparteChatMessage[],
        modelId: string,
        authConfig: string | Record<string, string> | undefined,
        opts?: { temperature?: number },
    ): Promise<void> {
        const registeredTools = this._toolsForCurrentModel();
        let baseRequest: AparteChatRequest = {
            messages,
            modelId,
            stream: true,
            tools: registeredTools.length ? registeredTools : undefined,
            ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
        };
        if (this.options.requestInterceptor) {
            baseRequest = await this.options.requestInterceptor(baseRequest);
        }
        // toolChoice: 'none' — strip tools so the model never sees them.
        if (baseRequest.toolChoice === 'none') {
            baseRequest = { ...baseRequest, tools: undefined };
        }

        // Stopped while we were resolving auth or reading attachments: the stream
        // controller did not exist yet, so `abort()` had nothing to cancel — the
        // flag is the only trace, and it must not be thrown away here.
        if (this._isAborted) {
            dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId });
            return;
        }
        dispatchLifecycleEvent(targetElement, 'aparte-message-start', { messageId, role: 'assistant' });
        try {
            const usage = await this._streamLoop(targetElement, messageId, provider, baseRequest, authConfig);
            if (this._isAborted) {
                // A stopped turn is FINISHED, and someone has to say so. The inline
                // loop marks the message completed on its way out; the injected
                // runner returns through `run-aborted` and never emits `run-done`,
                // so nothing did — and the bubble stayed flagged as streaming
                // forever. Caught by the browser suite, which is the only place a
                // stuck flag is visible.
                //
                // Not `done`, though: announcing a normal completion on top of an
                // abort is what a provider that ends quietly used to produce.
                this._updateMessage(targetElement, messageId, { status: 'completed' });
            } else {
                dispatchLifecycleEvent(targetElement, 'aparte-message-done', { messageId, role: 'assistant', usage });
            }
        } catch (error: unknown) {
            // A THIRD abort path, and the one the browser suite caught after the
            // other two were closed: when the user stops before any event has
            // arrived, the fetch rejection escapes `transportCall` as an exception.
            // It never reaches the event stream, so neither the guard around
            // `reader.read()` nor the one on the `error` event can see it — and
            // `_handleLifecycleError` would REPLACE the message with an error
            // segment, turning a deliberate stop into a rendered failure.
            if (this._isAborted) {
                dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId });
                this._updateMessage(targetElement, messageId, { status: 'completed' });
                return;
            }
            const aparteError = AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR);
            this._handleLifecycleError(targetElement, messageId, aparteError);
        }
    }

    /**
     * Compact the current conversation: summarize all messages via the AI,
     * clear the viewport, then inject the summary as a single context message.
     *
     * Triggered programmatically or by dispatching `window.dispatchEvent(new CustomEvent('aparte-compact'))`.
     * Dispatches `aparte-compact-done` on window when complete, or `aparte-compact-error` on failure.
     */
    async compact(targetId?: string): Promise<void> {
        // 1. Resolve target element — through the same resolver every other
        // handler uses, so an explicit id wins over a document-wide scan. The
        // scan alone meant a scoped client summarised whichever chat happened to
        // come first in the DOM, not its own.
        let target = this._resolveTarget<AparteChatTargetElement>(targetId);
        if (target && typeof target.getMessages !== 'function') target = null;
        if (!target) {
            window.dispatchEvent(new CustomEvent('aparte-compact-error', { detail: { error: 'No aparte-chat target found' } }));
            return;
        }

        const messages: AparteMessage[] = target.getMessages?.() ?? [];
        if (messages.length === 0) {
            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { skipped: true } }));
            return;
        }

        // Decide what to summarize (`drop`) vs preserve verbatim (`keep`).
        // Default: drop everything (summarize all, replace all — legacy behaviour).
        const selector = this.options.compactionSelector
            ?? ((m: AparteMessage[]) => ({ keep: [] as AparteMessage[], drop: m }));
        const { keep, drop } = selector(messages);
        if (drop.length === 0) {
            // Nothing old enough to summarize (e.g. already within budget).
            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { skipped: true } }));
            return;
        }

        // 2. Resolve provider + model
        const config = this._config.getModelConfig();
        const providerId = config.defaultProvider;
        if (!providerId) {
            window.dispatchEvent(new CustomEvent('aparte-compact-error', { detail: { error: 'No provider configured' } }));
            return;
        }
        const provider = this._config.getAIProvider(providerId);
        if (!provider) {
            window.dispatchEvent(new CustomEvent('aparte-compact-error', { detail: { error: `Provider '${providerId}' not found` } }));
            return;
        }

        // 3. Dispatch start so host can show loading state
        window.dispatchEvent(new CustomEvent('aparte-compact-start'));

        try {
            // 4. Resolve auth
            const authConfig = await this._resolveAuth(providerId);

            // 5. Build summarize request — only over the dropped (old) turns
            const historyMessages: AparteChatMessage[] = drop
                .filter(m => m.role === 'user' || (m.role === 'assistant' && m.status === 'completed'))
                .map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: this._extractText(m)
                }))
                .filter(m => contentToText(m.content).length > 0);

            const summarizeRequest: AparteChatRequest = {
                messages: [
                    {
                        role: 'system',
                        content:
                            'You are a conversation summarizer. ' +
                            'Create a concise but complete summary of the conversation below. ' +
                            'Capture: key topics, conclusions, decisions, ongoing tasks, and any context needed to continue the conversation. ' +
                            'Write in third person. Be factual and brief. No preamble, just the summary.'
                    },
                    ...historyMessages,
                    {
                        role: 'user',
                        content: 'Please summarize this conversation.'
                    }
                ],
                modelId: config.defaultModel || '',
                stream: false
            };

            // 6. Call provider (non-streaming), WITH a signal.
            //
            // This call had none, so `abort()` could not stop it: a summarisation the
            // user cancelled kept running and kept being billed, and its result
            // arrived to overwrite a conversation the user had moved on from. It goes
            // through the same controller slot as a turn so `abort()` and `stop()`
            // reach it.
            const compactController = new AbortController();
            this._streamController = compactController;
            const response = await this._config.getTransport().chat(
                provider, summarizeRequest, authConfig,
                { providerId: provider.id, signal: compactController.signal },
            );
            let summary: string;
            if (typeof response === 'string') {
                summary = response;
            } else {
                // Collect stream fallback
                const reader = (response as ReadableStream<AparteStreamEvent>).getReader();
                const chunks: string[] = [];
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value.type === 'text') chunks.push(value.delta);
                }
                reader.releaseLock();
                summary = chunks.join('');
            }

            if (!summary.trim()) {
                throw new Error('Empty summary returned by model');
            }

            // 7. Clear THIS viewport and inject the summary. The global
            // `aparte-reset` used to go out instead, and every mounted viewport
            // listens for it — so compacting one chat cleared the others too,
            // with no summary injected into them. The broadcast remains only as
            // the fallback for a host whose target exposes no clearAll.
            const clearAll = (target as { clearAll?: () => void }).clearAll;
            if (typeof clearAll === 'function') clearAll.call(target);
            else window.dispatchEvent(new CustomEvent('aparte-reset'));

            // Small delay to let clearAll() finish DOM cleanup
            await new Promise<void>(resolve => setTimeout(resolve, 50));

            target.appendMessage?.({
                id: uuid(),
                role: 'assistant',
                content: `📝 **Conversation summary**\n\n${summary}`,
                timestamp: Date.now(),
                status: 'completed'
            });

            // 7b. Re-append the preserved recent turns verbatim after the summary.
            // (No-op with the default selector, which keeps nothing.)
            for (const kept of keep) {
                target.appendMessage?.(kept);
            }

            // 8. Done
            window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { summary, kept: keep.length } }));

        } catch (err: unknown) {
            console.error('[AparteClient] compact() failed:', err);
            const message = err instanceof Error ? err.message : String(err);
            window.dispatchEvent(new CustomEvent('aparte-compact-error', { detail: { error: message } }));
        }
    }

    /**
     * Handle aparte-retry — add a sibling branch to the assistant message and re-stream
     * using the same conversation history minus the retried reply.
     */
    /**
     * Registered tools, gated by capability: only returned when the current model
     * declares `function_calling` support (else `[]`). Single source for the gate so
     * send / retry / edit can't drift — the drift is exactly what shipped `tools` on
     * the initial send while retry/edit correctly omitted them.
     */
    private _toolsForCurrentModel(): AparteTool[] {
        const supportsFunctionCalling =
            this._config.getCurrentModel()?.capabilities?.includes('function_calling') ?? false;
        return supportsFunctionCalling ? this._config.getTools() : [];
    }

    private async _handleRetry(event: CustomEvent): Promise<void> {
        const { messageId, targetId } = event.detail ?? {};
        // A fresh user action clears a previous turn's abort, the same way the
        // `aparte-send` handler does. It has to happen HERE, at the start of the
        // action, rather than inside `_streamTurn` — which runs after the auth and
        // file-reading awaits, so a reset there erased an abort that arrived while
        // the user was still waiting for a large attachment to be read.
        this._isAborted = false;

        if (!messageId) return;

        const targetElement = this._resolveTarget<AparteChatTargetElement>(targetId);
        if (!targetElement) {
            console.warn('[AparteClient] aparte-retry — no target found');
            return;
        }

        // Build history BEFORE calling addSiblingOf (getMessages() returns active path)
        const allMessages: AparteMessage[] = targetElement.getMessages?.() ?? [];
        const retryIdx = allMessages.findIndex(m => m.id === messageId);
        const retryMsg = retryIdx >= 0 ? allMessages[retryIdx] : undefined;
        // For user messages: include the user message in history (AI needs to see the question).
        // For assistant messages: exclude it (we are regenerating that response).
        const sliceEnd = retryMsg?.role === 'user' ? retryIdx + 1 : retryIdx;
        // `>= 0`, not `> 0`: index 0 is a legitimate retry target (a thread seeded
        // with an assistant greeting), and treating it as "not found" discarded the
        // computed slice and resent the ENTIRE transcript — including the reply
        // being regenerated, so the retry produced a continuation, not a redo.
        const historyMessages = retryIdx >= 0 ? allMessages.slice(0, sliceEnd) : allMessages;

        // Create new sibling message and get its ID for streaming
        const newMsg: AparteMessage = {
            id: uuid(),
            role: 'assistant',
            content: '',
            status: 'pending',
            timestamp: Date.now(),
        };
        const newMessageId = targetElement.addSiblingOf?.(messageId, newMsg) ?? newMsg.id;

        const config = this._config.getModelConfig();
        const providerId = config.defaultProvider;
        if (!providerId) return;
        const provider = this._config.getAIProvider(providerId);
        if (!provider) return;

        const authConfig = await this._resolveAuth(providerId);

        const chatMessages = this._messagesToChatMessages(historyMessages);

        // Add system prompts
        const systemMessages: import('../types/chat.js').AparteChatMessage[] = [];
        const userSystemPrompt = this._config.resolveSystemPrompt();
        if (userSystemPrompt) systemMessages.push({ role: 'system', content: userSystemPrompt });

        // Retry must produce a DIFFERENT answer than the greedy (byte-identical)
        // re-run: temperature > 0 opts into sampling (the worker turns on
        // do_sample); variation comes from the in-decoder RNG, no seed needed.
        await this._streamTurn(
            targetElement, newMessageId, provider,
            [...systemMessages, ...chatMessages], config.defaultModel || '',
            authConfig, { temperature: 0.4 },
        );
    }

    /**
     * Handle aparte-edit — update the user message in place, truncate all subsequent
     * messages, then re-stream a fresh assistant response.
     */
    private async _handleEdit(event: CustomEvent): Promise<void> {
        const { messageId, content: newContent, targetId } = event.detail ?? {};
        // A fresh user action clears a previous turn's abort, the same way the
        // `aparte-send` handler does. It has to happen HERE, at the start of the
        // action, rather than inside `_streamTurn` — which runs after the auth and
        // file-reading awaits, so a reset there erased an abort that arrived while
        // the user was still waiting for a large attachment to be read.
        this._isAborted = false;

        if (!messageId || newContent === undefined) return;

        const targetElement = this._resolveTarget<AparteChatTargetElement>(targetId);
        if (!targetElement) {
            console.warn('[AparteClient] aparte-edit — no target found');
            return;
        }

        // 1. Update the user message content
        targetElement.updateMessage?.(messageId, { content: newContent });

        // 2. Collect all messages, find index of edited message
        const allMessages: AparteMessage[] = targetElement.getMessages?.() ?? [];
        const editIdx = allMessages.findIndex(m => m.id === messageId);

        // 3. Remove ALL previous responses to the edited user message.
        //    truncateResponsesAfter clears every sibling branch so the new
        //    response starts as the only child (sibling count = 1).
        //    Fall back to truncateFrom on the active next message for older hosts.
        if (targetElement.truncateResponsesAfter) {
            targetElement.truncateResponsesAfter(messageId);
        } else {
            const nextAssistantId = editIdx >= 0 && editIdx + 1 < allMessages.length
                ? allMessages[editIdx + 1]?.id
                : undefined;
            if (nextAssistantId) {
                targetElement.truncateFrom?.(nextAssistantId);
            }
        }

        // 4. Build new history up to and including the edited user message
        const historyMessages = editIdx >= 0 ? allMessages.slice(0, editIdx + 1) : allMessages;
        const chatMessages = this._messagesToChatMessages(historyMessages);

        const systemMessages: import('../types/chat.js').AparteChatMessage[] = [];
        const userSystemPrompt = this._config.resolveSystemPrompt();
        if (userSystemPrompt) systemMessages.push({ role: 'system', content: userSystemPrompt });

        const config = this._config.getModelConfig();
        const providerId = config.defaultProvider;
        if (!providerId) return;
        const provider = this._config.getAIProvider(providerId);
        if (!provider) return;

        const authConfig = await this._resolveAuth(providerId);

        const newMessageId = uuid();
        targetElement.appendMessage?.({
            id: newMessageId,
            role: 'assistant',
            content: '',
            status: 'pending',
            timestamp: Date.now()
        });

        await this._streamTurn(
            targetElement, newMessageId, provider,
            [...systemMessages, ...chatMessages], config.defaultModel || '',
            authConfig,
        );
    }

    /**
     * Resolve a target element by id (from event detail.targetId) or via targetResolver / DOM scan.
     */
    private _resolveTarget<T extends HTMLElement>(targetId?: string): T | null {
        // An explicit id / resolver is TRUSTED as given (it may gain its render
        // methods later); only the implicit DOM scan must prefer a candidate that
        // can actually render — the <aparte-chat> shell matches the selector first
        // but delegates rendering to its viewport (see _asRenderTarget), so a blind
        // candidates[0] returned an unusable shell and retry/edit silently no-op'd.
        if (targetId) {
            const el = document.getElementById(targetId) as HTMLElement | null;
            if (el) return this._asRenderTarget<T>(el) ?? (el as unknown as T);
        }
        if (this.options.targetResolver) {
            const el = this.options.targetResolver() as HTMLElement | null;
            if (el) return this._asRenderTarget<T>(el) ?? (el as unknown as T);
        }
        const candidates = document.querySelectorAll<HTMLElement>('aparte-chat, aparte-chat-viewport, [data-aparte-chat]');
        for (const candidate of candidates) {
            const target = this._asRenderTarget<T>(candidate);
            if (target) return target;
        }
        return (candidates[0] as unknown as T | undefined) ?? null;
    }

    /**
     * Resolve an element to a usable render target: itself when it exposes
     * `appendMessage`, else the viewport it delegates to. The `<aparte-chat>`
     * shell matches the host selectors/id but owns no `appendMessage` (it forwards
     * rendering to its `.viewport`), so returning the bare shell would make
     * send / retry / edit silently no-op. Returns null when neither can render.
     */
    private _asRenderTarget<T extends HTMLElement>(el: HTMLElement | null | undefined): T | null {
        if (!el) return null;
        if (typeof (el as { appendMessage?: unknown }).appendMessage === 'function') return el as unknown as T;
        const viewport = (el as { viewport?: HTMLElement | null }).viewport;
        if (viewport && typeof (viewport as { appendMessage?: unknown }).appendMessage === 'function') {
            return viewport as unknown as T;
        }
        return null;
    }

    /**
     * Convert AparteMessage[] to AparteChatMessage[] for re-submission.
     */
    private _messagesToChatMessages(messages: AparteMessage[]): import('../types/chat.js').AparteChatMessage[] {
        // Use _extractText (not m.content): assistant replies stream their text
        // into `segments`, leaving `content` as ''. Without flattening, retry/edit
        // would send empty assistant turns and the model answers the wrong question.
        return messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: this._extractText(m)
            }));
    }

    private async _handleSend(event: CustomEvent): Promise<void> {
        const { content, modelId, providerId: explicitProviderId } = event.detail;

        // 1. Use targetId from event detail — the most reliable path.
        //    The composer sets detail.targetId = host.id (set by AparteChatComponent).
        //    document.getElementById works even when the composer is temporarily detached.
        let targetElement: AparteChatTargetElement | null = null;
        const targetId = (event.detail as { targetId?: string })?.targetId as string | undefined;
        if (targetId) {
            // Resolve through the shared helper: an `<aparte-chat>` shell carries
            // the id but owns no appendMessage (it delegates to `.viewport`), so
            // requiring the method ON the element made every `target`-attributed
            // send fall through to the DOM scan below — which returns the FIRST
            // chat on the page. With two chats, one chat's reply landed in the
            // other. retry/edit already used this helper; send had drifted.
            const byId = document.getElementById(targetId) as HTMLElement | null;
            const resolved = this._asRenderTarget<HTMLElement>(byId) as AparteChatTargetElement | null;
            if (resolved) {
                targetElement = resolved;
            } else {
                console.warn('[AparteClient] ⚠️ targetId present but element not found or missing appendMessage:', targetId);
            }
        }

        // 2. User-supplied resolver (e.g. provided via APARTE_CLIENT_OPTIONS)
        if (!targetElement && this.options.targetResolver) {
            const resolved = this.options.targetResolver() as AparteChatTargetElement | null;
            if (resolved && typeof resolved.appendMessage === 'function') {
                targetElement = resolved;
            }
        }

        // 3. Walk up the event bubble chain as last resort
        if (!targetElement) {
            let walker: AparteChatTargetElement | null = event.target as AparteChatTargetElement | null;
            while (walker && typeof walker.appendMessage !== 'function') {
                walker = walker.parentElement as AparteChatTargetElement | null;
            }
            if (walker) {
                targetElement = walker;
            }
        }

        // 4. Same-page DOM scan. The composer/input and the viewport are usually
        //    SIBLINGS (the viewport fills the scroll area, the composer docks
        //    below it) — exactly the documented flat quick-start layout — so the
        //    parentElement walk above never reaches the viewport. Mirror the
        //    retry/edit resolver's scan so a bare `<aparte-chat-viewport>` works
        //    out of the box without a targetResolver.
        if (!targetElement) {
            // Prefer the first candidate that can actually render. The <aparte-chat>
            // shell matches the selector first but delegates to its viewport (no
            // appendMessage of its own), so a blind querySelector returned an
            // unusable shell and the send silently no-op'd. _asRenderTarget skips
            // to the shell's viewport (or the bare viewport) — see also _resolveTarget.
            const candidates = document.querySelectorAll<HTMLElement>(
                'aparte-chat, aparte-chat-viewport, [data-aparte-chat]',
            );
            for (const candidate of candidates) {
                const resolved = this._asRenderTarget<AparteChatTargetElement>(candidate);
                if (resolved) {
                    targetElement = resolved;
                    break;
                }
            }
        }

        if (!targetElement) {
            console.warn('[AparteClient] ⚠️ No target element found with appendMessage support. Provide a targetResolver in AparteClientOptions or ensure the composer has a `target` attribute.');
            return;
        }

        const messageId = uuid();
        const config = this._config.getModelConfig();
        const providerId = explicitProviderId || config.defaultProvider;

        // 1. Initial Checks (Sync Errors)
        if (!providerId) {
            this._handleLifecycleError(targetElement, messageId, new AparteError(
                'No provider selected. Please configure a provider.',
                AparteErrorCode.CONFIG_NO_PROVIDER
            ));
            return;
        }

        const provider = this._config.getAIProvider(providerId);
        if (!provider) {
            this._handleLifecycleError(targetElement, messageId, new AparteError(
                `Provider '${providerId}' is not registered.`,
                AparteErrorCode.CONFIG_MISSING_KEY,
                { providerId }
            ));
            return;
        }

        // 2. Prepare Atomic Assistant Message
        targetElement.appendMessage?.({
            id: messageId,
            role: 'assistant',
            content: '',
            status: 'pending',
            timestamp: Date.now()
        });

        // Resolve auth + build the request (key channel + file injection are
        // send-specific). A failure here routes to the lifecycle error exactly
        // like a stream failure inside _streamTurn.
        let authConfig: string | Record<string, string> | undefined;
        let messages: AparteChatMessage[];
        try {
            authConfig = await this._resolveAuth(providerId);

            const rawFiles: File[] = Array.isArray(event.detail?.files) ? event.detail.files : [];
            const filesToInject = this._selectFilesToInject(rawFiles);
            const contentParts = filesToInject.length > 0 ? await this._filesToContentParts(filesToInject) : [];
            messages = this._buildMessages(content, targetElement, contentParts.length > 0 ? contentParts : undefined);
        } catch (error: unknown) {
            this._handleLifecycleError(targetElement, messageId, AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR));
            return;
        }

        await this._streamTurn(
            targetElement, messageId, provider,
            messages, modelId || config.defaultModel || '',
            authConfig,
        );
    }

    /**
     * Build the initial messages array, prepending system prompts and conversation history.
     */
    private _buildMessages(userContent: string, target?: AparteChatTargetElement, parts?: AparteContentPart[]): AparteChatMessage[] {
        const messages: AparteChatMessage[] = [];

        // 1. User-defined system prompt (with resolved variables)
        const userSystemPrompt = this._config.resolveSystemPrompt();
        if (userSystemPrompt) {
            messages.push({ role: 'system', content: userSystemPrompt });
        }

        const historyOption = this.options.history ?? 'viewport';
        const viewportMessages: AparteMessage[] = target?.getMessages?.() ?? [];

        if (historyOption === 'viewport') {
            messages.push(...this._toHistoryMessages(viewportMessages));
        } else if (typeof historyOption === 'function') {
            messages.push(...historyOption(viewportMessages));
        }

        const userMsg: AparteChatMessage['content'] = (parts && parts.length > 0)
            ? [{ type: 'text' as const, text: userContent }, ...parts]
            : userContent;
        messages.push({ role: 'user', content: userMsg });
        return messages;
    }

    private _toHistoryMessages(messages: AparteMessage[]): AparteChatMessage[] {
        // Exclude trailing unanswered user messages: the current user message is
        // already added explicitly at the end of _buildMessages, so including it
        // from the viewport would cause a duplicate.
        // Find the last completed assistant response and cut there.
        let cutoff = 0;
        for (let i = 0; i < messages.length; i++) {
            const m = messages[i]!;
            if (m.role === 'assistant' && m.status === 'completed') {
                cutoff = i + 1;
            }
        }

        return messages
            .slice(0, cutoff)
            .filter(m => {
                if (m.role === 'user') return m.status !== 'error';
                if (m.role === 'assistant') return m.status === 'completed';
                return false;
            })
            .map(m => ({
                role: m.role as 'user' | 'assistant',
                content: this._extractText(m)
            }))
            .filter(m => m.content.length > 0);
    }

    /**
     * What the model is told it said last turn — reconstructed from what was
     * RENDERED, not from the raw-text field.
     *
     * The order used to be the other way round, and it silently corrupted the
     * context on the most common opening in a coding chat: a reply starting with a
     * code fence was sent back as three backticks and nothing else. Three
     * correct-in-isolation decisions composed into it:
     *
     *  1. the parser withholds an ambiguous prefix (``` ``` ```, `` ` ``, `<`)
     *     waiting for the next delta, and creates no active segment while it waits;
     *  2. so `_streamLoop` sees zero segments, concludes the parser produced
     *     nothing, and appends the raw delta straight to `message.content`;
     *  3. and this method preferred `content`.
     *
     * The bubble hides its content element as soon as segments exist, so the UI was
     * perfect and only the NEXT request showed it. No unit test, no playground and
     * no browser test could see it.
     *
     * `content` stays as the fallback, and that is not vestigial: a non-streaming
     * transport writes the whole reply there and creates no segments at all.
     */
    private _extractText(message: AparteMessage): string {
        const rendered = this._segmentsToText(message.segments);
        if (rendered) return rendered;
        if (typeof message.content === 'string' && message.content) return message.content;
        return '';
    }

    /**
     * Segments → the text a model can read back.
     *
     * Fences and the language tag are kept. Without them the model re-reads its own
     * code as prose — which is how it starts explaining a snippet it believes it
     * wrote in English. Artifacts are included for the same reason: dropping them
     * made an artifact the model had just produced invisible on the very next turn,
     * so it could not be asked to change the thing it had built.
     *
     * `thinking` stays out on purpose — it is the model's own scratchpad, and most
     * APIs neither want it back nor bill for it kindly.
     */
    private _segmentsToText(segments: AparteMessage['segments']): string {
        if (!segments?.length) return '';
        const fence = '```';
        const parts: string[] = [];
        for (const segment of segments) {
            const content = (segment as { content?: string }).content ?? '';
            if (segment.type === 'text') {
                if (content) parts.push(content);
            } else if (segment.type === 'code') {
                const lang = (segment as { language?: string }).language ?? '';
                parts.push(`${fence}${lang}\n${content}\n${fence}`);
            } else if (segment.type === 'artifact') {
                const title = (segment as { title?: string }).title ?? 'artifact';
                const kind = (segment as { artifactType?: string }).artifactType ?? '';
                parts.push(`${fence}${kind}\n<!-- artifact: ${title} -->\n${content}\n${fence}`);
            }
        }
        return parts.join('\n').trim();
    }

    /**
     * Which of the send's pending files get inlined into the request: the
     * `rawFileInject` mode first —
     *   'none'        → nothing inline (RAG handles all file types),
     *   'images-only' → images inline, text/docs to the app layer,
     *   'all' (default) → images + text files inline —
     * then the optional per-file `fileInjectFilter` veto.
     */
    private _selectFilesToInject(rawFiles: File[]): File[] {
        const byMode =
            this.options.rawFileInject === 'none' ? [] :
            this.options.rawFileInject === 'images-only' ? rawFiles.filter(f => f.type.startsWith('image/')) :
            rawFiles;
        const filter = this.options.fileInjectFilter;
        return filter ? byMode.filter(f => filter(f)) : byMode;
    }

    /**
     * Convert an array of File objects to AparteContentPart[].
     * - Images → AparteImagePart (base64 data URL)
     * - Text files (txt, md, json, csv, xml, html, css, js, ts, …) → AparteTextPart
     *   injected as a fenced block so all models (including local) can read them.
     * - Other binary files → silently ignored.
     */
    private async _filesToContentParts(files: File[]): Promise<AparteContentPart[]> {
        const TEXT_TYPES = /^(text\/|application\/(json|xml|javascript|typescript|x-yaml|yaml|toml|csv|markdown))/i;
        const TEXT_EXTENSIONS = /\.(txt|md|markdown|json|jsonl|csv|tsv|xml|html|htm|css|js|mjs|cjs|ts|tsx|jsx|py|rb|java|c|cpp|h|go|rs|php|sh|bash|zsh|fish|yaml|yml|toml|ini|env|log|svg|graphql|gql)$/i;

        const parts: (AparteContentPart | null)[] = await Promise.all(
            files.map((file): Promise<AparteContentPart | null> => {
                if (file.type.startsWith('image/')) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve({ type: 'image', image: reader.result as string, mimeType: file.type });
                        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
                        reader.readAsDataURL(file);
                    });
                }

                if (TEXT_TYPES.test(file.type) || TEXT_EXTENSIONS.test(file.name)) {
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const content = reader.result as string;
                            const ext = file.name.split('.').pop() ?? '';
                            resolve({
                                type: 'text',
                                text: `\`\`\`${ext}\n// File: ${file.name}\n${content}\n\`\`\``,
                            });
                        };
                        reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
                        reader.readAsText(file);
                    });
                }

                return Promise.resolve(null);
            })
        );

        return parts.filter((p): p is AparteContentPart => p !== null);
    }

    /**
     * Stream loop: runs one provider.chat() call and repeats if a tool was called.
     * Maintains a running messages array to inject tool_call / tool_result turns.
     */
    /**
     * Feed one text delta to the Claude-style `<artifact>` XML streamer. Scans for
     * `<artifact …>` / `</artifact>`, routing chat text through the text parser and
     * artifact content into a dedicated artifact segment (handling tags split across
     * deltas). Mutates `xml` in place. Extracted from _streamLoop.
     */
    private _feedXmlArtifactDelta(
        delta: string,
        xml: XmlArtifactStreamState,
        ctx: {
            targetElement: AparteChatTargetElement;
            messageId: string;
            textParser: AparteStreamParser;
            streamingSegmentIds: Set<string>;
            artifactProgress: Map<string, number>;
            artifactXmlHint: AparteArtifactHint;
        },
    ): void {
        const { targetElement, messageId, textParser, streamingSegmentIds, artifactProgress, artifactXmlHint } = ctx;
        let remaining = delta;

        // One emitter for chat text, used by all three exits below. There used to
        // be two near-copies of this, and the back-out path added by the
        // partial-tag fix would have made a third.
        //
        // `syncActive` is the one difference between those copies, and it is
        // LOAD-BEARING rather than drift, which the engine parity suite proved:
        // the text-before-an-opening-tag path must NOT flush its still-growing
        // segment, or core emits the text segment before the artifact while
        // `runStreamAgent` still emits the artifact first — a visible divergence in
        // the call sequence the two loops are contracted to share.
        //
        // Flushing early is arguably the better UX (the prose appears as it
        // arrives rather than after the artifact card). That is a deliberate change
        // to a streamed call order, with the engine side to match: a decision of
        // its own, not a side effect of removing a duplicate.
        const emitChatText = (text: string, syncActive = true): void => {
            if (!text) return;
            const r = textParser.parse(text);
            for (const seg of r.segments) {
                if (!streamingSegmentIds.has(seg.id)) {
                    targetElement.addSegment?.(seg);
                    streamingSegmentIds.add(seg.id);
                } else if ('content' in seg) {
                    targetElement.updateSegment?.(seg.id, { content: (seg as { content?: string }).content });
                }
            }
            // The active segment is always CONSULTED (the imperative fallback below
            // must not fire while one is growing) but only EMITTED when the caller
            // says so. Getting that distinction wrong is what produced a spurious
            // `typeName` call and broke parity a second time.
            const active = textParser.getState().activeSegment;
            if (syncActive && active) {
                if (!streamingSegmentIds.has(active.id)) {
                    targetElement.addSegment?.(active);
                    streamingSegmentIds.add(active.id);
                } else {
                    targetElement.updateSegment?.(active.id, { content: (active as { content?: string }).content });
                }
            } else if (!r.segments.length && !active) {
                // Nothing: see the note on the other feeder. The parser is holding
                // an ambiguous prefix, and writing it here duplicated it into
                // `message.content`, which history preferred over the segments.
            }
        };

        while (remaining.length > 0) {
            if (xml.state === 'normal') {
                const tagStart = remaining.indexOf(XML_OPEN_TAG);
                if (tagStart === -1) {
                    // No whole tag - but the delta may END on a piece of one.
                    const held = partialXmlOpenTagLength(remaining);
                    if (held > 0) {
                        // `false` for the same reason as the whole-tag branch below:
                        // flushing here puts the prose BEFORE the artifact card while
                        // the runner still emits it after. Reintroduced right next to
                        // the comment explaining it.
                        emitChatText(remaining.slice(0, remaining.length - held), false);
                        xml.scanBuf = remaining.slice(remaining.length - held);
                        xml.state = 'scanning';
                    } else {
                        emitChatText(remaining);
                    }
                    remaining = '';
                } else {
                    // Emit chat text before the opening tag — WITHOUT flushing the
                    // active segment (see `syncActive` above; the parity suite pins it).
                    emitChatText(remaining.slice(0, tagStart), false);
                    // The tail goes through `remaining`, NOT into `scanBuf`.
                    //
                    // Parking it in `scanBuf` and clearing `remaining` ended the
                    // `while` loop immediately, so a complete
                    // `<artifact …>…</artifact>` arriving in ONE delta was never
                    // processed: no artifact segment, no lifecycle events, and the
                    // prose AFTER the closing tag was silently dropped as well. The
                    // finalize block only flushes `state === 'in-artifact'`, so
                    // `scanning` was a dead end.
                    //
                    // The `scanning` state already knows how to resume (it accumulates
                    // `remaining` and hands the tail back after `>`), so it just had to
                    // be allowed to run. Reachable from a non-SSE `AparteBackendTransport`,
                    // a buffering provider, or `injectTokenStream`; the parity suite's
                    // scenario split the tag across two deltas and stepped right past it.
                    xml.scanBuf = '';
                    remaining = remaining.slice(tagStart);
                    xml.state = 'scanning';
                }
            } else if (xml.state === 'scanning') {
                // Accumulate until we have the full opening tag (ends with >)
                xml.scanBuf += remaining;
                remaining = '';
                // Entered on a partial prefix that turns out to be a different tag
                // (an <article> element, say): give the text back and return to normal.
                const cmp = Math.min(xml.scanBuf.length, XML_OPEN_TAG.length);
                if (xml.scanBuf.slice(0, cmp) !== XML_OPEN_TAG.slice(0, cmp)) {
                    emitChatText(xml.scanBuf);
                    xml.scanBuf = '';
                    xml.state = 'normal';
                    continue;
                }
                const gtIdx = xml.scanBuf.indexOf('>');
                if (gtIdx !== -1) {
                    const tag = xml.scanBuf.slice(0, gtIdx + 1);
                    // Parse mimeType and title attributes (single or double quotes)
                    const mimeMatch = /mimeType=['"]([^'"]+)['"]/.exec(tag);
                    const titleMatch = /title=['"]([^'"]+)['"]/.exec(tag);
                    xml.mime = mimeMatch?.[1] ?? artifactXmlHint.mimeType;
                    xml.title = titleMatch?.[1] ?? artifactXmlHint.kind;
                    xml.kind = deriveArtifactKind(xml.mime, artifactXmlHint.kind);
                    xml.segId = `artifact-xml-${uuid()}`;
                    xml.content = '';
                    const openSeg: import('../types/segments.js').AparteArtifactSegment = {
                        id: xml.segId, type: 'artifact',
                        mimeType: xml.mime, artifactType: xml.kind,
                        title: xml.title, content: '',
                    };
                    targetElement.addSegment?.(openSeg);
                    streamingSegmentIds.add(xml.segId);
                    dispatchArtifactLifecycle(targetElement, messageId, openSeg, artifactProgress, false);
                    xml.state = 'in-artifact';
                    remaining = xml.scanBuf.slice(gtIdx + 1);
                    xml.scanBuf = '';
                }
            } else { // in-artifact
                const CLOSE = '</artifact>';
                const combined = xml.closeBuf + remaining;
                const closeIdx = combined.indexOf(CLOSE);
                if (closeIdx !== -1) {
                    // Closing tag found — finalize the artifact
                    xml.content += combined.slice(0, closeIdx);
                    const lineCount = xml.content.split('\n').length;
                    const isInline = lineCount < 15;
                    const finalSeg: import('../types/segments.js').AparteArtifactSegment = {
                        id: xml.segId!, type: 'artifact',
                        mimeType: xml.mime, artifactType: xml.kind,
                        title: xml.title, content: xml.content,
                        inline: isInline,
                    };
                    targetElement.updateSegment?.(xml.segId!, { content: xml.content, inline: isInline } as Partial<import('../types/segments.js').AparteArtifactSegment>);
                    dispatchArtifactLifecycle(targetElement, messageId, finalSeg, artifactProgress, true);
                    xml.state = 'normal';
                    xml.closeBuf = '';
                    remaining = combined.slice(closeIdx + CLOSE.length);
                } else {
                    // Buffer a tail chunk to handle closing tag split across deltas
                    const safeLen = Math.max(0, combined.length - CLOSE.length + 1);
                    const safe = combined.slice(0, safeLen);
                    xml.content += safe;
                    xml.closeBuf = combined.slice(safeLen);
                    remaining = '';
                    if (xml.segId) {
                        targetElement.updateSegment?.(xml.segId, { content: xml.content });
                        dispatchArtifactLifecycle(targetElement, messageId, {
                            id: xml.segId, type: 'artifact',
                            mimeType: xml.mime, artifactType: xml.kind,
                            title: xml.title, content: xml.content,
                        } as import('../types/segments.js').AparteArtifactSegment, artifactProgress, false);
                    }
                }
            }
        }
    }

    /**
     * Turn-1 forced tool call. When `toolChoice = { name, input }`
     * (orchestrator-driven), execute the handler directly instead of consulting
     * the LLM, render the tool segment, inject the result as `tool_result`, and
     * strip `toolChoice` for the follow-up turn. Returns the (possibly-updated)
     * request and whether the loop should skip to the next turn (handler missing
     * or aborted). Extracted from `_streamLoop`. `messages` is mutated in place.
     */
    private async _maybeRunSyntheticTool(
        baseRequest: AparteChatRequest,
        turns: number,
        messages: AparteChatMessage[],
        targetElement: AparteChatTargetElement,
    ): Promise<{ baseRequest: AparteChatRequest; skip: boolean }> {
        const toolChoice = baseRequest.toolChoice;
        if (!(turns === 1 && toolChoice && typeof toolChoice === 'object' && toolChoice.input !== undefined)) {
            return { baseRequest, skip: false };
        }

        const syntheticId = uuid();
        const syntheticCall: AparteToolCall = { id: syntheticId, name: toolChoice.name, input: toolChoice.input };

        // Render the tool segment so the UI shows the tool was called.
        const toolSeg: AparteToolCallSegment = {
            id: `tool-${syntheticId}`,
            type: 'tool_call',
            toolCall: syntheticCall,
            status: 'pending',
        };
        const toolRenderer = this._config.getToolRenderer(toolChoice.name);
        if (toolRenderer) {
            const html = toolRenderer.render(toolSeg);
            if (html) targetElement.addSegment?.(toolSeg);
        } else {
            targetElement.addSegment?.(toolSeg);
        }

        const handler = this._config.getToolHandler(toolChoice.name);
        if (!handler) {
            console.warn(`[AparteClient] No handler for synthetic tool "${toolChoice.name}"`);
            targetElement.updateSegment?.(toolSeg.id, { status: 'aborted' });
            return { baseRequest, skip: true };
        }

        const controller = new AbortController();
        this._activeToolControllers.add(controller);
        const timeout = setTimeout(() => controller.abort(), this.options.toolTimeoutMs ?? DEFAULT_TOOL_HANDLER_TIMEOUT_MS);
        try {
            const result = await handler(syntheticCall, controller.signal, {
                target: targetElement as unknown as HTMLElement,
                config: this._config,
            });
            targetElement.updateSegment?.(toolSeg.id, { status: 'resolved', result: result.content });
            messages.push({ role: 'tool_call', content: '', toolCalls: [syntheticCall] });
            messages.push({ role: 'tool_result', content: result.content, toolCallId: syntheticId });
            // Strip toolChoice + tools from the follow-up LLM call — it should just answer.
            return { baseRequest: { ...baseRequest, toolChoice: 'none', tools: undefined }, skip: false };
        } catch (err: unknown) {
            if ((err as { name?: string })?.name === 'AbortError') {
                targetElement.updateSegment?.(toolSeg.id, { status: 'aborted' });
                return { baseRequest, skip: true };
            }
            throw err;
        } finally {
            clearTimeout(timeout);
            this._activeToolControllers.delete(controller);
        }
    }

    /**
     * Handle one `tool_use` stream event from {@link _streamLoop}: the built-in
     * `create_artifact`, per-tool renderer selection, the human-in-the-loop
     * approval gate, and running the registered handler (timeout / abort).
     * Mutates the shared `messages` / `toolCallsThisTurn` history in place and
     * returns whether the agentic loop should keep going.
     */
    private async _handleToolUseEvent(
        event: { id: string; name: string; input: Record<string, unknown> },
        ctx: {
            targetElement: AparteChatTargetElement;
            messageId: string;
            messages: AparteChatMessage[];
            toolCallsThisTurn: AparteToolCall[];
            precedingText: string;
            artifactProgress: Map<string, number>;
            turns: number;
            globalMaxTurns: number;
        },
    ): Promise<{ continueLoop: boolean }> {
        const { targetElement, messageId, messages, toolCallsThisTurn, precedingText, artifactProgress, turns, globalMaxTurns } = ctx;
        let continueLoop = true;

        toolCallsThisTurn.push({ id: event.id, name: event.name, input: event.input });

        // ── Built-in: create_artifact ─────────────────────────────────
        // When the LLM calls create_artifact, bypass the generic handler:
        // create an AparteArtifactSegment directly (isolated from chat text),
        // dispatch artifact lifecycle events, and inject a success tool_result
        // so the LLM can continue with a conversational reply.
        if (event.name === 'create_artifact') {
            const input = event.input as {
                mimeType?: string;
                title?: string;
                content?: string;
            };
            const mimeType = input.mimeType ?? 'text/plain';
            // The canonical derivation, not a third hand-rolled copy: the inline
            // chain that used to live here knew nothing of Anthropic's
            // `application/vnd.ant.*` namespace, so the same create_artifact call
            // rendered differently depending on whether the engine runner was
            // injected. `deriveArtifactKind` is already imported at the top of
            // this file, and engine's copy is locked to it by a parity test.
            const kind = deriveArtifactKind(mimeType, 'text');
            const artifactSeg: import('../types/segments.js').AparteArtifactSegment = {
                id: `artifact-${event.id}`,
                type: 'artifact',
                mimeType,
                artifactType: kind,
                title: input.title ?? kind,
                content: input.content ?? '',
            };
            targetElement.addSegment?.(artifactSeg);
            dispatchArtifactLifecycle(targetElement, messageId, artifactSeg, artifactProgress, true);

            messages.push({
                role: 'tool_call',
                content: '',
                toolCalls: [{ id: event.id, name: event.name, input: event.input }],
            });
            messages.push({
                role: 'tool_result',
                content: 'Artifact created successfully.',
                toolCallId: event.id,
            });
            return { continueLoop: true };
        }
        // ── End built-in create_artifact ──────────────────────────────

        const toolSeg: AparteToolCallSegment = {
            id: `tool-${event.id}`,
            type: 'tool_call',
            toolCall: { id: event.id, name: event.name, input: event.input },
            status: 'pending'
        };

        // Check for a per-tool renderer override
        const toolRenderer = this._config.getToolRenderer(event.name);
        if (toolRenderer) {
            // Inject per-tool styles once
            if (toolRenderer.getStyles) {
                const styles = toolRenderer.getStyles();
                if (styles) {
                    const styleId = `aparte-tool-renderer-${event.name}`;
                    if (!document.getElementById(styleId)) {
                        const el = document.createElement('style');
                        el.id = styleId;
                        el.textContent = styles;
                        document.head.appendChild(el);
                    }
                }
            }
            const html = toolRenderer.render(toolSeg);
            // Only add segment if the renderer produces visible output
            if (html) {
                targetElement.addSegment?.(toolSeg);
            }
            // No DOM setup here — segment bubble handles it via its own renderer
        } else {
            // Fallback: generic tool_call segment renderer (pill + spinner)
            targetElement.addSegment?.(toolSeg);
        }

        // Check per-tool maxTurns override
        const toolDef = this._config.getTools().find(t => t.name === event.name);
        const effectiveMaxTurns = toolDef?.maxTurns ?? globalMaxTurns;
        if (turns >= effectiveMaxTurns) {
            console.warn(`[AparteClient] Tool "${event.name}" maxTurns (${effectiveMaxTurns}) reached.`);
            targetElement.updateSegment?.(toolSeg.id, { status: 'aborted' });
            return { continueLoop: false };
        }

        // Find and run the registered handler
        const handler = this._config.getToolHandler(event.name);
        if (handler) {
            // The input the handler runs with. A human approval step may
            // override it via the decision payload (see below); with no
            // approval it is exactly what the model requested.
            let effectiveInput = event.input;
            // Human-in-the-loop: pause for approval before running, if required.
            if (toolDef?.needsApproval) {
                const approvalController = new AbortController();
                this._activeToolControllers.add(approvalController);
                targetElement.updateSegment?.(toolSeg.id, { status: 'awaiting-approval' });
                // Through the helper, like every other lifecycle event this class
                // emits — it stamps `targetId`. The engine path already goes
                // through `dispatchLifecycleEvent` and stamps it, so dispatching
                // raw here gave one event two shapes depending on which loop
                // produced it, and a composer filtering on `targetId` saw the
                // approval request from the other chat on the page.
                dispatchLifecycleEvent(targetElement, 'aparte-tool-approval-request', {
                    toolCallId: event.id, toolName: event.name, input: event.input,
                });
                let decision: { approved: boolean; payload?: unknown };
                const resolveApproval = this.options.approvalResolver
                    ?? ((id: string, sig: AbortSignal) => this._awaitToolDecision(id, sig));
                try {
                    decision = await resolveApproval(event.id, approvalController.signal);
                } finally {
                    this._activeToolControllers.delete(approvalController);
                }
                if (!decision.approved) {
                    const rejection = 'Tool execution was rejected by the user.';
                    targetElement.updateSegment?.(toolSeg.id, { status: 'rejected', result: rejection });
                    const existingToolCallMsg = messages.find(
                        m => m.role === 'tool_call' && m.toolCalls?.some(tc => tc.id === event.id)
                    );
                    if (!existingToolCallMsg) {
                        messages.push({
                            role: 'tool_call',
                            content: '',
                            toolCalls: toolCallsThisTurn,
                            precedingText: precedingText.trim() || undefined
                        });
                    }
                    messages.push({ role: 'tool_result', content: rejection, toolCallId: event.id });
                    return { continueLoop: false };
                }
                // Approved → optionally let the human's payload edit the
                // arguments, then restore pending and run the handler.
                if (decision.payload && typeof decision.payload === 'object' && !Array.isArray(decision.payload)) {
                    effectiveInput = { ...event.input, ...(decision.payload as Record<string, unknown>) };
                }
                targetElement.updateSegment?.(toolSeg.id, { status: 'pending' });
            }

            const controller = new AbortController();
            this._activeToolControllers.add(controller);
            const timeout = setTimeout(() => controller.abort(), this.options.toolTimeoutMs ?? DEFAULT_TOOL_HANDLER_TIMEOUT_MS);

            try {
                const result = await handler(
                    { id: event.id, name: event.name, input: effectiveInput },
                    controller.signal,
                    { target: targetElement as unknown as HTMLElement, config: this._config },
                );
                targetElement.updateSegment?.(toolSeg.id, { status: 'resolved', result: result.content });

                // Inject tool_call + tool_result into message history for re-call
                const existingToolCallMsg = messages.find(
                    m => m.role === 'tool_call' && m.toolCalls?.some(tc => tc.id === event.id)
                );
                if (!existingToolCallMsg) {
                    messages.push({
                        role: 'tool_call',
                        content: '',
                        toolCalls: toolCallsThisTurn,
                        precedingText: precedingText.trim() || undefined
                    });
                }
                messages.push({
                    role: 'tool_result',
                    content: result.content,
                    toolCallId: event.id
                });
            } catch (err: unknown) {
                if ((err as { name?: string })?.name === 'AbortError') {
                    targetElement.updateSegment?.(toolSeg.id, { status: 'aborted' });
                    continueLoop = false;
                } else {
                    throw err;
                }
            } finally {
                clearTimeout(timeout);
                this._activeToolControllers.delete(controller);
            }
        } else {
            console.warn(`[AparteClient] No handler registered for tool "${event.name}"`);
            targetElement.updateSegment?.(toolSeg.id, { status: 'aborted' });
            continueLoop = false;
        }
        return { continueLoop };
    }

    private async _streamLoop(
        targetElement: AparteChatTargetElement,
        messageId: string,
        provider: AparteAIProvider,
        baseRequest: AparteChatRequest,
        authConfig: string | Record<string, string> | undefined
    ): Promise<AparteUsage | undefined> {
        // Fetch-level abort: aborting this controller (via `abort()`) cuts the
        // in-flight vendor request, so a user "stop" halts server-side generation
        // rather than only stopping client-side reading of the stream.
        // A NEW turn abandons the previous one, and abandoning means cutting it.
        //
        // `_streamController` is a single slot overwritten on each turn, and nothing
        // guards `_handleSend` / `_handleRetry` / `_handleEdit` against a turn already
        // in flight — so the first turn became unabortable: `abort()` reached only the
        // newest signal while the older stream kept generating and kept being billed,
        // with nothing left on the page to render it.
        //
        // Reachable without doing anything unusual: the composer converts
        // submit-while-streaming into a cancel, but the action bar is hidden only on
        // the bubble carrying `data-streaming`, so retry or edit on any EARLIER bubble
        // is clickable mid-stream and starts a second loop.
        //
        // Cutting the old one rather than tracking both, because two simultaneous
        // assistant turns on one chat is not a state this UI has — and "we walked away
        // from a stream, so cancel it" is already the rule everywhere else here.
        this._streamController?.abort();
        const streamController = new AbortController();
        this._streamController = streamController;

        // ── Injected stream runner ───────────────────────────────────────────
        // When a headless runner is injected (e.g. @aparte/engine's
        // runStreamAgent), delegate the loop to it and render via the core
        // adapter. Absent → the inline loop below runs (core standalone,
        // zero-dep). Both paths produce the same targetElement calls (proven by
        // the engine `stream-parity` suite).
        if (this.options.streamRunner) {
            return this._runViaStreamRunner(this.options.streamRunner, targetElement, messageId, provider, baseRequest, authConfig, streamController);
        }

        const messages: AparteChatMessage[] = [...baseRequest.messages];
        let continueLoop = true;
        let turns = 0;
        const globalMaxTurns = this.options.maxTurns ?? 10;
        let lastUsage: AparteUsage | undefined;

        // ── Pipeline mode ─────────────────────────────────────────────────
        // _meta.pipeline runs each phase as one LLM turn: the system message +
        // artifact hint are injected per phase, and reply N is context for N+1.
        // (Typed via AparteRequestMeta — no local shape / cast needed.)
        const pipeline = baseRequest._meta?.pipeline;
        let pipelineIndex = 0;

        this._updateMessage(targetElement, messageId, { status: 'streaming' });

        // Inject prefix segments (e.g. an orchestrator thinking block) before streaming.
        for (const seg of baseRequest._meta?.prefixSegments ?? []) {
            targetElement.addSegment?.(seg);
        }

        while (continueLoop) {
            if (this._isAborted) {
                dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId });
                break;
            }

            turns++;
            if (turns > globalMaxTurns) {
                console.warn(`[AparteClient] maxTurns (${globalMaxTurns}) exceeded — stopping loop.`);
                targetElement.addSegment?.({
                    id: `max-turns-${uuid()}`,
                    type: 'error',
                    content: `Stopped after ${globalMaxTurns} tool calls to prevent an infinite loop.`,
                    details: 'MAX_TURNS_EXCEEDED'
                });
                break;
            }

            // Turn-1 forced tool call (orchestrator-driven toolChoice) — runs the
            // handler directly instead of the LLM. `skip` = this turn is done
            // (handler missing / aborted); otherwise fall through with the request
            // stripped of toolChoice for the follow-up. See _maybeRunSyntheticTool.
            const synthetic = await this._maybeRunSyntheticTool(baseRequest, turns, messages, targetElement);
            baseRequest = synthetic.baseRequest;
            if (synthetic.skip) { continueLoop = false; continue; }

            // ── Build per-phase request when pipeline is active ───────────────
            let phaseMessages: AparteChatMessage[] = messages;
            let phaseMeta: AparteRequestMeta | undefined = baseRequest._meta;
            if (pipeline && pipelineIndex < pipeline.length) {
                const phase = pipeline[pipelineIndex]!;
                phaseMessages = [{ role: 'system', content: phase.system } as AparteChatMessage, ...messages];
                if (phase.mode === 'artifact') {
                    phaseMeta = { ...phaseMeta, artifactRaw: { mimeType: phase.mimeType, kind: phase.kind } };
                } else {
                    // Ensure no stale artifactRaw leaks into a text phase
                    const { artifactRaw: _dropped, pipeline: _p, ...restMeta } = (phaseMeta ?? {}) as AparteRequestMeta;
                    phaseMeta = restMeta;
                }
            }
            const request: AparteChatRequest = { ...baseRequest, messages: phaseMessages, _meta: phaseMeta };
            const response = await this._config.getTransport().chat(provider, request, authConfig, { providerId: provider.id, signal: streamController.signal });

            if (typeof response === 'string') {
                // PARSED, like every other reply. Writing the raw string to `content`
                // meant a non-streaming backend rendered literal ``` fences and got no
                // code, thinking or artifact segments at all — while the SAME backend
                // through the engine seam rendered them properly, because
                // `runStreamAgent` emits the string as a `text-delta` and the adapter
                // parses it. Two loops, two different products from one response.
                const wholeParser = new AparteStreamParser();
                const parsed = [
                    ...wholeParser.parse(response).segments,
                    ...wholeParser.finalize(),
                ];
                if (parsed.length > 0) {
                    for (const segment of parsed) targetElement.addSegment?.(segment);
                    this._updateMessage(targetElement, messageId, { status: 'completed' });
                } else {
                    // Nothing parseable (an empty or whitespace-only reply): keep the
                    // old shape so the bubble still has something to show.
                    this._updateMessage(targetElement, messageId, { content: response, status: 'completed' });
                }
                return undefined;
            }

            // Streaming mode
            const reader = (response as ReadableStream<AparteStreamEvent>).getReader();
            const textParser = new AparteStreamParser();
            const streamingSegmentIds = new Set<string>();
            /**
             * Lifecycle bookkeeping for artifact segments. Maps a segment id to the
             * length of content already broadcast via `aparte-artifact-delta`. Used to
             * compute incremental chunks without forcing the parser to expose deltas.
             */
            const artifactProgress = new Map<string, number>();
            let thinkingSegmentId: string | null = null;
            let thinkingContent = '';
            let thinkingCollapsed = false;
            // Extract artifact hint once — used in both streaming and finalize promotion
            const artifactHint = baseRequest._meta?.artifactHint;
            let artifactPromoted = false; // promote only the first code segment

            // ── artifactRaw mode (turn 2 of multi-turn) ──────────────────────
            // Entire stream is raw code → routed directly into an artifact segment.
            const artifactRawHint = request._meta?.artifactRaw;
            let rawSegId: string | null = null;
            let rawContent = '';

            if (artifactRawHint) {
                // Create the artifact segment immediately (pill during streaming)
                rawSegId = `artifact-raw-${uuid()}`;
                const rawSeg: import('../types/segments.js').AparteArtifactSegment = {
                    id: rawSegId, type: 'artifact',
                    mimeType: artifactRawHint.mimeType,
                    artifactType: artifactRawHint.kind,
                    title: artifactRawHint.kind,
                    content: '',
                };
                targetElement.addSegment?.(rawSeg);
                streamingSegmentIds.add(rawSegId);
                dispatchArtifactLifecycle(targetElement, messageId, rawSeg, artifactProgress, false);
            }
            // ── END artifactRaw ──────────────────────────────────────────────

            // ── XML artifact streaming state (Claude-like) — fed to _feedXmlArtifactDelta ──
            const artifactXmlHint = baseRequest._meta?.artifactXml;
            const xmlCtx: XmlArtifactStreamState = {
                state: 'normal', scanBuf: '', closeBuf: '', segId: null, content: '', mime: '', kind: '', title: '',
            };

            // Accumulated text before a tool call in this turn
            let precedingText = '';
            // Tool calls emitted during this turn
            const toolCallsThisTurn: AparteToolCall[] = [];

            // Honor abort INSIDE the SSE event loop too (not only between tool-call
            // turns). Without this, late events buffered after an `aparte-abort`
            // (e.g. after the user switches conversation mid-stream) keep mutating
            // the target's last message — which may now belong to a different
            // conversation, causing the user message in the new conv to be
            // overwritten by the assistant reply from the old one.
            //
            // Checked on BOTH sides of the read, and that is the whole point: the
            // loop spends nearly all of its time parked on `reader.read()`, so an
            // abort arriving while parked — the user pressing Stop while watching
            // text stream, i.e. the only case that actually happens — is invisible
            // to a check that only runs before the await. Checking after the read
            // also covers both shapes a provider can take on abort: an `error`
            // event (openai-compat) or a quiet close (ai-sdk). Miss it and the
            // error branch throws, `_handleLifecycleError` REPLACES `segments`,
            // and the answer the user was reading is erased and blamed on a fault.
            const bailOnAbort = (): boolean => {
                if (!this._isAborted) return false;
                try { void reader.cancel(); } catch { /* best effort */ }
                dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId });
                continueLoop = false;
                return true;
            };

            // Did the vendor stream reach its own end, or are we walking away from
            // it? Only the second case needs a cancel (see the finally below).
            let streamDrained = false;

            try {
                while (true) {
                    if (bailOnAbort()) break;
                    const { done, value: event } = await reader.read();
                    if (bailOnAbort()) break;
                    if (done) { streamDrained = true; break; }

                    switch (event.type) {
                        case 'thinking': {
                            thinkingContent += event.delta;
                            if (!thinkingSegmentId) {
                                const seg: AparteThinkingSegment = {
                                    id: `think-${uuid()}`,
                                    type: 'thinking',
                                    content: thinkingContent,
                                    collapsed: true,
                                    label: 'Thinking'
                                };
                                thinkingSegmentId = seg.id;
                                streamingSegmentIds.add(seg.id);
                                targetElement.addSegment?.(seg);
                            } else {
                                targetElement.updateSegment?.(thinkingSegmentId, { content: thinkingContent });
                            }
                            break;
                        }
                        case 'text': {
                            // Collapse thinking block when the response text starts
                            if (thinkingSegmentId && !thinkingCollapsed) {
                                targetElement.updateSegment?.(thinkingSegmentId, { collapsed: true });
                                thinkingCollapsed = true;
                            }
                            precedingText += event.delta;

                            // ── artifactRaw: whole stream → artifact segment ──────────────
                            if (artifactRawHint && rawSegId) {
                                rawContent += event.delta;
                                targetElement.updateSegment?.(rawSegId, { content: rawContent });
                                dispatchArtifactLifecycle(targetElement, messageId, {
                                    id: rawSegId, type: 'artifact',
                                    mimeType: artifactRawHint.mimeType,
                                    artifactType: artifactRawHint.kind,
                                    title: artifactRawHint.kind,
                                    content: rawContent,
                                } as import('../types/segments.js').AparteArtifactSegment, artifactProgress, false);
                                break;
                            }

                            // XML artifact streaming (Claude-like) — extracted to _feedXmlArtifactDelta.
                            if (artifactXmlHint) {
                                this._feedXmlArtifactDelta(event.delta, xmlCtx, {
                                    targetElement, messageId, textParser, streamingSegmentIds, artifactProgress, artifactXmlHint,
                                });
                                break;
                            }
                            const result = textParser.parse(event.delta);
                            for (let segment of result.segments) {
                                // Artifact hint promotion: promote first code fence → artifact
                                if (artifactHint && !artifactPromoted && segment.type === 'code') {
                                    const codeSeg = segment as import('../types/segments.js').AparteCodeSegment;
                                    const promoted: import('../types/segments.js').AparteArtifactSegment = {
                                        id: codeSeg.id,
                                        type: 'artifact',
                                        mimeType: artifactHint.mimeType,
                                        artifactType: artifactHint.kind,
                                        title: codeSeg.filename ?? artifactHint.kind,
                                        content: codeSeg.content,
                                    };
                                    segment = promoted;
                                    artifactPromoted = true;
                                }
                                if (!streamingSegmentIds.has(segment.id)) {
                                    targetElement.addSegment?.(segment);
                                    streamingSegmentIds.add(segment.id);
                                } else if ('content' in segment) {
                                    // Segment was already streaming — sync the final content
                                    targetElement.updateSegment?.(segment.id, { content: (segment as { content?: string }).content });
                                }
                                if (segment.type === 'artifact') {
                                    dispatchArtifactLifecycle(targetElement, messageId, segment, artifactProgress, true);
                                }
                            }
                            const active = textParser.getState().activeSegment;
                            if (active) {
                                if (!streamingSegmentIds.has(active.id)) {
                                    targetElement.addSegment?.(active);
                                    streamingSegmentIds.add(active.id);
                                    if (active.type === 'artifact') {
                                        dispatchArtifactLifecycle(targetElement, messageId, active, artifactProgress, false);
                                    }
                                } else {
                                    targetElement.updateSegment?.(active.id, { content: (active as { content?: string }).content });
                                    if (active.type === 'artifact') {
                                        dispatchArtifactLifecycle(targetElement, messageId, active, artifactProgress, false);
                                    }
                                }
                            } else if (result.segments.length === 0) {
                                // NOTHING here on purpose. This branch used to write
                                // the raw delta into `message.content`, and it is the
                                // second half of the history corruption: it only ever
                                // fires when the parser has withheld an ambiguous
                                // prefix (``` / ` / <) — a real text delta always
                                // leaves an ACTIVE segment, which the branch above
                                // handles. Measured: `parse('a b')` gives 0 segments
                                // and an active text segment; `parse('```')` gives 0
                                // and none.
                                //
                                // So the parser is holding those characters, and
                                // `finalize()` flushes them as a text segment if the
                                // stream ends there — verified. Writing them out here
                                // duplicated them into a field that history then
                                // preferred over what was rendered.
                            }
                            break;
                        }
                        case 'tool_use': {
                            const toolResult = await this._handleToolUseEvent(
                                { id: event.id, name: event.name, input: event.input },
                                { targetElement, messageId, messages, toolCallsThisTurn, precedingText, artifactProgress, turns, globalMaxTurns },
                            );
                            if (!toolResult.continueLoop) continueLoop = false;
                            break;
                        }
                        case 'error':
                            throw new Error(event.message);
                        case 'done':
                            if (event.usage) lastUsage = event.usage;
                            break;
                        default: {
                            // Compile-time exhaustiveness is KEPT: add a member to the
                            // union and this assignment stops typechecking. What is gone
                            // is the runtime throw.
                            //
                            // `assertNever` threw here, `_streamTurn` caught it, and
                            // `_handleLifecycleError` REPLACED the message's segments with
                            // an error bubble — so one unrecognised event destroyed a reply
                            // the user was already reading. That is reachable on any
                            // provider/SDK version skew: the ai-sdk mapper already drops
                            // `source`/`file`/`abort` parts by design, so a new member is a
                            // normal event, not a corrupt stream.
                            const exhaustive: never = event;
                            void exhaustive;
                            this._warnUnknownStreamEvent(event);
                            break;
                        }
                    }

                    // A `break` inside the switch above leaves the SWITCH, not this
                    // loop. Without this line a turn the loop already decided to
                    // stop — a tool the human rejected, a per-tool turn limit, a
                    // missing handler — went on to execute every remaining tool
                    // call of the same turn: side effects ran after an explicit
                    // refusal, and their results were appended to a stopped loop's
                    // history. `runStreamAgent` exits its inner loop for the same
                    // reasons; this is the core side of that agreement.
                    if (!continueLoop) break;
                }

                // Finalize text parser
                const finals = textParser.finalize();

                // ── artifactRaw finalize ──────────────────────────────────────
                if (artifactRawHint && rawSegId) {
                    const lineCount = rawContent.split('\n').length;
                    const isInline = lineCount < 15;
                    targetElement.updateSegment?.(rawSegId, { content: rawContent, inline: isInline } as Partial<import('../types/segments.js').AparteArtifactSegment>);
                    dispatchArtifactLifecycle(targetElement, messageId, {
                        id: rawSegId, type: 'artifact',
                        mimeType: artifactRawHint.mimeType, artifactType: artifactRawHint.kind,
                        title: artifactRawHint.kind, content: rawContent, inline: isInline,
                    } as import('../types/segments.js').AparteArtifactSegment, artifactProgress, true);
                }
                // ── END artifactRaw finalize ──────────────────────────────────

                // ── XML artifact finalize ─────────────────────────────────────
                // If the stream ended while still inside an <artifact> tag
                // (model truncated — common on small models with low maxTokens),
                // flush whatever was buffered and render the partial artifact.
                if (artifactXmlHint && xmlCtx.state === 'in-artifact' && xmlCtx.segId) {
                    xmlCtx.content += xmlCtx.closeBuf;
                    const lineCount = xmlCtx.content.split('\n').length;
                    const isInline = lineCount < 15;
                    targetElement.updateSegment?.(xmlCtx.segId, { content: xmlCtx.content, inline: isInline } as Partial<import('../types/segments.js').AparteArtifactSegment>);
                    dispatchArtifactLifecycle(targetElement, messageId, {
                        id: xmlCtx.segId, type: 'artifact',
                        mimeType: xmlCtx.mime, artifactType: xmlCtx.kind,
                        title: xmlCtx.title, content: xmlCtx.content, inline: isInline,
                    } as import('../types/segments.js').AparteArtifactSegment, artifactProgress, true);
                    console.warn('[AparteClient] XML artifact finalized without closing tag — content may be partial.');
                }
                // ── END XML artifact finalize ─────────────────────────────────

                // ── Artifact hint promotion (finalize) ───────────────────────
                // Handles the case where the code fence was not yet finalized
                // during streaming (e.g. stream ended without closing ```).
                if (artifactHint && !artifactPromoted) {
                    const codeIdx = finals.findIndex(s => s.type === 'code');
                    if (codeIdx !== -1) {
                        const codeSeg = finals[codeIdx] as import('../types/segments.js').AparteCodeSegment;
                        const promoted: import('../types/segments.js').AparteArtifactSegment = {
                            id: codeSeg.id,
                            type: 'artifact',
                            mimeType: artifactHint.mimeType,
                            artifactType: artifactHint.kind,
                            title: codeSeg.filename ?? artifactHint.kind,
                            content: codeSeg.content,
                        };
                        finals[codeIdx] = promoted;
                        artifactPromoted = true;
                        // Already in DOM as code block → re-render as artifact pill
                        if (streamingSegmentIds.has(promoted.id)) {
                            targetElement.updateSegment?.(promoted.id, promoted);
                        }
                    }
                }
                // ────────────────────────────────────────────────────────────

                for (const s of finals) {
                    if (!streamingSegmentIds.has(s.id)) {
                        targetElement.addSegment?.(s);
                    } else if ('content' in s) {
                        // finalize() appended the residual buffer — sync to DOM
                        targetElement.updateSegment?.(s.id, { content: (s as { content?: string }).content });
                    }
                    if (s.type === 'artifact') {
                        dispatchArtifactLifecycle(targetElement, messageId, s, artifactProgress, true);
                    }
                }

                // Stop looping — or advance to the next pipeline phase
                if (toolCallsThisTurn.length === 0) {
                    if (pipeline && pipelineIndex < pipeline.length - 1) {
                        // Inject this turn's assistant reply as context for the next phase
                        if (precedingText.trim()) {
                            messages.push({ role: 'assistant', content: precedingText.trim() });
                        }
                        pipelineIndex++;
                        // Show pulsing dots while we wait for the next phase.
                        // The segment removes itself automatically via MutationObserver
                        // when the next segment appears — no manual cleanup needed.
                        const pwId = `pw-${uuid()}`;
                        targetElement.addSegment?.({ id: pwId, type: 'pipeline-waiting' });
                        // continueLoop stays true — next iteration handles the new phase
                    } else {
                        continueLoop = false;
                    }
                }

            } finally {
                // Leaving before the stream ended on its own — a thrown error, a
                // rejected tool, a per-tool turn limit — used to just release the
                // lock, so the vendor happily kept generating (and billing) into a
                // body nobody would ever read. Releasing a reader does not stop a
                // stream; cancelling it does.
                if (!streamDrained) {
                    try { await reader.cancel(); } catch { /* best effort */ }
                }
                reader.releaseLock();
            }
        }

        this._updateMessage(targetElement, messageId, { status: 'completed' });
        // Push usage onto the live bubble so the info action (stats popover)
        // is available immediately, even for consumers that don't listen for
        // `aparte-message-done`.
        if (lastUsage) {
            try {
                (targetElement as { setUsage?: (id: string, u: AparteUsage) => void })
                    .setUsage?.(messageId, lastUsage);
            } catch { /* viewport may not implement setUsage */ }
        }
        return lastUsage;
    }

    /**
     * Delegate `_streamLoop`'s agentic loop to an injected {@link AparteStreamRunner},
     * rendering its DOM-free events through {@link createStreamAdapter}.
     * Builds the runner's dependencies from this client's config / provider /
     * transport; the adapter reproduces the inline loop's `targetElement.*` calls
     * (validated by the engine `stream-parity` suite). Leading writes (status
     * streaming, prefix segments) mirror the inline path; the runner's `run-start`
     * re-asserts `streaming` idempotently.
     */
    private async _runViaStreamRunner(
        streamRunner: AparteStreamRunner,
        targetElement: AparteChatTargetElement,
        messageId: string,
        provider: AparteAIProvider,
        baseRequest: AparteChatRequest,
        authConfig: string | Record<string, string> | undefined,
        streamController: AbortController,
    ): Promise<AparteUsage | undefined> {
        const signal = streamController.signal;

        // Leading writes (mirror inline :1034-1042).
        this._updateMessage(targetElement, messageId, { status: 'streaming' });
        const prefixSegments = baseRequest._meta?.['prefixSegments'] as AparteSegment[] | undefined;
        if (prefixSegments?.length) {
            for (const seg of prefixSegments) targetElement.addSegment?.(seg);
        }

        const artifactHint = baseRequest._meta?.artifactHint;
        const emitter = createStreamAdapter({
            target: targetElement as StreamAdapterTarget,
            config: this._config,
            messageId,
            artifactHint,
        });

        const transportCall = async (request: AparteChatRequest): Promise<AsyncIterable<AparteStreamEvent> | string> => {
            const response = await this._config.getTransport().chat(provider, request, authConfig, { providerId: provider.id, signal });
            return typeof response === 'string'
                ? response
                : readableToAsyncIterable(response as ReadableStream<AparteStreamEvent>, signal);
        };
        // Wrapped, so the INJECTED runner hands a handler the same context core's
        // inline loop does. Without this, `streamRunner: runStreamAgent` would be the
        // one configuration where `ask_question` still silently cancelled — a new
        // parity divergence introduced by fixing the old one.
        const toolLookup = (name: string) => {
            const handler = this._config.getToolHandler(name);
            if (!handler) return undefined;
            const context = { target: targetElement as unknown as HTMLElement, config: this._config };
            return (call: AparteToolCall, sig: AbortSignal) => handler(call, sig, context);
        };
        const toolConfigLookup = (name: string) => {
            const tool = this._config.getTools().find(t => t.name === name);
            return tool ? { maxTurns: tool.maxTurns, needsApproval: tool.needsApproval } : undefined;
        };
        const approvalResolver = this.options.approvalResolver
            ?? ((id: string, sig: AbortSignal) => this._awaitToolDecision(id, sig));

        const usage = await streamRunner({
            messageId,
            baseRequest,
            transportCall,
            toolLookup,
            toolConfigLookup,
            approvalResolver,
            emitter,
            signal,
            maxTurns: this.options.maxTurns,
            // Forwarded, because the option's own JSDoc promises it means one thing
            // whichever loop runs — and the fix that introduced it only wired the
            // inline path, so setting it was silently ignored here. Exactly the
            // asymmetry the option was added to remove.
            toolTimeoutMs: this.options.toolTimeoutMs,
            // Match the inline loop's id conventions: prefixed artifact ids, but a
            // BARE uuid for the synthetic tool (the adapter renders `tool-<id>`).
            idGen: (prefix) => (prefix === 'synthetic-tool' ? uuid() : `${prefix}-${uuid()}`),
        });
        return usage ?? undefined;
    }

    /**
     * Updates an existing message or appends a new error if ID lookup fails
     */
    private _updateMessage(target: AparteChatTargetElement, messageId: string, updates: Partial<AparteMessage>) {
        if (target.updateMessage) {
            target.updateMessage(messageId, updates);
        }
    }

    /**
     * Gracefully handles errors by updating the current message instead of duplicating it
     */
    private _handleLifecycleError(target: AparteChatTargetElement, messageId: string, error: AparteError) {
        // A valid AparteErrorSegment: the renderer keys off `id` + `content`, so the
        // old `code`/`data` fields were dead here (the full error — including
        // `error.data` — still reaches consumers via the `aparte-message-error` event
        // below). The error code is preserved as `details`.
        const errorSegment: AparteErrorSegment = {
            id: `error-${uuid()}`,
            type: 'error',
            content: error.message,
            details: error.code,
        };

        if (target.updateMessage) {
            // ATOMIC UPDATE (V2)
            target.updateMessage(messageId, {
                status: 'error',
                segments: [errorSegment]
            });
        } else if (target.appendMessage) {
            // FALLBACK (V1) - Still try to be smart
            target.appendMessage({
                id: messageId,
                role: 'assistant',
                status: 'error',
                timestamp: Date.now(),
                segments: [errorSegment]
            });
        }

        dispatchLifecycleEvent(target, 'aparte-message-error', { messageId, error });
    }

    /** Warn once per client for an unrecognised stream event, then carry on. */
    private _warnedUnknownEvents = new Set<string>();
    private _warnUnknownStreamEvent(event: unknown): void {
        const type = String((event as { type?: unknown })?.type ?? 'undefined');
        if (this._warnedUnknownEvents.has(type)) return;
        this._warnedUnknownEvents.add(type);
        console.warn(
            `[AparteClient] Ignoring unrecognised stream event "${type}". The reply is`
            + ' unaffected; this usually means the provider or its SDK emits a part this'
            + ' version of aparté does not map yet.',
        );
    }
}
