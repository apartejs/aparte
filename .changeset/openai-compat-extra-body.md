---
"@aparte/provider-openai-compat": patch
---

New: `extraBody` on `createOpenAICompatProvider` adds vendor fields to every request body (#101). For example, `extraBody: { thinking: { type: 'disabled' } }` turns off a GLM model's reasoning on Z.ai.

It is the body's counterpart of `extraHeaders`. The fields the adapter writes stay its own (`model`, `messages`, `temperature`, `max_tokens`, `stream`, `stream_options`, `seed`, `tools`, `tool_choice`): an `extraBody` key with one of those names is ignored.
