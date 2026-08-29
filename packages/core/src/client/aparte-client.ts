import { aparteGlobalConfig, AparteConfig } from '../config/aparte-config.js';
import { resolveConfig } from '../config/config-context.js';
import { runStreamAgent } from '@aparte/engine';

import { registerDefaultRenderers, declineDefaultRenderers } from '../renderers/segment-renderers.js';
import { createStreamAdapter, readableToAsyncIterable } from './stream-adapter.js';
import { dispatchLifecycleEvent } from './lifecycle-events.js';
import type { AparteStreamRunner, AparteStreamRunEmitter, StreamAdapterTarget } from './stream-adapter.js';
import type { AparteSegment, AparteStreamEvent, AparteMessage, AparteErrorSegment } from '../types/index.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import type { AparteToolCall, AparteTool } from '../types/tools.js';
import { AparteChatRequest, AparteChatMessage, AparteContentPart, AparteUsage } from '../types/chat.js';
import { AparteError, AparteErrorCode } from '../types/errors.js';
import { uuid } from '../utils/uuid.js';
import { requestUserInput } from '../elicitation/index.js';

/**
 * The imperative surface AparteClient drives on a chat target element
 * (`<aparte-chat-viewport>` directly, or a framework host via AparteChatHost).
 * Every method is optional so a partial/mock target degrades gracefully — the
 * client always calls them through optional chaining. Mirrors the shape the
 * wrappers and `AparteChatHost` already conform to.
 */
interface AparteChatTargetElement extends HTMLElement {
    appendMessage?(message: AparteMessage): void;
    updateMessage?(id: string, updates: Partial<AparteMessage>): void;
    updateLastMessage?(content: string, options?: { append?: boolean }): void;
    addSegment?(segment: AparteSegment): void;
    updateSegment?(segmentId: string, updates: Partial<AparteSegment>): void;
    removeSegment?(segmentId: string): void;
    getMessages?(): AparteMessage[];
    /**
     * One message by id, from the whole TREE — unlike `getMessages()`, which returns only
     * the currently active path.
     *
     * The distinction is load-bearing rather than a convenience: a retry or an edit moves
     * the superseded reply off the active path while leaving it in the tree, so anything
     * that looks a message up by id through `getMessages()` silently fails to find one that
     * still exists. `_handleLifecycleError` did exactly that and destroyed it.
     */
    getMessage?(id: string): AparteMessage | undefined;
    addSiblingOf?(existingId: string, newMessage: AparteMessage): string | null;
    truncateFrom?(id: string): void;
    truncateResponsesAfter?(userMessageId: string): void;
    typeName?(text: string): void;
}

/**
 * Resolves a human-in-the-loop tool approval for a `needsApproval` tool call.
 * Resolves `{ approved, payload? }`; the `signal` aborts a pending decision.
 *
 * It receives the CALL, not just its id. You cannot ask a person "run this?" without
 * naming what — the built-in channel needs the tool's name for its question, and an
 * id alone forced a lookup table filled by one event and read by another, which is the
 * shape that breaks in silence.
 */
export type AparteToolApprovalResolver = (
    call: { id: string; name: string; input: Record<string, unknown> },
    signal: AbortSignal,
) => Promise<{
    approved: boolean;
    payload?: unknown;
    /**
     * What the user said to do instead, on a refusal.
     *
     * It becomes the tool_result the model reads, which is possible at all only
     * because a refusal now hands the model a turn. Optional and additive: a resolver
     * that returns a bare `{ approved }` behaves exactly as before.
     */
    instruction?: string;
    /**
     * The refusal, verbatim, when nobody said anything — an approval policy that
     * refused on its own. Without it the model is told "the user rejected this",
     * which for a mode is a lie; with it, it reads the policy's own sentence.
     */
    reason?: string;
}>;

