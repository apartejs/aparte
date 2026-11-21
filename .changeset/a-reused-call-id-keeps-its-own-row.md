---
'@aparte/engine': patch
---

Two tool calls of one reply now keep two rows, even when a later model call repeats an earlier call's id.

A vendor that sends no call ids has them minted per stream (openai-compat), and a server that numbers ids per response repeats them: the second call's result was written onto the first call's row, the second row stayed pending, and the next request filed both answers under one id. A repeated id is now renamed for the whole reply (`aparte-call-1_2`), the calls a resumed run made before its pause included. An earlier reply's ids are left alone. The suffix uses `_`, a character every vendor accepts in a call id: Anthropic takes `[a-zA-Z0-9_-]` only, and a history replayed to it after a change of model must not carry a `#`.
