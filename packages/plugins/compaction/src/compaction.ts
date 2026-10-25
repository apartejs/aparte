/**
 * compaction.ts — `setupCompaction`: the controller that answers `aparte-compact`.
 *
 * One compaction is: resolve the chat, select what to summarise (the budget-aware
 * selector over the current model by default), summarise it through the config's
 * transport — or a summariser of the host's — then replace the transcript with the
 * summary as a notice followed by the kept turns verbatim. Every step that can fail
 * reports on `window` (`aparte-compact-start` / `-done` / `-error`, each naming the
 * chat) AND in the returned outcome, so a host that called `compact()` itself never
 * has to listen for the answer to its own call.
 *
 * What this file is careful about, each learned on the client's version of it:
 *   - one compaction at a time per setup — a second request while one runs is
 *     reported skipped, not started (two paid summaries, both replacing the transcript);
 *   - a transcript with a turn in flight is left alone — summarising under a streaming
 *     reply would drop it;
 *   - the summarisation has its OWN abort controller, reached by `abort()` and by an
 *     `aparte-abort` addressed to the chat, so a summary the user cancelled stops there;
 *   - and a summary nobody cancelled is refused too when the transcript it was written
 *     from is gone: if not one selected turn is left on the target when the model
 *     answers, the conversation was switched (or reset) underneath, and the summary
 *     would land over a transcript it never read;
 *   - what arrived while the summary was being written is kept: the replacement is
 *     summary, then the kept turns, then anything newer than the selection;
 *   - a chat is addressed by id through the same rule the gauge and the client use, and
 *     `scopeToTargetId` makes a setup answer one chat on a page that has several.
 */

import {
    aparteGlobalConfig, contentToText, resolveConfig, revokeAttachmentUrls, uuid,
    type AparteConfig, type AparteMessage, type AparteChatMessage, type AparteChatRequest, type AparteStreamEvent,
    type AparteAIProvider, type AparteCompactDoneEventDetail, type AparteCompactErrorEventDetail,
    type AparteCompactStartEventDetail,
} from '@aparte/core';
import {
    computeHistoryBudget, DEFAULT_COMPACTION_CONFIG, estimateTokens, splitHistoryBudget,
} from './budget.js';
import { createCompactionSelector, type CompactionSelection } from './selector.js';
import { DEFAULT_COMPACTION_PROMPT, transcriptForSummary } from './transcript.js';

/**
 * The three things a chat must expose to be compacted: read the active path, empty
 * it, append to it. `<aparte-chat-viewport>` does; an `<aparte-chat>` shell hands over
 * its viewport. A host whose transcript lives elsewhere (a framework store) gives
 * `resolveTarget` an object of its own.
 */
export interface CompactionTarget {
    getMessages(): AparteMessage[];
    /**
     * Empty the transcript. A compaction passes `{ revokeAttachments: false }`,
     * because it puts the kept turns straight back: `<aparte-chat-viewport>` releases
     * every message's object URLs on the way out, which killed the images and files of
     * the turns the compaction was keeping. It revokes the summarised-away ones itself
     * afterwards. A target that ignores the argument keeps working — it just leaks the
     * URLs of what it drops, which is what it did before this existed.
     */
    clearAll(options?: { revokeAttachments?: boolean }): void;
    appendMessage(message: AparteMessage): void;
}

/** Which messages are summarised (`drop`) and which stay verbatim (`keep`). Pure — no model call. */
export type CompactionMessageSelector = (messages: AparteMessage[]) => CompactionSelection<AparteMessage>;

/** The key (or record of settings) for a provider — the same shape `AparteClientOptions.keyResolver` takes. */
export type CompactionKeyResolver = (
    providerId: string,
) => string | Record<string, string> | undefined | null | Promise<string | Record<string, string> | undefined | null>;

/**
 * Replaces the model call: given the summarisation request, return the summary text.
 * The request asks for a stream (`stream: true`) and carries `maxTokens`, a ceiling on the
 * answer that keeps it inside the window — a summariser that talks to a model should pass both on.
 */
export type CompactionSummarizer = (request: AparteChatRequest, signal: AbortSignal) => Promise<string>;

