---
"@aparte/engine": patch
---

A turn's `tool_call` envelope is created once, held by reference, and declares every call whose `tool_result` follows it — so a turn that calls `create_artifact` and another tool no longer sends the second tool's result with no call declaring it. `onHistoryAppend` reports the envelope once, when the first call completes; the calls that complete later in the same turn are already in that same object's `toolCalls`.

The loop used to guess whether the turn's envelope was already in the history by scanning it for any of the turn's call ids. The built-in `create_artifact` fast path pushed a fresh envelope of its own, the scan found the artifact's id in it, concluded "already pushed", and the next tool's result went out orphaned — a history an Anthropic-shaped API rejects outright. A reference cannot be guessed wrong.
