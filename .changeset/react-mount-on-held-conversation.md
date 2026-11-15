---
'@aparte/react': patch
---

`<AparteChat conversationId={id}>` now draws that conversation when it mounts, also when the conversation manager already holds it loaded; a `setConversationId(id)` after mount is no longer needed.

Nothing to change in your code; remove the workaround if you added one. A conversation the manager holds (one another chat had open, on the same manager) is drawn at once, during the chat's mount. The `messages` prop's effect then ran for the first time, took the initial `[]` for a list pushed by the parent, and replaced the transcript with it: the chat showed its empty state while `getConversationId()` returned the id. The effect's first run is now recognised as the value the chat was created with. A conversation that has to be fetched (`loadFull`) was not affected, nor were Vue, Svelte or Angular, whose `messages` watchers do not run on mount; each wrapper now has a test for this case.
