---
"@aparte/engine": minor
---

`runStreamAgent` now emits `finishReason` on `run-done`: the reason the LAST model call of the run ended, when its provider reported one.

A step that reports no reason does not inherit the one before it: the value is reset at the top of every model call, so a final answer that says nothing is not described by the `'tool-calls'` of the turn before. `StreamChatEvent`'s `done` accepts the field (`StreamFinishReason`, the same union as core's `AparteFinishReason`). A run whose providers report nothing emits `run-done` exactly as before.
