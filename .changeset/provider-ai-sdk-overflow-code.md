---
'@aparte/provider-ai-sdk': minor
---

An overflowing prompt reported by the AI SDK now carries `code: 'USAGE_CONTEXT_EXCEEDED'` on the `error` event, so core can compact and send the turn again. Nothing for you to change; any other error is the event it was.

The bridge matches the vendor's own sentence in the API error's message, or in its `responseBody` when the message is generic ("maximum context length", "context size has been exceeded", `exceed_context_size_error`, "exceeds the available context size", "prompt is too long", `context_length_exceeded`; any case), the same readings `@aparte/provider-openai-compat` makes on a wire body.
