---
"@aparte/provider-transformers": minor
---

A runner of your own now receives the tools the request allows and its `toolChoice`: `input.tools` (each a `RunnerTool` — `name`, `description`, `inputSchema`) and `input.toolChoice` (`'auto'`, `'none'` or `{ name }`).

Core sends `tools` when the model declares `function_calling`, and the provider used to post the worker only the messages and the generation options, so a runner that emits `tool_use` had to hard-code its tool list — offering a small local model tools the app never enabled, and unable to honour `toolChoice: 'none'` or a forced tool. Both are absent when the request has none. The built-in runners take neither, and still warn when a turn needs a tool call they cannot carry. Closes #119.
