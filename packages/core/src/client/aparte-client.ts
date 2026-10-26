import { aparteGlobalConfig, AparteConfig } from '../config/aparte-config.js';
import { resolveConfig } from '../config/config-context.js';
import { runStreamAgent } from '@aparte/engine';
import type { StreamApprovalResolver, StreamDeferral, StreamDeferredCall, StreamDeferredOutcome, StreamRefusalOrigin } from '@aparte/engine';

import { registerDefaultRenderers, declineDefaultRenderers } from '../renderers/segment-renderers.js';
import { createStreamAdapter, readableToAsyncIterable } from './stream-adapter.js';
import { historyFromCheckpoint } from '../context/checkpoint.js';
import { carriesNonTextParts, estimateRequestTokens, toolsForCurrentModel } from '../context/measure.js';
import { isInFlight, isOpenDeferred, mergeAdjacentUserMessages, segmentsToWireText, underPreamble, wireMessages, wireTurns } from './wire-history.js';
import { dispatchLifecycleEvent } from './lifecycle-events.js';
import type { AparteStreamRunner, AparteStreamRunEmitter, StreamAdapterTarget } from './stream-adapter.js';
import type { AparteSegment, AparteStreamEvent, AparteMessage, AparteErrorSegment, AparteToolCallSegment } from '../types/index.js';
import type { AparteAIProvider } from '../types/model-provider.js';
import type { AparteToolCall, AparteTool, AparteApprovalRuling } from '../types/tools.js';
import { AparteChatRequest, AparteChatMessage, AparteContentPart, AparteUsage, AparteFinishReason } from '../types/chat.js';
import { AparteError, AparteErrorCode } from '../types/errors.js';
import { filesToAttachments } from '../utils/files-to-attachments.js';
import { uuid } from '../utils/uuid.js';
import { eventOrigin, rootOf } from '../utils/event-target.js';
import { describeToolInput } from '../utils/tool-input.js';
import { toolNameOf, toolTargetOf } from '../utils/tool-line.js';
import { requestUserInput } from '../elicitation/index.js';

/**
 * The imperative surface AparteClient drives on a chat target element
 * (`<aparte-chat-viewport>` directly, or a framework host via AparteChatHost).
 * Every method is optional so a partial/mock target degrades gracefully — the
 * client always calls them through optional chaining. Mirrors the shape the
 * wrappers and `AparteChatHost` already conform to.
 */
/** What one run of the loop reports back to its turn: its usage, and whether it paused. */
interface AparteRunResult {
    usage: AparteUsage | undefined;
    /** Why the last model call ended — what `run-done` carried, when the provider said. */
    finishReason?: AparteFinishReason;
    /** A server loop suspended on calls the page must answer, with its signed continuation. */
    suspended?: { pending: StreamDeferredCall[]; ticket?: string };
}

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
 *
 * Engine's `StreamApprovalResolver`, under core's name — one type, not a twin to keep in
 * step: its result's `instruction`, `reason` and `by` are documented there.
 */
export type AparteToolApprovalResolver = StreamApprovalResolver;

/** What the model reads for a paused call that did not run because an earlier one of the same step was refused. */
const NOT_RUN_AFTER_A_REFUSAL = 'Not run: an earlier call of the same step was refused.';

/** A call as an approval remembers it: the call itself, not its id alone, which a later call may reuse. */
const approvalKey = (call: { id: string; name: string; input: unknown }): string =>
    JSON.stringify([call.id, call.name, call.input]);

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
     * - 'viewport' (default) — sends every user/assistant turn up to the last answered
     *                          one. A turn that errored, or is still in flight
     *                          ('streaming' / 'pending'), is held back and does not move
     *                          that cutoff; a turn a host seeded with NO `status` counts
     *                          as answered, so a restored or server-rendered transcript
     *                          goes out as history without inventing a status for it.
     * - 'none'               — sends only the current message
     * - function             — custom: receives viewport messages, returns AparteChatMessage[]
     *
     * With 'viewport', a checkpoint (`AparteMessage.contextSummary`, written by
     * `@aparte/plugin-compaction`) shortens what goes out: the summary, then the messages
     * from the checkpoint on. A function receives the WHOLE transcript, checkpoint and
     * everything before it — what to send is its call. To honour the checkpoint, pass
     * the messages through `historyFromCheckpoint` and send its `summary` first.
     * Retry and edit rebuild the history themselves and do not call this function.
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
     * Whether a send appends the optimistic USER bubble before the reply streams.
     *
     * Default `true` — and opt-OUT on purpose: if the host had to append the bubble,
     * whoever forgot would ship a chat where the person cannot see what they typed.
     * It compiles, it streams, and nothing errors.
     *
     * Pass `false` when the host owns its transcript and appends the user message
     * itself — the four framework wrappers do (their ConversationController is
     * that owner) and pass it. The wire cannot double either way: the history
     * builder already excludes trailing unanswered user messages.
     */
    echoUserMessage?: boolean;

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
     *   bytes. Saves bytes on every turn.
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
 * Files `_filesToContentParts` has already announced — warn once per name, the idiom the
 * stream loop uses for an event it cannot map. Repeating it on every send is how a
 * warning gets muted, and the developer only needs to hear it once per attachment.
 */
const warnedUninlinedFiles = new Set<string>();

/** What a chat looks like from outside: the shell, the viewport, or a host that says so. */
const CHAT_SELECTOR = 'aparte-chat, aparte-chat-viewport, [data-aparte-chat]';

/**
 * Stands in for a provider the page does not have, when the turn's runner calls the model
 * somewhere else (a server loop, an AG-UI agent). It carries the id the page named, if
 * any, and fails clearly if anything still tries to call the model from the page.
 */
