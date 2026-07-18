/**
 * conversation/compactor.ts — adaptive budgeting + context-window assembly.
 *
 * Conversation history budgeting and sliding-window assembly —
 * framework-free and tokenizer-free (char-count heuristic).
 *
 * Pattern (cf. Claude Code /context, OpenAI Agents SDK TrimmingSession):
 *   Budget = CONTEXT_WINDOW − systemPrompt − tools − reservedThinking
 *                          − reservedGeneration − autocompactBuffer − safetyMargin
 *
 * The history budget is then split into:
 *   - summary    (global summary, LLM-generated, ~10%)
 *   - ragHist    (older turns retrieved by cosine similarity, ~25%)
 *   - window     (verbatim sliding window, the rest)
 *
 * Drop priority on overflow:
 *   1. summary    (async-regenerable)
 *   2. ragHist    (retrievable on the next turn)
 *   3. window oldest turns
 *   X. NEVER dropped: currentUser + lastAssistant (absolute working memory)
 *
 * Browser-portable: zero deps, just an estimateTokens heuristic.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompactionMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
}

export interface RetrievedTurn {
    role: 'user' | 'assistant';
    content: string;
    score?: number;
}

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
    /** Ratio of history budget allocated to the summary block. */
    summaryRatio: number;
    /** Hard cap for summary tokens. */
    summaryMaxTokens: number;
    /** Ratio of history budget allocated to the RAG-retrieved old turns. */
    ragHistRatio: number;
    /** Hard cap for ragHist tokens. */
    ragHistMaxTokens: number;
    /** Trigger summarization once history usage reaches this % of the budget. */
    triggerSummaryThresholdPct: number;
    /** Re-run summarization every N user turns. */
    summarizeEveryNTurns: number;
    /** Header prepended to the summary block injected into the model context. English
     *  by default — override to localise (the compactor ships no locale system). */
    summaryLabel: string;
    /** Header prepended to the RAG-retrieved old turns injected into the context. */
    ragIntroLabel: string;
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

export interface SplitBudget {
    summary: number;
    ragHist: number;
    window: number;
}

export interface UsageBreakdown {
    system: number;
    summary: number;
    ragHist: number;
    window: number;
}

export interface DroppedBreakdown {
    ragHits: number;
    oldTurns: number;
    summary: boolean;
}

export interface FullBreakdown extends BudgetBreakdown {
    historyAllocated: SplitBudget;
    historyUsed: UsageBreakdown;
    totalUsed: number;
    /** Free tokens left in the context window after all reservations + actual use. */
    free: number;
    dropped: DroppedBreakdown;
}

export interface CompactionInput {
    messages: CompactionMessage[];
    systemPrompt: string;
    /** Tools array passed to apply_chat_template (or null/undefined when no tools). */
    toolsArray?: unknown;
    /** Running summary text (regenerable). */
    summary?: string;
    /** RAG-retrieved old turns (older than the sliding window). */
    retrievedTurns?: RetrievedTurn[];
    /** Partial override of the default config. */
    config?: Partial<CompactionConfig>;
}

export interface CompactionResult {
    compactedMessages: CompactionMessage[];
    breakdown: FullBreakdown;
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
    ragHistRatio: 0.25,
    ragHistMaxTokens: 1000,

    triggerSummaryThresholdPct: 0.75,
    summarizeEveryNTurns: 5,

    summaryLabel: 'Conversation summary:',
    ragIntroLabel: 'Relevant excerpts from earlier in the conversation:',
};

// ─── Token estimation ──────────────────────────────────────────────────────

/**
 * Token heuristic (FR ~3.5 chars/tok, EN ~4 chars/tok).
 * Accurate to ±10% — enough for budgeting, and it avoids `tokenizer.encode()`,
 * which costs ~5ms per message × N (too slow to run on every turn).
 */
export function estimateTokens(text: string | null | undefined): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
}

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
 * Split history budget into summary / ragHist / window slots.
 */
export function splitHistoryBudget(
    historyBudget: number,
    cfg: CompactionConfig = DEFAULT_COMPACTION_CONFIG,
): SplitBudget {
    const summary = Math.min(cfg.summaryMaxTokens, Math.floor(historyBudget * cfg.summaryRatio));
    const ragHist = Math.min(cfg.ragHistMaxTokens, Math.floor(historyBudget * cfg.ragHistRatio));
    const window = historyBudget - summary - ragHist;
    return { summary, ragHist, window };
}

// ─── Message assembly ──────────────────────────────────────────────────────

interface AssembleParams {
    messages: CompactionMessage[];
    summary?: string;
    retrievedTurns?: RetrievedTurn[];
    windowBudget: number;
    summaryBudget: number;
    ragBudget: number;
    systemContent?: string;
    /** Context-injection headers; default to English (DEFAULT_COMPACTION_CONFIG). */
    summaryLabel?: string;
    ragIntroLabel?: string;
}

interface AssembleResult {
    compactedMessages: CompactionMessage[];
    used: UsageBreakdown;
    dropped: DroppedBreakdown;
}

