---
"@aparte/runner-ag-ui": patch
---

A refused AG-UI tool call's row now says who refused and what they wrote; the agent receives the same sentence as before.

The runner wrote its own copy of the refusal sentence. It takes `toolRefusal` from `@aparte/core` now, so its `tool-rejected` carries `by` and `instruction` like the loop's.
