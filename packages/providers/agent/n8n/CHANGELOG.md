# @aparte/runner-n8n

## 0.27.3

### Patch Changes

- a329d19: n8n's "Block User Input" is now honoured: a Chat node's buttons are asked without a field to write in when it is on.

  Without it, the person may still write instead of choosing, which n8n reads as a message and takes as not approved, as with its own widget.

## 0.27.2

### Patch Changes

- 14c782d: A workflow that answers through response nodes now works: the runner reads n8n's chat WebSocket, and a Chat node's buttons are answered in the page after `setupN8nButtons()`.

  On a Chat Trigger set to "Using Response Nodes", n8n answers the first message with an execution to listen to; the runner opens n8n's chat socket for it, draws each message the workflow's Chat nodes send, and keeps the socket while the execution waits — a written reply to a Chat node that asks for one goes on it. A Chat node that waits for an approval sends buttons: the turn pauses on them as a call the page answers, `setupN8nButtons()` asks them at the composer with their own labels, and the chosen button resumes the execution. Only buttons whose links lead back to the same n8n are shown. n8n 2.x runs response nodes only on a Chat Trigger in "Hosted Chat" mode. A runtime without a global `WebSocket` passes one as the runner's `WebSocket` option.

## 0.27.1

## 0.27.0

### Minor Changes

- 5e31fa9: New package: `@aparte/runner-n8n` puts aparté on an n8n chat workflow (a Chat Trigger and its AI Agent), in place of n8n's chat widget. Pass `createN8nRunner({ webhookUrl })` as `AparteClient`'s `streamRunner`; `loadN8nHistory({ webhookUrl, sessionId })` reads a conversation back after a reload.

  The agent, its tools and its memory run in n8n; each turn sends what n8n's widget sends — the session, the person's message, their files as a form — and the chat draws the answer, streamed when the Chat Trigger streams, whole when it waits for the last node. Two nodes that stream are drawn as two blocks, in order, never interleaved. A new conversation gets a new n8n session unless you give one, so two chats never share a memory.

  The errors say what to change in n8n: an inactive workflow's 404 with n8n's hint, a trigger that streams while its agent does not, a last node that returns no `output`/`text`/`message` field (where n8n's widget printed the JSON into the bubble), credentials the workflow waits for, a memory not connected to the trigger when loading history, a workflow that answers through response nodes over n8n's chat WebSocket, and a proxy that gave up (a 502/504 page, never shown as markup).

  The history leaves out a tool's call and its result, as the live stream does — n8n's widget drew them as bubbles after a reload, the tool's result as raw JSON. The tests replay answers recorded from live n8n 2.35.7 and 2.44.6 instances, byte for byte, including a `keepalive` that opens the stream when a slow node runs first, and read them cut into any pieces. n8n's stream carries the text of the answer only, so the agent's tool calls are not drawn.
