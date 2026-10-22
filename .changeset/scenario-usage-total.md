---
'@aparte/provider-scenario': patch
---

A scripted `{ usage }` step that overrides `inputTokens` or `outputTokens` now moves `totalTokens` with it; set `totalTokens` too to pin it.

The total was computed from the estimates before the step's fields were merged over them, so `{ usage: { inputTokens: 900 } }` left the estimated total in place — and the context gauge reads the total first, so overriding the input alone moved nothing on it.
