---
'@aparte/core': minor
---

A question can be answered from outside its chat: `aparteGlobalConfig.observeElicitations(listener)` hands the app each question and approval a chat puts on screen, with `respond()` to answer it and `settled` to know when it no longer waits (#250).

The chat still asks: its panel is up and the person can answer there. Whichever answers first is the answer, and an answer from outside takes the chat's panel down. `request.conversationId` names the conversation that asked, so an inbox of everything waiting across conversations can answer an `ask_user` question the way `approvalResolver` already let it answer an approval. The answer is what the panel would have resolved, `{ action: 'accept', content }` with the value the question's schema collects (for `ask_user`, the option's value, a `string[]` for several, free text, or `{ q1, q2 }` for several questions), or `{ action: 'decline' }`. `AparteElicitationPending` is the type. A listener that throws is reported at the console and the question is still asked. The elicitation guide has it under "Answer from outside the chat".
