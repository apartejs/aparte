---
"@aparte/core": patch
---

Fix send routing when several chats share a page. `AparteClient._handleSend`
resolved the event's `targetId` by requiring `appendMessage` **on** that element,
but an `<aparte-chat>` shell owns no `appendMessage` — it delegates to its
`.viewport`. Every `target`-attributed send therefore logged a warning and fell
through to a DOM scan that returns the *first* chat on the page, so with two
chats mounted one chat's reply rendered inside the other. Send now uses the same
resolver as retry/edit (which had already been fixed for this).
