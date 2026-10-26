/**
 * selector.ts — the budget-aware selector: which messages are summarised, which stay.
 *
 * A compaction decides what to summarise through one function:
 * `(messages) => { keep, drop }`. This is the default one: the newest turns that still
 * fit the history budget stay verbatim, the older ones are dropped for summarising.
 *
 * The budget is `budget.ts`'s (`computeHistoryBudget` + `splitHistoryBudget`), so the
 * gauge a page shows, the selection the compaction uses and the window the model
 * declares all speak the same numbers. The window is read through a getter at each
 * call — a model change is picked up on the next compaction, never guessed.
 */

import { computeHistoryBudget, estimateTokens, splitHistoryBudget, type CompactionConfig } from './budget.js';

/**
 * The least a message must carry to be costed: its text, or segments with text.
 * Structural on purpose, so a host's own message type fits without a cast — core's
 * `AparteMessage` satisfies it.
 */
export interface CompactableMessage {
    content?: string;
    /**
     * `unknown` elements, read defensively below: core's segment union includes a
     * segment with no `content` at all, and TypeScript refuses a type with no property
     * in common with the all-optional `{ content?: unknown }` (a "weak type"), so that
     * tighter shape made `AparteMessage` unassignable here.
     */
    segments?: ReadonlyArray<unknown>;
}

/** What a compaction asks for: the messages kept verbatim and the ones to summarise. */
export interface CompactionSelection<M> {
    keep: M[];
    drop: M[];
}

/**
 * The selector itself — generic in the MESSAGE type. The generic sits on the returned
 * function, not on the factory: a factory-level `<M>` has no inference site at
 * `createCompactionSelector({...})` and falls back to the bare `CompactableMessage`.
 */
export type CompactionSelector = <M extends CompactableMessage>(messages: M[], limits?: CompactionLimits) => CompactionSelection<M>;

/**
 * What one call can tighten beyond the budget the selector was built with. The plugin's own
 * default selector is called with these, per compaction; a host that passes a selector of
 * its own as `setupCompaction`'s `selector` is called with the messages alone, and one that
 * calls this selector directly may leave them out. All of it is in REAL tokens, the ones the
 * model counts, so a heuristic that undercounts (`scale`) is accounted for on both sides.
 */
export interface CompactionLimits {
    /**
     * How far the character heuristic undercounts: real tokens per estimated token, the way
     * the context measure calibrates it. The messages AND the system prompt and tools are
     * priced at `scale` times their estimate. Default `1`.
     */
    scale?: number;
    /**
     * Tokens the history must leave room for: the turn being prepared, which is not in the
     * messages handed over but will be in the request. A long new message is made room for,
     * down to `minKeep` messages. Default `0`.
     */
    reserve?: number;
    /**
     * Aim below the budget: the share of the window (0..1) the request should land at once
     * the history is trimmed, the fixed costs (system prompt, tools, the reply's room, the
     * summary's slot) counted. Never above the budget; without it the selector keeps as much
     * as the budget allows, which on a large window is within a few percent of full.
     */
    landAt?: number;
    /** The most the kept history and `reserve` may take together, when something known to have failed bounds it. */
    ceiling?: number;
}

export interface CompactionSelectorOptions {
    /**
     * The active model's context window, in tokens — a number, or a getter read at
     * each call so a model change is picked up (`() => aparteGlobalConfig.getCurrentModel()?.contextWindow`).
     * Unknown (`undefined`) means nothing is dropped: without a window there is no
     * budget to be over.
     */
    contextWindow: number | (() => number | undefined);
    /** The system prompt the request carries, for the budget. A string or a getter. Default none. */
    systemPrompt?: string | (() => string | null | undefined);
    /** The tools declared to the model, for the budget. A value or a getter. Default none. */
    tools?: unknown | (() => unknown);
    /** Partial override of the budget's config — reserves, ratios, floors. */
    config?: Partial<Omit<CompactionConfig, 'contextWindow'>>;
    /** Never summarise fewer than this many of the newest messages. Default 2 — the last exchange. */
    minKeep?: number;
    /**
     * What one message costs, in tokens. Default: the character estimate of its text
     * (`content`, else its segments' text and its tool calls' input and result).
     *
     * Pass core's `estimateWireTokens` for one message to measure what the wire actually
     * sends — a thinking block, which the model is never shown, then costs nothing —
     * which is what `setupCompaction`'s own default selector does. A direct caller keeps
     * the default, so nothing it already relies on moves.
     */
    estimate?: (message: CompactableMessage) => number;
}

