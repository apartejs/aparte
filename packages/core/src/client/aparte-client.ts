import { AparteConfig, AparteConfigClass } from '../config/aparte-config.js';
import { AparteStreamParser, deriveArtifactKind } from '../parsers/aparte-stream-parser.js';
import { registerDefaultRenderers } from '../renderers/segment-renderers.js';
import { createStreamAdapter, readableToAsyncIterable } from './stream-adapter.js';
import type { AparteStreamRunner, StreamAdapterTarget } from './stream-adapter.js';
import type { AparteSegment, AparteStreamEvent, AparteMessage, AparteErrorSegment } from '../types/index.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import type { AparteThinkingSegment } from '../types/segments.js';
import type { AparteToolCallSegment } from '../types/segments.js';
import type { AparteToolCall, AparteTool } from '../types/tools.js';
import { AparteChatRequest, AparteChatMessage, AparteContentPart, AparteUsage, AparteRequestMeta, AparteArtifactHint, contentToText } from '../types/chat.js';
import { AparteError, AparteErrorCode } from '../types/errors.js';

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

/** Timeout (ms) for a tool handler to resolve before it is aborted */
const TOOL_HANDLER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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
     * `needsApproval`. Defaults to a global `document` `aparte:tool-decision`
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
     * Optional headless stream-loop runner (Lot 3 seam). When set, `_streamLoop`
     * delegates the agentic loop to it and renders via the core adapter
     * ({@link createStreamAdapter}); when absent, the built-in inline loop runs.
     * `apps/home` injects `@aparte/engine`'s `runStreamAgent` here so the cloud
     * path shares one tested loop — core stays the zero-dep leaf and never
     * imports engine. Same injection pattern as {@link approvalResolver} /
     * {@link compactionSelector}. See {@link AparteStreamRunner}.
     */
    streamRunner?: AparteStreamRunner;

    /**
     * Optional request interceptor to modify the chat request before sending.
     */
    requestInterceptor?: (request: AparteChatRequest) => AparteChatRequest | Promise<AparteChatRequest>;

    /**
     * Whether to automatically register default segment renderers.
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
     * When set, the client will only handle `aparte-send`, `aparte:retry`, `aparte:edit`
     * and `aparte:abort` events whose `detail.targetId` matches this id.
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
     * Config this client reads (providers, model selection, tools, system
     * prompt). Defaults to the global `AparteConfig` singleton. Pass a host's
     * instance config when scoping a client to one chat among several
     * (pairs with `scopeToTargetId`).
     */
    config?: AparteConfigClass;
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
    private _boundCompactHandler: (() => void) | null = null;
    private _boundRetryHandler: ((e: Event) => void) | null = null;
    private _boundEditHandler: ((e: Event) => void) | null = null;
    private _activeToolControllers: Set<AbortController> = new Set();
    private _isAborted = false;
    /** Aborts the in-flight vendor/transport fetch when the user stops a stream. */
    private _streamController: AbortController | null = null;
    private options: AparteClientOptions;
    /** Config read by this client — an instance config, or the global default. */
    private readonly _config: AparteConfigClass;

    constructor(options: AparteClientOptions = {}) {
        this.options = {
            autoRegister: true,
            ...options
        };
        this._config = options.config ?? AparteConfig;

        if (this.options.autoRegister) {
            registerDefaultRenderers();
        }

        this._setupListeners();
    }

    /**
     * Sets up the event listeners.
     * This is called once in the constructor.
     */
    private _setupListeners(): void {
        if (this._boundHandler) return; // Already set up

        this._boundHandler = async (e: Event) => {
            const event = e as CustomEvent;
            if (event.type !== 'aparte-send') return;
            // Scope guard: ignore events not for this instance
            if (this.options.scopeToTargetId) {
                const evtTargetId = (event.detail as any)?.targetId as string | undefined;
                if (evtTargetId && evtTargetId !== this.options.scopeToTargetId) return;
            }
            // Reset abort flag and cancel any tool calls from a previous turn
            this._isAborted = false;
            for (const controller of this._activeToolControllers) {
                controller.abort();
            }
            this._activeToolControllers.clear();

            await this._handleSend(event);
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
                if (this.options.scopeToTargetId) {
                    const evtTargetId = ((e as CustomEvent)?.detail as any)?.targetId as string | undefined;
                    if (evtTargetId && evtTargetId !== this.options.scopeToTargetId) return;
                }
                this.abort();
            };
        }
        window.addEventListener('aparte:abort', this._boundAbortHandler);
        if (!this._boundCompactHandler) {
            this._boundCompactHandler = () => { void this.compact(); };
        }
        window.addEventListener('aparte:compact', this._boundCompactHandler);

        if (!this._boundRetryHandler) {
            this._boundRetryHandler = (e: Event) => {
                const evt = e as CustomEvent;
                if (this.options.scopeToTargetId) {
                    const evtTargetId = (evt.detail as any)?.targetId as string | undefined;
                    if (evtTargetId && evtTargetId !== this.options.scopeToTargetId) return;
                }
                void this._handleRetry(evt);
            };
        }
        window.addEventListener('aparte:retry', this._boundRetryHandler);

        if (!this._boundEditHandler) {
            this._boundEditHandler = (e: Event) => {
                const evt = e as CustomEvent;
                if (this.options.scopeToTargetId) {
                    const evtTargetId = (evt.detail as any)?.targetId as string | undefined;
                    if (evtTargetId && evtTargetId !== this.options.scopeToTargetId) return;
                }
                void this._handleEdit(evt);
            };
        }
        window.addEventListener('aparte:edit', this._boundEditHandler);
    }

    /**
     * Stop listening.
     */
    stop(): void {
        if (!this._boundHandler) return;
        window.removeEventListener('aparte-send', this._boundHandler);
        this._boundHandler = null;
        if (this._boundAbortHandler) {
            window.removeEventListener('aparte:abort', this._boundAbortHandler);
            this._boundAbortHandler = null;
        }
        if (this._boundCompactHandler) {
            window.removeEventListener('aparte:compact', this._boundCompactHandler);
            this._boundCompactHandler = null;
        }
        if (this._boundRetryHandler) {
            window.removeEventListener('aparte:retry', this._boundRetryHandler);
            this._boundRetryHandler = null;
        }
        if (this._boundEditHandler) {
            window.removeEventListener('aparte:edit', this._boundEditHandler);
            this._boundEditHandler = null;
        }
    }

    /**
     * Abort the current streaming response and all active tool calls.
     * Dispatches `apartemessageaborted` on the target element.
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
     * Human-in-the-loop: wait for an `aparte:tool-decision` event matching this
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
                document.removeEventListener('aparte:tool-decision', onDecision as EventListener);
                signal.removeEventListener('abort', onAbort);
            };
            const onDecision = (e: Event) => {
                const detail = (e as CustomEvent).detail as { toolCallId?: string; approved?: boolean; payload?: unknown } | undefined;
                if (detail?.toolCallId !== toolCallId) return;
                cleanup();
                resolve({ approved: detail?.approved === true, payload: detail?.payload });
            };
            const onAbort = () => { cleanup(); resolve({ approved: false }); };
            document.addEventListener('aparte:tool-decision', onDecision as EventListener);
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }

    /**
     * Resolve the auth for a provider: `options.keyResolver` takes precedence,
     * then the AparteConfig key channel (`setKeyProvider`) so a key registered
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
     * Compact the current conversation: summarize all messages via the AI,
     * clear the viewport, then inject the summary as a single context message.
     *
     * Triggered programmatically or by dispatching `window.dispatchEvent(new CustomEvent('aparte:compact'))`.
     * Dispatches `aparte:compact-done` on window when complete, or `aparte:compact-error` on failure.
     */
    async compact(): Promise<void> {
        // 1. Resolve target element
        interface CompactTarget extends HTMLElement {
            getMessages?(): AparteMessage[];
            appendMessage?(msg: AparteMessage): void;
        }
        let target: CompactTarget | null = null;
        if (this.options.targetResolver) {
            target = this.options.targetResolver() as CompactTarget | null;
        }
        if (!target) {
            // Walk the DOM for any element exposing getMessages
            const candidates = document.querySelectorAll<CompactTarget>('aparte-chat, [data-aparte-chat]');
            for (const el of Array.from(candidates)) {
                if (typeof (el as any).getMessages === 'function') {
                    target = el;
                    break;
                }
            }
        }
        if (!target) {
            window.dispatchEvent(new CustomEvent('aparte:compact-error', { detail: { error: 'No aparte-chat target found' } }));
            return;
        }

        const messages: AparteMessage[] = target.getMessages?.() ?? [];
        if (messages.length === 0) {
            window.dispatchEvent(new CustomEvent('aparte:compact-done', { detail: { skipped: true } }));
            return;
        }

        // Decide what to summarize (`drop`) vs preserve verbatim (`keep`).
        // Default: drop everything (summarize all, replace all — legacy behaviour).
        const selector = this.options.compactionSelector
            ?? ((m: AparteMessage[]) => ({ keep: [] as AparteMessage[], drop: m }));
        const { keep, drop } = selector(messages);
        if (drop.length === 0) {
            // Nothing old enough to summarize (e.g. already within budget).
            window.dispatchEvent(new CustomEvent('aparte:compact-done', { detail: { skipped: true } }));
            return;
        }

        // 2. Resolve provider + model
        const config = this._config.getModelConfig();
        const providerId = config.defaultProvider;
        if (!providerId) {
            window.dispatchEvent(new CustomEvent('aparte:compact-error', { detail: { error: 'No provider configured' } }));
            return;
        }
        const provider = this._config.getAIProvider(providerId);
        if (!provider) {
            window.dispatchEvent(new CustomEvent('aparte:compact-error', { detail: { error: `Provider '${providerId}' not found` } }));
            return;
        }

        // 3. Dispatch start so host can show loading state
        window.dispatchEvent(new CustomEvent('aparte:compact-start'));

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

            // 6. Call provider (non-streaming)
            const response = await this._config.getTransport().chat(provider, summarizeRequest, authConfig, { providerId: provider.id });
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

            // 7. Clear viewport and inject summary
            window.dispatchEvent(new CustomEvent('aparte:reset'));

            // Small delay to let clearAll() finish DOM cleanup
            await new Promise<void>(resolve => setTimeout(resolve, 50));

            target.appendMessage?.({
                id: crypto.randomUUID(),
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
            window.dispatchEvent(new CustomEvent('aparte:compact-done', { detail: { summary, kept: keep.length } }));

        } catch (err: any) {
            console.error('[AparteClient] compact() failed:', err);
            window.dispatchEvent(new CustomEvent('aparte:compact-error', { detail: { error: err?.message ?? String(err) } }));
        }
    }

    /**
     * Handle aparte:retry — add a sibling branch to the assistant message and re-stream
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
        if (!messageId) return;

        interface RetryTarget extends HTMLElement {
            appendMessage?(msg: AparteMessage): void;
            addSiblingOf?(existingId: string, newMsg: AparteMessage): string | null;
            updateMessage?(id: string, updates: Partial<AparteMessage>): void;
            addSegment?(seg: AparteSegment): void;
            getMessages?(): AparteMessage[];
        }

        const targetElement = this._resolveTarget<RetryTarget>(targetId);
        if (!targetElement) {
            console.warn('[AparteClient] aparte:retry — no target found');
            return;
        }

        // Build history BEFORE calling addSiblingOf (getMessages() returns active path)
        const allMessages: AparteMessage[] = targetElement.getMessages?.() ?? [];
        const retryIdx = allMessages.findIndex(m => m.id === messageId);
        const retryMsg = retryIdx >= 0 ? allMessages[retryIdx] : undefined;
        // For user messages: include the user message in history (AI needs to see the question).
        // For assistant messages: exclude it (we are regenerating that response).
        const sliceEnd = retryMsg?.role === 'user' ? retryIdx + 1 : retryIdx;
        const historyMessages = retryIdx > 0 ? allMessages.slice(0, sliceEnd) : allMessages;

        // Create new sibling message and get its ID for streaming
        const newMsg: AparteMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: '',
            status: 'pending',
            timestamp: Date.now(),
        };
        const newMessageId = (targetElement as any).addSiblingOf?.(messageId, newMsg) ?? newMsg.id;

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

        const registeredTools = this._toolsForCurrentModel();

        let baseRequest: AparteChatRequest = {
            messages: [...systemMessages, ...chatMessages],
            modelId: config.defaultModel || '',
            stream: true,
            tools: registeredTools.length ? registeredTools : undefined,
            // A retry must produce a DIFFERENT answer. Greedy decoding is a
            // pure function of the input — a re-run is byte-identical — so the
            // retry opts into sampling: temperature > 0 makes the worker turn
            // on do_sample. Variation comes from the in-decoder RNG; no seed
            // needed (and JS Math.random() isn't seedable anyway).
            temperature: 0.4,
        };

        if (this.options.requestInterceptor) {
            baseRequest = await this.options.requestInterceptor(baseRequest);
        }
        if (baseRequest.toolChoice === 'none') {
            baseRequest = { ...baseRequest, tools: undefined };
        }

        this._isAborted = false;
        this._dispatchLifecycleEvent(targetElement, 'apartemessagestart', { messageId: newMessageId, role: 'assistant' });

        try {
            const usage = await this._streamLoop(targetElement, newMessageId, provider, baseRequest, authConfig);
            this._dispatchLifecycleEvent(targetElement, 'apartemessagedone', { messageId: newMessageId, role: 'assistant', usage });
        } catch (error: any) {
            const aparteError = AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR);
            this._handleLifecycleError(targetElement, newMessageId, aparteError);
        }
    }

    /**
     * Handle aparte:edit — update the user message in place, truncate all subsequent
     * messages, then re-stream a fresh assistant response.
     */
    private async _handleEdit(event: CustomEvent): Promise<void> {
        const { messageId, content: newContent, targetId } = event.detail ?? {};
        if (!messageId || newContent === undefined) return;

        interface EditTarget extends HTMLElement {
            appendMessage?(msg: AparteMessage): void;
            truncateFrom?(id: string): void;
            truncateResponsesAfter?(userMessageId: string): void;
            updateMessage?(id: string, updates: Partial<AparteMessage>): void;
            addSegment?(seg: AparteSegment): void;
            getMessages?(): AparteMessage[];
        }

        const targetElement = this._resolveTarget<EditTarget>(targetId);
        if (!targetElement) {
            console.warn('[AparteClient] aparte:edit — no target found');
            return;
        }

        // 1. Update the user message content
        (targetElement as any).updateMessage?.(messageId, { content: newContent });

        // 2. Collect all messages, find index of edited message
        const allMessages: AparteMessage[] = targetElement.getMessages?.() ?? [];
        const editIdx = allMessages.findIndex(m => m.id === messageId);

        // 3. Remove ALL previous responses to the edited user message.
        //    truncateResponsesAfter clears every sibling branch so the new
        //    response starts as the only child (sibling count = 1).
        //    Fall back to truncateFrom on the active next message for older hosts.
        if ((targetElement as any).truncateResponsesAfter) {
            (targetElement as any).truncateResponsesAfter(messageId);
        } else {
            const nextAssistantId = editIdx >= 0 && editIdx + 1 < allMessages.length
                ? allMessages[editIdx + 1]?.id
                : undefined;
            if (nextAssistantId) {
                (targetElement as any).truncateFrom?.(nextAssistantId);
            }
        }

        // 4. Build new history up to and including the edited user message
        const historyMessages = editIdx >= 0 ? allMessages.slice(0, editIdx + 1) : allMessages;
        const chatMessages = this._messagesToChatMessages(historyMessages);

        const systemMessages: import('../types/chat.js').AparteChatMessage[] = [];
        const userSystemPrompt = this._config.resolveSystemPrompt();
        if (userSystemPrompt) systemMessages.push({ role: 'system', content: userSystemPrompt });

        const registeredTools = this._toolsForCurrentModel();

        const config = this._config.getModelConfig();
        const providerId = config.defaultProvider;
        if (!providerId) return;
        const provider = this._config.getAIProvider(providerId);
        if (!provider) return;

        const authConfig = await this._resolveAuth(providerId);

        const newMessageId = crypto.randomUUID();
        targetElement.appendMessage?.({
            id: newMessageId,
            role: 'assistant',
            content: '',
            status: 'pending',
            timestamp: Date.now()
        });

        let baseRequest: AparteChatRequest = {
            messages: [...systemMessages, ...chatMessages],
            modelId: config.defaultModel || '',
            stream: true,
            tools: registeredTools.length ? registeredTools : undefined
        };

        if (this.options.requestInterceptor) {
            baseRequest = await this.options.requestInterceptor(baseRequest);
        }
        if (baseRequest.toolChoice === 'none') {
            baseRequest = { ...baseRequest, tools: undefined };
        }

        this._isAborted = false;
        this._dispatchLifecycleEvent(targetElement, 'apartemessagestart', { messageId: newMessageId, role: 'assistant' });

        try {
            const usage = await this._streamLoop(targetElement, newMessageId, provider, baseRequest, authConfig);
            this._dispatchLifecycleEvent(targetElement, 'apartemessagedone', { messageId: newMessageId, role: 'assistant', usage });
        } catch (error: any) {
            const aparteError = AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR);
            this._handleLifecycleError(targetElement, newMessageId, aparteError);
        }
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

        // Define interface for the target element (AparteChat)
        interface AparteChatElement extends HTMLElement {
            appendMessage(message: AparteMessage): void;
            updateMessage?(id: string, updates: Partial<AparteMessage>): void;
            updateLastMessage(content: string, options?: { append?: boolean }): void;
            addSegment?(segment: AparteSegment): void;
            updateSegment?(segmentId: string, updates: Partial<AparteSegment>): void;
            removeSegment?(segmentId: string): void;
            typeName?(text: string): void;
            getMessages?(): AparteMessage[];
        }

        // 1. Use targetId from event detail — the most reliable path.
        //    aparte-chat-input sets detail.targetId = host.id (set by AparteChatComponent).
        //    document.getElementById works even when aparte-chat-input is temporarily detached.
        let targetElement: AparteChatElement | null = null;
        const targetId = (event.detail as any)?.targetId as string | undefined;
        if (targetId) {
            const byId = document.getElementById(targetId) as AparteChatElement | null;
            if (byId && typeof byId.appendMessage === 'function') {
                targetElement = byId;
            } else {
                console.warn('[AparteClient] ⚠️ targetId present but element not found or missing appendMessage:', targetId);
            }
        }

        // 2. User-supplied resolver (e.g. provided via APARTE_CLIENT_OPTIONS)
        if (!targetElement && this.options.targetResolver) {
            const resolved = this.options.targetResolver() as AparteChatElement | null;
            if (resolved && typeof resolved.appendMessage === 'function') {
                targetElement = resolved;
            }
        }

        // 3. Walk up the event bubble chain as last resort
        if (!targetElement) {
            let walker: AparteChatElement | null = event.target as any;
            while (walker && typeof walker.appendMessage !== 'function') {
                walker = walker.parentElement as any;
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
                const resolved = this._asRenderTarget<AparteChatElement>(candidate);
                if (resolved) {
                    targetElement = resolved;
                    break;
                }
            }
        }

        if (!targetElement) {
            console.warn('[AparteClient] ⚠️ No target element found with appendMessage support. Provide a targetResolver in AparteClientOptions or ensure aparte-chat-input has a `target` attribute.');
            return;
        }

        const messageId = crypto.randomUUID();
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
        targetElement.appendMessage({
            id: messageId,
            role: 'assistant',
            content: '',
            status: 'pending',
            timestamp: Date.now()
        });

        // Notify Start
        this._dispatchLifecycleEvent(targetElement, 'apartemessagestart', { messageId, role: 'assistant' });

        try {
            // 3. Resolve Keys
            let authConfig: string | Record<string, string> | undefined;
            if (this.options.keyResolver) {
                const resolved = await this.options.keyResolver(providerId);
                if (resolved) authConfig = resolved;
            }
            // Fallback to the AparteConfig key channel (setKeyProvider) so a key
            // registered there actually reaches the chat — one key source on the happy path.
            if (authConfig === undefined) {
                const key = await this._config.getKey(providerId);
                if (key) authConfig = key;
            }

            // 4. Build base request
            const rawFiles: File[] = Array.isArray(event.detail?.files) ? event.detail.files : [];
            // rawFileInject controls what reaches the LLM as raw content :
            //   'none'        → nothing inline. RAG handles all file types (incl. images).
            //   'images-only' → images inline, text/docs to RAG via requestInterceptor.
            //   'all' (default) → images + text files inline. Default for cloud SaaS providers.
            const filesToInject =
                this.options.rawFileInject === 'none' ? [] :
                this.options.rawFileInject === 'images-only' ? rawFiles.filter(f => f.type.startsWith('image/')) :
                rawFiles;
            const contentParts = filesToInject.length > 0 ? await this._filesToContentParts(filesToInject) : [];
            const registeredTools = this._toolsForCurrentModel();

            let baseRequest: AparteChatRequest = {
                messages: this._buildMessages(content, targetElement, contentParts.length > 0 ? contentParts : undefined),
                modelId: modelId || config.defaultModel || '',
                stream: true,
                tools: registeredTools.length ? registeredTools : undefined
            };

            if (this.options.requestInterceptor) {
                baseRequest = await this.options.requestInterceptor(baseRequest);
            }

            // Apply toolChoice: 'none' — strip tools so the model never sees them
            if (baseRequest.toolChoice === 'none') {
                baseRequest = { ...baseRequest, tools: undefined };
            }

            // 5. Execute Chat — with tool use loop
            const usage = await this._streamLoop(targetElement, messageId, provider, baseRequest, authConfig);

            // Notify Done
            this._dispatchLifecycleEvent(targetElement, 'apartemessagedone', { messageId, role: 'assistant', usage });

        } catch (error: any) {
            console.error('[AparteClient] Chat failed:', error);
            const aparteError = AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR);
            this._handleLifecycleError(targetElement, messageId, aparteError);
        }
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

    private _extractText(message: AparteMessage): string {
        if (typeof message.content === 'string' && message.content) return message.content;
        if (!message.segments) return '';
        return message.segments
            .filter(s => s.type === 'text' || s.type === 'code')
            .map(s => (s as any).content ?? '')
            .join('\n')
            .trim();
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

        while (remaining.length > 0) {
            if (xml.state === 'normal') {
                const tagStart = remaining.indexOf('<artifact');
                if (tagStart === -1) {
                    // Pure chat text — route through normal text parser
                    const r = textParser.parse(remaining);
                    for (const seg of r.segments) {
                        if (!streamingSegmentIds.has(seg.id)) {
                            targetElement.addSegment?.(seg);
                            streamingSegmentIds.add(seg.id);
                        } else if ('content' in seg) {
                            targetElement.updateSegment?.(seg.id, { content: (seg as any).content });
                        }
                    }
                    const active = textParser.getState().activeSegment;
                    if (active) {
                        if (!streamingSegmentIds.has(active.id)) {
                            targetElement.addSegment?.(active);
                            streamingSegmentIds.add(active.id);
                        } else {
                            targetElement.updateSegment?.(active.id, { content: (active as any).content });
                        }
                    } else if (!r.segments.length) {
                        if (targetElement.typeName) targetElement.typeName(remaining);
                        else targetElement.updateLastMessage?.(remaining, { append: true });
                    }
                    remaining = '';
                } else {
                    // Emit chat text before the opening tag
                    const before = remaining.slice(0, tagStart);
                    if (before) {
                        const r = textParser.parse(before);
                        for (const seg of r.segments) {
                            if (!streamingSegmentIds.has(seg.id)) {
                                targetElement.addSegment?.(seg);
                                streamingSegmentIds.add(seg.id);
                            }
                        }
                        if (!r.segments.length && !textParser.getState().activeSegment) {
                            if (targetElement.typeName) targetElement.typeName(before);
                            else targetElement.updateLastMessage?.(before, { append: true });
                        }
                    }
                    xml.scanBuf = remaining.slice(tagStart);
                    remaining = '';
                    xml.state = 'scanning';
                }
            } else if (xml.state === 'scanning') {
                // Accumulate until we have the full opening tag (ends with >)
                xml.scanBuf += remaining;
                remaining = '';
                const gtIdx = xml.scanBuf.indexOf('>');
                if (gtIdx !== -1) {
                    const tag = xml.scanBuf.slice(0, gtIdx + 1);
                    // Parse mimeType and title attributes (single or double quotes)
                    const mimeMatch = /mimeType=['"]([^'"]+)['"]/.exec(tag);
                    const titleMatch = /title=['"]([^'"]+)['"]/.exec(tag);
                    xml.mime = mimeMatch?.[1] ?? artifactXmlHint.mimeType;
                    xml.title = titleMatch?.[1] ?? artifactXmlHint.kind;
                    xml.kind = deriveArtifactKind(xml.mime, artifactXmlHint.kind);
                    xml.segId = `artifact-xml-${crypto.randomUUID()}`;
                    xml.content = '';
                    const openSeg: import('../types/segments.js').AparteArtifactSegment = {
                        id: xml.segId, type: 'artifact',
                        mimeType: xml.mime, artifactType: xml.kind,
                        title: xml.title, content: '',
                    };
                    targetElement.addSegment?.(openSeg);
                    streamingSegmentIds.add(xml.segId);
                    this._dispatchArtifactLifecycle(targetElement, messageId, openSeg, artifactProgress, false);
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
                    targetElement.updateSegment?.(xml.segId!, { content: xml.content, inline: isInline } as any);
                    this._dispatchArtifactLifecycle(targetElement, messageId, finalSeg, artifactProgress, true);
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
                        this._dispatchArtifactLifecycle(targetElement, messageId, {
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

        const syntheticId = crypto.randomUUID();
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
        const timeout = setTimeout(() => controller.abort(), TOOL_HANDLER_TIMEOUT_MS);
        try {
            const result = await handler(syntheticCall, controller.signal);
            targetElement.updateSegment?.(toolSeg.id, { status: 'resolved', result: result.content });
            messages.push({ role: 'tool_call', content: '', toolCalls: [syntheticCall] });
            messages.push({ role: 'tool_result', content: result.content, toolCallId: syntheticId });
            // Strip toolChoice + tools from the follow-up LLM call — it should just answer.
            return { baseRequest: { ...baseRequest, toolChoice: 'none', tools: undefined }, skip: false };
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                targetElement.updateSegment?.(toolSeg.id, { status: 'aborted' });
                return { baseRequest, skip: true };
            }
            throw err;
        } finally {
            clearTimeout(timeout);
            this._activeToolControllers.delete(controller);
        }
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
        const streamController = new AbortController();
        this._streamController = streamController;

        // ── Injected stream runner (Lot 3 seam) ──────────────────────────────
        // When a headless runner is injected (apps/home wires @aparte/engine's
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
                this._dispatchLifecycleEvent(targetElement, 'apartemessageaborted', { messageId });
                break;
            }

            turns++;
            if (turns > globalMaxTurns) {
                console.warn(`[AparteClient] maxTurns (${globalMaxTurns}) exceeded — stopping loop.`);
                targetElement.addSegment?.({
                    id: `max-turns-${crypto.randomUUID()}`,
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
                    const { artifactRaw: _dropped, pipeline: _p, ...restMeta } = (phaseMeta ?? {}) as any;
                    phaseMeta = restMeta;
                }
            }
            const request: AparteChatRequest = { ...baseRequest, messages: phaseMessages, _meta: phaseMeta };
            const response = await this._config.getTransport().chat(provider, request, authConfig, { providerId: provider.id, signal: streamController.signal });

            if (typeof response === 'string') {
                this._updateMessage(targetElement, messageId, { content: response, status: 'completed' });
                return undefined;
            }

            // Streaming mode
            const reader = (response as ReadableStream<AparteStreamEvent>).getReader();
            const textParser = new AparteStreamParser();
            const streamingSegmentIds = new Set<string>();
            /**
             * Lifecycle bookkeeping for artifact segments. Maps a segment id to the
             * length of content already broadcast via `aparte:artifact-delta`. Used to
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
                rawSegId = `artifact-raw-${crypto.randomUUID()}`;
                const rawSeg: import('../types/segments.js').AparteArtifactSegment = {
                    id: rawSegId, type: 'artifact',
                    mimeType: artifactRawHint.mimeType,
                    artifactType: artifactRawHint.kind,
                    title: artifactRawHint.kind,
                    content: '',
                };
                targetElement.addSegment?.(rawSeg);
                streamingSegmentIds.add(rawSegId);
                this._dispatchArtifactLifecycle(targetElement, messageId, rawSeg, artifactProgress, false);
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

            try {
                while (true) {
                    // Honor abort INSIDE the SSE event loop too (not only between
                    // tool-call turns). Without this, late events buffered after
                    // a `aparte:abort` (e.g. after the user switches conversation
                    // mid-stream) keep mutating the target's last message — which
                    // may now belong to a different conversation, causing the
                    // user message in the new conv to be overwritten by the
                    // assistant reply from the old one.
                    if (this._isAborted) {
                        try { reader.cancel(); } catch { /* best effort */ }
                        this._dispatchLifecycleEvent(targetElement, 'apartemessageaborted', { messageId });
                        continueLoop = false;
                        break;
                    }
                    const { done, value: event } = await reader.read();
                    if (done) break;

                    switch (event.type) {
                        case 'thinking': {
                            thinkingContent += event.delta;
                            if (!thinkingSegmentId) {
                                const seg: AparteThinkingSegment = {
                                    id: `think-${crypto.randomUUID()}`,
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
                                this._dispatchArtifactLifecycle(targetElement, messageId, {
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
                                    targetElement.updateSegment?.(segment.id, { content: (segment as any).content });
                                }
                                if (segment.type === 'artifact') {
                                    this._dispatchArtifactLifecycle(targetElement, messageId, segment, artifactProgress, true);
                                }
                            }
                            const active = textParser.getState().activeSegment;
                            if (active) {
                                if (!streamingSegmentIds.has(active.id)) {
                                    targetElement.addSegment?.(active);
                                    streamingSegmentIds.add(active.id);
                                    if (active.type === 'artifact') {
                                        this._dispatchArtifactLifecycle(targetElement, messageId, active, artifactProgress, false);
                                    }
                                } else {
                                    targetElement.updateSegment?.(active.id, { content: (active as any).content });
                                    if (active.type === 'artifact') {
                                        this._dispatchArtifactLifecycle(targetElement, messageId, active, artifactProgress, false);
                                    }
                                }
                            } else if (result.segments.length === 0) {
                                if (targetElement.typeName) targetElement.typeName(event.delta);
                                else targetElement.updateLastMessage?.(event.delta, { append: true });
                            }
                            break;
                        }
                        case 'tool_use': {
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
                                const kind = mimeType.includes('react') ? 'react'
                                    : mimeType.includes('html') ? 'html'
                                    : mimeType.includes('javascript') ? 'js'
                                    : mimeType.includes('css') ? 'css'
                                    : mimeType.includes('svg') ? 'svg'
                                    : mimeType.includes('json') ? 'json'
                                    : mimeType.includes('csv') ? 'csv'
                                    : mimeType.includes('markdown') ? 'markdown'
                                    : 'text';
                                const artifactSeg: import('../types/segments.js').AparteArtifactSegment = {
                                    id: `artifact-${event.id}`,
                                    type: 'artifact',
                                    mimeType,
                                    artifactType: kind,
                                    title: input.title ?? kind,
                                    content: input.content ?? '',
                                };
                                targetElement.addSegment?.(artifactSeg);
                                this._dispatchArtifactLifecycle(targetElement, messageId, artifactSeg, artifactProgress, true);

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
                                break;
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
                                continueLoop = false;
                                break;
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
                                    targetElement.dispatchEvent?.(new CustomEvent('aparte:tool-approval-request', {
                                        bubbles: true, composed: true,
                                        detail: { toolCallId: event.id, toolName: event.name, input: event.input }
                                    }));
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
                                        continueLoop = false;
                                        break;
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
                                const timeout = setTimeout(() => controller.abort(), TOOL_HANDLER_TIMEOUT_MS);

                                try {
                                    const result = await handler(
                                        { id: event.id, name: event.name, input: effectiveInput },
                                        controller.signal
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
                                } catch (err: any) {
                                    if (err?.name === 'AbortError') {
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
                            break;
                        }
                        case 'error':
                            throw new Error(event.message);
                        case 'done':
                            if (event.usage) lastUsage = event.usage;
                            break;
                    }
                }

                // Finalize text parser
                const finals = textParser.finalize();

                // ── artifactRaw finalize ──────────────────────────────────────
                if (artifactRawHint && rawSegId) {
                    const lineCount = rawContent.split('\n').length;
                    const isInline = lineCount < 15;
                    targetElement.updateSegment?.(rawSegId, { content: rawContent, inline: isInline } as any);
                    this._dispatchArtifactLifecycle(targetElement, messageId, {
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
                    targetElement.updateSegment?.(xmlCtx.segId, { content: xmlCtx.content, inline: isInline } as any);
                    this._dispatchArtifactLifecycle(targetElement, messageId, {
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
                            targetElement.updateSegment?.(promoted.id, promoted as any);
                        }
                    }
                }
                // ────────────────────────────────────────────────────────────

                for (const s of finals) {
                    if (!streamingSegmentIds.has(s.id)) {
                        targetElement.addSegment?.(s);
                    } else if ('content' in s) {
                        // finalize() appended the residual buffer — sync to DOM
                        targetElement.updateSegment?.(s.id, { content: (s as any).content });
                    }
                    if (s.type === 'artifact') {
                        this._dispatchArtifactLifecycle(targetElement, messageId, s, artifactProgress, true);
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
                        const pwId = `pw-${crypto.randomUUID()}`;
                        targetElement.addSegment?.({ id: pwId, type: 'pipeline-waiting' } as any);
                        // continueLoop stays true — next iteration handles the new phase
                    } else {
                        continueLoop = false;
                    }
                }

            } finally {
                reader.releaseLock();
            }
        }

        this._updateMessage(targetElement, messageId, { status: 'completed' });
        // Push usage onto the live bubble so the info action (stats popover)
        // is available immediately, even for consumers that don't listen for
        // `apartemessagedone`.
        if (lastUsage) {
            try {
                (targetElement as { setUsage?: (id: string, u: AparteUsage) => void })
                    .setUsage?.(messageId, lastUsage);
            } catch { /* viewport may not implement setUsage */ }
        }
        return lastUsage;
    }

    /**
     * Delegate `_streamLoop`'s agentic loop to an injected {@link AparteStreamRunner}
     * (Lot 3 seam), rendering its DOM-free events through {@link createStreamAdapter}.
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
        const toolLookup = (name: string) => this._config.getToolHandler(name);
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
            // Match the inline loop's id conventions: prefixed artifact ids, but a
            // BARE uuid for the synthetic tool (the adapter renders `tool-<id>`).
            idGen: (prefix) => (prefix === 'synthetic-tool' ? crypto.randomUUID() : `${prefix}-${crypto.randomUUID()}`),
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
        // `error.data` — still reaches consumers via the `apartemessageerror` event
        // below). The error code is preserved as `details`.
        const errorSegment: AparteErrorSegment = {
            id: `error-${crypto.randomUUID()}`,
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

        this._dispatchLifecycleEvent(target, 'apartemessageerror', { messageId, error });
    }

    private _dispatchLifecycleEvent(target: HTMLElement, name: string, detail: any) {
        target.dispatchEvent(new CustomEvent(name, {
            bubbles: true,
            composed: true,
            // Tag every lifecycle event with the target's id so several chats on
            // one page stay isolated — a composer reacts only to its own host's
            // turn (id-less single-instance pages still broadcast).
            detail: { targetId: target.id || undefined, ...detail },
        }));
    }

    /**
     * Dispatch the artifact lifecycle (`aparte:artifact-start` / `delta` / `ready`)
     * on the host bubble element. Idempotent for `start` (fires once per segment id)
     * and emits `delta` only when the body actually grew. `isFinal=true` fires `ready`.
     */
    private _dispatchArtifactLifecycle(
        target: HTMLElement,
        messageId: string,
        segment: any,
        progress: Map<string, number>,
        isFinal: boolean
    ): void {
        const id = segment.id as string;
        const content = (segment.content as string) ?? '';
        const seen = progress.get(id);

        if (seen === undefined) {
            // First time we see this artifact → start
            target.dispatchEvent(new CustomEvent('aparte:artifact-start', {
                bubbles: true,
                composed: true,
                detail: {
                    messageId,
                    segmentId: id,
                    mimeType: segment.mimeType,
                    artifactType: segment.artifactType,
                    title: segment.title,
                },
            }));
            progress.set(id, 0);
        }

        const lastLen = progress.get(id) ?? 0;
        if (content.length > lastLen) {
            const chunk = content.slice(lastLen);
            target.dispatchEvent(new CustomEvent('aparte:artifact-delta', {
                bubbles: true,
                composed: true,
                detail: { segmentId: id, chunk },
            }));
            progress.set(id, content.length);
        }

        if (isFinal) {
            target.dispatchEvent(new CustomEvent('aparte:artifact-ready', {
                bubbles: true,
                composed: true,
                detail: {
                    messageId,
                    segmentId: id,
                    mimeType: segment.mimeType,
                    artifactType: segment.artifactType,
                    title: segment.title,
                    content,
                },
            }));
        }
    }
}
