---
"@aparte/plugin-storage-idb": patch
---

New package: `createIdbStorage()` keeps conversations in the browser's IndexedDB, as the conversation manager's storage adapter.

The list is read without a single message (`loadMeta`), a conversation's messages when it opens (`loadFull`), and an attachment's file is kept as a `Blob` in its own store and given a fresh object URL when the conversation is loaded, so it survives a reload. Pins, archives and a typed title are kept, the latter as a typed title. Options: `name` (the database, `'aparte'`), `indexedDB` (an `IDBFactory`, e.g. `fake-indexeddb` in a test), `objectUrl`. No dependency.