/** What a compaction summary goes out under, so the model reads it as context and not as the user's words. */
const COMPACTION_PREAMBLE =
    'The earlier part of this conversation was compacted. This is a summary of what came before; continue from it.';

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
     * `needsApproval`. Without one, the gate asks at the composer through
     * `requestUserInput`, like every other request for the user. Inject this to
     * decide from the call itself — it receives `(call, signal)` — or to drive
     * approval from a headless source (CLI / webhook) with no DOM.
     *
     * It owns the WHOLE decision: with one injected, an `AparteApprovalPolicy`
     * registered through `setApprovalPolicy()` — and therefore
     * `@aparte/plugin-approval`'s modes — is not consulted at all, neither for the
     * gate nor for the answer, and the tool's own `needsApproval` decides which
     * calls reach this resolver. Rule on the call here, or drop this option and use
     * a policy; do not expect both.
     *
     * On a refusal it may return an `instruction` (the user's words) or a `reason`
     * (nobody spoke), which the model reads as the tool result.
     */
    approvalResolver?: AparteToolApprovalResolver;

    /**
     * The stream-loop runner. Default: `@aparte/engine`'s `runStreamAgent`, rendered
     * through the core adapter ({@link createStreamAdapter}). Set it to wrap that loop
     * — `(opts) => runStreamAgent({ ...opts, onHistoryAppend })` for a host that owns
     * its transcript — or to replace it with a loop of your own that emits the same
     * events. Same injection pattern as {@link approvalResolver}. See {@link AparteStreamRunner}.
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
    private _boundRetryHandler: ((e: Event) => void) | null = null;
    private _boundEditHandler: ((e: Event) => void) | null = null;
    private _isAborted = false;

    /**
     * Does this window event belong to this client?
     *
     * One rule for all four handlers, because it used to be near-copies and
     * one omission: `aparte-compact` (answered here until 0.16.0) had no guard at all, so in the two-client
     * layout the JSDoc documents, a single compact event made BOTH clients run —
     * two paid summarisation calls against whichever chat the DOM scan found
     * first, and a global reset that wiped the other conversation.
     *
     * A scoped client also answers only events ADDRESSED to it. The old guard let
     * an untargeted event through to every scoped client, which turned one
     * broadcast into an action on every chat on the page.
     */
    private _isForThisInstance(e?: Event): boolean {
        // No event at all means a direct, programmatic call — not a broadcast, so
        // no addressing rule applies to it.
        if (!e) return true;
        const detail = (e as CustomEvent).detail as { targetId?: string } | undefined;

        const scope = this.options.scopeToTargetId;
        if (scope) return detail?.targetId === scope;

        /*
         * No `scopeToTargetId`, but a client given its own `config` is still not a
         * page-wide client: it must answer only the chats that resolve THAT config.
         *
         * Without this, `{ config }` scoped what the client READ and nothing about
         * what it ANSWERED. Two config-scoped clients on one page therefore both
         * ran a full agentic turn for every send — two provider calls, two paid
         * completions, and both replies appended into the single target the event
         * named. The showcase that demonstrates per-instance config constructed
         * exactly that pair, and its comment asserted the opposite.
         *
         * `scopeToTargetId` was the documented remedy and is not reachable from any
         * wrapper (they generate the host id internally and do not expose it), so a
         * framework consumer had no way to apply it.
         *
         * A client on the GLOBAL config is deliberately unchanged: it answers
         * everything, which is every single-chat app on the planet, and narrowing
         * that would be a silent break for the common case.
         */
        if (this._config === aparteGlobalConfig) return true;
        const target = this._resolveTarget(detail?.targetId);
        if (!target) return true;
        const owner = resolveConfig(target);
        /*
         * Reject only a target that demonstrably belongs to ANOTHER instance — one
         * whose boundary resolves a different, non-global config.
         *
         * Not "the target must resolve OUR config", which was the first attempt and
         * was too strict: passing `{ config }` without ever calling `attachConfig`
         * is a legitimate shape — the config as a settings bag for the one chat on
         * the page — and three existing tests do exactly that. A chat with no
         * boundary is unclaimed, so answering it is correct.
         */
        return owner === this._config || owner === aparteGlobalConfig;
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
     * What every fresh user action does before it starts a turn.
     *
     * Clearing the abort flag has to happen at the START of the action rather than inside
     * `_streamTurn`, which runs after the auth and file-reading awaits — a reset there
     * erased an abort that arrived while the user was still waiting for a large attachment
     * to be read.
     *
     * The superseded turn's TOOL handlers are not cancelled here, and do not need a
     * registry of their own: `_streamTurn` aborts the previous `_streamController`, and
     * the engine links every tool handler's controller to that run signal
     * (`invokeToolHandler`), so cutting the stream cuts its tools. A `Set<AbortController>`
     * used to sit here for that job and was never added to — three lines of loop over an
     * empty set, plus a paragraph describing a cancellation the method did not perform.
     */
    private _beginUserTurn(): void {
        this._isAborted = false;
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
            this._beginUserTurn();

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
    }

    /*
     * Two docblocks stood here, both describing `_awaitToolDecision` — the method
     * this replaced. Deleting a method and leaving its documentation is worse than
     * leaving the method: only the LAST comment before a declaration is its JSDoc,
     * so those two were floating prose, and one of them explained a DOM-containment
     * check as a live security property. It was the fix for a cross-chat hazard that
     * only existed because the decision travelled as a bubbling `document` event.
     * Routing through `requestUserInput` removed the hazard rather than guarding it,
     * so the guard is gone too — and a reader who found that comment would have
     * believed a containment check was still protecting them.
     */
    /**
     * Ask the human at the COMPOSER, and report what they decided.
     *
     * The default channel, replacing a `document` listener for `aparte-tool-decision`
     * that existed only because the buttons lived in a segment renderer with no
     * reference to this client. Routing through `requestUserInput` puts the decision
     * where every other request for the user already goes, which is the whole point:
     * one queue, one panel slot, one teardown, and the same behaviour whether the
     * request came from a tool handler or from this gate.
     *
     * The tool NAME is the question; the arguments stay in the transcript, on the pill
     * this request is anchored to. A panel capped at 50vh cannot hold a diff or a plan,
     * and the transcript is already scrollable, copyable and persisted.
     *
     * `aparte-tool-decision` is GONE with the buttons that dispatched it, and so is the
     * `document` listener that answered it. It existed only because a segment renderer
     * has no reference to this client; two seams that can disagree about who answers a
     * decision are one seam too many, and the ratified elicitation rule already said so
     * — "a typed presenter registered per config instance, never window events". A host
     * that wants to answer programmatically registers an `approvalResolver` (headless,
     * no DOM) or its own presenter, both strictly more capable than an id on an event.
     */
    private async _askForApproval(
        event: { id: string; name: string; input: Record<string, unknown> },
        signal: AbortSignal,
        target: HTMLElement,
    ): Promise<{ approved: boolean; payload?: unknown; instruction?: string }> {
        const answer = await requestUserInput({
            kind: 'approval',
            /*
             * A function, like the option labels below, and for the same reason: the
             * FRAME is locale text and follows a language switch while the question is
             * open. The tool's NAME is substituted into it and never translated — it is
             * wire format, the identifier the model called.
             */
            message: () => {
                const loc = this._config.getLocale();
                return (loc.approvalAsk ?? 'Run {tool}?').replace('{tool}', event.name);
            },
            // Functions, not strings, same as the question: these follow a language
            // switch while the request is open, which a resolved string cannot.
            options: [
                { value: 'allow', label: () => this._config.getLocale().approveTool ?? 'Approve', tone: 'affirm' },
                { value: 'deny', label: () => this._config.getLocale().rejectTool ?? 'Reject', tone: 'deny' },
            ],
            signal,
            target,
        });
        // `decline` is the corner escape, which for a decision means "not this": the
        // safe reading of an unanswered approval is never "go ahead".
        if (answer.action !== 'accept') return { approved: false };
        const content = answer.content as { option?: string; instruction?: string } | undefined;
        const instruction = content?.instruction?.trim();
        // Typed text with no option chosen IS the refusal — "no, do this instead" — so
        // the instruction alone denies. An option decides on its own.
        if (instruction) return { approved: false, instruction };
        return { approved: content?.option === 'allow' };
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
            // FINISHED, like the two abort paths below: the pending shell appended a few
            // lines up is a streaming message in the viewport's model until a terminal
            // status says otherwise, and with nothing saying it the transcript stayed
            // read-only — arrows, retry, edit — for the life of the page after one Stop
            // that landed while auth or an attachment was still being read.
            this._updateMessage(targetElement, messageId, { status: 'completed' });
            return;
        }
        dispatchLifecycleEvent(targetElement, 'aparte-message-start', { messageId, role: 'assistant' });
        // This turn's own controller: the terminal below is decided from ITS signal, not
        // from the client-wide `_isAborted`, which the next send resets before the
        // superseded turn has returned.
        const streamController = new AbortController();
        try {
            const usage = await this._streamLoop(targetElement, messageId, provider, baseRequest, authConfig, streamController);
            if (this._isAborted || streamController.signal.aborted) {
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
            if (this._isAborted || streamController.signal.aborted) {
                dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId });
                this._updateMessage(targetElement, messageId, { status: 'completed' });
                return;
            }
            const aparteError = AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR);
            this._handleLifecycleError(targetElement, messageId, aparteError);
        }
    }

    /**
     * Handle aparte-retry — add a sibling branch to the assistant message and re-stream
     * using the same conversation history minus the retried reply.
     */
    /**
     * The registered tools, unless the current model says it cannot call one.
     *
     * Single source for the gate, so send / retry / edit cannot drift — that drift
     * is what once shipped `tools` on the initial send while retry and edit omitted
     * them.
     *
     * The gate used to be "the model DECLARES function_calling", defaulting to
     * stripping — and that made the whole tool surface unreachable on the primary
     * documented path. Three things had to line up for a tool to be sent, and one
     * never did: the app sets a model id by hand (`setModelConfig`) or a selector
     * sets it from a fetched list, and in both cases the model's declared
     * capabilities are commonly unknown. `undefined` capabilities then read as "no
     * function calling", so `tools: []` went on the wire while `getTools()` held
     * the tool the app had explicitly registered. The model answered, correctly,
     * that it had no such tool, and nothing anywhere said why.
     *
     * So the question is now "did this model say it cannot", not "did it say it
     * can". Registering a tool is an explicit act by the app; silently dropping it
     * because a `/models` listing is terse is the library second-guessing the
     * developer. A model that declares its capabilities and omits function calling
     * is still honoured — that is a statement, and it is respected.
     *
     * Failure modes, both ways round: over-sending means a model that cannot use
     * tools does not call one, or its own endpoint rejects the array with an error
     * the developer can read. Under-sending was silent, total, and looked like a
     * lying model.
     */
    private _toolsForCurrentModel(): AparteTool[] {
        const capabilities = this._config.getCurrentModel()?.capabilities;
        const declinesTools = capabilities ? !capabilities.includes('function_calling') : false;
        return declinesTools ? [] : this._config.getTools();
    }

    private async _handleRetry(event: CustomEvent): Promise<void> {
        const { messageId, targetId } = event.detail ?? {};
        // The same opening every user action gets — see _beginUserTurn.
        this._beginUserTurn();

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

        const systemMessages = this._systemMessages();

        // Retry must produce a DIFFERENT answer than a byte-identical re-run:
        // temperature > 0 opts into sampling, whatever the provider — variation
        // comes from the decoder's own RNG, no seed involved. (`request.seed`
        // stays untouched: it is the caller's reproducibility knob, and writing
        // one here would defeat it.)
        await this._streamTurn(
            targetElement, newMessageId, provider,
            [...systemMessages, ...chatMessages], config.defaultModel || '',
            authConfig, { temperature: 0.4 },
        );
    }

    /**
     * The system messages a turn opens with: the app's own template, then the registered
     * tools' `systemPrompt`s.
     *
     * A helper rather than three copies. The two lines it replaces were written out at each
     * of the three turn entry points (send, retry, edit), which is exactly how the tool half
     * would have been added to two of them and forgotten in the third — the same shape as
     * the abort-flag asymmetry `_beginUserTurn` exists to prevent.
     */
    private _systemMessages(): AparteChatMessage[] {
        const messages: AparteChatMessage[] = [];
        const appPrompt = this._config.resolveSystemPrompt();
        if (appPrompt) messages.push({ role: 'system', content: appPrompt });
        const toolPrompts = this._config.resolveToolSystemPrompts();
        if (toolPrompts) messages.push({ role: 'system', content: toolPrompts });
        return messages;
    }

    /**
     * Handle aparte-edit — update the user message in place, truncate all subsequent
     * messages, then re-stream a fresh assistant response.
     */
    private async _handleEdit(event: CustomEvent): Promise<void> {
        const { messageId, content: newContent, targetId } = event.detail ?? {};
        // The same opening every user action gets — see _beginUserTurn.
        this._beginUserTurn();

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

        const systemMessages = this._systemMessages();

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
                content: this._wireText(m)
            }));
    }

    /** The "no model selected" warning is said once per client, not once per dropped send. */
    private _warnedNoModel = false;

    private async _handleSend(event: CustomEvent): Promise<void> {
        const { content, modelId, providerId: explicitProviderId } = event.detail;

        // The model gate is a POLICY, so the thing that runs the turn has to hold
        // it — not only the composer that draws it.
        //
        // `setRequireModelSelection(true)` means "no send before a model is chosen",
        // and `aparte-composer.submit()` honours it. But any other way of sending
        // walked straight past: an app's suggestion chip, a "try this prompt"
        // button, a host dispatching `aparte-send` itself. The turn then ran with
        // `config.defaultModel || ''` — an empty model id on the wire, i.e. a real
        // request to the provider that can only fail. Reported from an example: the
        // chips above the composer are clickable while the composer is still greyed
        // out, waiting for `GET /models`.
        //
        // Refused rather than queued: a send is a user action tied to a moment, and
        // holding it to replay after an async fetch would surprise anyone whose
        // fetch takes ten seconds. `warn` and not silence, because the developer is
        // the one who can fix it — an app that gates SHOULD also disable its own
        // buttons, and this is how it finds out it did not.
        if (this._config.getRequireModelSelection() && !this._config.hasSelectedModel() && !modelId) {
            console.warn(
                '[AparteClient] Send refused: requireModelSelection is on and no model is selected yet. '
                + 'The composer blocks this, but this send did not come from it — disable your own '
                + 'send affordances while `hasSelectedModel()` is false.',
            );
            return;
        }

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
            // Said once to the developer, who is the one who can fix it: the error
            // segment below is appended to a message that does not exist yet, so on a
            // page with no listener the send was simply dropped — the user's message
            // sat there and nothing said why (issue #29).
            if (!this._warnedNoModel) {
                this._warnedNoModel = true;
                console.warn(
                    '[AparteClient] Send dropped: no model is selected. Call '
                    + 'aparteGlobalConfig.setModelConfig({ defaultProvider, defaultModel }), mount '
                    + '<aparte-model-selector auto-select>, or register one provider with a single '
                    + 'model — that one is selected on its own.',
                );
            }
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
        // 1. The app's system prompt, then the tools' own — see `_systemMessages`.
        const messages: AparteChatMessage[] = this._systemMessages();

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
                content: this._wireText(m)
            }))
            .filter(m => m.content.length > 0);
    }

    /**
     * A message's text as the MODEL should read it — the one mapper both history
     * paths use, so the compaction preamble cannot be applied on retry and edit and
     * forgotten on the ordinary send, which is what the first review of this feature
     * caught: the summary went out on every normal turn as something the user said.
     */
    private _wireText(message: AparteMessage): string {
        const text = this._extractText(message);
        return message.compaction ? `${COMPACTION_PREAMBLE}\n\n${text}` : text;
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
     * perfect and only the NEXT request showed it. No unit test, no example and
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
     * wrote in English.
     *
     * A type core does not know — a registered block grammar's (an artifact, a
     * citation, a file), a consumer's custom segment — follows one rule: its
     * `content` if it has one, else its `fallback`, else nothing. Dropping such a
     * segment made a document the model had just produced invisible on the very next
     * turn, so it could not be asked to change the thing it had built; there used to
     * be an `artifact` branch here for exactly that, and the rule is what replaces it
     * now that the artifact is a plugin's type like any other.
     *
     * `thinking` and `tool_call` stay out on purpose — the first is the model's own
     * scratchpad, and most APIs neither want it back nor bill for it kindly; the
     * second is already in the history as a call and a result.
     */
    private _segmentsToText(segments: AparteMessage['segments']): string {
        if (!segments?.length) return '';
        const fence = '```';
        const parts: string[] = [];
        for (const segment of segments) {
            const content = (segment as { content?: string }).content;
            if (segment.type === 'text') {
                if (content) parts.push(content);
            } else if (segment.type === 'code') {
                const lang = (segment as { language?: string }).language ?? '';
                parts.push(`${fence}${lang}\n${content ?? ''}\n${fence}`);
            } else if (segment.type === 'thinking' || segment.type === 'tool_call' || segment.type === 'error') {
                continue;
            } else if (typeof content === 'string' && content) {
                parts.push(content);
            } else {
                const fallback = (segment as { fallback?: string }).fallback;
                if (fallback) parts.push(fallback);
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
     * What the loop does after one tool call. THREE outcomes, because a boolean
     * conflated two questions that a refusal answers differently.
     *
     * - `'continue'` — run the next tool call of this turn.
     * - `'respond'`  — skip this turn's remaining calls, then take another turn so the
     *                  model reads what happened. A human refusal: the model asked for
     *                  several calls and refusing one cannot license the others, but a
     *                  refusal it never reads is one the user has to retype as a message.
     * - `'halt'`     — the run is over: an abort, a turn limit, a missing handler.
     */
    /**
     * The turn's agent loop — the engine's `runStreamAgent` rendered through the core
     * adapter, or the runner a host injected — after the fetch-level abort bookkeeping.
     */
    private async _streamLoop(
        targetElement: AparteChatTargetElement,
        messageId: string,
        provider: AparteAIProvider,
        baseRequest: AparteChatRequest,
        authConfig: string | Record<string, string> | undefined,
        // Defaulted for a caller that drives the loop directly (the parity suite does).
        streamController: AbortController = new AbortController(),
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
        // The controller is the TURN's, created by `_streamTurn` and handed in, so the
        // turn can read its own signal when it ends: `_isAborted` is client-wide and
        // is reset by the next send, so a turn superseded by a retry on an earlier
        // bubble came back to find it false and announced `aparte-message-done` for a
        // reply that was cut mid-stream — clearing the NEW turn's streaming state.
        this._streamController = streamController;

        // The loop is the engine's. `streamRunner` lets a host wrap or replace it
        // (`onHistoryAppend`, a prefix-cache transport…); absent, `runStreamAgent`
        // runs, rendered through the core adapter. Core used to carry a second copy
        // of this loop inline — five hundred lines "kept in sync" with the engine by
        // hand — and the same tool turn corrupted the history in two different
        // shapes, one per copy, invisible to a parity suite precisely because they
        // differed. One loop, one shape (audit 2026-08-28, D1).
        const runner = this.options.streamRunner ?? runStreamAgent;
        return this._runViaStreamRunner(runner, targetElement, messageId, provider, baseRequest, authConfig, streamController);
    }

    /**
     * Run the loop through a {@link AparteStreamRunner} — the engine's by default —
     * rendering its DOM-free events through {@link createStreamAdapter}. Builds the
     * runner's dependencies from this client's config / provider / transport. The
     * leading writes (status streaming, prefix segments) happen here; the runner's
     * `run-start` re-asserts `streaming` idempotently. The call sequence this
     * produces is pinned by the `stream-parity` suite's snapshots, recorded while
     * the inline loop it replaced still ran beside it.
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

        const adapter = createStreamAdapter({
            target: targetElement as StreamAdapterTarget,
            config: this._config,
            messageId,
        });
        // `prefixSegments` (`_meta`) land right after the runner's `run-start` — the
        // flip to `status: 'streaming'` — so they sit on a streaming bubble, in the
        // order the loop always used: status first, then the segments the host seeded.
        // The client used to write the status itself before the runner and let
        // `run-start` repeat it: harmless on the page, but one call the recorded
        // sequence never had, which is how the parity suite caught it.
        const prefixSegments = baseRequest._meta?.['prefixSegments'] as AparteSegment[] | undefined;
        const emitter: AparteStreamRunEmitter = (event) => {
            adapter(event);
            if (event.type === 'run-start' && prefixSegments?.length) {
                for (const seg of prefixSegments) targetElement.addSegment?.(seg);
            }
        };

        const transportCall = async (request: AparteChatRequest): Promise<AsyncIterable<AparteStreamEvent> | string> => {
            const response = await this._config.getTransport().chat(provider, request, authConfig, { providerId: provider.id, signal });
            return typeof response === 'string'
                ? response
                : readableToAsyncIterable(response as ReadableStream<AparteStreamEvent>, signal);
        };
        // Wrapped, so the INJECTED runner hands a handler the same context core's
        // inline loop did. Without this, `streamRunner: runStreamAgent` would be the
        // one configuration where `ask_user` still silently cancelled — a new
        // parity divergence introduced by fixing the old one.
        const toolLookup = (name: string) => {
            const handler = this._config.getToolHandler(name);
            if (!handler) return undefined;
            const context = { target: targetElement as unknown as HTMLElement, config: this._config };
            return (call: AparteToolCall, sig: AbortSignal) => handler(call, sig, context);
        };
        // The gate is decided per CALL, from the arguments, by the same ruling the
        // channel below answers with — read live, not snapshotted, so a policy
        // installed mid-turn governs the gate and the answer alike. With no policy
        // registered `ruleOnToolCall` is exactly the tool's own flag. `'ask'` pauses
        // and is announced; `'deny'` refuses without announcing a pause nobody will
        // answer; `false` runs.
        //
        // A host that injected its own resolver owns the whole decision, so the policy
        // must not decide the gate either — an `allow` would skip that resolver.
        const hostOwnsDecision = Boolean(this.options.approvalResolver);
        const toolConfigLookup = (name: string) => {
            const tool = this._config.getTools().find(t => t.name === name);
            if (!tool) return undefined;
            return {
                maxTurns: tool.maxTurns,
                needsApproval: hostOwnsDecision
                    ? tool.needsApproval
                    : (call: AparteToolCall) => {
                        const verdict = this._config.ruleOnToolCall(call).verdict;
                        return verdict === 'allow' ? false : verdict;
                    },
            };
        };
        // The SAME channel the inline loop had. It used to be the `document` listener
        // while the inline loop asked at the composer — two loops asking two different
        // ways, which the parity suite cannot see because it supplies its own resolver
        // to both sides.
        //
        // A host's own resolver decides everything and sees no policy: it already
        // chose to own the decision. The default channel consults the policy first — a
        // `deny` refuses with the policy's own reason, never "the user rejected this".
        const approvalResolver = this.options.approvalResolver
            ?? (async (call: { id: string; name: string; input: Record<string, unknown> }, sig: AbortSignal) => {
                const ruling = this._config.ruleOnToolCall(call);
                if (ruling.verdict === 'allow') return { approved: true };
                if (ruling.verdict === 'deny') {
                    // Truthiness, not `??`: an empty reason would otherwise be the whole
                    // tool_result, or fall through to "the user rejected this" downstream.
                    return { approved: false, reason: ruling.reason?.trim() || 'Tool execution was refused by the approval policy.' };
                }
                return this._askForApproval(call, sig, targetElement as unknown as HTMLElement);
            });

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
            // The id conventions the loop always had: prefixed artifact ids, but a
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
            /*
             * APPEND the error, never replace the reply.
             *
             * This used to pass `segments: [errorSegment]`, which destroyed
             * everything already streamed and rendered — text, the thinking block,
             * artifacts, resolved tool calls — the moment a provider emitted a
             * mid-stream `error` event, or a tool handler threw anything that was
             * not an `AbortError`.
             *
             * It is the same defect as "Stop erased the reply", fixed one release
             * earlier on the abort path and left standing on the error path. A
             * partial answer plus an error is the truth; an empty bubble with an
             * error in it is a lie about what the model said.
             */
            /*
             * TREE-WIDE first, active path second.
             *
             * The append-not-replace rule above was implemented with `getMessages()`, which
             * returns only the ACTIVE path — so it held for the message being streamed and
             * silently became a full replace for any message that had left that path. A
             * retry or an edit on an earlier bubble does precisely that to a reply still in
             * flight: the reply stays in the tree, drops off the path, and the error handler
             * then found no segments, passed `[errorSegment]`, and `updateMessage` —
             * which resolves ids tree-wide — overwrote every token it had actually streamed.
             *
             * The bug was invisible because both halves were individually correct. Found by
             * a cold audit; deterministic on `AparteBackendTransport`, whose parser turns a
             * cut connection into a thrown error rather than a quiet close.
             */
            const rendered =
                target.getMessage?.(messageId)?.segments
                ?? target.getMessages?.()?.find(m => m.id === messageId)?.segments
                ?? [];
            target.updateMessage(messageId, {
                status: 'error',
                segments: [...rendered, errorSegment],
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
}
