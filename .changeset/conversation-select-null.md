---
'@aparte/core': patch
---

`AparteConversationSelectDetail.id` is now `string | null`: `null` means a new conversation. Handle it where you read the event's `id` as a `string`.

`aparte-conversation-select` with `{ id: null }` is the documented way for a New chat button to start a new conversation, and every chat bound to a manager honours it, but the type said `id: string`: dispatching it took a cast, and a typed listener's "new conversation" branch read as dead code. The list itself still sends a row's id. A listener that passes `id` on to `setConversationId()` or a `conversationId` prop needs nothing, since both take `string | null`; one that uses it as a `string` (an index, a lookup key) now gets a type error where `null` was always possible at runtime.
