---
title: Conversation persistence
description: Implement an AparteStorageAdapter, register a ConversationManager, and drive a multi-conversation sidebar that loads and saves threads.
sidebar:
  order: 10
---

Everything so far lives in memory — reload the page and the thread is gone. aparté's
persistence subsystem closes that gap. A **`ConversationManager`** holds the list of
conversations and notifies listeners on every change, but never touches storage directly —
that's the job of an **`AparteStorageAdapter`** you implement against any backend
(`localStorage`, IndexedDB, SQLite WASM, your own REST API). A `conversationId` binding
loads/persists the *active* thread; `<aparte-conversation-list>` renders a sidebar to
switch between them.

## 1. Implement an `AparteStorageAdapter`

The contract has three **required** methods — together they're the minimum viable adapter:

```ts
interface AparteStorageAdapter {
  loadAll(): Promise<AparteConversation[]>;   // all conversations, full payload, newest first
  save(conv: AparteConversation): Promise<void>; // upsert (create or update)
  delete(id: string): Promise<void>;             // permanent delete
  // + optional split-storage extensions: archive?/unarchive?, loadMeta?/loadFull?,
  //   pin?/unpin?, rename?, and memory / settings / artifact-gallery / attachment rows.
}
```

An `AparteConversation` carries `id`, `title`, `createdAt`, `updatedAt`, a flat `messages`
array (the active path — always kept for sidebar previews and compat), an optional `tree`
(full branch topology, see [Conversations & branching](/guides/conversations-branching/)),
and optional `archivedAt` / `pinnedAt` / `folderId` / `schemaVersion` (current version is
`2`; treat `undefined` as legacy data).

Here's a complete adapter over `localStorage`, implementing the three required methods plus
the optional `archive` / `unarchive` pair:

```ts
import type { AparteConversation, AparteStorageAdapter } from '@aparte/core';

const KEY = 'aparte:conversations';

function readAll(): AparteConversation[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { return []; }
}
function writeAll(convs: AparteConversation[]): void {
  localStorage.setItem(KEY, JSON.stringify(convs));
}

export class LocalStorageAdapter implements AparteStorageAdapter {
  async loadAll(): Promise<AparteConversation[]> {
    return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async save(conv: AparteConversation): Promise<void> {
    const all = readAll();
    const i = all.findIndex((c) => c.id === conv.id);
    if (i >= 0) all[i] = conv; else all.push(conv);
    writeAll(all);
  }

  async delete(id: string): Promise<void> {
    writeAll(readAll().filter((c) => c.id !== id));
  }

  // Optional — without them, archiving falls back to a plain save().
  async archive(id: string): Promise<void> { this._setArchived(id, Date.now()); }
  async unarchive(id: string): Promise<void> { this._setArchived(id, undefined); }

  private _setArchived(id: string, archivedAt: number | undefined): void {
    const all = readAll();
    const conv = all.find((c) => c.id === id);
    if (conv) { conv.archivedAt = archivedAt; writeAll(all); }
  }
}
```

An IndexedDB (or SQLite WASM) adapter follows the same shape — every method is `async`
precisely so any backend fits. Richer backends can additionally implement `loadMeta()` /
`loadFull(id)` (fast sidebar listing vs. lazy full payload), `pin` / `unpin` / `rename`,
and the memory-fact / settings / gallery methods — all optional, consulted only when
present.

## 2. Register a `ConversationManager`

`ConversationManager` owns the in-memory list, mutates it, and calls your adapter — your
app never calls the adapter directly.

```ts
import { AparteConfig, ConversationManager } from '@aparte/core';
import { LocalStorageAdapter } from './local-storage-adapter';

const manager = new ConversationManager(new LocalStorageAdapter());
await manager.init();                          // hydrates the list from the adapter
AparteConfig.setConversationManager(manager);  // registers it for every <aparte-*> component
```

Running several independently-configured chats on one page? Call `setConversationManager`
on each chat's own `AparteConfigClass` instance (passed as `config`) instead of the global
singleton.

