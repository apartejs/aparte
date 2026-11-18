# @aparte/runner-n8n

## 1.13.1

## 1.13.0

## 1.12.2

## 1.12.1

## 1.12.0

## 1.11.0

## 1.10.1

## 1.10.0

### Patch Changes

- d2f054c: `approvalResolver`, an approval policy and `requestInterceptor` now receive the turn they are called for, `{ conversationId, messageId, targetId }` (`AparteTurnContext`), and so do the server handler's `approvalPolicy` and `prepareRequest`.

  ```ts
  new AparteClient({
    approvalResolver: (call, signal, { conversationId }) =>
      cards.ask(conversationId, call, signal),
  });
  ```

  Do you have to touch your code? No. Each is an extra argument a callback is free to ignore. A resolver that read the open conversation from the app's own state, or from a capturing listener on `aparte-conversation-loaded`, can read it from the turn instead.

  - **Why.** The client asks again about a paused call the moment a conversation is loaded (`resumeDeferred`), before a framework has rendered the new id: a resolver that read the app's state filed the request under the conversation shown before, and its card never appeared. The turn is read when the person acted, at every call site: a turn in the page, a paused server run, a resume after a reload.
  - **Where it goes.** The third argument of `approvalResolver(call, signal, turn)` and of an approval policy `(call, tool, turn)` (absent only when `config.ruleOnToolCall(call)` is called by hand, which now takes the turn as an optional second argument); the second of `requestInterceptor(request, turn)`; on the server, `approvalPolicy(call, tool, turn)` and `prepareRequest(request, req, turn)`, with `{ messageId, conversationId }` as the page sent them. The sub-agent whose call it is stays on `call.agent`.
  - **On the event and the panel.** `aparte-tool-approval-request` carries `messageId` and `conversationId`, and the approval core puts to the panel carries them on the request (`AparteElicitationRequest.conversationId`, `messageId`), for a presenter of your own. `@aparte/plugin-ask-user` and the n8n `buttons` tool put the conversation on the question they ask.
  - **The approval preview.** The request also carries `preview`, what the tool display's `approvalPreview` draws for the call.
  - **A browser tool that answers a paused server run** is now told its conversation (`context.conversationId`), like a tool the page's own loop runs.
  - **`AparteToolApprovalResolver`** is now its own type, engine's resolver plus the turn. Passing one straight to `runStreamAgent` needs a wrapper: `(call, signal) => resolver(call, signal, turn)`.

- `@aparte/runner-n8n` sends n8n the message just typed, also after a failed turn; it sent the failed message again, joined to the new one, which n8n's memory may already hold. The run now names the person's message it answers: `userMessage`, `{ content, messageId? }`, on `StreamRunOptions`, which `AparteClient` fills on a send, a retry and an edit.

  Do you have to touch your code? No. A runner whose agent keeps its own memory and is sent only the new message reads `opts.userMessage` rather than the last user message of `baseRequest.messages`, which after a failed turn is that message joined to the one before it. With a client that does not name it, `@aparte/runner-n8n` reads the history as before. A first message whose turn failed now keeps its n8n session for the next one.

## 1.9.0

## 1.8.0

## 1.7.0

### Minor Changes