const read = <T>(value: T | (() => T)): T => (typeof value === 'function' ? (value as () => T)() : value);

/**
 * What a message costs: its text, or the text of its segments when it has no `content`.
 * A tool call has no `content` but is not free: its arguments and its result go to the
 * model (core sends a reply's calls and their answers on later turns), so it costs what
 * that text does.
 */
const textOf = (message: CompactableMessage): string => {
    if (typeof message.content === 'string' && message.content.length > 0) return message.content;
    return (message.segments ?? [])
        .map((segment) => {
            if ((segment as { type?: unknown }).type === 'tool_call') {
                const { toolCall, result } = segment as { toolCall?: { input?: unknown }; result?: unknown };
                return `${JSON.stringify(toolCall?.input ?? {})}\n${typeof result === 'string' ? result : ''}`;
            }
            const content = (segment as { content?: unknown }).content;
            return typeof content === 'string' ? content : '';
        })
        .join('\n');
};

/**
 * Build the selector. `setupCompaction` builds this one itself over the current model;
 * build your own to close over a budget only the app knows:
 *
 * ```ts
 * setupCompaction({
 *   selector: createCompactionSelector({
 *     contextWindow: 32_000,                                  // yours, not the model's
 *     systemPrompt: () => aparteGlobalConfig.resolveSystemPrompt(),
 *     minKeep: 6,                                             // never summarise the last three exchanges
 *   }),
 * });
 * ```
 *
 * Walks the history from the newest message: what fits the sliding window's budget
 * is kept verbatim, the rest is dropped for summarising. When everything fits,
 * `drop` is empty and the compaction reports `{ skipped: true }` — nothing to do.
 */
export function createCompactionSelector(options: CompactionSelectorOptions): CompactionSelector {
    const minKeep = Math.max(0, options.minKeep ?? 2);
    const costOf = options.estimate ?? ((message: CompactableMessage) => estimateTokens(textOf(message)));
    return <M extends CompactableMessage>(messages: M[], limits?: CompactionLimits): CompactionSelection<M> => {
        const contextWindow = read(options.contextWindow);
        if (!contextWindow || contextWindow <= 0) return { keep: messages, drop: [] };

        const budget = computeHistoryBudget({
            systemPrompt: read(options.systemPrompt) ?? '',
            toolsArray: read(options.tools),
            config: { ...options.config, contextWindow },
        });
        const split = splitHistoryBudget(budget.historyBudget, budget.config);

        // The room for the verbatim history, in real tokens. The budget above is made of
        // estimates: priced at `scale`, the system prompt and the tools take (scale − 1) times
        // their estimate more than it counted, and that comes out of the room.
        const scale = limits?.scale !== undefined && limits.scale > 0 ? limits.scale : 1;
        const fixed = budget.breakdown.systemPrompt + budget.breakdown.tools;
        let windowBudget = split.window - (scale - 1) * fixed;
        if (limits?.landAt !== undefined) {
            const { reservedThinking, reservedGeneration, minHistoryBudget } = budget.config;
            // Not below the floor the budget itself keeps: on a small window the fixed costs
            // alone are past the aim, and a history that small is not worth a summary.
            windowBudget = Math.min(windowBudget, Math.max(
                minHistoryBudget,
                limits.landAt * contextWindow - scale * fixed - reservedThinking - reservedGeneration - split.summary,
            ));
        }
        if (limits?.ceiling !== undefined) windowBudget = Math.min(windowBudget, limits.ceiling);
        windowBudget -= limits?.reserve ?? 0;

        let used = 0;
        let cut = messages.length;
        for (let i = messages.length - 1; i >= 0; i--) {
            const cost = scale * costOf(messages[i]!);
            const kept = messages.length - 1 - i;
            if (used + cost > windowBudget && kept >= minKeep) break;
            used += cost;
            cut = i;
        }
        if (cut === 0) return { keep: messages, drop: [] };
        return { keep: messages.slice(cut), drop: messages.slice(0, cut) };
    };
}
