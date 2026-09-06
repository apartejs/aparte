---
"@aparte/provider-transformers": patch
---

A local runner now says when it dropped a tool call the assistant made, not only the tool result that answered it, and the vision runner counts a content part it cannot carry instead of failing at generate time. Nothing to change on your side; you get one warning where you used to get none.

Neither built-in runner can carry a tool turn — the wire syntax for one is model-specific — and both have always said so. Now that a call rides on an `assistant` message rather than a role of its own, the call passes the runner's role test: a turn where the model said nothing before calling was then dropped by the emptiness check below it, in silence, which is the exact defect the warning exists to prevent. Both runners count such a turn, and the shared message names both halves — the call the assistant made, and the result that answered it.

The message says one thing more precisely than it did. What is dropped is the CALL and its result; what the assistant said before calling is still in the prompt, because that sentence rides on the same `assistant` message and passes the role test. "Dropped tool turn(s) from the prompt" read as if the whole turn left, which had stopped being true.

On the parts axis the vision runner had no guard at all. Its content loop was `text` or *else an image*, so a `file` part — removed from `AparteContentPart`, and still reachable from an app built against an older aparté — was pushed into the image list as `undefined` and reached `load_image(undefined)`, failing the turn at generate time. It is counted and named now, the way the wire mappers already guard the removed tool ROLES: same class, same treatment.
