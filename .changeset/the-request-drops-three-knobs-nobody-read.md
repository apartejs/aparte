---
"@aparte/core": minor
---

`AparteChatRequest` drops `prefill`, `systemOverride` and `fastStream` — no provider read them; pass provider-specific options in `_meta`. If you set one, move it under a key of your own: `_meta: { llamacpp: { prefill: 'x' } }`, which reaches your provider untouched.

All three were documented "providers MAY ignore it", and every provider did: they were one model family's raw-completion vocabulary flattened onto every request, so a third-party provider implementing the type inherited three fields it could not honour. `_meta` is the channel that already works — an open, namespaced bag core neither filters nor rewrites. The trigger to reconsider is a raw-completion provider in this repo that would actually read one; the JSDoc on the interface now says so, and a test drives an option through the client and `AparteDirectTransport` to prove the path stays open.

One correction comes with it: `_meta`'s own documentation claimed it was "never sent to the AI provider — stripped before the network call". Nothing strips it, and `AparteBackendTransport` serialises it to your endpoint inside the default `{ providerId, request }` body. Both halves were false, and the field now says what it does — including that it is not a place to hide a secret.
