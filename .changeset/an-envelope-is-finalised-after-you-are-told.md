---
"@aparte/engine": patch
---

`onHistoryAppend`'s documentation now says which fields of a `tool_call` envelope are filled in after you are notified, and what a host that writes bytes at receipt should do about it. Documentation only.

The option exists for a host that owns its own transcript — a prefix cache, an append-only log — and the docblock said to hold the reference rather than a snapshot, justifying it with the turn's later `toolCalls`. Since the loop re-reads `precedingText` at the turn's end (a provider that emits a tool call before the rest of its sentence), an append-only log, which by definition serialises at receipt and cannot hold a reference, was told to do the one thing it cannot.

The paragraph now names both late fields and says to treat the envelope as provisional until the turn's last `tool_result`.
