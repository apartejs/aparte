---
'@aparte/core': patch
---

Reasoning that arrives after its block was closed now opens a new block, instead of growing a block that already reads "Thought for 3s".

Nothing to change in your code. A reasoning block closes when the answer starts or a tool is called, and only a `turn-start` let the next reasoning open a block of its own. Later reasoning in the same turn was appended to the closed block, folded, above the calls made since, and the block kept its finished label while it grew. It happened to a server loop that sent one `turn-start` per run instead of one per model call (apartejs/aparte#272), and as well to a model that reasons again after it starts answering within one call (the engine, `ai-sdk` and AG-UI all pass that through), in the reply and in a sub-agent's transcript.

The server-loop guide now says what a server writing its own wire must send: a `turn-start` before each model call, a sub-agent's with its `agentId`.