/** Why a compaction did nothing. */
export type CompactionSkipReason =
    /** The transcript is empty. */
    | 'empty'
    /** The selector kept everything — within budget, or nothing older than what is kept. */
    | 'nothing-to-drop'
    /** A compaction is already running for this setup. */
    | 'running'
    /** A turn is in flight in the transcript; compacting under it would drop it. */
    | 'streaming'
    /**
     * The current model declares no `contextWindow` and nothing of the host's sizes the
     * request (no `selector`, no `summarize`, no `keepWithoutWindow`). Without a window the
     * default would send everything but the last few messages in one request, which a small
     * model refuses as over its context. Declare the window, or pass one of the three.
     */
    | 'no-window';

export type CompactionOutcome =
    | { ok: true; skipped: true; reason: CompactionSkipReason; targetId?: string }
    | { ok: true; skipped: false; summary: string; kept: number; dropped: number; targetId?: string }
    | { ok: false; error: string; targetId?: string };

export interface CompactionSetupOptions {
    /**
     * Which messages are summarised away and which stay verbatim.
     *
     * Default: `createCompactionSelector` over the current model — its `contextWindow`,
     * the resolved system prompt and the registered tools set the budget, and the
     * newest turns that fit the window stay. When the current model declares no
     * window there is no budget to walk, and the compaction skips (`'no-window'`)
     * unless the host sizes the request itself: a `selector`, a `summarize` or
     * `keepWithoutWindow`.
     */
    selector?: CompactionMessageSelector;
    /**
     * How many of the newest messages stay when the model declares no window; everything
     * older goes to the summariser in ONE request, so the number is the host's bet that it
     * fits the model. Passing it is the opt-in: left out, a model without a window makes the
     * default compaction skip with `'no-window'`, since nothing says the request would fit.
     * Without a `selector` of your own, `4` (the last two exchanges) is what it takes when
     * you opt in through `summarize` alone. Ignored when the model declares a window.
     */
    keepWithoutWindow?: number;
    /**
     * The summariser's instruction — carried by the ask itself, not by a `system`
     * message, so a provider that imposes its own system prompt cannot drop it.
     * English by default — it is addressed to the model, not to the user — asking for
     * the decisions, the open tasks and the tool results that still matter. Replace it
     * to steer the summary (a language, a domain, a length).
     */
    prompt?: string;
    /**
     * The key for the provider, when it is not on the config (`config.setKeyProvider`)
     * — the resolver an `AparteClient` was given can be passed here as is. Consulted
     * first; `config.getKey(providerId)` is the fallback.
     */
    keyResolver?: CompactionKeyResolver;
    /**
     * Replace the model call entirely. The request carries the transcript of the
     * dropped turns, then a final `user` message holding the summariser's instruction
     * and the ask, `stream: true`, `maxTokens` (a ceiling on the answer that keeps it
     * inside the window) and `_meta: { compaction: true }`; return the summary text. Your own call
     * is not trimmed to the window — the sizing is yours — but a summary that is no
     * shorter than the turns it replaces is still refused. For a
     * host with an endpoint of its own, or a cheaper model for summaries. With one, no
     * provider needs to be configured at all.
     */
    summarize?: CompactionSummarizer;
    /**
     * Resolve the chat to compact. Default: the element whose id is the `targetId`
     * (or, unnamed, the first `<aparte-chat>` / `<aparte-chat-viewport>` /
     * `[data-aparte-chat]` on the page), taking its viewport when the element itself
     * cannot render. Return your own object for a transcript that lives in a store.
     */
    resolveTarget?: (targetId?: string) => CompactionTarget | null;
    /**
     * Answer only the `aparte-compact` and `aparte-abort` events that name this chat
     * id, and compact it when `compact()` is called without one. For a page with
     * several chats and one setup per chat.
     */
    scopeToTargetId?: string;
    /** Listen for `aparte-compact` and `aparte-abort` on `window`. Default `true`; `false` for a host that calls `compact()` itself. */
    listen?: boolean;
}

export interface CompactionController {
    /**
     * Compact one chat — the one `targetId` names, else the scoped one, else the
     * first on the page. Never rejects: the outcome says what happened, and the
     * same information goes out as `aparte-compact-done` / `aparte-compact-error`.
     */
    compact(targetId?: string): Promise<CompactionOutcome>;
    /** Abort the summarisation in flight, if any. The transcript is left untouched. */
    abort(): void;
    /** `true` while a summarisation is in flight. */
    readonly running: boolean;
    /** Remove the listeners and forget this setup; an in-flight summarisation is aborted. */
    dispose(): void;
}

