# @aparte/plugin-storage-idb

## 1.7.0

## 1.6.0

## 1.5.0

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.2

## 1.1.1

## 1.1.0

## 1.0.2

## 1.0.1

## 1.0.0

### Patch Changes

- Updated dependencies [26ddd6c]
- Updated dependencies [e97d464]
- Updated dependencies [0a6dd91]
- Updated dependencies [635f69b]
- Updated dependencies [224afde]
- Updated dependencies [2e5c5ab]
- Updated dependencies [67efebe]
- Updated dependencies [99fcc42]
- Updated dependencies [e97d464]
- Updated dependencies [048864d]
- Updated dependencies [99784ad]
  - @aparte/core@1.0.0

## 0.32.1

## 0.32.0

### Patch Changes

- fc1fc9f: New package: `createIdbStorage()` keeps conversations in the browser's IndexedDB, as the conversation manager's storage adapter.

  The list is read without a single message (`loadMeta`), a conversation's messages when it opens (`loadFull`), and an attachment's file is kept in its own store (as its bytes, which Safari's private browsing accepts where it refuses a `Blob`) and given back as a `Blob` with a fresh object URL when the conversation is loaded, so it survives a reload. A save is all or nothing, and a file is written once. Pins, archives and a typed title are kept, the latter as a typed title. Options: `name` (the database, `'aparte'`), `indexedDB` (an `IDBFactory`, e.g. `fake-indexeddb` in a test), `objectUrl`. No dependency.
