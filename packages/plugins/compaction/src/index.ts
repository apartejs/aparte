/**
 * `@aparte/plugin-compaction` — conversation compaction: summarise the turns that no
 * longer fit the model's window, keep the recent ones verbatim.
 *
 * Core owns the seams — the `aparte-compact` command `<aparte-context>` dispatches on
 * reaching its `danger` threshold, the `compaction: true` message the viewport draws as
 * a notice and the history sends under a preamble, the events a host listens for — and
 * this plugin is what answers the command: a selector over the model's budget, a
 * summariser through the config's transport, and the replacement in the transcript.
 * Nothing in core compacts by itself; no UI kit does, every agent SDK ships it as an
 * opt-in module, and so does aparté.
 *
 * No element, so one entry serves the browser and Node: `setupCompaction` touches
 * `window` when called, never at import.
 */
export { setupCompaction } from './compaction.js';
export type {
    CompactionSetupOptions, CompactionController, CompactionOutcome, CompactionSkipReason,
    CompactionTarget, CompactionMessageSelector, CompactionKeyResolver, CompactionSummarizer,
} from './compaction.js';
export { createCompactionSelector } from './selector.js';
export type { CompactionSelectorOptions, CompactableMessage, CompactionSelection, CompactionSelector } from './selector.js';
export {
    computeHistoryBudget, splitHistoryBudget, estimateTokens, estimateTokensJson, DEFAULT_COMPACTION_CONFIG,
} from './budget.js';
export type { CompactionConfig, BudgetBreakdown, BudgetResult, SplitBudget } from './budget.js';
export { transcriptForSummary, messageText, DEFAULT_COMPACTION_PROMPT } from './transcript.js';
export type {
    AparteCompactEventDetail, AparteCompactStartEventDetail, AparteCompactDoneEventDetail, AparteCompactErrorEventDetail,
} from '@aparte/core';
