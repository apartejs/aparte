---
"@aparte/core": minor
---

`AparteClient.compact()` keeps the recent turns by default: with no `compactionSelector`, the engine's `createCompactionSelector` walks the current model's budget (its `contextWindow`, the resolved system prompt, the registered tools) and only what no longer fits is summarised; when the model declares no window, the last two exchanges stay. The summariser now reads the tool calls of the summarised turns (`[tool name] input → result`) and the errors, so a session of tool work survives its own compaction; `compactionPrompt` on the client replaces its instruction. The summary comes back as a message with `compaction: true` and `role: 'user'`: the viewport draws it as a centred notice (`data-kind="compaction"` on the bubble — no avatar, no actions) and the history sends it under a fixed preamble saying what it is. `aparte-compact-done` gains `dropped`.

Before: `compact()` replaced the whole transcript with one paragraph unless the host knew to import a selector from the engine, the summary had never seen a tool run, and it landed as an assistant reply indistinguishable from an answer. `AparteMessage.compaction` is the one field added; `AparteCompactDoneEventDetail.dropped` the one event field.
