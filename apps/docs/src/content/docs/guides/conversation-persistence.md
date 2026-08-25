---
title: Conversation persistence
description: Implement an AparteStorageAdapter, register a AparteConversationManager, and drive a multi-conversation sidebar that loads and saves threads.
sidebar:
  order: 10
---

Everything so far lives in memory — reload the page and the thread is gone. aparté's
persistence subsystem closes that gap. A **`AparteConversationManager`** holds the list of
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

The current value is exported as `APARTE_CONVERSATION_SCHEMA_VERSION`, so an adapter
can compare it against what it stored and migrate instead of guessing.

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

## 2. Register a `AparteConversationManager`

`AparteConversationManager` owns the in-memory list, mutates it, and calls your adapter — your
app never calls the adapter directly.

<!-- doc-check: skip excerpt — imports the adapter the reader writes in the fence above -->
```ts
import { aparteGlobalConfig, AparteConversationManager } from '@aparte/core';
import { LocalStorageAdapter } from './local-storage-adapter';

const manager = new AparteConversationManager(new LocalStorageAdapter());
await manager.init();                          // hydrates the list from the adapter
aparteGlobalConfig.setConversationManager(manager);  // registers it for every <aparte-*> component
```

Running several independently-configured chats on one page? Call `setConversationManager`
on each chat's own `AparteConfig` instance (passed as `config`) instead of the global
singleton.

Useful reads once registered: `manager.conversations`, `manager.activeConversations` /
`manager.archivedConversations` (newest first), `manager.activeId`, `manager.active`, and
`manager.subscribe(listener)` (returns an unsubscribe fn; fires after every mutation).
Mutations: `createNew(title?)`, `delete(id)`, `archive(id)`, `unarchive(id)`.

Optional bounded history:
`new AparteConversationManager(adapter, { retention: { maxMessages: 200 } })` trims a persisted
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
once instead of constructing `AparteConversationManager` by hand (step 2 is done for you), then
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

## 5. What survives a round trip

Your adapter stores `AparteMessage` objects verbatim, segments included, and hands them
back. Core then **adopts** them rather than treating them as new — and the difference is
worth knowing, because two of the fields on a segment are facts and two are measurements.

| on a restored segment | what happens | why |
|---|---|---|
| `id`, `type`, `content`, … | yours, untouched | it is your data |
| `messageId`, `index` | **recomputed** from the array being joined | derivable facts. A stored value can only contradict the list it lands in — and no protocol persists either; Anthropic's block `index` exists solely inside the streaming envelope, as a position |
| `meta.aparte.startedAt` / `endedAt` | **not restored, and not invented** | a span is something the client measured while the turn ran. A measurement nobody took is absent |
| `isStreaming` | forced to `false` | a persisted stream is dead. Restored as streaming it would render a caret for ever, and the next completed turn would stamp it a brand-new end |
| `meta.*` (yours) | round-trips as stored | your half of the bag |

**Nothing is lost that was ever there.** Most backends store messages and have never
heard of a segment — content parts carry no timestamp in any wire format — so there is
usually nothing to lose. What changed is that core no longer *fills the gap with now*: a
conversation from three weeks ago used to come back claiming every segment had started
that second, and only on some of the load paths, so the same stored thread produced
different numbers depending on whether you were in native or framework-managed mode and
on whether a `tree` had been saved.

:::note[If you want the spans back]
Persist them yourself and put them where core reads them:

```ts
import { segmentTiming, type AparteMessage, type AparteSegment } from '@aparte/core';

type Span = { id: string; startedAt?: number; endedAt?: number };

/** On save: pull out what core measured, alongside whatever else you store. */
function spansOf(message: AparteMessage): Span[] {
  return (message.segments ?? []).map((s) => ({ id: s.id, ...segmentTiming(s) }));
}

/** On load: put it back under `meta.aparte`, and core leaves it alone. */
function restoreSpans(message: AparteMessage, spans: Span[]): AparteMessage {
  return {
    ...message,
    segments: message.segments?.map((s: AparteSegment) => {
      const span = spans.find((x) => x.id === s.id);
      if (!span) return s;
      return {
        ...s,
        meta: { ...s.meta, aparte: { startedAt: span.startedAt, endedAt: span.endedAt } },
      } as AparteSegment;
    }),
  };
}
```

Read them back with `segmentDuration(segment)` rather than subtracting, so an absent span
gives you `undefined` instead of `NaN`.
:::

**A request that outlived its page is closed for you.** A `tool_call` persisted as
`awaiting-approval` comes back as `aborted`. The loop that awaited the decision went with
the page, so nothing can answer it — and `aborted` rather than `rejected` because nobody
refused anything. Every load path shares one normalisation, so this holds whichever of
them your adapter uses.

**One thing core still cannot fix for you.** A `tool_call` persisted as `pending` comes
back with a spinner and an open span, because the handler that was running is likewise
gone. If your adapter can be interrupted mid-turn, normalise that status on save.

---

See the generated [Elements reference](/reference/api/) for `<aparte-conversation-list>`'s
exact property/attribute signatures, and
[Conversations & branching](/guides/conversations-branching/) for `exportTree()` /
`importTree()`, which this subsystem persists as the `tree` field.
