/**
 * budget.ts — the context-window budget.
 *
 * One question, answered without a tokenizer: how much of the model's window is left
 * for the conversation once the fixed costs are paid — the system prompt, the tools,
 * the room reserved for the reply and for thinking, a buffer, a margin. The answer is
 * what `createCompactionSelector` (selector.ts) walks the history against.
 *
 *   Budget = contextWindow − systemPrompt − tools − reservedThinking
 *                          − reservedGeneration − autocompactBuffer − safetyMargin
 *
 * The budget is then split in two: a slot for the running summary and the sliding
 * window of verbatim turns.
 *
 * It lived in `@aparte/engine` until 0.16.0. Nothing in the loop read it — the loop
 * reports usage and lets the caller decide — so it moved here, next to the one thing
 * that does: the compaction this plugin performs. Zero deps, a char-count heuristic.
 */

import { estimateTokens } from '@aparte/core';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompactionConfig {
    /** Total context window of the active model, in tokens. */
    contextWindow: number;
    /** Reserved budget for the model's thinking/reasoning block, in tokens. */
    reservedThinking: number;
    /** Reserved budget for the assistant response (max_new_tokens cap). */
    reservedGeneration: number;
    /** Fraction of context_window kept as autocompact buffer (0..1). */
    autocompactBufferPct: number;
    /** Hard safety margin in tokens. */
    safetyMargin: number;
    /** Floor for history budget — never compact below this. */
    minHistoryBudget: number;
    /**
     * Share of the history budget held back for the running summary, so the verbatim
     * window leaves room for it (0..1).
     */
    summaryRatio: number;
    /**
     * Ceiling on that reservation, in tokens. It sizes the WINDOW: the verbatim turns
     * leave this much room for the summary. The summary request's own `maxTokens` is a
     * looser ceiling that only keeps the answer inside the window (see `setupCompaction`),
     * and a summary no shorter than the turns it replaces is refused.
     */
    summaryMaxTokens: number;
}

export interface BudgetBreakdown {
    contextWindow: number;
    systemPrompt: number;
    tools: number;
    reservedThinking: number;
    reservedGeneration: number;
    autocompactBuffer: number;
    safetyMargin: number;
    historyAvailable: number;
}

export interface BudgetResult {
    historyBudget: number;
    breakdown: BudgetBreakdown;
    config: CompactionConfig;
}

/**
 * The history budget, split: the room held back for the running summary, and the
 * verbatim window that is what remains.
 *
 * `summary` is a RESERVATION, read to shrink `window`. The summary request carries a
 * looser `maxTokens` of its own (it keeps the answer inside the window), and a summary
 * that is cut off at that limit, or no shorter than the turns it replaces, is refused.
 */
export interface SplitBudget {
    summary: number;
    window: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
    // Conservative model-agnostic defaults — the consuming app overrides
    // `contextWindow` / `reservedThinking` with its model's real values.
    contextWindow: 8192,
    reservedThinking: 0,
    reservedGeneration: 2000,
    autocompactBufferPct: 0.10,     // ~3300 tok
    safetyMargin: 500,
    minHistoryBudget: 1000,

    summaryRatio: 0.10,
    summaryMaxTokens: 400,
};

// ─── Token estimation ──────────────────────────────────────────────────────

/**
 * Token heuristic — core's, re-exported under the name this module always had.
 *
 * It lives in `@aparte/core` (`estimateTokens`) because the context gauge and the count
 * the client records on each reply read the SAME estimate: a plugin that kept a private copy
 * would decide on figures the page does not show.
 */
export { estimateTokens };

/**
 * Estimate tokens for a JSON-serializable structure (e.g. tools array).
 */
export function estimateTokensJson(obj: unknown): number {
    if (!obj) return 0;
    try {
        return estimateTokens(JSON.stringify(obj));
    } catch {
        return 0;
    }
}

// ─── Budget computation ────────────────────────────────────────────────────

/**
 * Compute the available history budget after subtracting fixed costs.
 */
export function computeHistoryBudget(input: {
    systemPrompt: string;
    toolsArray?: unknown;
    config?: Partial<CompactionConfig>;
}): BudgetResult {
    const cfg: CompactionConfig = { ...DEFAULT_COMPACTION_CONFIG, ...(input.config ?? {}) };

    const systemTokens = estimateTokens(input.systemPrompt);
    const toolsTokens = estimateTokensJson(input.toolsArray);
    const autocompactBuffer = Math.floor(cfg.contextWindow * cfg.autocompactBufferPct);

    const fixed = systemTokens + toolsTokens
        + cfg.reservedThinking + cfg.reservedGeneration
        + autocompactBuffer + cfg.safetyMargin;

    const historyBudget = Math.max(cfg.minHistoryBudget, cfg.contextWindow - fixed);

    return {
        historyBudget,
        breakdown: {
            contextWindow: cfg.contextWindow,
            systemPrompt: systemTokens,
            tools: toolsTokens,
            reservedThinking: cfg.reservedThinking,
            reservedGeneration: cfg.reservedGeneration,
            autocompactBuffer,
            safetyMargin: cfg.safetyMargin,
            historyAvailable: historyBudget,
        },
        config: cfg,
    };
}

/**
 * Split the history budget: the running summary's slot (capped), and the rest for
 * the verbatim window.
 */
export function splitHistoryBudget(
    historyBudget: number,
    cfg: CompactionConfig = DEFAULT_COMPACTION_CONFIG,
): SplitBudget {
    const summary = Math.min(cfg.summaryMaxTokens, Math.floor(historyBudget * cfg.summaryRatio));
    return { summary, window: historyBudget - summary };
}
