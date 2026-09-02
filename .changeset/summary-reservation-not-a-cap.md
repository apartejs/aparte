---
"@aparte/plugin-compaction": patch
---

`summaryMaxTokens` reserves room in the window budget; it never truncated the summary and no longer claims to.

Its JSDoc read "Hard cap for summary tokens" and `summaryRatio`'s read "Ratio of history budget allocated to the summary block", so both described a bound on the text a summariser returns. `splitHistoryBudget` uses them for one thing: `summary = min(summaryMaxTokens, budget × summaryRatio)`, and that number is subtracted from the verbatim window. Nothing measures a summary against it and nothing clips one — a summariser that overruns simply costs the turn more than the split assumed, silently, which is the failure mode a reader trusting the word "cap" would never look for.

Words only: `splitHistoryBudget`, the defaults and the numbers are untouched. If you need a real bound, clip inside your own `summarize`.
