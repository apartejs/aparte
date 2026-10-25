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
