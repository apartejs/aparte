---
"@aparte/provider-openai-compat": patch
---

Parallel tool calls survive a server that omits `tool_calls[].index`, a call with no `id` gets one, and a forced `toolChoice: { name }` reaches the endpoint instead of being downgraded to `auto`. Nothing to change on your side.

`index` was the accumulation map's only key, and it is a streaming convenience rather than part of the function-call payload — plenty of compat servers leave it out. Every call of such a turn landed on slot 0: the second `id` and `name` overwrote the first, the two argument strings concatenated into non-JSON, and the turn ran ONE tool on `{}` while the model was told it had two answers. The only trace was a console warning naming "malformed arguments JSON", which reads as the model's fault. The key is now `index`, else `id`, else the function name — which in this format appears only on a call's first delta, so a nameless chunk still continues the call before it.

An id is minted (`call_1`, `call_2`, …) when the vendor sends none; a real id arriving in a later chunk still wins. `id: ''` used to travel, and downstream it is an identity: the transcript keys a row on `tool-${id}` and the history files a result under `toolCallId`, so two id-less calls in one turn shared one row — the second call's result was written onto the first call's line — and one history slot an OpenAI-shaped endpoint rejects on the next turn.

`tool_choice` was written as `'auto'` unconditionally whenever tools were present. `{ name }` is a shape the agent loop passes straight through (it intercepts only `{ name, input }`, the synthetic call it runs itself), and the ai-sdk bridge has always honoured it, so the same request forced a tool on one provider and not on this one.
