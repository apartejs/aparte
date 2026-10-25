---
'@aparte/plugin-compaction': patch
---

`estimateTokens` now comes from `@aparte/core`. The plugin re-exports it under the same name, so nothing changes for you.

The gauge and the plugin used to keep their own copy of the character heuristic; core's `measureContext` reads one, and the plugin's budget now reads that one too. The function and its result are the same: `ceil(characters / 3.8)`.
