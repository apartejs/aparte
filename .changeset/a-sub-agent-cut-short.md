---
'@aparte/engine': minor
'@aparte/plugin-subagents': minor
---

A sub-agent whose own run stops before it answers (its turn limit, a call it could not make) now ends `partial`, with a `reason` and what it found as its `result`, and its line reads "Cut short" instead of Done.

`runSubAgent` reported every such sub-agent as `done` with its last text, often empty after a round of tool calls, so the parent model read a finished answer and the line said Done above a transcript showing the turn limit's error. `StreamAgentStatus` and `AparteSubagentStatus` gain `'partial'`, `agent-end` gains `reason` (a `StreamAgentCutReason`: `turn-limit`, `timeout`, `no-handler`, `no-resolver`, `aborted` for a call that stopped itself, or `context` for a host's own loop), `runSubAgent` returns them, and a background sub-agent cut short is reported to the model as such. A host that matched every status exhaustively has one more to handle. (apartejs/aparte#285)
