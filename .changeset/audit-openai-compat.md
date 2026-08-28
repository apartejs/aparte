---
"@aparte/provider-openai-compat": patch
---

A streamed turn that ends on `finish_reason: 'stop'` or `'length'` (or a bare `[DONE]`) after tool-call deltas now emits the accumulated `tool_use` events instead of dropping them — a call cut mid-arguments is dropped with a console line rather than run on `{}`. The accumulator no longer inherits from `Object.prototype` and a vendor's `index` is made a number, so a chunk whose `index` is `"__proto__"` pollutes nothing.
