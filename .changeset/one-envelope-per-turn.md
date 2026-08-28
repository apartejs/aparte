---
"@aparte/engine": patch
---

A turn that calls `create_artifact` and another tool no longer sends the second tool's result without the call that declares it — a history an Anthropic-shaped API rejected outright. The turn's `tool_call` envelope is now created once, held by reference, and declares every call whose `tool_result` follows it; `onHistoryAppend` reports the envelope once, when the first call completes, and the calls that complete later in the same turn are already in that same object's `toolCalls`.

The loop used to guess whether the turn's envelope was already in the history by scanning it for any of the turn's call ids. The built-in `create_artifact` fast path pushed a fresh envelope of its own, the scan found the artifact's id in it, concluded "already pushed", and the next tool's result went out orphaned. A reference cannot be guessed wrong.
