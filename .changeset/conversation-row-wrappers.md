---
"@aparte/react": minor
"@aparte/vue": minor
"@aparte/svelte": minor
"@aparte/angular": minor
---

The conversation-manager helper of each wrapper (`useConversationManager`, `createConversationManager`, `ConversationManagerService`) exposes `pin(id)`, `unpin(id)` and `updateTitle(id, title)`, so the list's new `aparte-pin-conversation`, `aparte-unpin-conversation` and `aparte-rename-conversation` events can be wired without reaching for the manager. Angular's `<aparte-conversation-list>` directive gains the matching `(pinConversation)`, `(unpinConversation)` and `(renameConversation)` outputs.
