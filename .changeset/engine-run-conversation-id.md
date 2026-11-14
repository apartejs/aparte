---
'@aparte/engine': minor
---

`StreamRunOptions` gains `conversationId`, the id of the conversation the run belongs to, for a runner that sends the run elsewhere.

Do you have to touch your code? No. The field is optional, and `runStreamAgent` does not read it: it is opaque to the loop, like `messageId` and `providerId`. `AparteClient` fills it from the conversation open in the chat when the person sent the message (see `@aparte/core`), and leaves it out when the chat has none.

- **Why here.** A runner receives `StreamRunOptions`: `createAgentStreamRunner` routes by the id, `createAgUiRunner` runs the agent's thread in it, and a runner of your own reads it as `opts.conversationId`.
