---
"@aparte/runner-n8n": patch
---

A workflow that answers through response nodes now works: the runner reads n8n's chat WebSocket, and a Chat node's buttons are answered in the page after `setupN8nButtons()`.

On a Chat Trigger set to "Using Response Nodes", n8n answers the first message with an execution to listen to; the runner opens n8n's chat socket for it, draws each message the workflow's Chat nodes send, and keeps the socket while the execution waits — a written reply to a Chat node that asks for one goes on it. A Chat node that waits for an approval sends buttons: the turn pauses on them as a call the page answers, `setupN8nButtons()` asks them at the composer with their own labels, and the chosen button resumes the execution. Only buttons whose links lead back to the same n8n are shown. n8n 2.x runs response nodes only on a Chat Trigger in "Hosted Chat" mode. A runtime without a global `WebSocket` passes one as the runner's `WebSocket` option.
