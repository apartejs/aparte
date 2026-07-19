---
"@aparte/provider-transformers": patch
---

Cancelling a local-model stream now actually STOPS generation: the worker runs each generate
under an `InterruptableStoppingCriteria` and the stream's `cancel()` interrupts it, instead of
letting the model run to `max_new_tokens` off-thread after the consumer aborted.
