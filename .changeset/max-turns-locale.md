---
"@aparte/core": patch
---

The turn-limit message follows the chat's locale (`maxTurnsReached`, with `{n}` the limit).

It was a hard-coded English sentence ("Stopped after 3 tool calls to prevent an infinite loop.") in a chat set to any language.
