---
"@aparte/provider-transformers": patch
---

Stop now reaches a reply that is still queued behind a model load, and a token the worker emits after a Stop no longer lands in the stream. Nothing to change on your side.

The worker created a generate's `AbortController` when the queue reached that generate. A `cancel` arriving earlier — while `prepareModel` was still downloading another model, which can take minutes — found nothing to abort, so once the load finished the stopped reply started anyway and streamed to the end. The controller is now registered when the message arrives, and a generate cancelled before it starts never loads a model; it answers `gen-done`, which is what releases the queue slot.

The main thread kept the stream open after posting the `cancel`, waiting for the worker to answer, so a token already in flight was enqueued into a reply the user had ended. The stream is closed at the Stop instead — with `done`, since a stop is not a failure — and the worker's own `gen-done` still releases the slot. On the non-streaming path (`chat({ stream: false })`) that means a Stop after the request has reached the worker resolves with the text produced so far, where a Stop before it still rejects with `Generation cancelled before it started`.
