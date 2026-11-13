---
'@aparte/runner-n8n': minor
---

An n8n AI Agent Tool (a sub-agent) is now drawn as a sub-agent: its text goes on a line of its own, named after its node, and no longer into the reply. Add `@aparte/plugin-subagents` (`setupSubagents()`) to show the line; without it, that text is kept out of the reply and the console says so.

- **What n8n sends** (recorded on n8n 2.47.7): an AI Agent Tool that streams sends frames under its
  own node, between its caller's blocks. The caller's block ends empty when its model asks for the
  tool, the sub-agent's frames follow, then the caller streams again under the same node, run and
  item. Nothing else names the call. The runner reads exactly that: a stream that begins after an
  empty block is that agent's sub-agent until the caller streams again, and it emits `agent-start`
  (named after the node, `parentAgentId` for a sub-agent's sub-agent), the text with its `agentId`,
  and `agent-end` with the text as `result`. Only the caller streaming again proves it, so the
  line is drawn then, the sub-agent's answer whole in it, not while it streams. A sub-agent called
  twice is two lines; a workflow that fails ends the open ones as `failed`.
- **What it cannot tell.** An AI Agent Tool with *Enable Streaming* off sends no frame, so it shows
  nothing. A caller that writes text before its call looks like two agents in a row, and the
  sub-agent's text is drawn in the reply as before. If the agent before it never streams again
  (two agents in a row, the first answering nothing), nothing was a sub-agent: what followed is the
  reply, drawn once, in order, with no line.