const ABORTED = 'Compaction aborted';

/**
 * The model call, settled by the signal as well as by itself: an abort resolves the
 * compaction NOW, whether or not the transport (or a host's `summarize`) honours the
 * signal — a late result is discarded. Without this, a transport that ignored the
 * signal kept `running` true for as long as it pleased.
 */
const withAbort = <T>(work: Promise<T>, signal: AbortSignal): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const onAbort = (): void => reject(new Error(ABORTED));
        if (signal.aborted) {
            onAbort();
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        work.then(
            (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
            (error: unknown) => { signal.removeEventListener('abort', onAbort); reject(error); },
        );
    });

/** The setup per config, so a hot-reloading host does not stack listeners. */
const controllers = new WeakMap<AparteConfig, CompactionController>();

/**
 * The configs whose setup answers the window's requests for any chat on them: listening,
 * and not scoped to one chat. Only those make another setup step aside — a setup with
 * `listen: false`, or one scoped to another chat, answers nothing for the rest. In the order
 * they were set up: a chat whose config has none is answered by the first.
 */
const answering = new Set<AparteConfig>();

/**
 * The chats a listening setup is scoped to (`scopeToTargetId`), with how many setups name each:
 * a chat named by a scoped setup is that setup's, and the others step aside for it.
 */
const scopedChats = new Map<string, number>();

/**
 * The `resolveTarget` of every listening, unscoped setup that brought its own, with how many
 * setups pass each: a chat that is not on the page (a transcript in a store) is answered by the
 * setup whose resolver knows it, and by none of the others. A scoped setup's resolver is not
 * here — the chat it answers is in `scopedChats`, and it answers no other.
 */
const ownResolvers = new Map<(targetId?: string) => CompactionTarget | null, number>();

const asTarget = (candidate: unknown, depth = 0): CompactionTarget | null => {
    if (!candidate || typeof candidate !== 'object' || depth > 1) return null;
    const el = candidate as Partial<CompactionTarget> & { viewport?: unknown };
    if (typeof el.getMessages === 'function' && typeof el.clearAll === 'function' && typeof el.appendMessage === 'function') {
        return el as CompactionTarget;
    }
    // The `<aparte-chat>` shell matches the selectors but renders through its viewport.
    return asTarget(el.viewport, depth + 1);
};

/** The default target: by id, else the first chat host on the page that can render. */
const resolveDomTarget = (targetId?: string): CompactionTarget | null => {
    if (typeof document === 'undefined') return null;
    if (targetId) return asTarget(document.getElementById(targetId));
    for (const el of document.querySelectorAll('aparte-chat, aparte-chat-viewport, [data-aparte-chat]')) {
        const target = asTarget(el);
        if (target) return target;
    }
    return null;
};

/** A host without a document (Node, a test of the selection alone) gets the outcome and no events. */
const hasWindow = typeof window !== 'undefined';

const inFlight = (message: AparteMessage): boolean => message.status === 'streaming' || message.status === 'pending';

/** The default selector: the engine budget over the current model, read at each call. */
function defaultSelector(config: AparteConfig, keepWithoutWindow: number): CompactionMessageSelector {
    const budgeted = createCompactionSelector({
        contextWindow: () => config.getCurrentModel()?.contextWindow,
        systemPrompt: () => config.resolveSystemPrompt(),
        tools: () => config.getTools(),
    });
    return (messages) => {
        if (config.getCurrentModel()?.contextWindow) return budgeted(messages);
        const cut = Math.max(0, messages.length - keepWithoutWindow);
        return { keep: messages.slice(cut), drop: messages.slice(0, cut) };
    };
}

/** The turns that reach the summariser: the dropped ones as transcript lines, minus what is in flight or says nothing. */
const summarisable = (drop: AparteMessage[]): AparteChatMessage[] =>
    drop
        .filter((m) => !inFlight(m))
        .map((m) => ({ role: m.role, content: transcriptForSummary(m) }))
        .filter((m) => contentToText(m.content).length > 0);

/** The ask that closes the request. One place, because the input bound has to count what it sends. */
const askFor = (prompt: string): string => `${prompt}

Please summarize the conversation above.`;

