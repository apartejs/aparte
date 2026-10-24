---
"@aparte/runner-ag-ui": patch
---

A refusal sent to an AG-UI agent tells the row who refused and what they said; the agent reads the same sentence as before.

The runner wrote its own copy of the refusal sentence. It takes `toolRefusal` from `@aparte/core` now, so its `tool-rejected` carries `by` and `instruction` like the loop's.
