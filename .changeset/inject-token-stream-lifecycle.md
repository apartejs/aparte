---
'@aparte/core': patch
---

A framework chat streaming with `injectTokenStream` now shows Stop, stops on it, and saves the reply: the turn sends its own lifecycle events.

`injectTokenStream` (React, Vue, Svelte, Angular) dispatches `aparte-message-start` when it begins and `aparte-message-done`, `-aborted` or `-error` when it ends, on the chat, stamped with its id, as `AparteClient` does. The composer's Stop (`aparte-abort` for this chat) stops the stream; another chat's Stop does not. Code that sent these events by hand around `injectTokenStream` can drop them; left in place, the composer and the conversation manager see each event twice, which they tolerate.
