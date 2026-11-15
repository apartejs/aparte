---
'@aparte/core': minor
'@aparte/engine': minor
'@aparte/plugin-ask-user': patch
'@aparte/runner-n8n': patch
---

`approvalResolver`, an approval policy and `requestInterceptor` now receive the turn they are called for, `{ conversationId, messageId, targetId }` (`AparteTurnContext`), and so do the server handler's `approvalPolicy` and `prepareRequest`.

```ts
new AparteClient({
  approvalResolver: (call, signal, { conversationId }) => cards.ask(conversationId, call, signal),
});
```

Do you have to touch your code? No. Each is an extra argument a callback is free to ignore. A resolver that read the open conversation from the app's own state, or from a capturing listener on `aparte-conversation-loaded`, can read it from the turn instead.

- **Why.** The client asks again about a paused call the moment a conversation is loaded (`resumeDeferred`), before a framework has rendered the new id: a resolver that read the app's state filed the request under the conversation shown before, and its card never appeared. The turn is read when the person acted, at every call site: a turn in the page, a paused server run, a resume after a reload.
- **Where it goes.** The third argument of `approvalResolver(call, signal, turn)` and of an approval policy `(call, tool, turn)` (absent only when `config.ruleOnToolCall(call)` is called by hand, which now takes the turn as an optional second argument); the second of `requestInterceptor(request, turn)`; on the server, `approvalPolicy(call, tool, turn)` and `prepareRequest(request, req, turn)`, with `{ messageId, conversationId }` as the page sent them. The sub-agent whose call it is stays on `call.agent`.
- **On the event and the panel.** `aparte-tool-approval-request` carries `messageId` and `conversationId`, and the approval core puts to the panel carries them on the request (`AparteElicitationRequest.conversationId`, `messageId`), for a presenter of your own. `@aparte/plugin-ask-user` and the n8n `buttons` tool put the conversation on the question they ask.
- **The approval preview.** The request also carries `preview`, what the tool display's `approvalPreview` draws for the call.
- **A browser tool that answers a paused server run** is now told its conversation (`context.conversationId`), like a tool the page's own loop runs.
- **`AparteToolApprovalResolver`** is now its own type, engine's resolver plus the turn. Passing one straight to `runStreamAgent` needs a wrapper: `(call, signal) => resolver(call, signal, turn)`.
