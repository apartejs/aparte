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
export type CompactionSelector = <M extends CompactableMessage>(messages: M[]) => CompactionSelection<M>;

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
}

const read = <T>(value: T | (() => T)): T => (typeof value === 'function' ? (value as () => T)() : value);

/** What a message costs: its text, or the text of its segments when it has no `content`. */
const textOf = (message: CompactableMessage): string => {
    if (typeof message.content === 'string' && message.content.length > 0) return message.content;
    return (message.segments ?? [])
        .map((segment) => {
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
    return <M extends CompactableMessage>(messages: M[]): CompactionSelection<M> => {
        const contextWindow = read(options.contextWindow);
        if (!contextWindow || contextWindow <= 0) return { keep: messages, drop: [] };

        const budget = computeHistoryBudget({
            systemPrompt: read(options.systemPrompt) ?? '',
            toolsArray: read(options.tools),
            config: { ...options.config, contextWindow },
        });
        const windowBudget = splitHistoryBudget(budget.historyBudget, budget.config).window;

        let used = 0;
        let cut = messages.length;
        for (let i = messages.length - 1; i >= 0; i--) {
            const cost = estimateTokens(textOf(messages[i]!));
            const kept = messages.length - 1 - i;
            if (used + cost > windowBudget && kept >= minKeep) break;
            used += cost;
            cut = i;
        }
        if (cut === 0) return { keep: messages, drop: [] };
        return { keep: messages.slice(cut), drop: messages.slice(0, cut) };
    };
}