function remoteProvider(id: string): AparteAIProvider {
    return {
        id,
        getMetadata: () => ({ id, name: id }),
        getModels: () => [],
        chat: async () => {
            throw new AparteError(
                'This turn has no provider in the page. Register one, or use a runner that calls the model elsewhere (createAgentStreamRunner, an AG-UI runner).',
                AparteErrorCode.CONFIG_NO_PROVIDER,
            );
        },
    } as unknown as AparteAIProvider;
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
    /** Between `start()` and `stop()`: the listeners are on `window`. The send handler alone is
     *  not the sign — the constructor prepares it without listening. */
    private _listening = false;
    private _boundAbortHandler: (() => void) | null = null;
    private _boundLoadedHandler: ((e: Event) => void) | null = null;
    private _boundRetryHandler: ((e: Event) => void) | null = null;
    private _boundEditHandler: ((e: Event) => void) | null = null;
    private _releaseKeyResolver: (() => void) | null = null;
    private _isAborted = false;
    /** Provider and model pairs whose window was already read again after a turn (see `_readWindowAfterTurn`). */
    private readonly _windowReadFor = new Set<string>();

    /**
     * The current model's window, read again once after a turn when it had none.
     *
     * A local server that loads a model on its first request — LM Studio's just-in-time
     * loading, Ollama — has no loaded window to report when the model list is fetched at
     * start-up, so the model comes without one, and the gauge and the compaction have
     * nothing to measure against. After a reply the model is loaded, and the provider's
     * own probe finds it. Once per provider and model: a server that never says costs one
     * request, not one per turn. The config announces the window when it appears.
     */
    private async _readWindowAfterTurn(): Promise<void> {
        // The config the turn picked its provider and model from — the client's own.
        const config = this._config;
        const model = config.getCurrentModel();
        const providerId = config.getModelConfig().defaultProvider;
        if (!model || model.contextWindow || !providerId) return;
        const key = `${providerId}\u0000${model.id}`;
        if (this._windowReadFor.has(key)) return;
        this._windowReadFor.add(key);
        await config.refreshProviderModels(providerId);
    }

    /**
     * Does this window event belong to this client?
     *
     * One rule for all the window-event handlers, so none of them can lack the guard:
     * in a two-client layout an unguarded event would make BOTH clients run — two paid
     * calls against whichever chat the DOM scan found first.
     *
     * A scoped client also answers only events ADDRESSED to it; an untargeted event is
     * not let through to every scoped client, or one broadcast would act on every chat
     * on the page.
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
         * Otherwise `{ config }` would scope what the client READ and nothing about
         * what it ANSWERED: two config-scoped clients on one page would both run a
         * full agentic turn for every send. `scopeToTargetId` is not the remedy for
         * a framework consumer — the wrappers generate the host id internally and do
         * not expose it.
         *
         * A client on the GLOBAL config is deliberately not narrowed: it answers
         * everything, which is every single-chat app.
         */
        if (this._config === aparteGlobalConfig) return true;
        const target = this._resolveTarget(detail?.targetId, e);
        if (!target) return true;
        const owner = resolveConfig(target);
        /*
         * Reject only a target that demonstrably belongs to ANOTHER instance — one
         * whose boundary resolves a different, non-global config.
         *
         * Not "the target must resolve OUR config", which is too strict: passing
         * `{ config }` without ever calling `attachConfig` is a legitimate shape —
         * the config as a settings bag for the one chat on the page. A chat with no
         * boundary is unclaimed, so answering it is correct.
         */
        return owner === this._config || owner === aparteGlobalConfig;
    }
    /** Aborts the in-flight vendor/transport fetch when the user stops a stream. */
    private _streamController: AbortController | null = null;

    private options: AparteClientOptions;
    /** Config read by this client — an instance config, or the global default. */
    private readonly _config: AparteConfig;

    /**
     * A `keyResolver` becomes a key source on the client's config at once, before `start()`,
     * so everything that needs a key can use it — the model selector's list included.
     * `autoRegister` (on by default) installs core's built-in renderers on that config.
     */
    constructor(options: AparteClientOptions = {}) {
        this.options = {
            autoRegister: true,
            ...options
        };
        this._config = options.config ?? aparteGlobalConfig;

        /*
         * The key channel this client was given becomes a key source on its CONFIG,
         * so everything that needs a key can see it — not the chat alone.
         *
         * `refreshProviderModels`, the model selector's one data path, reads
         * `config.getKey` only: without this, an app following the documented primary
         * channel (`keyResolver`) would get an empty picker on every cloud provider,
         * because `fetchModels` returns `[]` without a key, with no warning.
         *
         * Registered on the config rather than answered by the client, so the
         * capability stays reachable without one (decision #9).
         */
        this._registerKeyResolver();

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
     * Clearing the abort flag happens at the START of the action rather than inside
     * `_streamTurn`, which runs after the auth and file-reading awaits — a reset there
     * would erase an abort that arrived while the user was still waiting for a large
     * attachment to be read.
     *
     * The superseded turn's TOOL handlers are not cancelled here, and do not need a
     * registry of their own: `_streamTurn` aborts the previous `_streamController`, and
     * the engine links every tool handler's controller to that run signal
     * (`invokeToolHandler`), so cutting the stream cuts its tools.
     */
    private _beginUserTurn(): void {
        this._isAborted = false;
    }

    /**
     * Put this client's `keyResolver` on its config, and hold the teardown so
     * `stop()` can take it back off.
     *
     * The teardown means a stopped client stops signing model-list requests, and a
     * remount — the way the wrappers document swapping options — replaces the source
     * instead of adding one behind it. Idempotent, so the usual
     * `new AparteClient({…}).start()` registers once.
     */
    private _registerKeyResolver(): void {
        if (this._releaseKeyResolver || !this.options.keyResolver) return;
        this._releaseKeyResolver = this._config.registerKeyProvider(this.options.keyResolver);
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
     * Answer the chats: listen on `window` for `aparte-send`, `aparte-retry`, `aparte-edit`,
     * `aparte-abort` and `aparte-conversation-loaded`. Nothing streams before this is
     * called. Starting a stopped client puts its `keyResolver` back on the config.
     */
    start(): void {
        // A client that was stopped and started again signs requests with its own
        // key again: `stop()` takes the resolver off the config.
        this._registerKeyResolver();
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

        // A conversation came back with a turn a server loop paused: answer it now.
        if (!this._boundLoadedHandler) {
            this._boundLoadedHandler = (e: Event) => {
                if (!this._isForThisInstance(e)) return;
                const host = e.target instanceof HTMLElement ? e.target : undefined;
                void this.resumeDeferred(host ?? (e as CustomEvent<{ targetId?: string }>).detail?.targetId);
            };
        }
        window.addEventListener('aparte-conversation-loaded', this._boundLoadedHandler);
        this._listening = true;
    }

    /**
     * Stop answering: abort the reply in flight, take this client's `keyResolver` off the
     * config, and remove the listeners.
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
        // Before the early return as well: the key source is put on the config in
        // the CONSTRUCTOR, so a client that never started still holds one, and a
        // resolver left behind keeps answering for whatever mounts next.
        this._releaseKeyResolver?.();
        this._releaseKeyResolver = null;
        // A client that never started has nothing on `window` to remove — and on a server there
        // is no `window`: Svelte stops it from onDestroy, which runs at the end of a server render.
        if (!this._listening || !this._boundHandler) return;
        this._listening = false;
        window.removeEventListener('aparte-send', this._boundHandler);
        this._boundHandler = null;
        if (this._boundAbortHandler) {
            window.removeEventListener('aparte-abort', this._boundAbortHandler);
            this._boundAbortHandler = null;
        }
        if (this._boundLoadedHandler) {
            window.removeEventListener('aparte-conversation-loaded', this._boundLoadedHandler);
            this._boundLoadedHandler = null;
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

    /**
     * Ask the human at the COMPOSER, and report what they decided.
     *
     * The default channel. Routing through `requestUserInput` puts the decision
     * where every other request for the user already goes, which is the whole point:
     * one queue, one panel slot, one teardown, and the same behaviour whether the
     * request came from a tool handler or from this gate.
     *
     * The tool NAME is the question and its ARGUMENTS are the body, because the
     * arguments are what is being approved — a decision surface that names the act and
     * hides its subject asks for a signature on a blank page. The transcript row stays the
     * anchor, but it is not the only place the call can be read. The panel is capped
     * at 50vh and the block inside it scrolls, so a long input cannot push the options
     * off the surface they are asked on.
     *
     * There is no `aparte-tool-decision` event and no `document` listener that answers
     * one: a decision is answered by a typed presenter registered per config instance,
     * never by a window event. A host
     * that wants to answer programmatically registers an `approvalResolver` (headless,
     * no DOM) or its own presenter, both strictly more capable than an id on an event.
     */
    private async _askForApproval(
        event: { id: string; name: string; input: Record<string, unknown> },
        signal: AbortSignal,
        target: HTMLElement,
    ): Promise<{ approved: boolean; payload?: unknown; instruction?: string; by?: StreamRefusalOrigin }> {
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
                // The call as its row names it — the label the app declared, then what it
                // targets — read from the chat's config, the one the row renders with.
                const chat = resolveConfig(target);
                const call = {
                    id: `tool-${event.id}`, type: 'tool_call', status: 'awaiting-approval',
                    toolCall: { id: event.id, name: event.name, input: event.input },
                } as AparteToolCallSegment;
                const name = toolNameOf(call, chat).text;
                const what = toolTargetOf(call, chat);
                return (loc.approvalAsk ?? 'Allow {tool}?').replace('{tool}', () => (what ? `${name} ${what}` : name));
            },
            // A plain string, not a function: the arguments are the model's — its JSON, or
            // the tool's own formatter's reading of it — and do not change with the
            // language. Same text the transcript row shows, from the same function and the
            // same config — the chat's, which the row renders with — so the two surfaces
            // cannot disagree about what is being run.
            details: describeToolInput(event.input, resolveConfig(target).getToolInputFormatter(event.name)),
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
        if (answer.action !== 'accept') return { approved: false, by: 'person' };
        const content = answer.content as { option?: string; instruction?: string } | undefined;
        const instruction = content?.instruction?.trim();
        // Typed text with no option chosen IS the refusal — "no, do this instead" — so
        // the instruction alone denies. An option decides on its own.
        if (instruction) return { approved: false, instruction, by: 'person' };
        return content?.option === 'allow' ? { approved: true } : { approved: false, by: 'person' };
    }


    /**
     * Resolve the auth for a provider: `options.keyResolver` takes precedence,
     * then the aparteGlobalConfig key channel (`setKeyProvider`) so a key registered
     * there reaches the request. One key source on the happy path.
     */
    /**
     * The runner calls the model somewhere else — a server loop, an AG-UI agent — so the
     * page needs no provider of its own. The engine's loop, passed explicitly, still does.
     */
    private get _modelRunsElsewhere(): boolean {
        const runner = this.options.streamRunner;
        return Boolean(runner) && runner !== runStreamAgent;
    }

    /**
     * The provider a turn runs on: the registered one, else, when the model runs
     * elsewhere, a stand-in carrying the id the page named (none is fine: the server
     * picks). Undefined when the page must have one and has not.
     */
    private _providerFor(providerId: string | undefined): AparteAIProvider | undefined {
        const registered = providerId ? this._config.getAIProvider(providerId) : undefined;
        if (registered) return registered;
        return this._modelRunsElsewhere ? remoteProvider(providerId ?? '') : undefined;
    }

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
        opts?: {
            temperature?: number;
            /** Resume a turn a server loop paused (a reload): skip the first run. */
            resume?: NonNullable<AparteRunResult['suspended']>;
            /**
             * Builds the messages of this request again, exactly as the caller built them the
             * first time (a send inlines its files as parts again). Called once the history
             * has become smaller — after a compactor wrote a checkpoint, before the request
             * goes out or after the model refused it as too long. Without it the turn cannot
             * be resent, so it neither waits for a compactor nor retries an overflow.
             */
            rebuild?: () => Promise<AparteChatMessage[]>;
            /** The files picked for this message, for a runner that uploads them itself. */
            files?: readonly File[];
        },
    ): Promise<void> {
        // The id of the CHAT, resolved once for the whole turn — the render target is
        // a viewport and does not carry it. See `_targetIdOf`.
        const chatId = this._targetIdOf(targetElement);
        const registeredTools = this._toolsForCurrentModel();
        // One function for the request, because a compaction builds it twice: the messages
        // change, and everything else the turn does to a request (the interceptor, the
        // `toolChoice` rule) must be done again to them.
        const buildRequest = async (requestMessages: AparteChatMessage[]): Promise<AparteChatRequest> => {
            let built: AparteChatRequest = {
                messages: requestMessages,
                modelId,
                stream: true,
                tools: registeredTools.length ? registeredTools : undefined,
                ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
            };
            if (this.options.requestInterceptor) {
                built = await this.options.requestInterceptor(built);
            }
            // toolChoice: 'none' — strip tools so the model never sees them.
            if (built.toolChoice === 'none') {
                built = { ...built, tools: undefined };
            }
            return built;
        };
        let baseRequest = await buildRequest(messages);

        // Stopped while we were resolving auth or reading attachments: the stream
        // controller did not exist yet, so `abort()` had nothing to cancel — the
        // flag is the only trace, and it must not be thrown away here.
        if (this._isAborted) {
            dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId }, chatId);
            // FINISHED, like the two abort paths below: the pending shell appended a few
            // lines up is a streaming message in the viewport's model until a terminal
            // status says otherwise, and with nothing saying it the transcript stayed
            // read-only — arrows, retry, edit — for the life of the page after one Stop
            // that landed while auth or an attachment was still being read.
            this._updateMessage(targetElement, messageId, { status: 'completed' });
            return;
        }
        dispatchLifecycleEvent(targetElement, 'aparte-message-start', { messageId, role: 'assistant' }, chatId);
        // A turn that starts from a saved pause starts PAUSED: it asks before any run, and
        // whoever tracks the turn (the conversation list) must hear that it waits on the
        // page, not that it runs.
        if (opts?.resume) dispatchLifecycleEvent(targetElement, 'aparte-message-paused', { messageId }, chatId);
        // What this turn runs on, on the reply: a pause resumed after a reload takes the
        // same model back. A resume keeps what its reply already says.
        if (!opts?.resume && provider.id) {
            this._updateMessage(targetElement, messageId, {
                model: {
                    providerId: provider.id,
                    modelId: baseRequest.modelId,
                    ...(baseRequest.temperature !== undefined ? { temperature: baseRequest.temperature } : {}),
                },
            });
        }
        // This turn's own controller: the terminal below is decided from ITS signal, not
        // from the client-wide `_isAborted`, which the next send resets before the
        // superseded turn has returned.
        const streamController = new AbortController();
        // Registered now rather than by the first run: a turn that resumes a reload waits
        // on a panel before any run starts, and Stop has to reach that wait.
        if (this._streamController !== streamController) this._streamController?.abort();
        this._streamController = streamController;
        this._turnsInFlight.add(messageId);
        // The compactor this chat answers to: the one on ITS config first (a chat inside an
        // instance boundary), then the client's. Needs `rebuild` to be of any use — what it
        // does is make the history smaller, and only the caller knows how to send it again.
        const compactor = opts?.rebuild
            ? (resolveConfig(targetElement).getCompactor() ?? this._config.getCompactor())
            : null;
        // The turn being prepared, which a compaction must leave alone: its user message
        // and this reply. Read when asked, from the path, because a retry has moved it.
        const turnIds = (): string[] => {
            const path = targetElement.getMessages?.() ?? [];
            const at = path.findIndex((m) => m.id === messageId);
            const asked = at > 0 ? path[at - 1] : undefined;
            return asked?.role === 'user' ? [asked.id, messageId] : [messageId];
        };
        // What this request costs, as the measure counts a view: written on the reply before
        // each send so the measure can calibrate the heuristic against the real usage. A
        // resume sends the request it was sent with plus the reply so far.
        const requestMessages = (): AparteChatMessage[] =>
            opts?.resume ? this._resumeMessages(targetElement, messageId, baseRequest.messages) : baseRequest.messages;
        const requestEstimate = (): number => estimateRequestTokens({ messages: requestMessages(), tools: baseRequest.tools });
        // Recorded on the reply only when the heuristic read the whole request. One that
        // carries an image has a floor for an estimate, and the measure would read the gap
        // to the provider's real count as the heuristic's error and scale everything by it.
        // Written as `undefined` rather than left alone, because a second attempt writes
        // over the first.
        const recordedEstimate = (): number | undefined => carriesNonTextParts(requestMessages()) ? undefined : requestEstimate();
        // A turn stopped before it had a run to stop: a Stop during the wait for a summary.
        const endStopped = (): void => {
            this._closeOpenCalls(targetElement, messageId);
            dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId }, chatId);
            this._updateMessage(targetElement, messageId, { status: 'completed' });
        };
        const isStopped = (): boolean => this._isAborted || streamController.signal.aborted;
        // The run itself, declared apart so an overflow can run it a second time.
        const runOnce = async (): Promise<void> => {
            let result: AparteRunResult = opts?.resume
                ? { usage: undefined, suspended: opts.resume }
                : await this._streamLoop(targetElement, messageId, provider, baseRequest, authConfig, streamController, undefined, opts?.files);
            // A server loop paused on calls only the page can answer: ask here — the
            // panel, the policy, a browser tool — then run again with the answers, into
            // the same bubble, under the same controller. The turn's lifecycle events
            // bracket every pause, so the button stays Stop while a panel waits.
            //
            // Capped like the loop's own turns: a server that pauses on every run would
            // otherwise ask forever, and a policy that answers alone would not even pause.
            const maxResumes = this.options.maxTurns ?? 10; // the engine's default
            let resumes = 0;
            // Calls a person approved at the last pause. An agent can pause on the same call
            // twice — approve it, then run it in the browser (TanStack AI does exactly that) —
            // and the second pause must not ask again. Kept for the next pause only, and for the
            // call itself: a vendor that sends no ids has them minted per stream, so a later call
            // can carry an id approved earlier in the turn, and that approval was not for it.
            let approvedAtLastPause = new Set<string>();
            const rowEvents = createStreamAdapter({ target: targetElement as StreamAdapterTarget, config: this._config, messageId, ...(chatId ? { targetId: chatId } : {}) });
            while (result.suspended) {
                const stopped = this._isAborted || streamController.signal.aborted;
                if (!stopped && ++resumes > maxResumes) {
                    this._closeOpenCalls(targetElement, messageId);
                    createStreamAdapter({ target: targetElement as StreamAdapterTarget, config: this._config, messageId, ...(chatId ? { targetId: chatId } : {}) })(
                        { type: 'turn-limit-exceeded', scope: 'global', limit: maxResumes },
                    );
                    break;
                }
                const approvedNow = new Set<string>();
                const outcomes = stopped
                    ? undefined
                    : await this._answerDeferred(targetElement, result.suspended.pending, streamController.signal, rowEvents, approvedAtLastPause, approvedNow);
                approvedAtLastPause = approvedNow;
                if (!outcomes) {
                    // Nobody will answer them — a Stop, or a channel that gave up: the calls
                    // do not run. And no run is left to say the turn stopped, so say it here.
                    this._closeOpenCalls(targetElement, messageId);
                    if (this._isAborted || streamController.signal.aborted) {
                        dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId }, chatId);
                    }
                    break;
                }
                const deferral: StreamDeferral = {
                    outcomes,
                    ...(result.suspended.ticket ? { token: result.suspended.ticket } : {}),
                };
                const messages = this._resumeMessages(targetElement, messageId, baseRequest.messages);
                this._spendPause(targetElement, messageId);
                // The pause is answered: the turn runs again, and says so — the other half
                // of `aparte-message-paused`, which nothing used to close.
                dispatchLifecycleEvent(targetElement, 'aparte-message-resumed', { messageId }, chatId);
                result = await this._streamLoop(
                    targetElement, messageId, provider,
                    { ...baseRequest, messages },
                    authConfig, streamController, deferral,
                );
            }
            const usage = result.usage;
            const finishReason = result.finishReason;
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
                this._closeOpenCalls(targetElement, messageId);
                this._updateMessage(targetElement, messageId, { status: 'completed' });
            } else {
                dispatchLifecycleEvent(targetElement, 'aparte-message-done', { messageId, role: 'assistant', usage, ...(finishReason ? { finishReason } : {}) }, chatId);
                void this._readWindowAfterTurn();
            }
        };
        // The model refused the request as too long, before saying a word: make the history
        // smaller and send the turn once more, into the same reply. Not after the reply has
        // text or a call — the turn would answer twice — and not without a compactor that
        // actually compacted: the error then stands, exactly as it did before there was one.
        // No note is written; the separator that appears above the kept turns says it.
        const resendAfterOverflow = async (error: AparteError): Promise<'resend' | 'stopped' | 'stands'> => {
            if (error.code !== AparteErrorCode.USAGE_CONTEXT_EXCEEDED || !compactor || !opts?.rebuild) return 'stands';
            const segments = targetElement.getMessage?.(messageId)?.segments
                ?? targetElement.getMessages?.()?.find((m) => m.id === messageId)?.segments
                ?? [];
            if (segments.some((s) => s.type === 'text' || s.type === 'tool_call')) return 'stands';
            try {
                const outcome = await compactor.compact({
                    target: targetElement,
                    ...(chatId ? { targetId: chatId } : {}),
                    force: true,
                    reason: 'overflow',
                    exclude: turnIds(),
                    signal: streamController.signal,
                });
                // A Stop while the summary was being written is a stop, not a failure to show.
                if (isStopped()) return 'stopped';
                if (!outcome.ok || outcome.skipped) return 'stands';
                baseRequest = await buildRequest(await opts.rebuild());
            } catch {
                // The compactor never rejects; a `rebuild` or an interceptor that throws is
                // no reason to hide the error the person actually had.
                return 'stands';
            }
            // Back to the waiting state the reply started in: nothing has been said yet.
            this._updateMessage(targetElement, messageId, { status: 'pending' });
            return 'resend';
        };
        try {
            for (let attempt = 0; ; attempt++) {
                try {
                    if (attempt === 0 && compactor?.beforeSend && opts?.rebuild) {
                        // The turn is announced (Stop is showing, the reply is waiting) and the
                        // request is built — files inlined — so the estimate is of what would go.
                        // A summary being written is awaited HERE rather than raced: a request
                        // sent beside it would carry the history it is about to replace.
                        let compacted = false;
                        try {
                            compacted = await compactor.beforeSend({
                                target: targetElement,
                                ...(chatId ? { targetId: chatId } : {}),
                                exclude: turnIds(),
                                requestTokens: requestEstimate(),
                                signal: streamController.signal,
                            });
                        } catch (failure) {
                            // Not a reason to refuse the send: the request goes out as built.
                            console.warn('[AparteClient] The compactor threw before a send; sending the request as built.', failure);
                        }
                        if (isStopped()) {
                            endStopped();
                            return;
                        }
                        if (compacted) baseRequest = await buildRequest(await opts.rebuild());
                    }
                    this._updateMessage(targetElement, messageId, { contextEstimate: recordedEstimate() });
                    await runOnce();
                    return;
                } catch (error: unknown) {
                    // A THIRD abort path, and the one the browser suite caught after the
                    // other two were closed: when the user stops before any event has
                    // arrived, the fetch rejection escapes `transportCall` as an exception.
                    // It never reaches the event stream, so neither the guard around
                    // `reader.read()` nor the one on the `error` event can see it — and
                    // `_handleLifecycleError` would REPLACE the message with an error
                    // segment, turning a deliberate stop into a rendered failure.
                    this._closeOpenCalls(targetElement, messageId);
                    if (isStopped()) {
                        dispatchLifecycleEvent(targetElement, 'aparte-message-aborted', { messageId }, chatId);
                        this._updateMessage(targetElement, messageId, { status: 'completed' });
                        return;
                    }
                    const aparteError = AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR);
                    // Once per turn: a second overflow means the summary was not enough.
                    const next = attempt === 0 ? await resendAfterOverflow(aparteError) : 'stands';
                    if (next === 'resend') continue;
                    if (next === 'stopped') {
                        endStopped();
                        return;
                    }
                    this._handleLifecycleError(targetElement, messageId, aparteError);
                    return;
                }
            }
        } finally {
            this._turnsInFlight.delete(messageId);
        }
    }

    /**
     * Replies a turn is running into right now, a pause it waits on included: a second
     * load of their conversation must not start them again (`resumeDeferred`).
     */
    private readonly _turnsInFlight = new Set<string>();

    /**
     * Handle aparte-retry — add a sibling branch to the assistant message and re-stream
     * using the same conversation history minus the retried reply.
     */
    /**
     * The registered tools, unless the current model says it cannot call one — the gate
     * lives in `toolsForCurrentModel` (with its reasoning), where the context measure reads
     * the same rule, so send / retry / edit and the gauge cannot drift.
     */
    private _toolsForCurrentModel(): AparteTool[] {
        return toolsForCurrentModel(this._config);
    }

    private async _handleRetry(event: CustomEvent): Promise<void> {
        const { messageId, targetId } = event.detail ?? {};
        // The same opening every user action gets — see _beginUserTurn.
        this._beginUserTurn();

        if (!messageId) return;

        const targetElement = this._resolveTarget<AparteChatTargetElement>(targetId, event);
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
        const provider = this._providerFor(providerId);
        if (!provider) return;

        const authConfig = providerId ? await this._resolveAuth(providerId) : undefined;

        const chatMessages = this._messagesToChatMessages(historyMessages);

        const systemMessages = this._systemMessages();

        // Retry must produce a DIFFERENT answer than a byte-identical re-run:
        // temperature > 0 opts into sampling, whatever the provider — variation
        // comes from the decoder's own RNG, no seed involved. (`request.seed`
        // stays untouched: it is the caller's reproducibility knob, and writing
        // one here would defeat it.)
        await this._streamTurn(
            targetElement, newMessageId, provider,
            [...systemMessages, ...mergeAdjacentUserMessages(chatMessages)], config.defaultModel || '',
            authConfig, {
                temperature: 0.4,
                rebuild: async () => [
                    ...this._systemMessages(),
                    ...mergeAdjacentUserMessages(this._messagesToChatMessages(this._current(targetElement, historyMessages))),
                ],
            },
        );
    }

    /**
     * The system messages a turn opens with: the app's own template, then the registered
     * tools' `systemPrompt`s.
     *
     * One helper for the three turn entry points (send, retry, edit), so the tool half
     * cannot be added to two of them and forgotten in the third — the same shape as the
     * abort-flag asymmetry `_beginUserTurn` exists to prevent.
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

        const targetElement = this._resolveTarget<AparteChatTargetElement>(targetId, event);
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
        const provider = this._providerFor(providerId);
        if (!provider) return;

        const authConfig = providerId ? await this._resolveAuth(providerId) : undefined;

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
            [...systemMessages, ...mergeAdjacentUserMessages(chatMessages)], config.defaultModel || '',
            authConfig, {
                rebuild: async () => [
                    ...this._systemMessages(),
                    ...mergeAdjacentUserMessages(this._messagesToChatMessages(this._current(targetElement, historyMessages))),
                ],
            },
        );
    }

    /**
     * These messages as the transcript holds them NOW. A retry or an edit slices the path
     * before it streams; a compaction that runs during the turn writes its checkpoint onto
     * one of those messages in the transcript, and the slice still holds the objects as they
     * were. Looked up by id, tree-wide, because a retry has moved the path since.
     */
    private _current(target: AparteChatTargetElement, messages: AparteMessage[]): AparteMessage[] {
        // Under a wrapper the target is the framework's root, which used to offer no
        // `getMessage`: every lookup fell back to the snapshot and the rebuilt request
        // skipped the checkpoint. The live list is the second source, so a target that
        // only offers `getMessages` (a host of one's own) is read as well.
        const live = new Map((target.getMessages?.() ?? []).map((m) => [m.id, m] as const));
        return messages.map((m) => target.getMessage?.(m.id) ?? live.get(m.id) ?? m);
    }

    /**
     * The chain the gesture really came up, nearest node first.
     *
     * Read from a `window` listener, `event.target` is the shadow HOST when the event
     * left a tree of the consumer's own, and `parentElement` stops at that tree's root —
     * so a walk from either starts, or ends, outside the chat the person typed into.
     * `composedPath()` is the one chain that crosses. The fallback is for an event
     * dispatched by hand, which has no path.
     */
    private _originChain(event?: Event | null): EventTarget[] {
        const path = event?.composedPath?.() ?? [];
        if (path.length > 0) return path;
        const chain: EventTarget[] = [];
        let node = (event ? eventOrigin(event) : null) as HTMLElement | null;
        while (node) { chain.push(node); node = node.parentElement; }
        return chain;
    }

    /**
     * The trees a lookup must search, the one the gesture came from FIRST.
     *
     * `document.getElementById` and `document.querySelectorAll` cannot see into a shadow
     * root, so a chat mounted in one — the arrangement the theming guide endorses — is
     * invisible to both: alone, the send would be dropped with a warning; on a page that
     * also holds a chat in the light DOM, the scan would answer with the WRONG chat, and
     * the person's message AND the model's reply would land in a transcript they never
     * typed into. Nearest tree first keeps it from swapping the other way round.
     */
    private _rootsFor(event?: Event | null): ParentNode[] {
        const roots: ParentNode[] = [];
        for (const node of this._originChain(event)) {
            if (typeof (node as Node).getRootNode !== 'function') continue;
            const root = rootOf(node as Node);
            if (!roots.includes(root)) roots.push(root);
        }
        if (!roots.includes(document)) roots.push(document);
        return roots;
    }

    /** The element an id names, looked up in the gesture's own tree before the document. */
    private _byId(targetId: string, event?: Event | null): HTMLElement | null {
        for (const root of this._rootsFor(event)) {
            const el = (root as Partial<NonElementParentNode>).getElementById?.(targetId) as HTMLElement | null | undefined;
            if (el) return el;
        }
        return null;
    }

    /** The first chat that can render, own tree first — the path when nothing names one. */
    private _scanForTarget<T extends HTMLElement>(event?: Event | null): T | null {
        for (const root of this._rootsFor(event)) {
            for (const candidate of root.querySelectorAll<HTMLElement>(CHAT_SELECTOR)) {
                const target = this._asRenderTarget<T>(candidate);
                if (target) return target;
            }
        }
        return null;
    }

    /**
     * Resolve a target element by id (from event detail.targetId) or via targetResolver / DOM scan.
     */
    private _resolveTarget<T extends HTMLElement>(targetId?: string, event?: Event | null): T | null {
        // An explicit id / resolver is TRUSTED as given (it may gain its render
        // methods later); only the implicit DOM scan must prefer a candidate that
        // can actually render — the <aparte-chat> shell matches the selector first
        // but delegates rendering to its viewport (see _asRenderTarget), so a blind
        // candidates[0] returned an unusable shell and retry/edit silently no-op'd.
        if (targetId) {
            const el = this._byId(targetId, event);
            if (el) return this._asRenderTarget<T>(el) ?? (el as unknown as T);
        }
        if (this.options.targetResolver) {
            const el = this.options.targetResolver() as HTMLElement | null;
            if (el) return this._asRenderTarget<T>(el) ?? (el as unknown as T);
        }
        const scanned = this._scanForTarget<T>(event);
        if (scanned) return scanned;
        for (const root of this._rootsFor(event)) {
            const first = root.querySelector<HTMLElement>(CHAT_SELECTOR);
            if (first) return first as unknown as T;
        }
        return null;
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
     * Which chat a render target BELONGS to — the id the lifecycle events must carry.
     *
     * Not `target.id`: the target is whatever renders, and an `<aparte-chat>` shell
     * delegates that to its `.viewport`, which has no id. So every lifecycle event on
     * a shell-shaped chat went out unstamped, and the receive side reads a missing id
     * as "for every chat on the page" — deliberately, so a single-chat page needs no
     * wiring. On a two-chat page one chat's turn therefore drove every composer.
     *
     * The climb is the same rule `aparte-composer._ownTargetId` uses on the receive
     * side, and it has to be, or the two would disagree about which chat is which:
     * the nearest `aparte-chat` / `[data-aparte-chat]` ancestor (or the element
     * itself) that HAS an id. Deliberately not `chatBoundaryOf` — that returns the
     * boundary whether or not it is identified, and an id-less boundary must fall
     * through to the next one up rather than answer "no id".
     */
    private _targetIdOf(el: HTMLElement | null | undefined): string | undefined {
        let node: HTMLElement | null = el ?? null;
        while (node) {
            const tag = node.tagName?.toLowerCase();
            const isHost = tag === 'aparte-chat' || node.hasAttribute?.('data-aparte-chat');
            if (isHost && node.id) return node.id;
            node = node.parentElement;
        }
        return el?.id || undefined;
    }

    /**
     * Convert AparteMessage[] to AparteChatMessage[] for re-submission (retry, edit).
     *
     * The SLICE is each caller's own business — retry cuts before the reply it is
     * regenerating, edit cuts after the message being reworded, send cuts at the last
     * answered turn. What a message CONTRIBUTES to the wire is not: send, retry and
     * edit must not disagree about it. A failed turn and a turn stopped before its
     * first token are filtered out rather than sent as
     * `{ role: 'assistant', content: '' }` — a claim the assistant said nothing, which
     * some providers reject outright and the rest read as an empty reply worth
     * imitating.
     */
    private _messagesToChatMessages(messages: AparteMessage[]): import('../types/chat.js').AparteChatMessage[] {
        const { summary, messages: kept } = historyFromCheckpoint(messages);
        return [...this._summaryMessage(summary), ...wireMessages(kept)];
    }

    /**
     * What the model reads in place of everything before a checkpoint: the summary, as a
     * `user` message under the same preamble a legacy compaction message gets, so it is
     * context and not something the person said. It may sit right before a user turn;
     * `mergeAdjacentUserMessages` joins the two where the history is assembled.
     */
    private _summaryMessage(summary: string | undefined): AparteChatMessage[] {
        return summary === undefined ? [] : [{ role: 'user', content: underPreamble(summary) }];
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
            const byId = this._byId(targetId, event);
            const resolved = this._asRenderTarget<HTMLElement>(byId) as AparteChatTargetElement | null;
            if (resolved) {
                targetElement = resolved;
            } else {
                console.warn('[AparteClient] ⚠️ targetId present but element not found or missing appendMessage:', targetId);
            }
        }

        // 2. User-supplied resolver (e.g. provided via APARTE_CLIENT_OPTIONS).
        //    Through _asRenderTarget, like step 1: the documented answer to a chat in a
        //    shadow root of your own is `targetResolver: () => root.querySelector('aparte-chat')`,
        //    and requiring appendMessage ON the element rejected the shell that returns —
        //    so the escape hatch out of a missed lookup missed in exactly the same way.
        if (!targetElement && this.options.targetResolver) {
            targetElement = this._asRenderTarget<HTMLElement>(
                this.options.targetResolver(),
            ) as AparteChatTargetElement | null;
        }

        // 3. Walk the chain the event really came up, as last resort. `composedPath()`
        //    and not `parentElement` from `event.target`: this listens on the window, so
        //    a send that left a shadow tree is retargeted to the host and the walk would
        //    start outside the chat it came from.
        if (!targetElement) {
            for (const node of this._originChain(event)) {
                const walker = node as AparteChatTargetElement;
                if (typeof walker?.appendMessage === 'function') {
                    targetElement = walker;
                    break;
                }
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
            targetElement = this._scanForTarget<AparteChatTargetElement>(event);
        }

        if (!targetElement) {
            console.warn('[AparteClient] ⚠️ No target element found with appendMessage support. Provide a targetResolver in AparteClientOptions or ensure the composer has a `target` attribute.');
            return;
        }

        // The optimistic USER bubble, before anything below can fail — a send the
        // person cannot see is a broken chat even when the failure card explains
        // the rest. Opt-out via `echoUserMessage: false` (see the option's JSDoc).
        //
        // Ownership is a HANDSHAKE on the event, not a guess: whoever appends the
        // user message marks `detail.echoed`, and whoever sees the mark yields.
        // The ConversationController appends in the CAPTURE phase — by design it
        // always precedes this window-bubble listener — so a controller-driven
        // chat beside a raw client echoes exactly once, whichever wrapper or none
        // built either of them. The client marks too: a second client resolving
        // the same target cannot double.
        // A reply paused on a question nobody answered: the new message closes it.
        this._closeDeferred(targetElement);
        if (this.options.echoUserMessage !== false && event.detail?.echoed !== true) {
            const echoFiles: File[] = Array.isArray(event.detail?.files) ? event.detail.files : [];
            targetElement.appendMessage?.({
                id: uuid(),
                role: 'user',
                content,
                timestamp: Date.now(),
                ...(echoFiles.length > 0 ? { attachments: filesToAttachments(echoFiles) } : {}),
            });
            if (event.detail && typeof event.detail === 'object') event.detail.echoed = true;
        }

        const messageId = uuid();
        const config = this._config.getModelConfig();
        const providerId = explicitProviderId || config.defaultProvider;

        // 1. Initial Checks (Sync Errors). A runner that calls the model elsewhere needs
        // no provider in the page: the server or the agent picks it.
        if (!providerId && !this._modelRunsElsewhere) {
            // Said once to the developer, who is the one who can fix it: the error
            // segment below is appended to a message that does not exist yet, so on a
            // page with no listener the send was simply dropped — the user's message
            // sat there and nothing said why.
            if (!this._warnedNoModel) {
                this._warnedNoModel = true;
                console.warn(
                    '[AparteClient] Send dropped: no model is selected. Call '
                    + 'aparteGlobalConfig.setModelConfig({ defaultProvider, defaultModel }), mount '
                    + '<aparte-model-selector auto-select persist>, or register one provider with a single '
                    + 'model — that one is selected on its own.',
                );
            }
            this._handleLifecycleError(targetElement, messageId, new AparteError(
                'No provider selected. Please configure a provider.',
                AparteErrorCode.CONFIG_NO_PROVIDER
            ));
            return;
        }

        const provider = this._providerFor(providerId);
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
        // Read once: the files are not read again when a compaction asks for the request to
        // be built again.
        let fileParts: AparteContentPart[] | undefined;
        const rawFiles: File[] = Array.isArray(event.detail?.files) ? event.detail.files : [];
        try {
            authConfig = providerId ? await this._resolveAuth(providerId) : undefined;

            const filesToInject = this._selectFilesToInject(rawFiles);
            const contentParts = filesToInject.length > 0 ? await this._filesToContentParts(filesToInject) : [];
            fileParts = contentParts.length > 0 ? contentParts : undefined;
            messages = this._buildMessages(content, targetElement, fileParts);
        } catch (error: unknown) {
            this._handleLifecycleError(targetElement, messageId, AparteError.from(error, AparteErrorCode.UNKNOWN_ERROR));
            return;
        }

        await this._streamTurn(
            targetElement, messageId, provider,
            messages, modelId || config.defaultModel || '',
            authConfig,
            {
                rebuild: async () => this._buildMessages(content, targetElement, fileParts),
                ...(rawFiles.length > 0 ? { files: rawFiles } : {}),
            },
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
        // Applied once, to the final array: the history may end on a user turn (a failed
        // one, a compaction summary) that the new message now sits right after.
        return mergeAdjacentUserMessages(messages);
    }

    private _toHistoryMessages(path: AparteMessage[]): AparteChatMessage[] {
        // The checkpoint is read on the FULL path, before the cutoff below: it may sit on
        // the very message being sent (a turn retried after an overflow), and the cutoff
        // would otherwise have cut it away with that message.
        const { summary, messages } = historyFromCheckpoint(path);
        // Exclude trailing unanswered user messages: the current user message is
        // already added explicitly at the end of _buildMessages, so including it
        // from the viewport would cause a duplicate.
        // Find the last ANSWERED assistant response and cut there — errored and
        // in-flight turns are not answers and must not move the cutoff.
        let cutoff = 0;
        for (let i = 0; i < messages.length; i++) {
            const m = messages[i]!;
            if (m.role === 'assistant' && m.status !== 'error' && !isInFlight(m)) {
                cutoff = i + 1;
            }
        }

        // The cutoff is this path's own concern; what each message contributes to the
        // wire is shared with retry and edit — see `wireMessages`.
        return [...this._summaryMessage(summary), ...wireMessages(messages.slice(0, cutoff))];
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
     * - Other binary files → no content part, and a one-time `console.warn` naming the
     *   file (see the branch below for why it is not silent).
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

                // Everything else — a PDF, a spreadsheet, an archive. The chip stays on
                // screen, so silence here reads as the model ignoring the attachment
                // rather than as aparté never having sent it.
                if (!warnedUninlinedFiles.has(file.name)) {
                    warnedUninlinedFiles.add(file.name);
                    console.warn(
                        `[aparte] ${file.name} (${file.type || 'unknown type'}) is attached to the message but is `
                        + 'not sent to the model: aparté inlines images and text files only. Handle it in your app '
                        + '(RAG, an upload) — the chip stays visible either way.',
                    );
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
    /** One run of the loop: its usage, and whether it paused (a server loop). */
    private async _streamLoop(
        targetElement: AparteChatTargetElement,
        messageId: string,
        provider: AparteAIProvider,
        baseRequest: AparteChatRequest,
        authConfig: string | Record<string, string> | undefined,
        // Defaulted for a caller that drives the loop directly (the parity suite does).
        streamController: AbortController = new AbortController(),
        // A paused server run's answers, when this call resumes it (see `_streamTurn`).
        deferral?: StreamDeferral,
        files?: readonly File[],
    ): Promise<AparteRunResult> {
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
        //
        // Only ANOTHER turn's controller, though: a turn that resumes after a pause runs
        // again under its own, and aborting that would stop the resume before it starts.
        if (this._streamController !== streamController) this._streamController?.abort();
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
        // differed. One loop, one shape.
        const runner = this.options.streamRunner ?? runStreamAgent;
        return this._runViaStreamRunner(runner, targetElement, messageId, provider, baseRequest, authConfig, streamController, deferral, files);
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
        deferral?: StreamDeferral,
        files?: readonly File[],
    ): Promise<AparteRunResult> {
        const signal = streamController.signal;

        // The chat, not the viewport — see `_targetIdOf`. Without it the adapter's own
        // two lifecycle dispatches (`aparte-tool-approval-request` and the abort) go
        // out unstamped, which every chat on the page reads as its own.
        const chatId = this._targetIdOf(targetElement);
        const adapter = createStreamAdapter({
            target: targetElement as StreamAdapterTarget,
            config: this._config,
            messageId,
            ...(chatId ? { targetId: chatId } : {}),
        });
        // `prefixSegments` (`_meta`) land right after the runner's `run-start` — the
        // flip to `status: 'streaming'` — so they sit on a streaming bubble, in the
        // order the loop always used: status first, then the segments the host seeded.
        // The client used to write the status itself before the runner and let
        // `run-start` repeat it: harmless on the page, but one call the recorded
        // sequence never had, which is how the parity suite caught it.
        const prefixSegments = baseRequest._meta?.['prefixSegments'] as AparteSegment[] | undefined;
        // A server loop that paused says so on its last event; the turn picks it up.
        let suspended: AparteRunResult['suspended'];
        let finishReason: AparteFinishReason | undefined;
        const emitter: AparteStreamRunEmitter = (event) => {
            adapter(event);
            if (event.type === 'run-done') finishReason = event.finishReason;
            if (event.type === 'run-suspended') {
                const ticket = (event as { ticket?: unknown }).ticket;
                suspended = { pending: event.pending, ...(typeof ticket === 'string' ? { ticket } : {}) };
            }
            // Once per turn: a resume starts a run too, into a reply that has them already.
            if (event.type === 'run-start' && prefixSegments?.length && !deferral) {
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
        const approvalResolver = this._approvalResolverFor(targetElement);

        const usage = await streamRunner({
            messageId,
            ...(provider.id ? { providerId: provider.id } : {}),
            ...(deferral ? { deferral } : {}),
            ...(files && files.length > 0 ? { files } : {}),
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
        return {
            usage: usage ?? undefined,
            ...(finishReason ? { finishReason } : {}),
            ...(suspended ? { suspended } : {}),
        };
    }

    /**
     * The approval channel a run asks through — and the one a paused server run's calls
     * are answered through, so the page asks the same way whichever loop paused.
     *
     * `gatedElsewhere`: a server already decided this call needs a person. The page's
     * policy may still answer it when it has an opinion (`auto` mode allows, a plan
     * refuses), but with none the person is asked. `ruleOnToolCall`'s own fallback —
     * the tool's `needsApproval` — reads a tool the page does not have, and said
     * "allow": the page approved, silently, what the server wanted a person to decide.
     */
    private _approvalResolverFor(targetElement: AparteChatTargetElement, gatedElsewhere = false): StreamApprovalResolver {
        return this.options.approvalResolver
            ?? (async (call: { id: string; name: string; input: Record<string, unknown> }, sig: AbortSignal) => {
                const ruling: AparteApprovalRuling = gatedElsewhere
                    ? (this._config.getApprovalPolicy()?.(call, this._config.getTools().find((t) => t.name === call.name)) ?? { verdict: 'ask' })
                    : this._config.ruleOnToolCall(call);
                if (ruling.verdict === 'allow') return { approved: true };
                if (ruling.verdict === 'deny') {
                    // Truthiness, not `??`: an empty reason would otherwise be the whole
                    // `tool` message, or fall through to "the user rejected this" downstream.
                    return { approved: false, reason: ruling.reason?.trim() || 'Tool execution was refused by the approval policy.', by: 'policy' };
                }
                return this._askForApproval(call, sig, targetElement as unknown as HTMLElement);
            });
    }


    /**
     * The answers a paused server run waits for, asked HERE because only the page can: an
     * approval through the same channel a run in the page uses (the panel, the policy, a
     * host's own resolver), a browser tool through the handler `registerTool` gave it.
     * A `queued` call needs nothing — the server runs it on resume. `undefined` when
     * nobody answered — the turn was stopped, or the channel gave up — and there is no
     * resume. A channel that CRASHES fails the turn, as it does for a run in the page.
     */
    private async _answerDeferred(
        targetElement: AparteChatTargetElement,
        pending: StreamDeferredCall[],
        signal: AbortSignal,
        rowEvents?: AparteStreamRunEmitter,
        approvedBefore: ReadonlySet<string> = new Set(),
        approvedNow: Set<string> = new Set(),
    ): Promise<Record<string, StreamDeferredOutcome> | undefined> {
        const outcomes: Record<string, StreamDeferredOutcome> = {};
        const resolver = this._approvalResolverFor(targetElement, true);
        // A refusal ends the pause's later calls, as it ends the turn's in the page's own
        // loop: nobody is asked about them and none of them runs — but each is ANSWERED, as
        // not run. Left without an answer, a server pauses on it again and an AG-UI agent
        // hands its model a call nothing answers, which providers reject.
        const refuseTheRest = (after: number): void => {
            for (const rest of pending.slice(after + 1)) {
                outcomes[rest.toolCallId] = { kind: 'decision', approved: false, reason: NOT_RUN_AFTER_A_REFUSAL, by: 'earlier-refusal' };
            }
        };
        for (const [index, p] of pending.entries()) {
            if (signal.aborted) break;
            const call = { id: p.toolCallId, name: p.name, input: (p.input ?? {}) as Record<string, unknown> };
            if (p.reason === 'approval') {
                let decision: Awaited<ReturnType<StreamApprovalResolver>> | undefined;
                try {
                    decision = await resolver(call, signal);
                } catch (error: unknown) {
                    // Resuming without the answer only paused the same call again. The
                    // turn's error exit closes the calls.
                    if (!signal.aborted && (error as { name?: string } | undefined)?.name !== 'AbortError') throw error;
                }
                if (!decision || signal.aborted) return undefined;
                outcomes[p.toolCallId] = { kind: 'decision', ...decision };
                if (decision.approved) approvedNow.add(approvalKey(call));
                else { refuseTheRest(index); break; }
            } else if (p.reason === 'external') {
                // The page's gate first, the one its own loop applies: a browser tool asked
                // for by a server or an AG-UI agent used to run without its `needsApproval`
                // or the approval policy ever being consulted.
                let gate: Awaited<ReturnType<StreamApprovalResolver>> | null | undefined = null;
                const key = approvalKey(call);
                if (!approvedBefore.has(key) && !approvedNow.has(key)) {
                    try {
                        gate = await this._gateBrowserTool(call, signal, targetElement, rowEvents);
                    } catch (error: unknown) {
                        if (!signal.aborted && (error as { name?: string } | undefined)?.name !== 'AbortError') throw error;
                        gate = undefined;
                    }
                }
                if (gate === undefined || signal.aborted) return undefined;
                if (gate && !gate.approved) {
                    outcomes[p.toolCallId] = { kind: 'decision', ...gate };
                    refuseTheRest(index);
                    break;
                }
                // An approval may carry a payload, merged into the input as the page's own
                // loop merges it.
                const payload = gate?.payload;
                const ran = payload && typeof payload === 'object' && !Array.isArray(payload)
                    ? { ...call, input: { ...call.input, ...(payload as Record<string, unknown>) } }
                    : call;
                const handler = this._config.getToolHandler(p.name);
                try {
                    if (!handler) throw new Error(`No browser handler is registered for "${p.name}".`);
                    const result = await handler(ran, signal, { target: targetElement as unknown as HTMLElement, config: this._config });
                    outcomes[p.toolCallId] = {
                        kind: 'result',
                        content: result.content,
                        ...(result.structuredContent !== undefined ? { structuredContent: result.structuredContent } : {}),
                    };
                } catch (error: unknown) {
                    if (signal.aborted) break;
                    outcomes[p.toolCallId] = { kind: 'failed', error: error instanceof Error ? error.message : String(error) };
                }
            }
        }
        return signal.aborted ? undefined : outcomes;
    }

    /**
     * Whether a browser tool a paused run asked for may run, decided as a run in the page
     * decides it. With a host `approvalResolver`, the tool's own `needsApproval` says whether
     * to ask and the resolver answers; without one, the approval policy and `needsApproval`
     * rule (`ruleOnToolCall`) and the default channel asks. `null` when nothing gates the
     * call, the decision when something did, `undefined` when nobody answered.
     */
    private async _gateBrowserTool(
        call: AparteToolCall,
        signal: AbortSignal,
        targetElement: AparteChatTargetElement,
        rowEvents?: AparteStreamRunEmitter,
    ): Promise<Awaited<ReturnType<StreamApprovalResolver>> | null | undefined> {
        const ruling = this.options.approvalResolver
            ? (this._config.getTools().find((t) => t.name === call.name)?.needsApproval ? 'ask' : 'allow')
            : this._config.ruleOnToolCall(call).verdict;
        if (ruling === 'allow') return null;
        // Someone is about to be asked: the row says so, and `aparte-tool-approval-request`
        // fires, as for a call gated in the page's own loop. A `deny` is decided already.
        if (ruling === 'ask') rowEvents?.({ type: 'tool-awaiting-approval', toolCallId: call.id, name: call.name, input: call.input });
        const decision = (await this._approvalResolverFor(targetElement)(call, signal)) ?? undefined;
        // Back to running, and still PAUSED: the resume hands this call back open for its
        // result to answer. Not through `rowEvents` — that adapter never saw the call start,
        // so it takes any settle for the end of the pause and drops `deferred`, and the
        // history then answered the call "stopped before it ran".
        if (decision?.approved && ruling === 'ask') targetElement.updateSegment?.(`tool-${call.id}`, { status: 'pending' } as Partial<AparteSegment>);
        return decision;
    }

    /**
     * The ticket is spent the moment the resume leaves: the server answers these calls
     * now, so a pause saved from here on — the conversation manager saves before it cuts a
     * switch — would be resumed a second time, against a server that has moved on. The
     * history that resumes them is built first; a new pause marks what still waits.
     */
    private _spendPause(targetElement: AparteChatTargetElement, messageId: string): void {
        const segments = targetElement.getMessage?.(messageId)?.segments
            ?? targetElement.getMessages?.()?.find((m) => m.id === messageId)?.segments;
        const paused = (segment: AparteSegment): segment is AparteToolCallSegment =>
            segment.type === 'tool_call' && Boolean((segment as AparteToolCallSegment).deferred);
        if (!segments?.some(paused)) return;
        targetElement.updateMessage?.(messageId, {
            segments: segments.map((segment) => {
                if (!paused(segment)) return segment;
                const { deferred: _spent, ...rest } = segment;
                return rest;
            }),
        });
    }

    /**
     * Close the reply's calls that can no longer finish — paused, queued, or running on a
     * server the page stopped listening to: each says it stopped, and forgets the pause.
     * A cut connection carries none of their last events, so nothing else would: the rows
     * would spin, and a queued call would keep its ticket, which a reload would then
     * resume against a server that had moved on. By the reply's id, not the chat's head — a retry during
     * the wait moves the head. A run in the page ends every call itself: nothing to do.
     */
    private _closeOpenCalls(targetElement: AparteChatTargetElement, messageId: string): void {
        const segments = targetElement.getMessage?.(messageId)?.segments
            ?? targetElement.getMessages?.()?.find((m) => m.id === messageId)?.segments;
        const unfinished = (segment: AparteSegment): segment is AparteToolCallSegment =>
            segment.type === 'tool_call'
            && ((segment as AparteToolCallSegment).status === 'pending' || (segment as AparteToolCallSegment).status === 'awaiting-approval');
        if (!segments?.some(unfinished)) return;
        targetElement.updateMessage?.(messageId, {
            segments: segments.map((segment) => {
                if (!unfinished(segment)) return segment;
                const { deferred: _spent, ...rest } = segment;
                return { ...rest, status: 'aborted' as const };
            }),
        });
    }

    /**
     * The history a resume sends: the request the turn was sent with — interceptor and
     * `history` option included, not rebuilt from the transcript — then the reply so
     * far, its paused calls left open for the server to answer.
     */
    private _resumeMessages(targetElement: AparteChatTargetElement, messageId: string, sent: AparteChatMessage[]): AparteChatMessage[] {
        const reply = targetElement.getMessages?.().find((m) => m.id === messageId);
        return [...sent, ...(reply ? wireTurns(reply, segmentsToWireText, { openDeferred: true }) : [])];
    }

    /**
     * What the send of a reloaded turn put before its reply, rebuilt the way
     * `_buildMessages` builds it: the system prompts, the history `options.history`
     * asks for — given the transcript before the reply, where the send also saw the
     * reply's empty shell; handing over the paused reply would send it twice — and the
     * message that asked.
     * That message goes as its text: the files a send read are not in a transcript.
     */
    private _resumeBase(all: AparteMessage[], replyIndex: number): AparteChatMessage[] {
        const before = all.slice(0, replyIndex);
        const askedAt = before.map((m) => m.role).lastIndexOf('user');
        const historyOption = this.options.history ?? 'viewport';
        const history = historyOption === 'viewport' ? this._toHistoryMessages(before)
            : typeof historyOption === 'function' ? historyOption(before)
                : [];
        return mergeAdjacentUserMessages([
            ...this._systemMessages(), ...history,
            ...(askedAt >= 0 ? wireMessages([before[askedAt]!]) : []),
        ]);
    }

    /**
     * A new message closes a wait nobody answered. The paused calls of the last reply are
     * marked stopped, so the history the new turn sends answers them ("stopped before it
     * ran") — a provider rejects a request that declares a call with no answer.
     */
    private _closeDeferred(targetElement: AparteChatTargetElement): void {
        const messages = targetElement.getMessages?.() ?? [];
        const last = [...messages].reverse().find((m) => m.role === 'assistant');
        if (!last?.segments?.some(isOpenDeferred)) return;
        const segments = last.segments.map((segment) => {
            if (!isOpenDeferred(segment)) return segment;
            const { deferred: _closed, ...rest } = segment;
            return { ...rest, status: 'aborted' as const };
        });
        targetElement.updateMessage?.(last.id, { segments });
    }

    /**
     * Answer a turn a server loop paused, when the conversation comes back — a reload, a
     * conversation reopened days later. The last reply's paused calls (they carry the
     * server's ticket) are put to the person again, or run in the page, and the loop
     * resumes on the server, into the same bubble.
     *
     * Called on its own when a conversation manager loads a conversation
     * (`aparte-conversation-loaded`); call it yourself after `setMessages` if you load
     * conversations another way. Resolves `true` when a resume ran, `false` when there
     * was nothing to resume.
     *
     * @param target The chat — an element, or its id. Defaults to the one `targetResolver` names, else the first on the page.
     */
    async resumeDeferred(target?: HTMLElement | string): Promise<boolean> {
        const host = typeof target === 'string' ? this._byId(target) : target ?? this.options.targetResolver?.() ?? null;
        const targetElement = (host ? this._asRenderTarget<HTMLElement>(host) : this._scanForTarget<HTMLElement>()) as AparteChatTargetElement | null;
        if (!targetElement) return false;
        const messages = targetElement.getMessages?.() ?? [];
        const last = [...messages].reverse().find((m) => m.role === 'assistant');
        const open = (last?.segments ?? []).filter(isOpenDeferred);
        const ticket = open.find((s) => s.deferred?.ticket)?.deferred?.ticket;
        // Not a reply a turn is already running into: a live pause waits on its panel, and a
        // second load of the conversation (a click on the one already open) would otherwise
        // start the same reply again and put the same question twice.
        if (!last || open.length === 0 || !ticket || this._resuming.has(last.id) || this._turnsInFlight.has(last.id)) return false;

        const config = this._config.getModelConfig();
        // The model the turn ran on, when its provider is still here; else today's default.
        const recorded = last.model && this._config.getAIProvider(last.model.providerId) ? last.model : undefined;
        const providerId = recorded?.providerId ?? config.defaultProvider;
        const provider = this._providerFor(providerId);
        if (!provider) {
            console.warn('[AparteClient] Cannot resume the paused turn: no provider is selected.');
            return false;
        }
        // A fresh turn, like a send: a Stop pressed on an earlier one does not cancel it.
        this._beginUserTurn();
        this._resuming.add(last.id);
        try {
            const authConfig = provider.id ? await this._resolveAuth(provider.id) : undefined;
            const pending: StreamDeferredCall[] = open.map((s) => ({
                toolCallId: s.toolCall.id, name: s.toolCall.name, input: s.toolCall.input, reason: s.deferred!.reason,
            }));
            const base = this._resumeBase(messages, messages.indexOf(last));
            await this._streamTurn(targetElement, last.id, provider, base, recorded?.modelId ?? config.defaultModel ?? '', authConfig, {
                resume: { pending, ticket },
                rebuild: async () => {
                    const now = targetElement.getMessages?.() ?? [];
                    const at = now.findIndex((m) => m.id === last.id);
                    return at >= 0 ? this._resumeBase(now, at) : base;
                },
                ...(recorded?.temperature !== undefined ? { temperature: recorded.temperature } : {}),
            });
        } finally {
            this._resuming.delete(last.id);
        }
        return true;
    }

    /** Replies being resumed, so a second load of the same conversation does not ask twice. */
    private readonly _resuming = new Set<string>();

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
        // below). The code rides as `code`, which the alert never draws: `details` is for
        // text an app chooses to show, and the person had no use for `UNKNOWN_ERROR`.
        const errorSegment: AparteErrorSegment = {
            id: `error-${uuid()}`,
            type: 'error',
            content: error.message,
            code: error.code,
        };

        if (target.updateMessage) {
            /*
             * APPEND the error, never replace the reply.
             *
             * Replacing with `segments: [errorSegment]` would destroy everything already
             * streamed and rendered — text, the thinking block, artifacts, resolved tool
             * calls — the moment a provider emits a mid-stream `error` event, or a tool
             * handler throws anything that is not an `AbortError`. A partial answer plus
             * an error is the truth; an empty bubble with an error in it is a lie about
             * what the model said.
             */
            /*
             * TREE-WIDE first, active path second.
             *
             * `getMessages()` returns only the ACTIVE path, so the append-not-replace rule
             * would silently become a full replace for any message that has left that
             * path. A retry or an edit on an earlier bubble does precisely that to a reply
             * still in flight: the reply stays in the tree, drops off the path, and the
             * error handler would find no segments, pass `[errorSegment]`, and
             * `updateMessage` — which resolves ids tree-wide — would overwrite every token
             * already streamed.
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

        dispatchLifecycleEvent(target, 'aparte-message-error', { messageId, error }, this._targetIdOf(target));
    }
}
