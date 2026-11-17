---
'@aparte/core': minor
---

A message can now say who wrote it (`author`), a notice can mark what happened in the conversation (`kind: 'notice'`), a note can sit under a message (`note`), and `setAutoReply(false)` keeps the AI quiet while a person answers.

Nothing to change in your code, with one thing to know first: a conversation saved with notices, opened with an older version of aparté, shows each notice as a reply of the AI.

- `AparteMessage.author` (`AparteAuthor`: `name`, `type` `'ai' | 'human'`, `avatar`, `id`) names the writer; `role` still says the side. The bubble shows the name and the picture, carries `data-author-type` and `data-author-name`, and a person's message offers no regenerate, rating or model details. An avatar provider is told the author (`render(role, host, { author })`), and `registerAction` takes `bubble.authorTypes`. `isModelReply(message)` and `authorTypeOf(message)` are exported.
- `kind: 'notice'` draws a line across the transcript (`role="note"`), never sent to the model and never answered. `note` is a short line under a message, set with `updateMessage(id, { note })`.
- `config.setAutoReply(on, conversationId?)` / `getAutoReply(conversationId?)`: off, a person's message is shown, announced and saved, and no turn starts — not from a send, a queued message, a regenerate, an edit or the resume of a paused reply. Regenerate and edit are disabled meanwhile. Per conversation, or for the whole chat; not stored, so apply it again on `aparte-conversation-loaded`.
- `aparte-send` carries `messageId`, the id of the message on screen. A message appended or updated outside a turn fires `aparte-transcript-change`, and the conversation controller saves it; `manager.addMessage()` now writes the stored branch tree too.
- A message appended while a reply streams no longer cuts into it: the turn writes into its own message by id, and the history is cut at the message that was sent, wherever it sits.
- What the model reads: an author's name goes as the message's `name`; two messages in a row on the same side are joined into one, assistant ones too unless they call tools (before, only the person's were), since strict chat templates refuse two in a row; joined messages from different authors open each named author's words with the name (`Marie: …`).

The guide is "Humans in the conversation".
