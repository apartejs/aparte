---
"@aparte/engine": minor
---

The engine's compactor is the budget, and nothing else: `assembleCompacted`, `compactConversation`, `CompactionMessage`, `CompactionInput`, `CompactionResult`, `RetrievedTurn`, the `ragHistRatio` / `ragHistMaxTokens` / `ragIntroLabel` / `summaryLabel` fields of `CompactionConfig` and the `ragHist` slot of `SplitBudget` are removed. What stays — `estimateTokens`, `estimateTokensJson`, `computeHistoryBudget`, `splitHistoryBudget` (`{ summary, window }`), `DEFAULT_COMPACTION_CONFIG` and `createCompactionSelector` — is what core and the gauge actually run.

The assembler rebuilt a message list with a summary and RAG-retrieved excerpts; it had no caller in the repository and no producer for the excerpts, and the summarising itself lives where the transport is — `AparteClient.compact()`, which now budgets by default. A page documented the assembler as "Ready" for nobody. If you called `compactConversation` yourself, the window it computed is `splitHistoryBudget(computeHistoryBudget(…).historyBudget).window`, and the selector is the walk.
