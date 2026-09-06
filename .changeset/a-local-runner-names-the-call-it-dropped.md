---
"@aparte/provider-transformers": patch
---

A local runner now says when it dropped a tool call the assistant made, not only the tool result that answered it. Nothing to change on your side; you get one warning where you used to get none.

Neither built-in runner can carry a tool turn — the wire syntax for one is model-specific — and both have always said so. Now that a call rides on an `assistant` message rather than a role of its own, the call passes the runner's role test: a turn where the model said nothing before calling was then dropped by the emptiness check below it, in silence, which is the exact defect the warning exists to prevent. Both runners count such a turn, and the shared message names both halves — the call the assistant made, and the result that answered it.
