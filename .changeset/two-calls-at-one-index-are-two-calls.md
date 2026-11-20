---
'@aparte/provider-openai-compat': patch
---

Two tool calls a server sends at the same `index` with different ids are now two calls, each with its own arguments.

A server that numbers `index` per chunk rather than per response sends every call at index 0 (Ollama's /v1 has been seen to). The second call was taken for the rest of the first: one call, run with the second's name on `{}`, and the first lost. A named delta with a new id now opens its own call when the index is held by a call with another vendor id. A call opened by index whose real id arrives later is still one call.
