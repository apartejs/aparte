---
"@aparte/core": patch
---

Fix three problems after a compaction or a new chat: the model no longer receives two `user` messages in a row, the conversation title is no longer taken from the summary, and the context gauge no longer keeps the previous conversation's reading.

Nothing to change in your code.

- **Two user turns in a row.** After a compaction the summary is a `user` message and the kept turns usually start with one; after a failed turn its user message stays while its error reply is not sent. Either gave the model adjacent `user` messages, which strict chat templates (Gemma, Mistral, llama.cpp with `--jinja`, vLLM) reject, and every following turn failed. Send, retry, edit and the resume of a paused turn now merge adjacent `user` messages into one on the final array (texts joined by a blank line, image parts kept). System, assistant and tool messages are never merged.
- **The title.** `AparteConversationManager` took the title from the first `user` message, which after a compaction is the summary notice ("Conversation summary The user requested…"). The three places that look for it skip a `compaction: true` message.
- **The gauge.** `<aparte-context>` listened to turns and compactions only, so after "New chat" the empty conversation still showed the last reading. It now clears on `aparte-reset-done` and, for a stored conversation, restores the last reply's `usage` on `aparte-conversation-loaded`. A restored reading never dispatches `aparte-compact`: auto-compact is now asked only at the end of a turn, so a gauge already in `danger` no longer asks again on a window or config change.