/**
 * Assemble compacted message list given a budget and conversation state.
 *
 * Output order:
 *   [system?] → [summary system msg?] → [ragHist system msg?] → window verbatim
 *
 * Always keeps the last 2 non-system messages verbatim (working memory),
 * regardless of windowBudget — these are the floor that can never be dropped.
 */
export function assembleCompacted(params: AssembleParams): AssembleResult {
    const {
        messages,
        summary = '',
        retrievedTurns = [],
        windowBudget,
        summaryBudget,
        ragBudget,
        systemContent,
        summaryLabel = DEFAULT_COMPACTION_CONFIG.summaryLabel,
        ragIntroLabel = DEFAULT_COMPACTION_CONFIG.ragIntroLabel,
    } = params;

    const out: CompactionMessage[] = [];
    const used: UsageBreakdown = { system: 0, summary: 0, ragHist: 0, window: 0 };
    const dropped: DroppedBreakdown = { ragHits: 0, oldTurns: 0, summary: false };

    // System message first
    if (systemContent) {
        out.push({ role: 'system', content: systemContent });
        used.system = estimateTokens(systemContent);
    }

    // Summary
    if (summary) {
        const summaryWrapped = `${summaryLabel}\n${summary}`;
        const summaryToks = estimateTokens(summaryWrapped);
        if (summaryToks <= summaryBudget) {
            out.push({ role: 'system', content: summaryWrapped });
            used.summary = summaryToks;
        } else {
            const ratio = (summaryBudget / summaryToks) * 0.95;
            const truncated = summary.slice(0, Math.max(0, Math.floor(summary.length * ratio)));
            const wrapped = `${summaryLabel}\n${truncated}…`;
            out.push({ role: 'system', content: wrapped });
            used.summary = estimateTokens(wrapped);
            dropped.summary = true;
        }
    }

    // RAG hist — old turns retrieved by cosine similarity, sorted by score desc
    if (retrievedTurns.length > 0) {
        const sorted = [...retrievedTurns].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const lines: string[] = [];
        const intro = `${ragIntroLabel}\n`;
        let toks = estimateTokens(intro);
        for (const t of sorted) {
            const line = `[${t.role}] ${t.content}`;
            const lt = estimateTokens(line);
            if (toks + lt > ragBudget) {
                dropped.ragHits++;
                continue;
            }
            lines.push(line);
            toks += lt;
        }
        if (lines.length > 0) {
            const content = intro + lines.join('\n');
            out.push({ role: 'system', content });
            used.ragHist = estimateTokens(content);
        }
    }

    // Sliding window verbatim — newest → oldest, until windowBudget exhausted.
    // Always keep the last 2 non-system messages (working memory floor).
    const nonSystem = messages.filter(m => m.role !== 'system');
    if (nonSystem.length === 0) {
        return { compactedMessages: out, used, dropped };
    }

    const reversedWindow: CompactionMessage[] = [];
    let windowToks = 0;
    const minKeep = Math.min(2, nonSystem.length);

    for (let i = nonSystem.length - 1; i >= 0; i--) {
        const m = nonSystem[i];
        if (!m) continue;
        const t = estimateTokens(m.content);
        const idxFromEnd = nonSystem.length - 1 - i;

        if (idxFromEnd < minKeep) {
            // Working memory floor — kept no matter the budget.
            reversedWindow.unshift(m);
            windowToks += t;
            continue;
        }

        if (windowToks + t > windowBudget) {
            dropped.oldTurns += i + 1;
            break;
        }
        reversedWindow.unshift(m);
        windowToks += t;
    }

    out.push(...reversedWindow);
    used.window = windowToks;

    return { compactedMessages: out, used, dropped };
}

// ─── High-level helper ─────────────────────────────────────────────────────

/**
 * Compute budget + assemble in one call. The primary entry point for
 * consumers (a browser request interceptor, mobile, Node tests).
 */
export function compactConversation(input: CompactionInput): CompactionResult {
    const { messages, systemPrompt, toolsArray, summary, retrievedTurns, config } = input;

    const budget = computeHistoryBudget({ systemPrompt, toolsArray, config });
    const split = splitHistoryBudget(budget.historyBudget, budget.config);

    const { compactedMessages, used, dropped } = assembleCompacted({
        messages,
        summary,
        retrievedTurns,
        windowBudget: split.window,
        summaryBudget: split.summary,
        ragBudget: split.ragHist,
        systemContent: systemPrompt,
        summaryLabel: budget.config.summaryLabel,
        ragIntroLabel: budget.config.ragIntroLabel,
    });

    const totalUsed = budget.breakdown.systemPrompt
        + budget.breakdown.tools
        + used.summary
        + used.ragHist
        + used.window;

    const free = budget.config.contextWindow - totalUsed
        - budget.config.reservedThinking - budget.config.reservedGeneration
        - budget.breakdown.autocompactBuffer - budget.config.safetyMargin;

    const breakdown: FullBreakdown = {
        ...budget.breakdown,
        historyAllocated: split,
        historyUsed: used,
        totalUsed,
        free,
        dropped,
    };

    return { compactedMessages, breakdown };
}