/**
 * The summarisation request: the instruction, the dropped turns as a transcript, the ask.
 *
 * Every turn being deleted is summarised, minus the ones still in flight — the same
 * `inFlight` predicate `compact()` guards the whole transcript with, so the two cannot
 * disagree. The clause here used to be hand-written and demanded `status: 'completed'`
 * on an assistant turn, which meant a host appending its own messages (no `status` at
 * all — the shape the docs teach) had its replies deleted without ever reaching the
 * summariser. A turn that ended in an error is summarised too: the user read it, and it
 * is about to be deleted.
 */
function buildRequest(drop: AparteMessage[], prompt: string, modelId: string, maxTokens: number): AparteChatRequest {
    return {
        messages: [
            ...summarisable(drop),
            // The instruction rides the USER turn, not a `system` message.
            //
            // A system message is a persona, and a provider is entitled to own that: one
            // serving a local model under a fixed training contract replaces the request's
            // system message with its own, by design. When it does, the summarisation
            // instruction simply never arrives — and nothing errors, because the request is
            // still well formed. The model reads the bare "Please summarize this
            // conversation." after somebody else's persona and answers something plausible:
            // measured on a consumer's local model, one reply refused for want of internet
            // access, one said "noted, I'll do it", and one invented figures for a client
            // that appears nowhere in the transcript — which then landed in the transcript
            // as the summary notice and became the premise of every following turn.
            //
            // The instruction is not a persona: it is the task of this one request, and the
            // task belongs where every provider must look. Reported as #45 by a consumer who
            // only found it by reading the output closely.
            { role: 'user', content: askFor(prompt) },
        ],
        modelId,
        // Streamed, so an `error` event and a `done` that says the model ran out of room
        // reach the drain below; a non-streamed answer cut at the limit is just a string.
        stream: true,
        // A ceiling on the answer, so a server cannot let it run until the context is
        // full (see `summaryAnswerCap`).
        maxTokens,
        // Named as what it is, so a backend can route it to a cheaper model.
        _meta: { compaction: true },
    };
}

/**
 * The model call through the config's transport, streamed, drained strictly: an `error`
 * event throws (the text before it is a fragment, not a summary), and so does a `done`
 * that reports the length limit (a summary cut off mid-sentence would replace the
 * conversation it was meant to carry). A transport that answers with a plain string
 * is taken as the whole summary.
 */
async function summarizeThroughTransport(
    config: AparteConfig,
    provider: AparteAIProvider,
    request: AparteChatRequest,
    signal: AbortSignal,
    keyResolver: CompactionKeyResolver | undefined,
): Promise<string> {
    const resolved = keyResolver ? await keyResolver(provider.id) : undefined;
    const auth = resolved || (await config.getKey(provider.id)) || undefined;
    // The key was resolved asynchronously; an abort may have landed meanwhile.
    if (signal.aborted) throw new Error(ABORTED);
    const response = await config.getTransport().chat(provider, request, auth, { providerId: provider.id, signal });
    if (typeof response === 'string') return response;
    const reader = (response as ReadableStream<AparteStreamEvent>).getReader();
    const chunks: string[] = [];
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.type === 'text') chunks.push(value.delta);
            else if (value.type === 'error') throw new Error(value.message);
            else if (value.type === 'done' && value.finishReason === 'length') {
                throw new Error("The summary was cut off at the model's length limit");
            }
        }
    } catch (err: unknown) {
        // Stop the producer: nobody reads the rest of a refused answer.
        void reader.cancel().catch(() => undefined);
        throw err;
    } finally {
        reader.releaseLock();
    }
    return chunks.join('');
}

/**
 * The ceiling on the summary's answer, sent as the request's `maxTokens`.
 *
 * It protects the window, not the summary's length: without one, a server lets the answer
 * run until the context is full. A quarter of the window, at most the budget's
 * `reservedGeneration` (the room every request already keeps for a reply), and never below
 * the room the window walk holds back for the summary (`summaryRatio` of the history
 * budget, capped by `summaryMaxTokens`). It is deliberately looser than that reservation:
 * on a 4 096-token model the reservation is about 118 tokens, and a reasoning model spends
 * more than that thinking before it writes a word, so a cap that tight would cut every
 * summary off and every compaction would be refused. With no window, `reservedGeneration`.
 */
function summaryAnswerCap(config: AparteConfig, contextWindow: number | undefined): number {
    const { reservedGeneration } = DEFAULT_COMPACTION_CONFIG;
    if (!contextWindow || contextWindow <= 0) return reservedGeneration;
    const budget = computeHistoryBudget({
        systemPrompt: config.resolveSystemPrompt() ?? '',
        toolsArray: config.getTools(),
        config: { contextWindow },
    });
    const reservation = splitHistoryBudget(budget.historyBudget, budget.config).summary;
    return Math.max(1, reservation, Math.min(reservedGeneration, Math.floor(contextWindow / 4)));
}

