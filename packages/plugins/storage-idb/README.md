# @aparte/plugin-storage-idb

Keep [aparté](https://apartejs.dev) conversations in the browser. An IndexedDB storage adapter for
the conversation manager: the list is read without a single message, a conversation's messages when
it opens, and a file a person attached is kept as a file — it is still there after a reload. No
server, no dependency.

```bash
npm install @aparte/plugin-storage-idb
```

```ts
import { AparteConversationManager } from '@aparte/core';
import { createIdbStorage } from '@aparte/plugin-storage-idb';

const manager = new AparteConversationManager(createIdbStorage());
await manager.init();
```

## What it keeps

- **The list**: one small row per conversation (title, dates, pinned, archived), so drawing the
  list never reads a message.
- **The messages and their branches**: the `messages` and the `tree` of every version, read when the
  conversation opens.
- **The files**: each attachment's file in its own store, by message and by conversation — kept as
  its bytes, which Safari's private browsing accepts where it refuses a `Blob` — given back as a
  `Blob` with a fresh object URL when the conversation is loaded, and written once — saving the conversation
  again does not rewrite them. A file whose attachment left the conversation
  is deleted with it; deleting a conversation deletes its files.
- **What the person did**: a pin, an archive, a title typed in — kept as a typed title, so the
  manager does not re-title it after a reload.

## Options

| Option | What it does | Default |
| --- | --- | --- |
| `name` | the database name; two chats on one origin that must not share their conversations take two | `'aparte'` |
| `indexedDB` | the `IDBFactory` to open it with; a test passes `fake-indexeddb`'s | the page's `indexedDB` |
| `objectUrl` | turns a stored file back into a URL when a conversation is loaded | `URL.createObjectURL` |

The adapter returned, `IdbStorage`, is the full `AparteStorageAdapter` (split loading, pins, archives,
rename, `loadAttachments`) plus `close()`, which lets go of the database; the next call opens it
again. The database opens on the first call, so creating the adapter during a server render is
harmless; a call where there is no IndexedDB rejects with a message that says so. A save is all
or nothing: if a message cannot be stored (a value structured clone refuses, the quota), nothing
of it is, and the save rejects with that error. Another tab upgrading the database is not blocked:
this connection lets go of it.

[The persistence guide](https://apartejs.dev/guides/conversation-persistence/#keep-them-in-the-browser)
shows it with the conversation list.

## License

MIT
