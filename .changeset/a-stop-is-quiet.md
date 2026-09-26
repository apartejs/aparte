---
"@aparte/core": patch
---

Stopping a reply no longer prints an uncaught `AbortError` in the console when the stream had already failed.

An aborted `fetch` errors its response body, and the Stop handler then cancelled the reader. `reader.cancel()` returns a promise that rejects on an errored stream, and it was wrapped in a `try` that only catches synchronous errors, so the rejection went unhandled. It is caught now.
