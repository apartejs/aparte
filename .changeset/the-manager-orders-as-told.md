---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

`new AparteConversationManager(adapter, { orderBy })` orders its lists as the app chooses: `'updated'` (the default, unchanged), `'created'`, or a compare function.

The lists were by `updatedAt`, the last change of content: a reply that ends moves its conversation up, as most chat products do. An app that keeps a conversation in its place, or orders by the person's last message, sorted the manager's lists again itself. A conversation list's date groups still read each row's `updatedAt`: with another order, hand it the date you order by. Opening, renaming or reloading a conversation never moved it, and still does not. The framework helpers' lists (`useConversationManager` in React and Vue, Angular's `ConversationManagerService`, Svelte's `createConversationManager` and `createConversations`) follow the same option, given to their `init`; `manager.compare(a, b)` sorts a list of the app's own the same way. (apartejs/aparte#293)
