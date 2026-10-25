---
'@aparte/engine': minor
---

A stream `error` event can now carry a `code`, and the error `runStreamAgent` throws for it carries the same `code`. Nothing for you to change: an event without a code throws the plain `Error` it always did.

`StreamChatEvent`'s `error` variant gains `code?: string` (core's event map gains the typed `code?: AparteErrorCode`; this is its mirror). The caller reads it from the thrown error: core's `AparteError.from` keeps it when it is one of `AparteErrorCode`'s values, which is how an overflowing prompt a provider reported mid-stream (`USAGE_CONTEXT_EXCEEDED`) becomes something the client can act on instead of a sentence to show.
