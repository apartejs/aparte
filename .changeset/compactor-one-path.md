---
"@aparte/engine": minor
---

The conversation module leaves the engine: `estimateTokens`, `estimateTokensJson`, `computeHistoryBudget`, `splitHistoryBudget`, `DEFAULT_COMPACTION_CONFIG`, `CompactionConfig`, `BudgetBreakdown`, `BudgetResult`, `SplitBudget`, `createCompactionSelector`, `CompactionSelectorOptions`, `CompactableMessage`, `CompactionSelection` and `CompactionSelector` are `@aparte/plugin-compaction`'s now, same names, same signatures — change the import. Gone with them, not moved: `assembleCompacted`, `compactConversation`, `CompactionMessage`, `CompactionInput`, `CompactionResult`, `RetrievedTurn`, the `ragHist*` / `ragIntroLabel` / `summaryLabel` fields of `CompactionConfig` and the `ragHist` slot of `SplitBudget`, and the `triggerSummaryThresholdPct` / `summarizeEveryNTurns` fields nothing read.

The engine is the loop, and only the loop: `runStreamAgent` reports usage and lets the caller decide. Nothing in it ever read the budget — the one reader was `AparteClient.compact()`, which has moved to the same plugin — and a module with no in-package consumer is a contract maintained for nobody.