Useful reads once registered: `manager.conversations`, `manager.activeConversations` /
`manager.archivedConversations` (newest first), `manager.activeId`, `manager.active`, and
`manager.subscribe(listener)` (returns an unsubscribe fn; fires after every mutation).
Mutations: `createNew(title?)`, `delete(id)`, `archive(id)`, `unarchive(id)`.

Optional bounded history:
`new ConversationManager(adapter, { retention: { maxMessages: 200 } })` trims a persisted
conversation to its last N messages on every write — **storage only**, the live session in
the DOM is never truncated.

## 3. Load and persist the active thread — `conversationId`

Each wrapper's `<AparteChat>` exposes a **`conversationId`** binding. Setting it loads that
conversation's messages (and branch tree, if any) via the registered manager; setting it to
`null` deselects. Sending the first message while `conversationId` is unset lazily creates a
conversation and reports the new id back, so you can sync a URL/router.

```tsx
// React — Vue/Svelte/Angular expose the same pair under their idiomatic names:
//   Vue      :conversation-id / @conversation-created
//   Svelte   conversationId  / on:conversationCreated
//   Angular  [conversationId] / (conversationCreated)
const [conversationId, setConversationId] = useState<string | null>(null);

<AparteChat conversationId={conversationId} onConversationCreated={setConversationId} />
```

Without a wrapper, drive the same lifecycle yourself with `AparteConversationController` —
it's exactly what the wrappers use internally:

```ts
import { AparteConversationController } from '@aparte/core';

const chat = document.querySelector('aparte-chat')!;
const viewport = (chat as any).viewport;

const controller = new AparteConversationController({
  hostId: 'main-chat',
  host: chat,
  getMessages: () => viewport.getMessages(),
  setMessages: (m) => viewport.setMessages(m),
  appendMessage: (m) => viewport.appendMessage(m),
  clearMessages: () => viewport.clearMessages(),
  exportTree: () => viewport.exportTree(),   // optional — enables branch persistence
  importTree: (t) => viewport.importTree(t), // optional
});
controller.bind();
void controller.setConversationId('abc-123'); // or null to deselect
```

## 4. Render a sidebar

`<aparte-conversation-list>` is a display primitive: set its `conversations` property and
`active-id` attribute, and handle the four events it emits (all bubble, `detail: { id }`):
`aparte-select-conversation`, `aparte-delete-conversation`, `aparte-archive-conversation`,
`aparte-unarchive-conversation`.

```ts
const list = document.querySelector('aparte-conversation-list')!;

function render() {
  (list as any).conversations = manager.activeConversations;
  list.setAttribute('active-id', manager.activeId ?? '');
}
manager.subscribe(render);
render();

list.addEventListener('aparte-delete-conversation', (e) => manager.delete((e as CustomEvent).detail.id));
list.addEventListener('aparte-archive-conversation', (e) => manager.archive((e as CustomEvent).detail.id));
list.addEventListener('aparte-unarchive-conversation', (e) => manager.unarchive((e as CustomEvent).detail.id));
// Selecting a conversation is owned by the `conversationId` binding (or a window-level
// `aparte-select-conversation` event that every bound controller listens for), not the list.
```

Each wrapper ships a reactive helper around the same manager — call its `init(adapter)`
once instead of constructing `ConversationManager` by hand (step 2 is done for you), then
bind `conversations` / `activeConversations` / `archivedConversations` to the list and
`createNew` / `addMessage` / `updateMessages` / `delete` / `archive` / `unarchive` to
actions:

| Wrapper | Helper |
|---|---|
| React | `useConversationManager()` — hook, plain state |
| Vue | `useConversationManager()` — composable, refs/computed |
| Svelte | `createConversationManager()` — stores |
| Angular | `ConversationManagerService` — injectable (`providedIn: 'root'`) |

Switching the active conversation stays owned by the `conversationId` binding — the helpers
deliberately don't expose a `select()`.

---

See the generated [Elements reference](/reference/api/) for `<aparte-conversation-list>`'s
exact property/attribute signatures, and
[Conversations & branching](/guides/conversations-branching/) for `exportTree()` /
`importTree()`, which this subsystem persists as the `tree` field.
