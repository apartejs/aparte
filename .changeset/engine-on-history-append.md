---
"@aparte/engine": minor
---

`runStreamAgent` gained an optional **`onHistoryAppend`** hook: it reports every turn the loop
appends to the history — the grouped `tool_call` envelope, each `tool_result` (resolved or
rejected), and a pipeline phase's reply — in order, and always before the transport call that
would carry it. Messages you passed in `baseRequest` are never reported: you already have them.

This makes the loop usable by hosts that **own their own transcript**. It re-sends its message
array every turn, which fits a stateless message API but not a prefix cache (llama.cpp slots,
vLLM), where turn N+1 must *extend* turn N byte for byte. Such a host already controlled the
request — `transportCall` may ignore `request.messages` — but had to reimplement the loop's
tool_call/tool_result bookkeeping to keep its own log in sync. Now it just mirrors the
notifications.

No core change is needed to use it through the `streamRunner` seam:
`streamRunner: (opts) => runStreamAgent({ ...opts, onHistoryAppend })`. Omitting the hook leaves
behaviour byte-identical — pinned by a test that compares the event stream and the per-turn
requests with and without it.
