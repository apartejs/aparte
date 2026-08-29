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
 *     `aparte-abort` addressed to the chat, so a summary the user cancelled never lands
 *     over a conversation they moved on from;
 *   - what arrived while the summary was being written is kept: the replacement is
 *     summary, then the kept turns, then anything newer than the selection;
 *   - a chat is addressed by id through the same rule the gauge and the client use, and
 *     `scopeToTargetId` makes a setup answer one chat on a page that has several.
 */

import {
    aparteGlobalConfig, contentToText, resolveConfig, uuid,
    type AparteConfig, type AparteMessage, type AparteChatMessage, type AparteChatRequest, type AparteStreamEvent,
    type AparteAIProvider, type AparteCompactDoneEventDetail, type AparteCompactErrorEventDetail,
    type AparteCompactStartEventDetail,
} from '@aparte/core';
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
    clearAll(): void;
    appendMessage(message: AparteMessage): void;
}

/** Which messages are summarised (`drop`) and which stay verbatim (`keep`). Pure — no model call. */
export type CompactionMessageSelector = (messages: AparteMessage[]) => CompactionSelection<AparteMessage>;

/** The key (or record of settings) for a provider — the same shape `AparteClientOptions.keyResolver` takes. */
export type CompactionKeyResolver = (
    providerId: string,
) => string | Record<string, string> | undefined | null | Promise<string | Record<string, string> | undefined | null>;

/** Replaces the model call: given the summarisation request, return the summary text. */
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
    | 'streaming';

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
     * window there is no budget to walk, so the last `keepWithoutWindow` messages
     * stay and the rest is summarised.
     */
    selector?: CompactionMessageSelector;
    /** How many of the newest messages stay when the model declares no window. Default 4 — the last two exchanges. */
    keepWithoutWindow?: number;
    /**
     * The summariser's system prompt. English by default — an instruction to the
     * model, not a string the user reads — asking for the decisions, the open tasks
     * and the tool results that still matter. Replace it to steer the summary (a
     * language, a domain, a length).
     */
    prompt?: string;
    /**
     * The key for the provider, when it is not on the config (`config.setKeyProvider`)
     * — the resolver an `AparteClient` was given can be passed here as is. Consulted
     * first; `config.getKey(providerId)` is the fallback.
     */
    keyResolver?: CompactionKeyResolver;
    /**
     * Replace the model call entirely. The request carries the summariser's system
     * prompt, the transcript of the dropped turns and `_meta: { compaction: true }`;
     * return the summary text. For a host with an endpoint of its own, or a cheaper
     * model for summaries. With one, no provider needs to be configured at all.
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

/** The summarisation request: the instruction, the dropped turns as a transcript, the ask. */
function buildRequest(drop: AparteMessage[], prompt: string, modelId: string): AparteChatRequest {
    const history: AparteChatMessage[] = drop
        .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.status === 'completed'))
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: transcriptForSummary(m) }))
        .filter((m) => contentToText(m.content).length > 0);
    return {
        messages: [
            { role: 'system', content: prompt },
            ...history,
            { role: 'user', content: 'Please summarize this conversation.' },
        ],
        modelId,
        stream: false,
        // Named as what it is, so a backend can route it to a cheaper model.
        _meta: { compaction: true },
    };
}

/** The model call through the config's transport, non-streaming, draining a stream if one comes back anyway. */
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
        }
    } finally {
        reader.releaseLock();
    }
    return chunks.join('');
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
     * Is a window event for this setup? Scoped: only the chat it names. On the global
     * config: every event — the single-chat page, which must need no wiring. On a
     * config of its own, the client's rule: answer a chat unless it demonstrably
     * belongs to ANOTHER instance — one whose boundary (`attachConfig`) resolves a
     * different, non-global config. Without this, two setups on two configs both
     * answered every `aparte-compact`: two summaries, one of them from the wrong model.
     */
    const addressed = (e: Event): boolean => {
        const targetId = (e as CustomEvent<{ targetId?: string } | undefined>).detail?.targetId;
        if (scope) return targetId === scope;
        if (config === aparteGlobalConfig || typeof document === 'undefined') return true;
        const el = targetId
            ? document.getElementById(targetId)
            : document.querySelector<HTMLElement>('aparte-chat, aparte-chat-viewport, [data-aparte-chat]');
        if (!el) return true;
        const owner = resolveConfig(el);
        return owner === config || owner === aparteGlobalConfig;
    };
    const onCompact = (e: Event): void => {
        if (!addressed(e)) return;
        void controller.compact((e as CustomEvent<{ targetId?: string } | undefined>).detail?.targetId);
    };
    const onAbort = (e: Event): void => {
        if (!addressed(e) || !running) return;
        // An abort that names another chat is not ours; an unnamed one stops whatever runs.
        const targetId = (e as CustomEvent<{ targetId?: string } | undefined>).detail?.targetId;
        if (targetId && running.targetId && targetId !== running.targetId) return;
        controller.abort();
    };
    const listening = options.listen !== false && typeof window !== 'undefined';
    if (listening) {
        window.addEventListener('aparte-compact', onCompact);
        window.addEventListener('aparte-abort', onAbort);
    }

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
            }
            if (controllers.get(config) === controller) controllers.delete(config);
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

            const { keep, drop } = select(messages);
            if (drop.length === 0) return skip('nothing-to-drop');

            const modelConfig = config.getModelConfig();
            const providerId = modelConfig.defaultProvider;
            let provider: AparteAIProvider | undefined;
            if (!options.summarize) {
                if (!providerId) return fail('No provider configured');
                provider = config.getAIProvider(providerId);
                if (!provider) return fail(`Provider '${providerId}' not found`);
            }

            const request = buildRequest(drop, options.prompt ?? DEFAULT_COMPACTION_PROMPT, modelConfig.defaultModel || '');
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
                const kept = live.filter((m) => keptIds.has(m.id));
                const arrived = live.filter((m) => !selectedIds.has(m.id));
                target.clearAll();
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
