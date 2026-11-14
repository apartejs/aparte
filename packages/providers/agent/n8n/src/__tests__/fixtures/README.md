# Recorded n8n answers

Each file is what n8n 2.35.7 (self-hosted, `npm i n8n@2.35.7`) answered a chat message, byte for
byte: the HTTP status, the content type and the body. The workflows were a public Chat Trigger
with an AI Agent, a Simple Memory and a Calculator tool, on a scripted OpenAI-compatible model.

| File | The workflow, and the message |
| --- | --- |
| `stream-tool.json` | Response Mode *Streaming*; the agent calls the calculator, then streams its answer |
| `stream-two-agents.json` | *Streaming*; two agents in a row, each streaming |
| `last-node.json` | *When Last Node Finishes*: one `{ output }` |
| `stream-disabled-in-agent.json` | *Streaming* in the trigger, streaming off in the agent: n8n answers nothing |
| `stream-model-error.json` | *Streaming*; the model answers HTTP 500 |
| `inactive-webhook.json` | a webhook no active workflow registers: 404 (its `stacktrace`, local paths, trimmed) |
| `stream-with-file.json` | *Streaming* with *Allow File Uploads*; the message carries a PNG |

The calculator's call does not appear in `stream-tool.json`: n8n's stream carries the text of the
answer only.

## n8n 2.44.6, a real model

The `v2.44-*` files were recorded on 2026-10-26 from n8n 2.44.6 (`npx n8n@2.44.6`), the stable release
that day, with the same workflow shape on a real model (Gemma 3n E2B served by LM Studio's
OpenAI-compatible endpoint). The trigger's memory was connected to the trigger as well as to the agent,
which *Load Previous Session: From Memory* needs.

| File | The workflow, and the message |
| --- | --- |
| `v2.44-stream-keepalive.json` | *Streaming*, a 35-second Wait node before the agent: n8n's `keepalive` opens the stream |
| `v2.44-stream-tool.json` | *Streaming*; the agent calls the calculator: an empty block before the call, then the reply |
| `v2.44-stream-memory.json` | *Streaming*; the second turn of a session, answered from the memory |
| `v2.44-stream-text-file.json` | *Streaming*; a text file uploaded as `files` in a form, read by the agent |
| `v2.44-stream-image-refused.json` | *Streaming*; an image the model cannot read: an `error` frame with its words |
| `v2.44-last-node.json` | *When Last Node Finishes*: one `{ output }` holding an HTML snippet |
| `v2.44-history.json` | `loadPreviousSession` after one exchange |
| `v2.44-history-tool.json` | `loadPreviousSession` after a calculator turn: the call and its result are stored too |
| `v2.44-history-empty.json` | `loadPreviousSession` for a session never used |
| `v2.44-history-memory-not-on-trigger.json` | `loadPreviousSession` with the memory connected to the agent only: a 500 (its `stacktrace`, local paths, trimmed) |

n8n labels every one of them `application/json; charset=utf-8`, the streamed ones included.

## n8n 2.47.7, sub-agents

The `v2.47-*` files were recorded on 2026-11-13 from n8n 2.47.7 (Docker `n8nio/n8n`), on a scripted
OpenAI-compatible model that calls the first tool it is offered, then streams `<ROLE>-CHUNK-1..3`
(the role is read off each agent's system message). The workflow: a public Chat Trigger, Response
Mode *Streaming* → an AI Agent (`Root Agent`, streaming on) with an **AI Agent Tool** (`Research
Agent`) as its tool, each on its own OpenAI Chat Model node. The message was sent as the runner sends
it.

| File | The workflow, and the message |
| --- | --- |
| `v2.47-stream-sub-agent.json` | the root calls `Research Agent`, which streams: its frames come under its own node, between the root's empty block and the root's answer |
| `v2.47-stream-sub-agent-nested.json` | `Research Agent` has its own AI Agent Tool, `Fact Checker`: three levels, each caller's empty block before its callee |
| `v2.47-stream-sub-agent-twice.json` | the root calls `Research Agent` twice in one reply: runs 0 and 1 of the same node, one after the other |
| `v2.47-stream-sub-agent-not-streaming.json` | *Enable Streaming* off on the AI Agent Tool: no frame of it at all |
| `v2.47-stream-sub-agent-after-preamble.json` | the root writes a sentence before its call: its block before the sub-agent is not empty |

No frame names the tool call, its input, its result or the caller: a sub-agent is known only by its
node's frames coming between its caller's blocks.
