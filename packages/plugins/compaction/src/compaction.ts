/**
 * compaction.ts — `setupCompaction`: the controller that answers `aparte-compact`.
 *
 * One compaction is: resolve the chat, select what to summarise (the budget-aware
 * selector over the model's view of the conversation by default), summarise it through
 * the config's transport — or a summariser of the host's — then write the summary as a
 * CHECKPOINT on the first message that stays verbatim. Nothing is deleted: the messages
 * above the checkpoint stay on the screen and in storage, and the history the client
 * builds resumes from the checkpoint, so the model reads the summary in their place.
 * Every step that can fail reports on `window` (`aparte-compact-start` / `-done` /
 * `-error`, each naming the chat) AND in the returned outcome, so a host that called
 * `compact()` itself never has to listen for the answer to its own call.
 *
 * What this file is careful about, each learned on the client's version of it:
 *   - one compaction at a time per CHAT — a second request for a chat whose summary is
 *     being written is reported skipped, not started (two paid summaries, both written),
 *     while another chat on the same setup compacts on its own;
 *   - a transcript with a turn in flight is left alone — except the turn being PREPARED
 *     (a send or retry the client is about to make), which the caller names in
 *     `exclude`: it is neither summarised nor counted as in flight;
 *   - the summarisation has its OWN abort controller, reached by `abort()`, by an
 *     `aparte-abort` addressed to the chat and by the abort signal of the request that
 *     asked for it (the client's Stop), so a summary the user cancelled stops there, and a
 *     Restore of the same chat cancels it too;
 *   - and a summary nobody cancelled is refused too when the message it was to sit on
 *     is no longer on the chat's path, or the checkpoint it updates was taken off: the
 *     conversation was switched (or reset) or restored underneath, and a success the host
 *     dropped would be reported as one;
 *   - the checkpoint is the model's own update of the one before it: a second compaction
 *     sends "Summary so far:" and only the messages since, not the whole history again;
 *   - a chat is addressed by id through the same rule the gauge and the client use, and
 *     `scopeToTargetId` makes a setup answer one chat on a page that has several.
 */

import {
    aparteGlobalConfig, contentToText, estimateWireTokens, historyFromCheckpoint, measureContext, resolveConfig,
    type AparteConfig, type AparteMessage, type AparteChatMessage, type AparteChatRequest, type AparteStreamEvent,
    type AparteAIProvider, type AparteCompactDoneEventDetail, type AparteCompactErrorEventDetail,
    type AparteCompactEventDetail, type AparteCompactStartEventDetail, type AparteCompactor,
    type AparteCompactorOutcome, type AparteCompactorReason, type AparteCompactorRequest,
} from '@aparte/core';
import {
    computeHistoryBudget, DEFAULT_COMPACTION_CONFIG, estimateTokens, splitHistoryBudget,
} from './budget.js';
import { cutAtUser, firstRequestBlock, splitFirstRequest } from './cut.js';
import {
    createCompactionSelector, type CompactableMessage, type CompactionLimits, type CompactionSelection, type CompactionSelector,
} from './selector.js';
import { DEFAULT_COMPACTION_PROMPT, messageText, transcriptForSummary } from './transcript.js';

/**
 * What a chat must expose to be compacted: read the active path and update one message
 * of it. `<aparte-chat-viewport>` does; an `<aparte-chat>` shell hands over its viewport.
 * A host whose transcript lives elsewhere (a framework store) gives `resolveTarget` an
 * object of its own.
 */
