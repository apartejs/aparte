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
- **The files**: each attachment's `blob` in its own store, by message and by conversation, given a
  fresh object URL when the conversation is loaded. A file whose attachment left the conversation
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
harmless; a call where there is no IndexedDB rejects with a message that says so. Another tab
upgrading the database is not blocked: this one closes and reopens on its next call.

[The persistence guide](https://apartejs.dev/guides/conversation-persistence/#keep-them-in-the-browser)
shows it with the conversation list.

## License

MIT
