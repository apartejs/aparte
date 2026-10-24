---
"@aparte/core": patch
---

The turn-limit message follows the chat's locale (`maxTurnsReached`, with `{n}` the limit).

It was a hard-coded English sentence ("Stopped after 3 tool calls to prevent an infinite loop.") in a chat set to any language. The English default now reads "Stopped after 3 turns to avoid an endless loop.", and the message is read from the chat's own config, so a client on the global config answering a chat with its own locale writes it in the chat's language.