/**
 * How many of the dropped turns, oldest first, the summarisation request can carry: the
 * instruction and their transcript must fit the window less the answer's room, the
 * reserved thinking and the safety margin (the budget's own defaults). The turns past
 * that point are not summarised now — they stay verbatim, and the next compaction takes them.
 */
function fitOldest(drop: AparteMessage[], prompt: string, contextWindow: number, maxTokens: number): number {
    const room = contextWindow - maxTokens - DEFAULT_COMPACTION_CONFIG.reservedThinking - DEFAULT_COMPACTION_CONFIG.safetyMargin;
    let used = estimateTokens(askFor(prompt));
    for (let i = 0; i < drop.length; i++) {
        used += summarisable([drop[i]!]).reduce((sum, m) => sum + estimateTokens(contentToText(m.content)), 0);
        if (used > room) return i;
    }
    return drop.length;
}

/**
 * Install compaction on a config. Returns the controller; the same call on the same
 * config replaces the previous setup (its listeners are removed first).
 *
 * ```ts
 * import { setupCompaction } from '@aparte/plugin-compaction';
 *
 * const compaction = setupCompaction();          // the global config, the current model's budget
 * // `<aparte-context auto-compact>` now asks for a compaction on reaching 90 %;
 * // or ask yourself:
 * await compaction.compact();
 * ```
 */
