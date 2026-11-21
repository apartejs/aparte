---
'@aparte/core': minor
'@aparte/locales': minor
---

A conversation row can say its turn is queued: `setConversationStatus(id, 'queued')` (or `aparte-conversation-status` with `status: 'queued'`) draws a muted mark, no shimmer, and "Queued" for a screen reader.

For a turn sent but waiting behind another conversation's: a local engine that serves one turn at a time, a backend's queue. Read as `running`, the row shimmered and said "Answering" while nothing was being written. Only the app knows a turn is queued, so the app says it, and says `running` once the turn is served; the conversation controller's `running` at the turn's start no longer takes a `queued` back. `AparteConversationStatus` gains `'queued'`: a host that matched every status exhaustively has one more to handle. The new locale key `conversationQueued` is translated in the nine languages of `@aparte/locales`. (apartejs/aparte#289)
