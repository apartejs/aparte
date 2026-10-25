---
'@aparte/provider-openai-compat': minor
---

The provider now tells an overflowing prompt from a bad request: a 400 or 413 whose body says the prompt did not fit is `USAGE_CONTEXT_EXCEEDED`, and so is an error the server streams after its 200. Nothing for you to change; with `@aparte/plugin-compaction`, core compacts and sends the turn again instead of showing the error.

What is new, all additive:

- `provider.classifyError(status, body)` (the `AparteFormatAdapter` method core's direct transport and `createAparteChatHandler` call): `USAGE_CONTEXT_EXCEEDED` for a 400 or 413 whose `error` says `context_length_exceeded`, or whose message, type or code matches "maximum context length", "context length", "context size has been exceeded", "exceed_context_size_error", "exceeds the available context size" or "prompt is too long" (any case). Every other status and body is left to the status.
- The mid-stream `error` event the provider emits for the same payloads carries `code: 'USAGE_CONTEXT_EXCEEDED'`; so does the error `parseText` throws for a 200 body that is an overflow (LM Studio). Any other error carries no code, as before.

Needs `@aparte/core` with the same release to be acted on; older cores ignore the code and show the error as they did.
