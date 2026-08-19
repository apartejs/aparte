---
"@aparte/provider-openai-compat": patch
---

Usage is no longer lost on a turn that ends with a tool call. `parseStream` emitted
`done` and returned as soon as it saw `finish_reason: 'tool_calls'` — but under
`include_usage` (which `buildRequest` requests) the usage-only chunk arrives *after*
the finish chunk, so `done.usage` was `undefined` for every tool-call turn. On a chat
that goes unnoticed; on an agent it is most turns. The parser now emits the
`tool_use` events and keeps reading, so the single `done` carries the usage (including
`cacheReadTokens`).
