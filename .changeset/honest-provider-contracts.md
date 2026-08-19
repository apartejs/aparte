---
"@aparte/provider-openai-compat": patch
"@aparte/provider-transformers": patch
---

Two provider contracts now say what they actually do.

`createOpenAICompatProvider` returns `AparteAIProvider & AparteFormatAdapter`. The
factory has always supplied `buildRequest` / `parseStream` / `authHeaders` /
`defaultEndpoint`, but the declared type left them optional (right for
`AparteAIProvider` in general, since a provider may own its I/O through `chat()`) —
so callers driving the adapter themselves had to add `!` or write a check that
cannot fail.

`@aparte/provider-transformers` warns once when it drops `tool_call` / `tool_result`
turns from the prompt. Tool calling is out of scope for v1, but the turns were
filtered silently: an app with registered tools got a model that never saw the call
or its result, with nothing to explain it.
