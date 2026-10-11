---
title: AG-UI chat UI for Agno, LangGraph, Mastra and CrewAI agents
description: Render an AG-UI agent in aparté — Agno, LangGraph, Mastra, CrewAI, Pydantic AI. The agent runs on its server with its own tools; aparté draws the chat, the tool calls and the approvals.
sidebar:
  order: 1
  label: AG-UI agents
---

[AG-UI](https://docs.ag-ui.com) is the protocol many agent frameworks serve their agents over:
Agno, LangGraph, Mastra, CrewAI, Pydantic AI, CopilotKit's runtime, and
[TanStack AI](/providers/agent/tanstack-ai/). `@aparte/runner-ag-ui` plugs such an agent into
`AparteClient`. The agent runs its loop and its tools on its own server. aparté draws what it
streams — text, reasoning, tool rows, approvals — the way it draws a loop it runs itself.

```bash
npm install @aparte/runner-ag-ui @aparte/core
```

```ts
import { AparteClient } from '@aparte/core';
import { createAgUiRunner } from '@aparte/runner-ag-ui';

const client = new AparteClient({
    streamRunner: createAgUiRunner({ endpoint: 'https://agents.example.com/agui' }),
});
client.start();
```

That is the whole wiring. The runner sits on the `streamRunner` seam: the chat, the composer,
Stop, the conversation manager and the approval panel work unchanged.

## What the agent's stream becomes

| The agent sends | aparté draws |
| --- | --- |
| `TEXT_MESSAGE_*` | the reply's text, one segment per message |
| `REASONING_MESSAGE_*` | the thinking block |
| `TOOL_CALL_START` / `ARGS` / `END` | a tool row, its arguments assembled from the deltas |
| `TOOL_CALL_RESULT` | the row's result |
| `RUN_FINISHED` with an interrupt | the approval panel, or a tool the page runs |
| `RUN_ERROR` | the reply's error card |

`STATE_*`, `MESSAGES_SNAPSHOT`, `ACTIVITY_*`, `CUSTOM` and sub-agent events are read and left
alone in this version.

## Tools the page runs

A tool you register in the page with `registerTool` is sent to the agent as an AG-UI
**frontend tool**. The [`ask_user`](/plugins/ask-user/) plugin is one. When the agent calls
it, the run ends with the call open. The page runs the tool, shows its row as resolved, and
calls the agent again with the result as a `tool` message. Nothing to configure.

## Approvals

When the agent pauses on a call that needs a person, the page asks with the same
[approval panel](/guides/tools/#require-approval-human-in-the-loop) as for its own tools. The
pause is an AG-UI interrupt with reason `tool_call` or `confirmation`, which is what TanStack AI's
`needsApproval` sends. Your [approval policy](/plugins/approval/) can answer first. The answer
goes back to the agent in one `resume` batch, since AG-UI refuses a partial one, and the run
continues on the agent's server, into the same reply.

The pause lives in the conversation, as with [the loop on your server](/guides/server-loop/):
it is saved the moment the run pauses, and the person can leave and answer when they come back.

## Options

| Option | |
| --- | --- |
| `endpoint` | The agent's AG-UI URL, e.g. Agno's `/agui`. Required. |
| `headers` | Sent with every request. A function is called per request, for a fresh token each time. |
| `fetch` | Your own `fetch`. Defaults to the global one. |
| `credentials` | For a cross-origin endpoint that authenticates by cookie. |
| `threadId` | The AG-UI thread a turn runs in. A string, or a function of the run's options. |
| `forwardedProps` | `RunAgentInput.forwardedProps`: settings your agent reads from the request. |
| `context` | `RunAgentInput.context`: extra context entries for the agent. |

By default every turn runs in a new thread, and the agent gets the whole history each time.
That is right for a stateless agent. Give `threadId` when the agent keeps state per thread,
as Agno does with its session: the conversation's id is the usual choice. A paused run is always
resumed in its own thread, whatever `threadId` returns.

`AgUiRunnerOptions` is the type of these options.

## Agno

Agno serves an agent or a team over AG-UI with its `AGUI` interface in `AgentOS`. The endpoint
is `POST /agui`. Give that URL to `createAgUiRunner`.

```py
from agno.agent.agent import Agent
from agno.models.openai import OpenAIResponses
from agno.os import AgentOS
from agno.os.interfaces.agui import AGUI

chat_agent = Agent(model=OpenAIResponses(id="gpt-5.4"))
agent_os = AgentOS(agents=[chat_agent], interfaces=[AGUI(agent=chat_agent)])
app = agent_os.get_app()  # POST /agui
```

This follows [Agno's AG-UI example](https://docs.agno.com/agent-os/interfaces/ag-ui/introduction).
Agno's support for tools the page runs, and for approvals over AG-UI, is still uneven at the
time of writing. Text and the agent's own tools work today.

## Limits in this version

- A user message goes as text. An image part has no AG-UI shape every agent reads, so it is
  left out.
- An interrupt that is neither a tool approval nor a tool for the page, such as
  `input_required`, ends the turn with an error that names its reason.
- The agent's own state (`STATE_*`) and `CUSTOM` events are not drawn.

To run aparté's own loop on your server instead, next to your tools, see
[Run the agent loop on your server](/guides/server-loop/).
