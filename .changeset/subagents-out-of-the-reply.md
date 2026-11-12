---
'@aparte/core': minor
'@aparte/runner-ag-ui': minor
---

A sub-agent's text and tool rows no longer show inside the reply; add `@aparte/plugin-subagents` to show one line per sub-agent.

```ts
import { setupSubagents } from '@aparte/plugin-subagents';

setupSubagents();
```

- **What you see without the plugin.** The reply holds the agent's own text and tool rows only. The call that opened a sub-agent stays as an ordinary tool row, and the console says once that nothing draws sub-agents. Before, an AG-UI agent's sub-agents streamed into the reply as if the agent had written it, and their tool calls were rows of the reply.
- **What the model reads.** A sub-agent's work is no longer part of the reply's history, so it is not sent back to the model on the next turn.
- **AG-UI.** `@aparte/runner-ag-ui` translates `SUBAGENT_STARTED`, `SUBAGENT_FINISHED`, `SUBAGENT_ERROR` and the `subagentRunId` on a sub-agent's events: several sub-agents can stream at once, each keeps its own messages and calls, and an interrupt raised inside a sub-agent is asked about as that sub-agent's. Most agent frameworks announce sub-agents only when asked to (LangGraph's and Strands' `subagent_visibility="attributed"`, Mastra's `subagentVisibility: "attributed"`, ADK-JS's `subagents: "attributed"`); the [Sub-agents guide](https://apartejs.dev/guides/sub-agents/) lists them.
- **Your own events.** An event that carries an `agentId`, and `agent-start` / `agent-end`, never reach the reply, whatever drew them: a backend that writes the engine's events as NDJSON for `createAgentStreamRunner` opens a sub-agent with `agent-start`, tags its events with its `agentId`, and closes it with `agent-end`. A `run-start`, `run-done`, `run-aborted` or `run-suspended` line that carries an `agentId` is dropped with a warning: a sub-agent never ends the run.
