---
"@aparte/core": minor
---

A conversation with no text yet has an empty `title` (it used to be the English string `New Chat`), and editing the first user message re-titles the conversation unless you named it yourself.

Two things for a consumer that reads `AparteConversation.title`:

- `createNew()` with no argument, and a first message with no text, now leave `title` empty. `<aparte-conversation-list>` already showed its locale's `newChat` word for an empty title, so a French UI no longer displays "New Chat" from the store. Render `title || yourLocale.newChat` where you show a title of your own.
- A new optional field, `autoTitle`, is `true` while the title is the manager's decision (the first message as typed, or the title provider's answer). Editing the first user message then re-titles through the same path. `updateTitle()` sets it to `false`, and a title you typed is kept whatever happens to the messages. Records written before this field existed have no flag and read as typed: an old title is never overwritten.
