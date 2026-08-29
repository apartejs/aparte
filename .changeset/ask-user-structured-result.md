---
"@aparte/core": minor
---

A tool result can carry a structured value beside its prose: `AparteToolResult.structuredContent` (MCP's name for exactly this field) travels with the call and lands on the transcript's segment as `AparteToolCallSegment.structuredResult`. `content` is unchanged — it stays what the model reads.

A tool renderer that had to parse its own JSON back out of the prose can read the value directly; `@aparte/plugin-ask-user`'s receipt and `@aparte/plugin-artifacts`' card both do.
