---
"@aparte/engine": minor
---

`CompactionConfig` loses `triggerSummaryThresholdPct` and `summarizeEveryNTurns` (and `DEFAULT_COMPACTION_CONFIG` their defaults, `0.75` and `5`). A config passing them gets a type error; remove the two keys. Nothing read them: they described a policy for when to re-summarise that no code in the engine or in core implements — `<aparte-context>` decides that with its own `danger` threshold. A documented field nothing honours is a promise the library cannot keep, so they are removed rather than deprecated.