- a815889: An n8n AI Agent Tool (a sub-agent) is now drawn as a sub-agent: its text goes on a line of its own, named after its node, and no longer into the reply. Add `@aparte/plugin-subagents` (`setupSubagents()`) to show the line; without it, that text is kept out of the reply and the console says so.

  - **What n8n sends** (recorded on n8n 2.47.7): an AI Agent Tool that streams sends frames under its
    own node, between its caller's blocks. The caller's block ends empty when its model asks for the
    tool, the sub-agent's frames follow, then the caller streams again under the same node, run and
    item. Nothing else names the call. The runner reads exactly that: a stream that begins after an
    empty block is that agent's sub-agent until the caller streams again, and it emits `agent-start`
    (named after the node, `parentAgentId` for a sub-agent's sub-agent), the text with its `agentId`,
    and `agent-end` with the text as `result`. Only the caller streaming again proves it, so the
    line is drawn then, the sub-agent's answer whole in it, not while it streams. A sub-agent called
    twice is two lines; a workflow that fails ends the open ones as `failed`.
  - **What it cannot tell.** An AI Agent Tool with _Enable Streaming_ off sends no frame, so it shows
    nothing. A caller that writes text before its call looks like two agents in a row, and the
    sub-agent's text is drawn in the reply as before. If the agent before it never streams again
    (two agents in a row, the first answering nothing), nothing was a sub-agent: what followed is the
    reply, drawn once, in order, with no line.

## 1.6.0

## 1.5.0

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.2

## 1.1.1

## 1.1.0

## 1.0.2

## 1.0.1

## 1.0.0

### Patch Changes

- f6715cd: A Chat node's buttons are now shown only when their links resume the running execution, and an n8n error frame no longer puts the workflow's own words in front of the person.

  Buttons are shown when every link, resolved once against `webhookUrl`, is http(s), on the webhook's origin, and has exactly the shape n8n sends: `<mount>/webhook-waiting/<execution id>/<node id>?approved=true|false&signature=<64 hex digits>`, with no other path segment, query parameter or fragment. The mount is what sits in front of the Chat Trigger's `/webhook/<id>/chat` at the end of `webhookUrl` (`https://site/n8n/webhook/abc/chat` takes `/n8n/webhook-waiting/…`; a base path that itself holds a `/webhook` segment is read whole). A path that only holds the waiting segment further down, such as `/rest/x/webhook-waiting/<id>`, and a waiting link with no signature are not accepted. An instance that moved the waiting endpoint (`N8N_ENDPOINT_WEBHOOK_WAIT`), or whose `webhookUrl` does not end in `/webhook/<id>/chat`, sets the `waitingPrefix` option (`'/n8n/webhook-waiting'`); the links must then begin with `<prefix>/<execution id>/<node id>` and have the same query. If any link fails, no button is shown, `onWarning` is told (and names `waitingPrefix`), and the question is drawn as text.

  On n8n 2.x a Chat node's message travels as plain text, so an answer written by a model could look like a buttons frame, and its relative link would be fetched from the host page. The ticket now stores the resolved absolute link, that link is what is fetched, and it is checked again when the turn resumes. A ticket whose links are not all strings is read as a new message.

  An answer that looks like n8n handing over to the chat socket (`{ "executionStarted": true, … }`) is now accepted only in the shape n8n sends: `application/json`, with exactly the fields `executionStarted`, `executionId` (a number) and `resumeToken`. Anything else carrying that field is shown as the workflow's answer. A workflow that returns a model's text as its body (a Respond to Webhook node set to Text) could otherwise name the execution and the token that the page opens its socket on.

  An `error` frame on the socket now fails the turn with "The n8n workflow failed."; the frame's message is passed to `onWarning` instead of being shown.

  The same holds for an `error` frame in the HTTP answer or stream: the turn fails with "The n8n workflow failed." and the frame's message goes to `onWarning`. A body that is only text cannot be told from an error frame, so a workflow answering with a model's text could write one (with a `begin` frame before it) and have its words shown as the failure. The error text of a failed n8n execution is now in the console, not in the chat.

- Updated dependencies [26ddd6c]
- Updated dependencies [e97d464]
- Updated dependencies [0a6dd91]
- Updated dependencies [635f69b]
- Updated dependencies [224afde]
- Updated dependencies [2e5c5ab]
- Updated dependencies [67efebe]
- Updated dependencies [99fcc42]
- Updated dependencies [e97d464]
- Updated dependencies [048864d]
- Updated dependencies [99784ad]
  - @aparte/core@1.0.0

## 0.32.1

## 0.32.0

## 0.31.0

## 0.30.1

## 0.30.0

## 0.29.4

## 0.29.3

## 0.29.2

## 0.29.1

## 0.29.0

## 0.28.3

## 0.28.2

## 0.28.1

## 0.28.0

## 0.27.4

### Patch Changes

- 7db31fc: `freeText` on an approval request is renamed `allowOther`, the name a question's free-text option already has. Replace `freeText: false` with `allowOther: false`.

  Published in 0.27.3 an hour before: one idea, "may the person answer in words", now has one name on both panels. Same default (`true`), same meaning; `setupN8nButtons` passes it for n8n's Block User Input.

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
