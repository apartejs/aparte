---
"@aparte/core": patch
---

`<aparte-context auto-compact>` asks for a compaction again after one was refused or failed; it used to ask once and never again.

The request was spent only by a compaction that actually landed. A skip — nothing to drop yet, a stream in flight, another compaction running — returned before the flag was cleared, the level never left `danger` with the usage still climbing, and the gauge stayed silent for the life of the element. The request is now made per turn: one stays open until the plugin answers (done, skipped or failed), and the next turn still in danger asks again. Nothing changes for a compaction that succeeds.