export function setupCompaction(options: CompactionSetupOptions = {}, config: AparteConfig = aparteGlobalConfig): CompactionController {
    controllers.get(config)?.dispose();

    const keepWithoutWindow = Math.max(0, options.keepWithoutWindow ?? 4);
    const select = options.selector ?? defaultSelector(config, keepWithoutWindow);
    const resolveTarget = options.resolveTarget ?? resolveDomTarget;
    const scope = options.scopeToTargetId;

    let running: { targetId: string | undefined; abort: AbortController } | null = null;
    let disposed = false;

    /**
     * Is a window event for this setup? Scoped: only the chat it names. Otherwise a chat
     * is answered by the setup on ITS OWN config (the one its boundary, `attachConfig`,
     * resolves), and only when that config has none by another: the global setup answers
     * every chat (the single-chat page, which must need no wiring), a setup on a config of
     * its own answers a chat on the global config. Never both: a page with a global setup
     * and an instance one answered a global chat twice — two summaries, one from the
     * wrong model.
     */
    const addressed = (e: Event): boolean => {
        const targetId = (e as CustomEvent<{ targetId?: string } | undefined>).detail?.targetId;
        if (scope) return targetId === scope;
        // A chat a scoped setup names is that setup's alone.
        if (targetId && scopedChats.has(targetId)) return false;
        if (typeof document === 'undefined') return true;
        const el = targetId
            ? document.getElementById(targetId)
            : document.querySelector<HTMLElement>('aparte-chat, aparte-chat-viewport, [data-aparte-chat]');
        if (!el && targetId) {
            // Not on the page: the setup whose own resolver knows it answers it, and only that
            // one. When no resolver knows it, the routing below picks a setup as for any other
            // chat, and that one says it found nothing: a request is never dropped in silence.
            if (options.resolveTarget && resolveTarget(targetId)) return true;
            for (const other of ownResolvers.keys()) if (other(targetId)) return false;
        }
        const owner = el ? resolveConfig(el) : aparteGlobalConfig;
        if (owner === config) return true;
        if (answering.has(owner)) return false;
        if (config === aparteGlobalConfig) return true;
        // A chat on the global config, which has no setup: one setup answers it, the first that
        // answers for a whole config. Each of them did, and the chat was summarised — or
        // reported missing — once per setup on the page.
        return owner === aparteGlobalConfig && answering.values().next().value === config;
    };
    const onCompact = (e: Event): void => {
        if (!addressed(e)) return;
        void controller.compact((e as CustomEvent<{ targetId?: string } | undefined>).detail?.targetId);
    };
    const onAbort = (e: Event): void => {
        if (!running) return;
        // An unnamed abort stops whatever runs. One that names a chat stops ours when it is
        // the chat we compact — or, compacting an unnamed one, when it is a chat we answer.
        const targetId = (e as CustomEvent<{ targetId?: string } | undefined>).detail?.targetId;
        if (targetId && (running.targetId ? targetId !== running.targetId : !addressed(e))) return;
        controller.abort();
    };
    const listening = options.listen !== false && typeof window !== 'undefined';
    if (listening) {
        window.addEventListener('aparte-compact', onCompact);
        window.addEventListener('aparte-abort', onAbort);
    }
    if (listening && !scope) answering.add(config);
    if (listening && scope) scopedChats.set(scope, (scopedChats.get(scope) ?? 0) + 1);
    const ownResolver = listening && !scope ? options.resolveTarget : undefined;
    if (ownResolver) ownResolvers.set(ownResolver, (ownResolvers.get(ownResolver) ?? 0) + 1);

    const controller: CompactionController = {
        get running() {
            return running !== null;
        },

        abort() {
            running?.abort.abort();
        },

        dispose() {
            if (disposed) return;
            disposed = true;
            controller.abort();
            if (listening) {
                window.removeEventListener('aparte-compact', onCompact);
                window.removeEventListener('aparte-abort', onAbort);
                if (scope) {
                    const left = (scopedChats.get(scope) ?? 1) - 1;
                    if (left > 0) scopedChats.set(scope, left);
                    else scopedChats.delete(scope);
                }
            }
            if (ownResolver) {
                const left = (ownResolvers.get(ownResolver) ?? 1) - 1;
                if (left > 0) ownResolvers.set(ownResolver, left);
                else ownResolvers.delete(ownResolver);
            }
            if (controllers.get(config) === controller) {
                controllers.delete(config);
                answering.delete(config);
            }
        },

        async compact(requested?: string): Promise<CompactionOutcome> {
            const targetId = requested ?? scope;
            // The events are written out literally, one per site: the docs' events
            // reference reads the dispatch itself to say where an event goes out from.
            const fail = (error: string): CompactionOutcome => {
                // A failure is also said on the console: the documented way to ask is a
                // fire-and-forget `aparte-compact`, and a page with no listener on the
                // error event would otherwise fail in total silence.
                console.warn(`[aparte/plugin-compaction] compaction failed: ${error}`);
                if (hasWindow) window.dispatchEvent(new CustomEvent<AparteCompactErrorEventDetail>('aparte-compact-error', { detail: { error, targetId } }));
                return { ok: false, error, targetId };
            };
            const skip = (reason: CompactionSkipReason): CompactionOutcome => {
                if (hasWindow) window.dispatchEvent(new CustomEvent<AparteCompactDoneEventDetail>('aparte-compact-done', { detail: { skipped: true, reason, targetId } }));
                return { ok: true, skipped: true, reason, targetId };
            };

            if (disposed) return fail('This compaction setup was disposed');
            if (running) return skip('running');

            const target = resolveTarget(targetId);
            if (!target) return fail(targetId ? `No chat with id "${targetId}" to compact` : 'No chat found to compact');

            const messages = target.getMessages();
            if (messages.length === 0) return skip('empty');
            if (messages.some(inFlight)) return skip('streaming');

            const contextWindow = config.getCurrentModel()?.contextWindow;
            // The default selector's fallback without a window sends all but the last few turns
            // in one request, sized by nothing: a small model answers 400, context exceeded. A host
            // that sized it itself (its selector, its summariser, a `keepWithoutWindow`) owns that.
            const hostSizes = options.selector || options.summarize || options.keepWithoutWindow !== undefined;
            if (!contextWindow && !hostSizes) return skip('no-window');

            let { keep, drop } = select(messages);
            if (drop.length === 0) return skip('nothing-to-drop');

            const prompt = options.prompt ?? DEFAULT_COMPACTION_PROMPT;
            const maxTokens = summaryAnswerCap(config, contextWindow);
            if (contextWindow && !options.summarize) {
                const fits = fitOldest(drop, prompt, contextWindow, maxTokens);
                if (fits === 0) return fail('The oldest turn to summarise does not fit the model\'s context window');
                if (fits < drop.length) {
                    // Not summarised now, not lost: they stay verbatim, between the notice and the
                    // turns that were already kept, and the next compaction takes them.
                    keep = [...drop.slice(fits), ...keep];
                    drop = drop.slice(0, fits);
                }
            }

            const modelConfig = config.getModelConfig();
            const providerId = modelConfig.defaultProvider;
            let provider: AparteAIProvider | undefined;
            if (!options.summarize) {
                if (!providerId) return fail('No provider configured');
                provider = config.getAIProvider(providerId);
                if (!provider) return fail(`Provider '${providerId}' not found`);
            }

            const request = buildRequest(drop, prompt, modelConfig.defaultModel || '', maxTokens);
            // The ask alone, with nothing above it: the turns being deleted say nothing a
            // summary could carry. Paying a model to summarise an empty transcript and then
            // replacing the conversation with the answer is worse than doing nothing. (One,
            // not two: the instruction rides the ask now — see `buildRequest`.)
            if (request.messages.length <= 1) return fail('Nothing summarisable in the dropped turns');
            const abort = new AbortController();
            running = { targetId, abort };
            if (hasWindow) window.dispatchEvent(new CustomEvent<AparteCompactStartEventDetail>('aparte-compact-start', { detail: { targetId } }));

            try {
                const raw = await withAbort(
                    options.summarize
                        ? options.summarize(request, abort.signal)
                        : summarizeThroughTransport(config, provider!, request, abort.signal, options.keyResolver),
                    abort.signal,
                );
                const summary = raw.trim();
                if (!summary) throw new Error('Empty summary returned by model');
                // A summary that is not shorter than what it replaces frees nothing, and the
                // turns it replaces are gone for good: refuse it, the transcript stays as it is.
                // (`slice(0, -1)`: the last message is the ask, not a turn.)
                const replaced = request.messages.slice(0, -1).reduce((sum, m) => sum + estimateTokens(contentToText(m.content)), 0);
                if (estimateTokens(summary) >= replaced) throw new Error('The summary is no shorter than the turns it replaces');

                // Replace, in one pass over the live transcript: the summary as a notice
                // (`compaction: true` — the viewport draws it centred without avatar or
                // actions, the history sends it under a preamble saying what it is; its role
                // is `user` because it is context handed to the model, and a `system`
                // message mid-conversation is refused by some providers), then the kept
                // turns AS THEY ARE NOW, then whatever arrived while the summary was written.
                // By id, not by object: the repository replaces a message's object on every
                // update, so a kept turn touched meanwhile would have read as "arrived" and
                // gone in twice.
                const selectedIds = new Set(messages.map((m) => m.id));
                const keptIds = new Set(keep.map((m) => m.id));
                const live = target.getMessages();
                // Nothing selected survived: this is not the transcript that was summarised.
                // A conversation switch (or a reset) replaces the whole active path, and the
                // summary of A would otherwise be written over B — and persisted with it.
                if (!live.some((m) => selectedIds.has(m.id))) return fail('The transcript changed while the summary was being written');
                const kept = live.filter((m) => keptIds.has(m.id));
                const arrived = live.filter((m) => !selectedIds.has(m.id));
                // Not a plain `clearAll()`: the viewport revokes the object URLs of
                // everything it drops, and the kept turns are going straight back in.
                target.clearAll({ revokeAttachments: false });
                target.appendMessage({
                    id: uuid(),
                    role: 'user',
                    compaction: true,
                    content: `**${config.t('compactionSummaryTitle')}**\n\n${summary}`,
                    timestamp: Date.now(),
                    status: 'completed',
                });
                for (const message of kept) target.appendMessage(message);
                for (const message of arrived) target.appendMessage(message);
                // Now the real casualties: a summarised-away turn is off the screen for
                // good, so its `blob:` URLs are released here rather than leaked.
                const survivors = new Set([...kept, ...arrived].map((m) => m.id));
                for (const message of drop) if (!survivors.has(message.id)) revokeAttachmentUrls(message.attachments);

                const outcome: CompactionOutcome = { ok: true, skipped: false, summary, kept: kept.length, dropped: drop.length, targetId };
                if (hasWindow) window.dispatchEvent(new CustomEvent<AparteCompactDoneEventDetail>('aparte-compact-done', { detail: { summary, kept: kept.length, dropped: drop.length, targetId } }));
                return outcome;
            } catch (err: unknown) {
                const aborted = abort.signal.aborted || (err instanceof Error && err.name === 'AbortError');
                return fail(aborted ? ABORTED : err instanceof Error ? err.message : String(err));
            } finally {
                running = null;
            }
        },
    };

    controllers.set(config, controller);
    return controller;
}
