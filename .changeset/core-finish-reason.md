---
"@aparte/core": minor
---

A reply cut off at the model's length limit now says so, and the `done` stream event, the stored message and `aparte-message-done` carry a new optional `finishReason`.

Nothing to change in your code: a provider that reports no reason behaves as before. To see the note, a provider has to send `finishReason: 'length'` on its `done` event (`@aparte/provider-openai-compat` and `@aparte/provider-ai-sdk` do; so does a scripted turn of `@aparte/provider-scenario`).

- `AparteFinishReason` is `'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'`. It rides on `AparteStreamEventMap.done`, on `AparteMessage.finishReason` (persisted, so a reload still shows the note) and on `AparteMessageDoneEventDetail.finishReason`. It is the reason of the LAST model call of the turn: a tool turn that ends on a text answer reports that answer's reason, never the earlier `'tool-calls'`.
- The bubble draws a small muted line after the content of a completed assistant reply whose reason is `'length'`, and nothing for any other reason or while the reply streams. The text is the new locale key `responseCutOff`, in `.aparte-finish-note` (no `role="alert"`: it is a fact about the answer, not an error). `bubble.setFinishReason()` and `populateBubbleFromMessage` feed it, so wrapper-managed bubbles get it with the call they already make.
- The server-loop path needed no change: `createAgentStreamRunner` replays each `run-done` line whole and `createAgentHandler` writes it whole; a test pins that.
