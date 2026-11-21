---
'@aparte/engine': minor
'@aparte/plugin-subagents': minor
---

A sub-agent can name the model it runs on: `agent-start` carries `model`, `runSubAgent` and `startSubAgent` fill it from their request (or take a `model` you give), and `setupSubagents({ model: true })` draws it quietly on the sub-agent's line.

A host whose sub-agents run on other models than the conversation (a small local one beside the main) had only the name to show it, "Reader · qwen3:8b", which a host matching lines by name then had to strip. The model is kept on the segment, so a thread read back still says it. Off by default: every existing line would change. (apartejs/aparte#286)