export interface CompactionTarget {
    getMessages(): AparteMessage[];
    /**
     * Merge `updates` into one message of the path — the one write a compaction makes: the
     * checkpoint (`contextSummary`) on the first message that stays. A target without it
     * cannot hold a checkpoint, and the compaction fails with an error saying so rather
     * than falling back to rewriting the transcript.
     */
    updateMessage?(messageId: string, updates: Partial<AparteMessage>): void;
    /**
     * Not called any more. A compaction used to empty the transcript and put the kept turns
     * back; it now writes one checkpoint and removes nothing. Still accepted, so a target
     * written for the earlier contract keeps type-checking.
     */
    clearAll?(options?: { revokeAttachments?: boolean }): void;
    /** Not called any more; see `clearAll`. */
    appendMessage?(message: AparteMessage): void;
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
    /**
     * The selector kept everything — within budget, or nothing older than what is kept —
     * or no user message could carry the checkpoint (the first message kept must be the
     * user's). Also what an automatic request is told when the back-off, a Restore or the
     * hysteresis says not to try now, and what an automatic or overflow request is told
     * when `auto: false` (or `listen: false`) keeps the setup manual.
     */
    | 'nothing-to-drop'
    /** A compaction is already running for this chat. */
    | 'running'
    /** A turn is in flight in the transcript; compacting under it would summarise a half-written reply. */
    | 'streaming'
    /**
     * The current model declares no `contextWindow` and nothing of the host's sizes the
     * request (no `selector`, no `summarize`, no `keepWithoutWindow`). Without a window the
     * default would send everything but the last few messages in one request, which a small
     * model refuses as over its context. Declare the window, or pass one of the three.
     */
    | 'no-window';

/** How a compaction ended — core's outcome, the same type the compactor seam returns. */
export type CompactionOutcome = AparteCompactorOutcome;

export interface CompactionSetupOptions {
    /**
     * Which messages are summarised and which stay verbatim, over what the model reads:
     * the messages from the latest checkpoint on, minus the turn being prepared.
     *
     * Default: `createCompactionSelector` over the current model — its `contextWindow`,
     * the resolved system prompt and the registered tools set the budget, and the
     * newest turns that fit stay. Each compaction sizes it: to land below the `threshold`
     * (about `threshold − 0.2` of the window once the fixed costs are paid, so one
     * compaction buys several turns), with room for the turn being prepared, and in the
     * model's own tokens (the heuristic's undercount, as the context gauge calibrates it).
     * A `selector` of your own is called with the messages alone and keeps what it keeps.
     * Whatever it chooses, the cut is moved so the
     * first message kept is a user message (the checkpoint sits on it). When the current
     * model declares no window there is no budget to walk, and the compaction skips
     * (`'no-window'`) unless the host sizes the request itself: a `selector`, a
     * `summarize` or `keepWithoutWindow`.
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
     * fixed sections (the goal, the decisions, the open tasks, the facts and tool results
     * still needed, the next step) in the language of the conversation. Replace it
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
     * turns being summarised, then a final `user` message holding the summariser's
     * instruction and the ask, `stream: true`, `maxTokens` (a ceiling on the answer that
     * keeps it inside the window) and `_meta: { compaction: true }`; return the summary
     * text. When an earlier checkpoint exists the request opens with "Summary so far:" and
     * that summary, and asks for an updated one. Your own call
     * is not trimmed to the window — the sizing is yours — but a summary that is no
     * shorter than the turns it replaces is still refused. For a
     * host with an endpoint of its own, or a cheaper model for summaries. With one, no
     * provider needs to be configured at all.
     */
    summarize?: CompactionSummarizer;
    /**
     * Resolve the chat to compact. Default: the chat element the request carries (the
     * compactor seam passes it, so a chat inside a shadow root is found), else the element
     * whose id is the `targetId` (or, unnamed, the first `<aparte-chat>` /
     * `<aparte-chat-viewport>` / `[data-aparte-chat]` on the page), taking its viewport
     * when the element itself cannot render. Return your own object for a transcript that
     * lives in a store.
     */
    resolveTarget?: (targetId?: string) => CompactionTarget | null;
    /**
     * Answer only the `aparte-compact` and `aparte-abort` events that name this chat
     * id, and compact it when `compact()` is called without one. A request for another chat
     * is refused. For a page with several chats and one setup per chat — and note that the
     * config has ONE compactor: the setup made last on a config is the one the client and
     * the gauge call.
     */
    scopeToTargetId?: string;
    /**
     * Listen for `aparte-compact` and `aparte-abort` on `window`. Default `true`; `false` for
     * a host that calls `compact()` itself.
     *
     * `false` also keeps compaction manual, whatever `auto` says (see `auto`): a setup that
     * hears nothing decides nothing. A Stop still cancels a summary: the client hands the
     * turn's abort signal to the compactor, so it does not depend on this listener.
     */
    listen?: boolean;
    /**
     * Compact by itself. Default `true`: once set up, the plugin summarises a chat when a
     * turn ends with the context at `threshold` of its window, before a send whose request
     * would not fit — the client asks first (`beforeSend`) — and when the model refuses a
     * request as over its window (the client asks again, with `reason: 'overflow'`, and
     * sends the turn once more).
     *
     * `false` means MANUAL ONLY: only a person's request compacts (the gauge's Compact now,
     * a separator's Retry, `compact()`, `aparte-compact`). None of the three automatic
     * attempts is made, the overflow included — `compact()` answers an `'auto'` or
     * `'overflow'` request with a skip, so the model's error stands exactly as it did before
     * the plugin. Forced `false` with `listen: false` (a setup that hears nothing decides
     * nothing).
     *
     * It acts only when a summariser can run: a provider registered for the current model,
     * or a `summarize` of the host's. It never acts on a Restore, a conversation switch or a
     * load, and never again after two failures in a row until something succeeds or a person
     * asks (see the back-off in the docs).
     */
    auto?: boolean;
    /**
     * The share of the window, from 0 to 1, at which a turn's end triggers a compaction.
     * Default `0.8`. The gauge's own levels are independent of it.
     *
     * A compaction aims lower than the threshold: with the default selector it leaves the
     * history the model reads at about `threshold − 0.2` of the window, less the fixed costs
     * (the system prompt, the tools, the room for the reply, the summary's slot), so one
     * compaction buys several turns and the next is not asked for after this one. That holds
     * for a person's request and an overflow retry too; a `selector` of your own is left
     * alone. If the context is still at the threshold afterwards (a long recent tail the
     * selector must keep), the after-turn trigger waits until a turn ends below it; a request
     * that would not fit is still compacted before it is sent, and an overflow still retried.
     */
    threshold?: number;
    /**
     * The window to measure against when the current model declares none — a number, or a
     * getter read at each use (`() => settings.contextWindow`). A local server has no
     * window the page can read, and without one nothing is automatic and the default
     * selector skips. The model's own `contextWindow` wins when it declares one. For one
     * more release, the `window` a gauge sends with its `aparte-compact` request is read
     * as a last resort.
     */
    contextWindow?: number | (() => number | undefined);
}

/**
 * The controller `setupCompaction` returns — and the compactor it registers on the
 * config (`AparteConfig.setCompactor`), so the gauge and the client call the same object
 * a host does.
 */
export interface CompactionController extends
    Omit<AparteCompactor, 'compact' | 'beforeSend' | 'preview'>,
    Required<Pick<AparteCompactor, 'beforeSend' | 'preview'>> {
    /**
     * Compact one chat. Takes the compactor seam's request (the chat element, its id, the
     * ids of a turn being prepared, why) or, as it always did, a chat id, or nothing:
     * the scoped chat, else the first on the page. A string or nothing is a person's
     * request (`reason: 'manual'`). Never rejects: the outcome says what happened, and the
     * same information goes out as `aparte-compact-done` / `aparte-compact-error`.
     */
    compact(request?: string | AparteCompactorRequest): Promise<CompactionOutcome>;
    /** Abort the summarisations in flight, if any. The transcripts are left untouched. */
    abort(): void;
    /** `true` while a summarisation is in flight, for any chat of this setup. */
    readonly running: boolean;
    /** Remove the listeners and forget this setup; an in-flight summarisation is aborted and the compactor unregistered. */
    dispose(): void;
}

/** The share of the window at which a turn's end triggers a compaction. */
const DEFAULT_THRESHOLD = 0.8;
/** Failures in a row, for one chat, after which the automatic attempts stop. */
const MAX_FAILURES = 2;
/**
 * How far below the threshold a compaction aims to leave the context, as a share of the
 * window. A compaction that landed AT the threshold would buy one turn and be asked again
 * after it; landing a fifth of the window below buys several.
 */
const LANDING_MARGIN = 0.2;
/**
 * After an overflow, the share of what failed that the kept history and the new turn may
 * still take. The model refused that request: one a token smaller is no answer.
 */
const OVERFLOW_SHRINK = 0.75;

/**
 * What the policy remembers about one chat. All of it is forgotten on a conversation
 * switch (`aparte-reset-done`): none of it is about the new conversation.
 */
interface ChatPolicy {
    /** Consecutive failed attempts; two stop the automatic ones. */
    failures: number;
    /** A Restore was pressed: the person wants the originals sent, so nothing automatic until they ask again. */
    suspended: boolean;
    /** The last compaction left the context at or over the threshold: no automatic attempt until another turn completes. */
    cooling: boolean;
    /** The range the last successful compaction summarised — an automatic attempt never takes it twice. */
    lastRange?: string;
}

const ABORTED = 'Compaction aborted';
const CHANGED ='The conversation changed while the summary was being written';

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
    const writes = typeof el.updateMessage === 'function'
        || (typeof el.clearAll === 'function' && typeof el.appendMessage === 'function');
    if (typeof el.getMessages === 'function' && writes) return el as CompactionTarget;
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

/**
 * The default selector: the engine budget over the current model, read at each call, measuring
 * what the WIRE sends for a message (core's estimate) rather than its text alone, so the
 * selection and the gauge price a reply's tool calls and its hidden thinking the same way.
 */
function defaultSelector(
    config: AparteConfig, keepWithoutWindow: number, windowOf: () => number | undefined,
): (messages: AparteMessage[], limits?: CompactionLimits) => CompactionSelection<AparteMessage> {
    const budgeted: CompactionSelector = createCompactionSelector({
        contextWindow: windowOf,
        systemPrompt: () => config.resolveSystemPrompt(),
        tools: () => config.getTools(),
        estimate: (message: CompactableMessage) => estimateWireTokens([message as AparteMessage]),
    });
    return (messages, limits) => {
        if (windowOf()) return budgeted(messages, limits);
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

/**
 * Adjacent turns of one role become one turn, joined by a blank line, the way core's wire
 * history joins them. Turns that say nothing are dropped before this (a reply stopped before
 * its first token), which can leave two of the user's side by side, and a chat template that
 * insists on alternation (a local model's: Mistral, Gemma) refuses them. The summary request
 * goes straight to the transport, so it does not pass through the merge a send does.
 */
const alternating = (turns: AparteChatMessage[]): AparteChatMessage[] => {
    const merged: AparteChatMessage[] = [];
    for (const turn of turns) {
        const last = merged[merged.length - 1];
        if (last && last.role === turn.role) {
            merged[merged.length - 1] = { role: last.role, content: `${contentToText(last.content)}\n\n${contentToText(turn.content)}` };
        } else {
            merged.push(turn);
        }
    }
    return merged;
};

/**
 * What a summary is made of once a reasoning model's inline thinking is taken out. A model
 * that reasons in its text (llama.cpp or vLLM without a reasoning parser) opens `<think>`,
 * and the chat path turns that block into a thinking segment; the summary never goes through
 * that parser, so the block would be stored as the summary, shown under "Show summary" and
 * sent on every later turn. A block left open (the answer ran out inside it) is dropped to the
 * end, and so is the reasoning of a template that opens the block in the prompt, whose answer
 * carries only the closing tag.
 */
const withoutThinking = (text: string): string =>
    text
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<think>[\s\S]*$/i, '')
        .replace(/^[\s\S]*<\/think>/i, '')
        .trim();

/**
 * The ask that closes the request. One place, because the input bound has to count what it
 * sends. An update asks for the old summary with the new turns folded in, not for a
 * summary of the new turns alone.
 */
const askFor = (prompt: string, updating: boolean): string => `${prompt}

${updating
        ? 'Please write the updated summary: the summary so far, with the conversation above folded in.'
        : 'Please summarize the conversation above.'}`;

/**
 * "Summary so far:" and the summary, ahead of the turns since. Merged into the first turn
 * when that is the user's, so the request never opens with two user messages in a row: a
 * chat template that insists on alternation (a local model's) refuses one.
 */
const withSummarySoFar = (turns: AparteChatMessage[], summary: string): AparteChatMessage[] => {
    const note = `Summary so far:\n${summary}\n\nThe conversation since then:`;
    const [first, ...rest] = turns;
    if (first?.role === 'user') return [{ role: 'user', content: `${note}\n\n${contentToText(first.content)}` }, ...rest];
    return [{ role: 'user', content: note }, ...turns];
};

/**
 * The summarisation request: the instruction, the turns as a transcript, the ask — and,
 * when an earlier checkpoint exists, its summary first.
 *
 * Every turn being summarised is included, minus the ones still in flight — the same
 * `inFlight` predicate `compact()` guards the transcript with, so the two cannot
 * disagree. The clause here used to be hand-written and demanded `status: 'completed'`
 * on an assistant turn, which meant a host appending its own messages (no `status` at
 * all — the shape the docs teach) had its replies kept out of the summary without ever
 * reaching the summariser. A turn that ended in an error is summarised too: the user
 * read it, and the model should know it happened.
 */
function buildRequest(
    turns: AparteChatMessage[], summarySoFar: string | undefined, prompt: string, modelId: string, maxTokens: number,
): AparteChatRequest {
    const body = summarySoFar === undefined ? turns : withSummarySoFar(turns, summarySoFar);
    const last = body[body.length - 1];
    const ask = askFor(prompt, summarySoFar !== undefined);
    return {
        messages: [
            // The ask joins a trailing user turn rather than following it: two user turns in a
            // row are what `alternating` took out of the transcript.
            ...(last?.role === 'user' ? body.slice(0, -1) : body),
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
            { role: 'user', content: last?.role === 'user' ? `${contentToText(last.content)}\n\n${ask}` : ask },
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
 * that reports the length limit (a summary cut off mid-sentence would stand in for the
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
 * How many of the turns to summarise, oldest first, the summarisation request can carry:
 * the instruction, the summary so far (`baseTokens`) and their transcript must fit the
 * window less the answer's room, the reserved thinking and the safety margin (the
 * budget's own defaults), all in the model's tokens: the estimates are scaled by `scale`.
 * The turns past that point are not summarised now — they stay
 * verbatim, and the next compaction takes them.
 */
function fitOldest(
    drop: AparteMessage[], prompt: string, contextWindow: number, maxTokens: number, baseTokens: number, scale: number,
): number {
    const room = contextWindow - maxTokens - DEFAULT_COMPACTION_CONFIG.reservedThinking - DEFAULT_COMPACTION_CONFIG.safetyMargin;
    // `scale` is how far the heuristic undercounts this conversation, so the request is priced
    // in the tokens the model will count, the way the selection is.
    let used = scale * (estimateTokens(askFor(prompt, baseTokens > 0)) + baseTokens);
    for (let i = 0; i < drop.length; i++) {
        used += scale * summarisable([drop[i]!]).reduce((sum, m) => sum + estimateTokens(contentToText(m.content)), 0);
        if (used > room) return i;
    }
    return drop.length;
}

/** What `compact()` settled on before it paid for a summary: where the cut falls and what goes to the model. */
interface Plan {
    target: CompactionTarget;
    /** Summarised by this compaction, oldest first. */
    drop: AparteMessage[];
    /** The first message kept — a user message, the one the checkpoint will sit on. */
    holder: AparteMessage;
    /** The summary the previous checkpoint holds, and how many messages it stands for. */
    previous?: { summary: string; count: number };
    /** The message that carries that earlier checkpoint, to see before writing that it still does. */
    previousHolderId?: string;
    /** The first request, ready to append to the new summary, or `''`. */
    firstRequest: string;
    maxTokens: number;
    prompt: string;
}

type Planned =
    | { kind: 'plan'; plan: Plan }
    | { kind: 'skip'; reason: CompactionSkipReason }
    | { kind: 'fail'; error: string; messageId?: string };

/**
 * Install compaction on a config. Returns the controller, which is also registered as the
 * config's compactor; the same call on the same config replaces the previous setup (its
 * listeners are removed first).
 *
 * ```ts
 * import { setupCompaction } from '@aparte/plugin-compaction';
 *
 * const compaction = setupCompaction();          // the global config, the current model's budget
 * // `<aparte-context>` now offers "Compact now", and the separator's Retry works;
 * // or ask yourself:
 * await compaction.compact();
 * ```
 */
export function setupCompaction(options: CompactionSetupOptions = {}, config: AparteConfig = aparteGlobalConfig): CompactionController {
    controllers.get(config)?.dispose();

    const keepWithoutWindow = Math.max(0, options.keepWithoutWindow ?? 4);
    const scope = options.scopeToTargetId;
    const threshold = options.threshold !== undefined && options.threshold > 0 ? Math.min(options.threshold, 1) : DEFAULT_THRESHOLD;

    /** The window the gauge's request named, kept as the last resort for one release. */
    let windowHint: number | undefined;
    /**
     * The window everything here measures against: the current model's, else the host's
     * `contextWindow`, else the gauge's. Read at each use — a model change is picked up on
     * the next decision, never guessed.
     */
    const windowFor = (): number | undefined => {
        const declared = config.getCurrentModel()?.contextWindow;
        if (declared && declared > 0) return declared;
        const own = typeof options.contextWindow === 'function' ? options.contextWindow() : options.contextWindow;
        return own && own > 0 ? own : windowHint;
    };
    const selectDefault = defaultSelector(config, keepWithoutWindow, windowFor);

    /** The chat to compact: the host's own resolver, else the chat element the request names, else the page. */
    const resolveFor = (element: Element | null | undefined, targetId?: string): CompactionTarget | null => {
        if (options.resolveTarget) {
            const own = options.resolveTarget(targetId);
            if (own) return own;
        }
        const named = element ? asTarget(element) : null;
        if (named) return named;
        return options.resolveTarget ? null : resolveDomTarget(targetId);
    };

    /** The summaries being written, by chat: two chats on one setup compact independently. */
    const running = new Map<string, { abort: AbortController; done: Promise<void> }>();
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
            if (options.resolveTarget && options.resolveTarget(targetId)) return true;
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
        const detail = (e as CustomEvent<AparteCompactEventDetail | undefined>).detail;
        if (typeof detail?.window === 'number' && detail.window > 0) windowHint = detail.window;
        // The gauge's deprecated `auto-compact` says its request is automatic: the back-off
        // counts it. A button's request, which says nothing, is a person's.
        void run({
            target: null,
            reason: detail?.auto ? 'auto' : 'manual',
            ...(detail?.targetId !== undefined ? { targetId: detail.targetId } : {}),
        });
    };
    const onAbort = (e: Event): void => {
        // An unnamed abort stops whatever runs. One that names a chat stops ours when it is
        // the chat we compact — or, compacting an unnamed one, when it is a chat we answer.
        const targetId = (e as CustomEvent<{ targetId?: string } | undefined>).detail?.targetId;
        for (const [key, entry] of running) {
            if (targetId && (key ? targetId !== key : !addressed(e))) continue;
            entry.abort.abort();
        }
    };
    const listening = options.listen !== false && typeof window !== 'undefined';

    // ── The policy: when to compact without being asked ─────────────────────────────────

    /**
     * Automatic compaction is on, and a setup that hears nothing decides nothing: `listen:
     * false` is a host that drives `compact()` itself, and a host that does has not given
     * the plugin the say over when.
     */
    const autoOn = options.auto !== false && listening;
    const policies = new Map<string, ChatPolicy>();
    const policyOf = (key: string): ChatPolicy => {
        let policy = policies.get(key);
        if (!policy) {
            policy = { failures: 0, suspended: false, cooling: false };
            policies.set(key, policy);
        }
        return policy;
    };
    /** A summariser can run: the host's own, or a provider registered for the current model. */
    const canSummarise = (): boolean => {
        if (options.summarize) return true;
        const providerId = config.getModelConfig().defaultProvider;
        return Boolean(providerId && config.getAIProvider(providerId));
    };
    /**
     * How far the character heuristic undercounts this conversation: real tokens per estimated
     * token, the factor the context measure calibrates the same way (the last reply's real
     * input over the estimate recorded when it was sent, clamped, and 1 when it has none).
     * Read off the measure itself, forced to an estimate, so the selection, the pre-send
     * comparison and the gauge price a history with one number and cannot drift apart.
     */
    const scaleOf = (messages: AparteMessage[], size: number | undefined): number => {
        const measure = measureContext({
            messages, config, viewChanged: true, ...(size !== undefined ? { windowOverride: size } : {}),
        });
        const estimate = measure.parts.system + measure.parts.tools + measure.parts.summary + measure.parts.messages;
        return estimate > 0 && measure.used > 0 ? measure.used / estimate : 1;
    };
    /**
     * May the plugin start a compaction of this chat on its own, now? `cooling` holds back only
     * the after-turn trigger — a context that a compaction could not bring under the threshold
     * would otherwise pay for a summary every turn. Before a send it does not apply: a request
     * that does not fit the window is reason enough, and waiting for a turn to end below the
     * threshold would mean waiting forever on a server that truncates instead of refusing.
     */
    const mayAct = (policy: ChatPolicy, beforeSend = false): boolean =>
        autoOn && canSummarise() && policy.failures < MAX_FAILURES && !policy.suspended && (beforeSend || !policy.cooling);

    /**
     * A turn ended: measure what the model would read next, and compact when it is at the
     * threshold. `aparte-message-done` is dispatched once the reply is completed and its
     * usage recorded, so the measure reads the real figure the provider reported.
     *
     * Lifts the hysteresis when this measure is below the threshold, and only then: a turn
     * that completes with the context still at the threshold is not a reason to try again,
     * and the same summary was being paid for after every turn of a conversation that sat
     * near its window.
     */
    const onTurnDone = (e: Event): void => {
        if (!addressed(e) || !autoOn) return;
        const targetId = (e as CustomEvent<{ targetId?: string } | undefined>).detail?.targetId;
        const policy = policyOf(targetId ?? '');
        const element = e.target instanceof Element ? e.target : null;
        const target = resolveFor(element, targetId);
        const size = windowFor();
        if (!target || !size) return;
        if (measureContext({ messages: target.getMessages(), config, windowOverride: size }).used < threshold * size) {
            policy.cooling = false;
            return;
        }
        if (!mayAct(policy)) return;
        void run({ target: element, reason: 'auto', ...(targetId !== undefined ? { targetId } : {}) });
    };
    /**
     * A Restore: the person asked for the original messages to go to the model again, so the
     * policy stops proposing the summary until they ask for it themselves.
     */
    const onRestored = (e: Event): void => {
        if (!(e as CustomEvent<AparteCompactDoneEventDetail | undefined>).detail?.restored || !addressed(e)) return;
        const key = (e as CustomEvent<AparteCompactDoneEventDetail>).detail.targetId ?? '';
        const policy = policyOf(key);
        policy.suspended = true;
        policy.cooling = false;
        delete policy.lastRange;
        // A summary still being written for this chat was built on a checkpoint the person has
        // just taken off: finishing it would put that checkpoint back, seconds after they
        // confirmed the Restore. The run turns the abort into a failed outcome and writes nothing.
        running.get(key)?.abort.abort();
    };
    /** A conversation switch (or a reset): nothing remembered was about this one. */
    const onSwitch = (): void => policies.clear();

    if (listening) {
        window.addEventListener('aparte-compact', onCompact);
        window.addEventListener('aparte-abort', onAbort);
        window.addEventListener('aparte-message-done', onTurnDone);
        window.addEventListener('aparte-compact-done', onRestored);
        window.addEventListener('aparte-reset-done', onSwitch);
    }
    if (listening && !scope) answering.add(config);
    if (listening && scope) scopedChats.set(scope, (scopedChats.get(scope) ?? 0) + 1);
    const ownResolver = listening && !scope ? options.resolveTarget : undefined;
    if (ownResolver) ownResolvers.set(ownResolver, (ownResolvers.get(ownResolver) ?? 0) + 1);

    /**
     * Where the cut falls, over the model's view of the conversation: from the latest
     * checkpoint on, less the turn being prepared. Pure — no model call — so `compact()`
     * and a preview read the same plan.
     */
    const plan = (
        element: Element | null | undefined, targetId: string | undefined, exclude: ReadonlySet<string>, reason: AparteCompactorReason,
    ): Planned => {
        const target = resolveFor(element, targetId);
        if (!target) return { kind: 'fail', error: targetId ? `No chat with id "${targetId}" to compact` : 'No chat found to compact' };

        const path = target.getMessages();
        if (path.length === 0) return { kind: 'skip', reason: 'empty' };
        // The turn being prepared is not "in flight": the client names it, and it is the reason
        // the compaction was asked for. Any OTHER message still streaming is.
        if (path.some((m) => !exclude.has(m.id) && inFlight(m))) return { kind: 'skip', reason: 'streaming' };

        const contextWindow = windowFor();
        // The default selector's fallback without a window sends all but the last few turns
        // in one request, sized by nothing: a small model answers 400, context exceeded. A host
        // that sized it itself (its selector, its summariser, a `keepWithoutWindow`) owns that.
        const hostSizes = options.selector || options.summarize || options.keepWithoutWindow !== undefined;
        if (!contextWindow && !hostSizes) return { kind: 'skip', reason: 'no-window' };

        // What the model reads from now on: the path from its latest checkpoint, whose first
        // message is the one that carries it. Everything above is already inside that summary.
        const checkpointed = historyFromCheckpoint(path);
        const holderOfPrevious = checkpointed.summary !== undefined ? checkpointed.messages[0] : undefined;
        const previous = holderOfPrevious?.contextSummary
            ? { summary: holderOfPrevious.contextSummary.summary, count: holderOfPrevious.contextSummary.count }
            : undefined;
        const view = checkpointed.messages.filter((m) => !exclude.has(m.id));

        // How far the heuristic undercounts this conversation: the selection, the summary
        // request and the room for the turn being prepared are all priced with it, in the
        // tokens the model counts rather than the ones the heuristic does.
        const scale = contextWindow ? scaleOf(path, contextWindow) : 1;
        let selected: CompactionSelection<AparteMessage>;
        if (options.selector) {
            // A host's own selector is called with the messages alone: what it keeps is its call.
            selected = options.selector(view);
        } else {
            // The default one is sized to where the compaction should LEAVE the context, not to
            // the budget's near-full edge (about 88 % of a 128K window, a threshold below which
            // nothing would ever be dropped, and one a compaction lands on only to be asked
            // again after the next turn), and with room for the turn being prepared, which is
            // not in `view` but will be in the request.
            const reserve = Math.round(scale * estimateWireTokens(path.filter((m) => exclude.has(m.id))));
            const limits: CompactionLimits = { scale, reserve, landAt: Math.max(0, threshold - LANDING_MARGIN) };
            // An overflow says the request that was built is too big, whatever the estimate
            // thought of it: cut well below it.
            if (reason === 'overflow') limits.ceiling = Math.floor(OVERFLOW_SHRINK * (scale * estimateWireTokens(view) + reserve));
            selected = selectDefault(view, limits);
        }
        if (selected.drop.length === 0) return { kind: 'skip', reason: 'nothing-to-drop' };
        // The selector speaks of two sets; a checkpoint is one boundary. Take the run of
        // dropped messages at the front — a selector that picks a hole in the middle is not
        // asking for a summary the model could read in order.
        const droppedIds = new Set(selected.drop.map((m) => m.id));
        let boundary = 0;
        while (boundary < view.length && droppedIds.has(view[boundary]!.id)) boundary++;
        if (boundary === 0) return { kind: 'skip', reason: 'nothing-to-drop' };

        const prompt = options.prompt ?? DEFAULT_COMPACTION_PROMPT;
        const maxTokens = summaryAnswerCap(config, contextWindow);
        const base = previous ? splitFirstRequest(previous.summary) : undefined;
        const baseTokens = base ? estimateTokens(base.base) : 0;
        // Your own `summarize` is not trimmed to the window — the sizing is yours.
        const fit = (n: number): number =>
            contextWindow && !options.summarize ? fitOldest(view.slice(0, n), prompt, contextWindow, maxTokens, baseTokens, scale) : n;

        // The turns that do not fit the summary request are not summarised now, not lost: they
        // stay verbatim after the checkpoint, and the next compaction takes them.
        const fits = fit(boundary);
        if (fits === 0) return { kind: 'fail', error: "The oldest turn to summarise does not fit the model's context window" };
        const cut = cutAtUser(view, fits);
        if (cut === null) return { kind: 'skip', reason: 'nothing-to-drop' };
        // Moved toward the newer end, the cut summarises more than the request was sized for.
        if (cut > fits && fit(cut) < cut) return { kind: 'skip', reason: 'nothing-to-drop' };

        const drop = view.slice(0, cut);
        const holder = view[cut]!;

        // The first request survives every compaction word for word: a summariser paraphrases
        // away what the user first asked, and every later turn is judged against it. Found in
        // the first summary, carried through each update; never asked of the model.
        let firstRequest = base?.block ?? '';
        if (!previous) {
            const first = path.find((m) => m.role === 'user' && !m.compaction);
            const text = first && drop.some((m) => m.id === first.id) ? messageText(first).trim() : '';
            if (text) firstRequest = firstRequestBlock(text);
        }
        return {
            kind: 'plan',
            plan: {
                target, drop, holder, ...(previous ? { previous } : {}),
                ...(holderOfPrevious ? { previousHolderId: holderOfPrevious.id } : {}),
                firstRequest, maxTokens, prompt,
            },
        };
    };

    const run = async (request: AparteCompactorRequest & { beforeSend?: true }): Promise<CompactionOutcome> => {
        const targetId = request.targetId ?? scope ?? (request.target?.id || undefined);
        const reason = request.reason ?? 'manual';
        const key = targetId ?? '';
        const policy = policyOf(key);
        let messageId: string | undefined;
        // The events are written out literally, one per site: the docs' events
        // reference reads the dispatch itself to say where an event goes out from.
        const fail = (error: string): CompactionOutcome => {
            // A stop the person asked for is not the summary failing.
            if (error !== ABORTED) policy.failures++;
            // A failure is also said on the console: the documented way to ask is a
            // fire-and-forget `aparte-compact`, and a page with no listener on the
            // error event would otherwise fail in total silence.
            console.warn(`[aparte/plugin-compaction] compaction failed: ${error}`);
            if (hasWindow) {
                window.dispatchEvent(new CustomEvent<AparteCompactErrorEventDetail>('aparte-compact-error', {
                    detail: { error, targetId, ...(messageId ? { messageId } : {}), ...(error === ABORTED ? { aborted: true as const } : {}) },
                }));
            }
            return { ok: false, error, targetId, ...(messageId ? { messageId } : {}) };
        };
        const skip = (reason: CompactionSkipReason): CompactionOutcome => {
            if (hasWindow) window.dispatchEvent(new CustomEvent<AparteCompactDoneEventDetail>('aparte-compact-done', { detail: { skipped: true, reason, targetId } }));
            return { ok: true, skipped: true, reason, targetId };
        };

        if (disposed) return fail('This compaction setup was disposed');
        // A scoped setup compacts its own chat. Refused quietly: another setup may own the
        // one asked for, and an error event here would tell the page it failed.
        if (scope && request.targetId !== undefined && request.targetId !== scope) {
            return { ok: false, error: `This compaction setup only compacts the chat "${scope}"`, targetId: request.targetId };
        }
        // `auto: false` means manual only: nobody asked for an automatic attempt or an overflow
        // retry, so neither is made — reported as a skip, the one answer every caller already
        // handles, and the client's error stands exactly as it did before there was a plugin.
        if ((reason === 'auto' || reason === 'overflow') && !autoOn) return skip('nothing-to-drop');
        // Somebody asked, so the policy may try again: the back-off and a Restore both wait for
        // exactly this. (An overflow is neither: the model refused a request, nobody chose it.)
        if (reason === 'manual' || reason === 'retry') {
            policy.failures = 0;
            policy.suspended = false;
        }
        // An overflow waits for the summary already being written for its chat — the retry is
        // measured against the history that summary leaves — where anything else is told to wait.
        if (reason === 'overflow') for (let busy = running.get(key); busy; busy = running.get(key)) await busy.done;
        // The turn that asked was stopped: no summary is paid for it.
        if (request.signal?.aborted) return fail(ABORTED);
        if (running.has(key)) return skip('running');
        // Nobody asked, and the policy has said not now. Reported as nothing to do — a skip is
        // the one answer every caller already handles — and `force` overrides it.
        if (reason === 'auto' && !request.force && (policy.failures >= MAX_FAILURES || policy.suspended || (policy.cooling && !request.beforeSend))) {
            return skip('nothing-to-drop');
        }

        const planned = plan(request.target, targetId, new Set(request.exclude ?? []), reason);
        if (planned.kind === 'skip') return skip(planned.reason);
        if (planned.kind === 'fail') {
            if (planned.messageId) messageId = planned.messageId;
            return fail(planned.error);
        }
        const { target, drop, holder, previous, previousHolderId, firstRequest, maxTokens, prompt } = planned.plan;
        messageId = holder.id;
        // The same range twice is the loop the hysteresis exists to prevent.
        const range = `${drop[0]!.id}..${drop[drop.length - 1]!.id}`;
        if (reason === 'auto' && !request.force && policy.lastRange === range) return skip('nothing-to-drop');
        // Checked before the model is paid: there is no replace fallback, and a summary that
        // cannot be written is a summary nobody should wait for.
        if (!target.updateMessage) return fail('This chat cannot hold a checkpoint: its transcript has no updateMessage');

        const modelConfig = config.getModelConfig();
        const providerId = modelConfig.defaultProvider;
        let provider: AparteAIProvider | undefined;
        if (!options.summarize) {
            if (!providerId) return fail('No provider configured');
            provider = config.getAIProvider(providerId);
            if (!provider) return fail(`Provider '${providerId}' not found`);
        }

        // What the model is shown of the earlier checkpoint is the summary it wrote, without
        // the first request we appended to it (see above): it would copy the block into its
        // own answer, and the block would be there twice.
        const summarySoFar = previous ? splitFirstRequest(previous.summary).base : undefined;
        const turns = alternating(summarisable(drop));
        // Nothing to read: the turns being summarised say nothing a summary could carry.
        // Paying a model to summarise an empty transcript and then standing the answer in
        // for the conversation is worse than doing nothing.
        if (turns.length === 0) return fail('Nothing summarisable in the dropped turns');
        const summariseRequest = buildRequest(turns, summarySoFar, prompt, modelConfig.defaultModel || '', maxTokens);

        const abort = new AbortController();
        // The turn's own Stop reaches the summary whether or not this setup listens on `window`.
        const onSignal = (): void => abort.abort();
        request.signal?.addEventListener('abort', onSignal, { once: true });
        let finished!: () => void;
        running.set(key, { abort, done: new Promise<void>((resolve) => { finished = resolve; }) });
        if (hasWindow) window.dispatchEvent(new CustomEvent<AparteCompactStartEventDetail>('aparte-compact-start', { detail: { targetId, messageId } }));

        try {
            const raw = await withAbort(
                options.summarize
                    ? options.summarize(summariseRequest, abort.signal)
                    : summarizeThroughTransport(config, provider!, summariseRequest, abort.signal, options.keyResolver),
                abort.signal,
            );
            const modelSummary = withoutThinking(raw);
            if (!modelSummary) throw new Error('Empty summary returned by model');
            // A summary that is not shorter than what it replaces frees nothing: refuse it, the
            // conversation is left as it is. What it replaces is the summary it updates and
            // the turns it folds in — the appended first request is on both sides of that
            // account, so it is on neither.
            const replaced = estimateTokens(summarySoFar) + turns.reduce((sum, m) => sum + estimateTokens(contentToText(m.content)), 0);
            if (estimateTokens(modelSummary) >= replaced) throw new Error('The summary is no shorter than the turns it replaces');

            // One write: the checkpoint, on the first message that stays. Not a replacement of
            // the transcript — the messages above it are untouched, which is also what makes
            // a Restore possible. By id, and only if that message is still on the path: a
            // conversation switch (or a reset) replaces the whole path while the summary is
            // written, and a success the host dropped would be reported as one.
            const live = target.getMessages();
            const at = live.findIndex((m) => m.id === holder.id);
            if (at < 0) throw new Error(CHANGED);
            // A summary that updates an earlier checkpoint is refused when that checkpoint is
            // gone: a Restore took it off while this was being written, and the update would
            // bring back what the person had just sent away.
            if (previousHolderId && !live.find((m) => m.id === previousHolderId)?.contextSummary) throw new Error(CHANGED);
            const summary = `${modelSummary}${firstRequest}`;
            const count = drop.length + (previous?.count ?? 0);
            target.updateMessage!(holder.id, { contextSummary: { summary, count, createdAt: Date.now() } });

            // What the policy learns from it: a success clears the back-off, remembers the range,
            // and, when what the model reads next is still over the threshold (a summary that
            // saved little, a long kept tail), waits for another turn before trying again.
            policy.failures = 0;
            policy.lastRange = range;
            const size = windowFor();
            const after = measureContext({ messages: target.getMessages(), config, ...(size !== undefined ? { windowOverride: size } : {}) });
            policy.cooling = after.window !== undefined && after.used >= threshold * after.window;

            const kept = live.length - at;
            const outcome: CompactionOutcome = { ok: true, skipped: false, summary, kept, dropped: drop.length, messageId: holder.id, count, targetId };
            if (hasWindow) window.dispatchEvent(new CustomEvent<AparteCompactDoneEventDetail>('aparte-compact-done', { detail: { summary, kept, dropped: drop.length, targetId, messageId: holder.id, count } }));
            return outcome;
        } catch (err: unknown) {
            const aborted = abort.signal.aborted || (err instanceof Error && err.name === 'AbortError');
            return fail(aborted ? ABORTED : err instanceof Error ? err.message : String(err));
        } finally {
            request.signal?.removeEventListener('abort', onSignal);
            running.delete(key);
            finished();
        }
    };

    const controller: CompactionController = {
        get running() {
            return running.size > 0;
        },

        abort() {
            for (const entry of running.values()) entry.abort.abort();
        },

        dispose() {
            if (disposed) return;
            disposed = true;
            controller.abort();
            if (listening) {
                window.removeEventListener('aparte-compact', onCompact);
                window.removeEventListener('aparte-abort', onAbort);
                window.removeEventListener('aparte-message-done', onTurnDone);
                window.removeEventListener('aparte-compact-done', onRestored);
                window.removeEventListener('aparte-reset-done', onSwitch);
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
            // Only if it is still the registered one: a later setup replaced it, and took the seam.
            if (config.getCompactor() === controller) config.setCompactor(null);
            if (controllers.get(config) === controller) {
                controllers.delete(config);
                answering.delete(config);
            }
        },

        compact(request) {
            return run(typeof request === 'object' ? request : { target: null, ...(request !== undefined ? { targetId: request } : {}) });
        },

        async settled(targetId) {
            // The chat's own summary — and an unnamed chat's, which may be the same one. Loops: a
            // compaction that ends may be followed by one queued behind it.
            const pending = (): Promise<void>[] => [...running]
                .filter(([key]) => targetId === undefined || key === '' || key === targetId)
                .map(([, entry]) => entry.done);
            for (let waiting = pending(); waiting.length > 0; waiting = pending()) await Promise.all(waiting);
        },

        async beforeSend({ target, targetId, exclude, requestTokens, signal }) {
            // A send never races a summary: whatever is running for its chat finishes first, and
            // the request is measured against the conversation it left behind.
            await controller.settled(targetId);
            const id = targetId ?? scope ?? (target?.id || undefined);
            const policy = policyOf(id ?? '');
            const size = windowFor();
            if (!size || !mayAct(policy, true)) return false;
            // The request's estimate is the raw heuristic's; the model counts in its own tokens,
            // and the measure has calibrated how far apart the two are for this conversation.
            const chat = resolveFor(target, id);
            const scale = chat ? scaleOf(chat.getMessages(), size) : 1;
            // The room the model keeps for its reply, as the budget everywhere else reads it.
            if (scale * requestTokens + DEFAULT_COMPACTION_CONFIG.reservedGeneration <= size) return false;
            const outcome = await run({
                target, reason: 'auto', beforeSend: true, exclude, ...(id !== undefined ? { targetId: id } : {}), ...(signal ? { signal } : {}),
            });
            // `true` only when a checkpoint was written: the caller builds the request again.
            return outcome.ok && !outcome.skipped;
        },

        preview(request) {
            if (scope && request.targetId !== undefined && request.targetId !== scope) return null;
            const id = request.targetId ?? scope ?? (request.target?.id || undefined);
            if (disposed || running.has(id ?? '') || !canSummarise()) return null;
            // What a person asking now would get: a manual request, no turn being prepared.
            const planned = plan(request.target, id, new Set(), 'manual');
            if (planned.kind !== 'plan') return null;
            return { messages: planned.plan.drop.length, tokens: estimateWireTokens(planned.plan.drop) };
        },
    };

    controllers.set(config, controller);
    config.setCompactor(controller);
    return controller;
}
