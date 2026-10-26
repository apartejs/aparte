---
"@aparte/runner-n8n": minor
---

New package: `@aparte/runner-n8n` puts aparté on an n8n chat workflow (a Chat Trigger and its AI Agent), in place of n8n's chat widget. Pass `createN8nRunner({ webhookUrl })` as `AparteClient`'s `streamRunner`; `loadN8nHistory({ webhookUrl, sessionId })` reads a conversation back after a reload.

The agent, its tools and its memory run in n8n; each turn sends what n8n's widget sends — the session, the person's message, their files as a form — and the chat draws the answer, streamed when the Chat Trigger streams, whole when it waits for the last node. Two nodes that stream are drawn as two blocks, in order, never interleaved. A new conversation gets a new n8n session unless you give one, so two chats never share a memory.

The errors say what to change in n8n: an inactive workflow's 404 with n8n's hint, a trigger that streams while its agent does not, a last node that returns no `output`/`text`/`message` field (where n8n's widget printed the JSON into the bubble), credentials the workflow waits for, a memory not connected to the trigger when loading history, a workflow that answers through response nodes over n8n's chat WebSocket, and a proxy that gave up (a 502/504 page, never shown as markup).

The history leaves out a tool's call and its result, as the live stream does — n8n's widget drew them as bubbles of raw JSON after a reload. The tests replay answers recorded from live n8n 2.35.7 and 2.44.6 instances, byte for byte, including a `keepalive` that opens the stream when a slow node runs first, and read them cut into any pieces. n8n's stream carries the text of the answer only, so the agent's tool calls are not drawn.
