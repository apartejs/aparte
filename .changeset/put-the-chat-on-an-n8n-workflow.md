---
"@aparte/runner-n8n": minor
---

New package: `@aparte/runner-n8n` puts aparté on an n8n chat workflow (a Chat Trigger and its AI Agent), in place of n8n's chat widget. Pass `createN8nRunner({ webhookUrl })` as `AparteClient`'s `streamRunner`.

The agent, its tools and its memory run in n8n; each turn sends what n8n's widget sends — the session, the person's message, their images as files — and the chat draws the answer, streamed when the Chat Trigger streams, whole when it waits for the last node. Two nodes that stream are drawn as two blocks, in order, never interleaved. The errors say what to change: an inactive workflow's 404 with n8n's hint, a trigger that streams while its agent does not (n8n then answers nothing), a workflow that answers through response nodes over n8n's chat WebSocket, a proxy that timed out.

The tests replay answers recorded from a live n8n 2.35.7, byte for byte, and read them cut into any pieces. n8n's stream carries the text of the answer only, so the agent's tool calls are not drawn.
