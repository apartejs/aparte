---
'@aparte/core': minor
---

Add `new AparteConversationController(binding, { keepDrafts: true })`: what was typed in a conversation comes back on return.

Kept in memory. A storage adapter with the optional `loadDraft` and `saveDraft` keeps it across reloads, and `updatedAt` does not move.
