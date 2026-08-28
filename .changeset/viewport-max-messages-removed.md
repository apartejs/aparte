---
"@aparte/core": minor
---

The deprecated `max-messages` attribute and `maxMessages` option of `<aparte-chat-viewport>` are removed — use `max-rendered-bubbles` / `maxRenderedBubbles`, which is what the alias had been forwarding to.

Pre-1.0 a rename lands as a rename; the alias and its one-time warning were the one deprecation shim in the package. (`AparteConversationManager`'s own `retention.maxMessages` is unrelated and unchanged.)
