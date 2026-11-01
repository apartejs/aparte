---
"@aparte/plugin-storage-idb": patch
---

New package: `createIdbStorage()` keeps conversations in the browser's IndexedDB, as the conversation manager's storage adapter.

The list is read without a single message (`loadMeta`), a conversation's messages when it opens (`loadFull`), and an attachment's file is kept in its own store (as its bytes, which Safari's private browsing accepts where it refuses a `Blob`) and given back as a `Blob` with a fresh object URL when the conversation is loaded, so it survives a reload. A save is all or nothing, and a file is written once. Pins, archives and a typed title are kept, the latter as a typed title. Options: `name` (the database, `'aparte'`), `indexedDB` (an `IDBFactory`, e.g. `fake-indexeddb` in a test), `objectUrl`. No dependency.
