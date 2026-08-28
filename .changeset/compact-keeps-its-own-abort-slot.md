---
"@aparte/core": patch
---

`AparteClient.abort()` now stops an in-flight `compact()` without disturbing a turn, and a turn without disturbing a compaction.

Compaction used to borrow the turn's abort controller slot, so a summarisation started during a turn left that turn unabortable — Stop reached only the summary while the reply kept streaming and kept being billed. Each has its own controller; `abort()` fires both.
