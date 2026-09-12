---
"@aparte/provider-ai-sdk": patch
---

The AI SDK stream is told to stop on every exit, not only when the consumer cancels. Nothing to change on your side.

`cancel()` calls `iterator.return()` precisely so the vendor call stops instead of draining to its natural end after the consumer has walked away. The two in-band terminals, `finish` and `error`, returned straight out of the loop and skipped it — so after an error part the call was left running exactly where the bridge was written to end it.
