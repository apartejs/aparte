---
'@aparte/core': minor
---

Each turn now carries the id of the conversation open in the chat: `conversationId` on the run's options, beside `messageId`, and `createAgentStreamRunner` takes an `endpoint` function that routes by it.

```ts
createAgentStreamRunner({ endpoint: ({ conversationId }) => `/api/agent/c/${conversationId}` });
```

Do you have to touch your code? No. A chat with no conversation sends nothing new, and a `streamRunner` that does not read the field behaves as before. Your server does receive a new field, `conversationId` in the body `createAgentStreamRunner` posts, whenever a conversation is open.

- **What it is.** The conversation open in the chat when the person sent the message, read at that moment and not after the turn's awaits (a key to resolve, a file to read), so a person who opens another conversation a moment later does not move the turn. The same on a retry, an edit, and the resume of a paused run, which goes out with the id of the run it continues. A first message carries the id of the conversation it creates. A chat with no conversation, no manager or none open, leaves the field out.
- **Route by it.** `endpoint` is a string or a function of the run's options, called for every request, so each conversation can have its own route. The runner also puts the id in the body, and `AparteAgentRequestBody` gains `conversationId?`.
- **On the server.** `createAparteAgentHandler` gives a server tool the id as `context.conversationId`, beside `context.request`; a tool that runs in the page gets the same field in its context. A body whose `conversationId` is not a string is a 400, and an empty one is none. The id comes from the browser: it names a conversation and proves nothing about who owns it, so check it against the caller before opening a journal by it.
- **Where it is read.** The conversation controller leaves a reader on the chat's element, and `AparteClient`, which sits beside the chat, climbs to it. Every wrapper and the vanilla controller are covered, and no prop changed. A provider reads the request, which does not carry the id: only a runner gets it. A provider that wants it, to key a prompt cache, is the trigger to put it on the request as well.
