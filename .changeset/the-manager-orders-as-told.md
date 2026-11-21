---
'@aparte/core': minor
---

`new AparteConversationManager(adapter, { orderBy })` orders its lists as the app chooses: `'updated'` (the default, unchanged), `'created'`, or a compare function.

The lists were by `updatedAt`, the last change of content: a reply that ends moves its conversation up, as most chat products do. An app that keeps a conversation in its place, or orders by the person's last message, sorted the manager's lists again itself. A conversation list's date groups still read each row's `updatedAt`: with another order, hand it the date you order by. Opening, renaming or reloading a conversation never moved it, and still does not. (apartejs/aparte#293)
