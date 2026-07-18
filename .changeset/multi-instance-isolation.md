---
"@aparte/core": patch
---

Isolate streaming state between multiple chats on one page. Lifecycle events
(`aparte-message-start` / `done` / `error` / `aborted`) and `aparte-abort` now
carry the target host's `targetId`, and a composer only reacts to its own host's
turn. Before this, streaming in one chat flipped every composer to the "Stop"
state, a `done` in one reset the others (hiding an active elicitation panel), and
cancelling one aborted every scoped client. Id-less single-instance pages still
broadcast unchanged.
